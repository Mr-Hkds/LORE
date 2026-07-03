// Serverless endpoint: POST /api/resolve-image
// Runs the multi-tier image cascade for a single story
// Body: { topic, concepts?, category?, pexels_key? }
// Returns: { success, image_url, source, width?, height? }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { topic, concepts, category, pexels_key } = req.body || {};
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

    // ─── Tier 1: Wikipedia REST API ─────────────────────────────────────
    try {
      console.log(`[RESOLVE-IMAGE] Tier 1 (Wikipedia): "${cleanTopic}"`);
      const data = await fetchJSON(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTopic)}`
      );
      const img = data?.originalimage || data?.thumbnail;
      if (img?.source && (img.width || 0) >= 300) {
        console.log(`[RESOLVE-IMAGE] \u2713 Wikipedia hit: ${img.width}x${img.height}`);
        return res.status(200).json({
          success: true,
          image_url: img.source,
          source: 'wikipedia',
          width: img.width,
          height: img.height,
        });
      }
    } catch (err) {
      console.log(`[RESOLVE-IMAGE] Tier 1 miss: ${err.message}`);
    }

    // Also try the full topic if cleanTopic was different
    if (cleanTopic !== topic.trim()) {
      try {
        const data = await fetchJSON(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.trim())}`
        );
        const img = data?.originalimage || data?.thumbnail;
        if (img?.source && (img.width || 0) >= 300) {
          return res.status(200).json({
            success: true, image_url: img.source, source: 'wikipedia',
            width: img.width, height: img.height,
          });
        }
      } catch (err) { /* continue */ }
    }

    // ─── Tier 2: Wikimedia Commons Search ───────────────────────────────
    try {
      console.log(`[RESOLVE-IMAGE] Tier 2 (Commons): "${cleanTopic}"`);
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanTopic)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
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
            if ((info.width || 0) < 400) return false;
            return true;
          })
          .sort((a, b) => (b.imageinfo[0].width || 0) - (a.imageinfo[0].width || 0));

        if (candidates.length > 0) {
          const best = candidates[0].imageinfo[0];
          const imgUrl = best.thumburl || best.url;
          console.log(`[RESOLVE-IMAGE] \u2713 Commons hit: ${best.width}x${best.height}`);
          return res.status(200).json({
            success: true,
            image_url: imgUrl,
            source: 'commons',
            width: best.width,
            height: best.height,
          });
        }
      }
    } catch (err) {
      console.log(`[RESOLVE-IMAGE] Tier 2 miss: ${err.message}`);
    }

    // ─── Tier 3: Pexels API ─────────────────────────────────────────────
    const pexelsKey = pexels_key || process.env.PEXELS_API_KEY;
    if (pexelsKey) {
      try {
        // Generate smart search query based on category
        const categoryTerms = {
          psychology: 'dark psychology mind experiment',
          true_crime: 'crime investigation dark noir',
          paranormal: 'mysterious dark fog abandoned',
          mythology: 'ancient temple mythology ruins',
          gov_experiments: 'classified laboratory government secret',
          conspiracy: 'surveillance conspiracy dark shadows',
          cyber_mysteries: 'cybersecurity hacker dark screen',
        };
        const catTerm = categoryTerms[category] || 'mysterious dark documentary';
        const topicWords = cleanTopic.split(/\s+/).slice(0, 2).join(' ');
        const searchQuery = `${topicWords} ${catTerm}`.trim();

        console.log(`[RESOLVE-IMAGE] Tier 3 (Pexels): "${searchQuery}"`);
        const data = await fetchJSON(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
          { Authorization: pexelsKey }
        );

        if (data?.photos?.length > 0) {
          const photo = data.photos[0];
          const imgUrl = photo.src?.landscape || photo.src?.large || photo.src?.original;
          console.log(`[RESOLVE-IMAGE] \u2713 Pexels hit: ${photo.width}x${photo.height}`);
          return res.status(200).json({
            success: true,
            image_url: imgUrl,
            source: 'pexels',
            width: photo.width,
            height: photo.height,
            photographer: photo.photographer,
            pexels_url: photo.url,
          });
        }
      } catch (err) {
        console.log(`[RESOLVE-IMAGE] Tier 3 miss: ${err.message}`);
      }
    }

    // ─── Tier 4: No image found ─────────────────────────────────────────
    console.log(`[RESOLVE-IMAGE] All tiers exhausted for "${topic}". Returning null.`);
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
