// Serverless endpoint: POST /api/resolve-image
// Runs the multi-tier image cascade for a single story, or returns a list of candidate images
// Body: { topic, concepts?, category?, pexels_key?, candidates? }
// Returns: { success, image_url, source, width?, height? } or { success, candidates: [...] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Support both GET (with query parameters) and POST
  const method = req.method;
  if (method !== 'POST' && method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = method === 'GET' ? req.query : (req.body || {});
    const { topic, category } = params;
    const candidatesMode = params.candidates === 'true' || params.candidates === true;

    if (!topic) {
      return res.status(400).json({ error: 'Missing required field: topic' });
    }

    const UA = 'SevenDescents/2.0 (https://sevendescents.vercel.app)';

    // Helper: fetch JSON with timeout
    async function fetchJSON(url, headers = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    // Clean topic for search: split at colon/dash, use first part
    const cleanTopic = (topic || '').split(/[:\u2014\u2013-]/)[0].trim();

    // Enforce smart organic search terms
    let fullText = topic.replace(/[:\-–—()]/g, " ");
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'for', 'nor', 'on', 'at', 'to', 'from',
      'by', 'of', 'in', 'with', 'about', 'as', 'into', 'through', 'over', 'under',
      'between', 'behind', 'underneath', 'upon', 'within', 'without', 'against'
    ]);
    const words = fullText
      .replace(/[.,/#!$%^&*;:_~"?''’]/g, "")
      .split(/\s+/)
      .filter(word => {
        const lower = word.toLowerCase();
        return lower.length > 1 && !stopWords.has(lower);
      });
    const searchQuery = words.slice(0, 4).join(' ');

    // ─── CANDIDATES MODE ────────────────────────────────────────────────
    if (candidatesMode) {
      console.log(`[RESOLVE-IMAGE] Candidate search mode triggered for "${searchQuery}"`);
      const candidates = [];
      const seenUrls = new Set();

      const addCandidate = (url, source, width, height) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        candidates.push({ url, source, width: width || 800, height: height || 600 });
      };

      // 1. Wikipedia Search API + Summary fetch for top 3 articles
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=3&format=json&origin=*`;
        const searchData = await fetchJSON(searchUrl);
        const searchItems = searchData?.query?.search || [];

        for (const item of searchItems) {
          const pageTitle = item.title;
          if (!pageTitle) continue;
          try {
            const summary = await fetchJSON(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
            );
            const img = summary?.originalimage || summary?.thumbnail;
            if (img?.source && (img.width || 0) >= 300) {
              addCandidate(img.source, 'wikipedia', img.width, img.height);
            }
          } catch (sumErr) { /* ignore */ }

          // Fetch other images on the Wikipedia article page
          try {
            const imagesListUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=images&imlimit=6&format=json&origin=*`;
            const listData = await fetchJSON(imagesListUrl);
            const pagesObj = listData?.query?.pages || {};
            const pageId = Object.keys(pagesObj)[0];
            const images = pagesObj[pageId]?.images || [];
            
            const fileNames = images
              .map(img => img.title)
              .filter(title => {
                const lower = title.toLowerCase();
                return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
              });

            if (fileNames.length > 0) {
              const titlesQuery = fileNames.map(name => encodeURIComponent(name)).join('|');
              const detailsUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${titlesQuery}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
              const detailsData = await fetchJSON(detailsUrl);
              const detailPages = detailsData?.query?.pages || {};
              for (const pid of Object.keys(detailPages)) {
                const info = detailPages[pid]?.imageinfo?.[0];
                if (info && info.url) {
                  const imgUrl = info.thumburl || info.url;
                  addCandidate(imgUrl, 'wikipedia_gallery', info.width, info.height);
                }
              }
            }
          } catch (galleryErr) { /* ignore */ }
        }
      } catch (wikiErr) {
        console.warn('[RESOLVE-IMAGE] Wikipedia candidate resolution failed:', wikiErr.message);
      }

      // 2. Wikimedia Commons Search
      try {
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
        const data = await fetchJSON(commonsUrl);
        const pages = data?.query?.pages || {};
        for (const p of Object.values(pages)) {
          const info = p.imageinfo?.[0];
          if (info && info.url) {
            const mime = (info.mime || '').toLowerCase();
            if (!mime.includes('svg') && mime.includes('image') && (info.width || 0) >= 300) {
              const imgUrl = info.thumburl || info.url;
              addCandidate(imgUrl, 'commons', info.width, info.height);
            }
          }
        }
      } catch (commonsErr) {
        console.warn('[RESOLVE-IMAGE] Commons candidate resolution failed:', commonsErr.message);
      }

      return res.status(200).json({
        success: true,
        candidates: candidates.slice(0, 6) // Return top 6 high-quality candidate images
      });
    }

    // ─── STANDARD CASCADE MODE (Fallback) ────────────────────────────────
    // 1. Wikipedia Direct Lookup
    try {
      console.log(`[RESOLVE-IMAGE] Tier 1 (Wikipedia Direct): "${cleanTopic}"`);
      const data = await fetchJSON(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTopic)}`
      );
      const img = data?.originalimage || data?.thumbnail;
      if (img?.source && (img.width || 0) >= 300) {
        return res.status(200).json({
          success: true,
          image_url: img.source,
          source: 'wikipedia',
          width: img.width,
          height: img.height,
        });
      }
    } catch (err) { /* continue */ }

    // 2. Wikipedia Search API + Summary Fallback
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=2&format=json&origin=*`;
      const searchData = await fetchJSON(searchUrl);
      const searchItems = searchData?.query?.search || [];
      for (const item of searchItems) {
        const pageTitle = item.title;
        if (!pageTitle) continue;
        try {
          const summary = await fetchJSON(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
          );
          const img = summary?.originalimage || summary?.thumbnail;
          if (img?.source && (img.width || 0) >= 300) {
            return res.status(200).json({
              success: true,
              image_url: img.source,
              source: 'wikipedia',
              width: img.width,
              height: img.height
            });
          }
        } catch (sumErr) { /* ignore */ }
      }
    } catch (searchErr) { /* continue */ }

    // 3. Wikimedia Commons Search
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
      const data = await fetchJSON(commonsUrl);
      const pages = data?.query?.pages;
      if (pages) {
        const candidates = Object.values(pages)
          .filter(p => {
            const info = p.imageinfo?.[0];
            if (!info) return false;
            const mime = (info.mime || '').toLowerCase();
            if (mime.includes('svg')) return false;
            if (!mime.includes('image')) return false;
            if ((info.width || 0) < 300) return false;
            return true;
          })
          .sort((a, b) => (b.imageinfo[0].width || 0) - (a.imageinfo[0].width || 0));

        if (candidates.length > 0) {
          const best = candidates[0].imageinfo[0];
          const imgUrl = best.thumburl || best.url;
          return res.status(200).json({
            success: true,
            image_url: imgUrl,
            source: 'commons',
            width: best.width,
            height: best.height,
          });
        }
      }
    } catch (err) { /* continue */ }

    // Fallback
    return res.status(200).json({
      success: false,
      image_url: null,
      source: null,
      message: 'No suitable image found across all sources.',
    });

  } catch (err) {
    console.error('[RESOLVE-IMAGE] Critical error:', err);
    return res.status(500).json({ error: err.message });
  }
}
