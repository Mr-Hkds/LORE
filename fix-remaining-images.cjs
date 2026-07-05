/**
 * fix-remaining-images.cjs
 * Resolves the ~8 remaining stories with null/missing images using
 * alternative search terms and Pexels API key loaded from .env
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { resolveStoryImage } = require('./lib/image-resolver.cjs');

const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const IMAGES_DIR = path.join(__dirname, 'public', 'content', 'images');
const MANIFEST_FILE = path.join(__dirname, 'public', 'content', 'image_manifest.json');
const PEXELS_KEY = '3LVA9JyEqjajSqPXiQucT1SodmcgmTR1o0xknor9OwORYvYjPATg87em';

const IMAGE_UA = 'SevenDescents/2.0 (https://sevendescents.vercel.app)';

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, { headers: { 'User-Agent': IMAGE_UA } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlink(destPath, () => {});
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close(); fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        try {
          const stat = fs.statSync(destPath);
          if (stat.size < 2000) { fs.unlink(destPath, () => {}); return reject(new Error(`Too small: ${stat.size}b`)); }
        } catch {}
        resolve();
      }));
    });
    req.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// For topics that are too specific/obscure, try these alternative simpler search terms
const ALTERNATE_TOPICS = {
  'bhasmasura_mohini_deception': { topic: 'Mohini Vishnu Hindu mythology', category: 'mythology' },
  'prophecies_of_kali_yuga':     { topic: 'Kali Yuga Hindu apocalypse', category: 'mythology' },
  'project_bullrun_muscular':    { topic: 'NSA surveillance encryption', category: 'cyber_mysteries' },
  'operation_shady_rat':         { topic: 'APT cyber espionage hacker', category: 'cyber_mysteries' },
};

async function run() {
  const data = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  const diskFiles = new Set(fs.readdirSync(IMAGES_DIR));

  const broken = data.stories.filter(s => {
    const img = s.hero_image;
    if (!img || img.includes('unsplash.com/photo-1509248961158')) return true;
    if (img.startsWith('/content/images/')) {
      return !diskFiles.has(img.replace('/content/images/', ''));
    }
    return false;
  });

  console.log(`\nRemaining broken stories: ${broken.length}\n`);

  let fixed = 0, failed = 0;

  for (const story of broken) {
    const fname = `${story.story_id}.jpg`;
    const destPath = path.join(IMAGES_DIR, fname);
    const relPath = `/content/images/${fname}`;

    // Use alternate topic if defined
    const alt = ALTERNATE_TOPICS[story.story_id];
    const searchTopic = alt ? alt.topic : story.title.split(':')[0].trim();
    const searchCategory = alt ? alt.category : story.category;

    console.log(`\n[RESOLVING] "${story.title}"`);
    console.log(`  Search term: "${searchTopic}" (${searchCategory})`);

    try {
      const result = await resolveStoryImage(story.story_id, searchTopic, searchCategory, PEXELS_KEY);
      if (!result || !result.url) {
        console.log('  → All tiers exhausted — keeping as typographic fallback');
        failed++;
        continue;
      }

      console.log(`  → Found via ${result.source}: ${result.url.substring(0, 80)}`);
      await downloadImage(result.url, destPath);

      story.hero_image = relPath;
      story.image_missing = 0;
      diskFiles.add(fname);
      fixed++;
      console.log(`  ✓ Saved as ${relPath}`);
    } catch (err) {
      console.warn(`  ✗ Failed: ${err.message}`);
      failed++;
    }
  }

  // Write updated stories.json
  fs.writeFileSync(STORIES_FILE, JSON.stringify(data, null, 2));

  // Rebuild manifest
  const allImages = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify({ committed: allImages, generated_at: new Date().toISOString() }, null, 2));

  console.log(`\n=== DONE ===`);
  console.log(`Fixed: ${fixed} | Exhausted (will use gradient): ${failed}`);
  console.log(`Manifest: ${allImages.length} images`);
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
