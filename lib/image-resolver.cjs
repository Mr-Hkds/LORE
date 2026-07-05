const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const IMAGE_UA = 'SevenDescents/2.0 (https://sevendescents.vercel.app)';

// Native fetch helper supporting redirects and timeouts
function fetchUrl(url, headers = {}, redirectCount = 0) {
  if (redirectCount > 3) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': IMAGE_UA,
        'Accept': 'application/json, text/plain, */*',
        ...headers
      }
    };
    const req = client.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          return fetchUrl(loc, headers, redirectCount + 1).then(resolve).catch(reject);
        }
        return reject(new Error('Redirect without location'));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function cleanTopicForSearch(topic) {
  return (topic || '').split(/[:\u2014\u2013-]/)[0].trim();
}

// Tier 1: Wikipedia REST API & Search API (resolves exact match problems)
async function searchWikipediaImage(topic) {
  const cleanTopic = cleanTopicForSearch(topic);
  
  // 1. Try Direct Title Lookup first (extremely fast)
  try {
    console.log(`[IMAGE RESOLVER] Wikipedia (Direct): Looking up summary for "${cleanTopic}"...`);
    const data = await fetchUrl(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTopic)}`
    );
    const img = data?.originalimage || data?.thumbnail;
    if (img?.source && (img.width || 0) >= 300) {
      console.log(`[IMAGE RESOLVER] ✓ Wikipedia Direct hit: ${img.source}`);
      return { url: img.source, source: 'wikipedia', width: img.width, height: img.height };
    }
  } catch (err) {
    console.log(`[IMAGE RESOLVER] Wikipedia Direct lookup failed for "${cleanTopic}": ${err.message}`);
  }

  // 2. Try Search API Fallback (extracts key terms and queries Wikipedia search to find the correct article)
  try {
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

    console.log(`[IMAGE RESOLVER] Wikipedia (Search): Querying search results for "${searchQuery}"...`);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=3&format=json&origin=*`;
    const searchResult = await fetchUrl(searchUrl);
    const searchItems = searchResult?.query?.search || [];

    for (const item of searchItems) {
      const pageTitle = item.title;
      if (!pageTitle) continue;
      
      console.log(`[IMAGE RESOLVER] Wikipedia (Search): Fetching summary for page "${pageTitle}"...`);
      try {
        const data = await fetchUrl(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
        );
        const img = data?.originalimage || data?.thumbnail;
        if (img?.source && (img.width || 0) >= 300) {
          console.log(`[IMAGE RESOLVER] ✓ Wikipedia Search hit via "${pageTitle}": ${img.source}`);
          return { url: img.source, source: 'wikipedia', width: img.width, height: img.height };
        }
      } catch (sumErr) {
        console.log(`[IMAGE RESOLVER] Wikipedia Summary failed for "${pageTitle}": ${sumErr.message}`);
      }
    }
  } catch (searchErr) {
    console.log(`[IMAGE RESOLVER] Wikipedia Search API failed: ${searchErr.message}`);
  }

  return null;
}

// Tier 2: Wikimedia Commons Search
async function searchWikimediaCommons(topic) {
  const cleanTopic = cleanTopicForSearch(topic);
  const queries = [cleanTopic, `${cleanTopic} photograph`, `${cleanTopic} historical`];

  for (const query of queries) {
    try {
      console.log(`[IMAGE RESOLVER] Tier 2 (Commons): Searching for "${query}"...`);
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
      const data = await fetchUrl(commonsUrl);
      const pages = data?.query?.pages;
      if (!pages) continue;

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
        console.log(`[IMAGE RESOLVER] ✓ Commons hit: ${best.width}x${best.height}`);
        return { url: imgUrl, source: 'commons', width: best.width, height: best.height };
      }
    } catch (err) {
      console.log(`[IMAGE RESOLVER] Tier 2 miss for "${query}": ${err.message}`);
    }
  }
  return null;
}

// Tier 3: Pexels API Search
async function searchPexels(topic, category, pexelsKey) {
  console.log(`[IMAGE RESOLVER] Tier 3 (Pexels): Disabled to avoid generic, random stock images. Falling back to typographic HUD cover.`);
  return null;
}
/*
async function searchPexelsOriginal(topic, category, pexelsKey) {

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
  const topicWords = cleanTopicForSearch(topic).split(/\s+/).slice(0, 2).join(' ');
  const searchQuery = `${topicWords} ${catTerm}`.trim();

  try {
    console.log(`[IMAGE RESOLVER] Tier 3 (Pexels): Searching for "${searchQuery}"...`);
    const data = await fetchUrl(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
      { Authorization: pexelsKey }
    );

    if (data?.photos?.length > 0) {
      for (const photo of data.photos) {
        const imgUrl = photo.src?.landscape || photo.src?.large || photo.src?.original || null;
        if (!imgUrl) continue; // skip photos with no usable src URL
        console.log(`[IMAGE RESOLVER] ✓ Pexels hit: ${photo.width}x${photo.height} by ${photo.photographer}`);
        return { url: imgUrl, source: 'pexels', width: photo.width, height: photo.height, photographer: photo.photographer };
      }
  return null;
}
*/

// Main cascade resolver supporting both object arguments and positional arguments
async function resolveStoryImage(firstArg, topicArg, categoryArg, pexelsApiKeyArg) {
  let storyId, topic, category, pexelsApiKey;
  if (typeof firstArg === 'object' && firstArg !== null) {
    storyId = firstArg.storyId;
    topic = firstArg.topic;
    category = firstArg.category;
    pexelsApiKey = firstArg.pexelsApiKey;
  } else {
    storyId = firstArg;
    topic = topicArg;
    category = categoryArg;
    pexelsApiKey = pexelsApiKeyArg;
  }

  console.log(`\n[IMAGE RESOLVER] === Resolving cover for "${topic}" (${category}) ===`);

  // Tier 1: Wikipedia
  let result = await searchWikipediaImage(topic);
  if (result) return result;

  // Tier 2: Wikimedia Commons
  result = await searchWikimediaCommons(topic);
  if (result) return result;

  // Tier 3: Pexels
  result = await searchPexels(topic, category, pexelsApiKey);
  if (result) return result;

  // Tier 4: Fallback
  console.log(`[IMAGE RESOLVER] All tiers exhausted for "${topic}". Using typographic fallback.`);
  return null;
}

module.exports = {
  resolveStoryImage,
  cleanTopicForSearch
};
