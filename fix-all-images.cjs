/**
 * fix-all-images.cjs
 * Downloads and locally saves images for ALL stories that:
 *   1. Have hero_image = null/empty/placeholder
 *   2. Have a local /content/images/ path whose file is missing from disk
 *   3. Have a remote https:// URL (downloads it locally for reliability)
 * 
 * Uses the existing 4-tier resolver for null stories, direct download for known URLs.
 * Updates stories.json with new local paths on success.
 * Writes updated image_manifest.json at the end.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { resolveStoryImage } = require('./lib/image-resolver.cjs');

const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const IMAGES_DIR = path.join(__dirname, 'public', 'content', 'images');
const MANIFEST_FILE = path.join(__dirname, 'public', 'content', 'image_manifest.json');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const IMAGE_UA = 'SevenDescents/2.0 (https://sevendescents.vercel.app)';

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, { headers: { 'User-Agent': IMAGE_UA } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          // Verify file is not empty or tiny (< 2KB = likely error page)
          try {
            const stat = fs.statSync(destPath);
            if (stat.size < 2000) {
              fs.unlink(destPath, () => {});
              return reject(new Error(`File too small (${stat.size} bytes) — likely error response`));
            }
          } catch {}
          resolve();
        });
      });
    });
    req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Download timed out')); });
  });
}

async function run() {
  const data = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  const diskFiles = new Set(fs.readdirSync(IMAGES_DIR));
  const pexelsKey = process.env.PEXELS_API_KEY || '';

  let fixed = 0, failed = 0, skipped = 0;

  for (const story of data.stories) {
    const img = story.hero_image;
    const fname = `${story.story_id}.jpg`;
    const destPath = path.join(IMAGES_DIR, fname);
    const relPath = `/content/images/${fname}`;

    // CASE 1: Already has a valid local file on disk — skip
    if (img && img.startsWith('/content/images/') && diskFiles.has(img.replace('/content/images/', ''))) {
      skipped++;
      continue;
    }

    // CASE 2: Has a local path but the file is MISSING from disk — re-download
    // CASE 3: null/empty/placeholder — resolve fresh
    // CASE 4: Has a remote https:// URL — download it locally

    let sourceUrl = null;

    if (img && img.startsWith('http') && !img.includes('unsplash.com/photo-1509248961158')) {
      // CASE 4: known remote URL — download directly
      sourceUrl = img;
    } else {
      // CASE 2 & 3: resolve via cascade
      console.log(`\n[RESOLVING] "${story.title}" (${story.category})`);
      try {
        const result = await resolveStoryImage(story.story_id, story.title, story.category, pexelsKey);
        if (result && result.url) {
          sourceUrl = result.url;
          console.log(`  → Found via ${result.source}: ${sourceUrl.substring(0, 80)}`);
        } else {
          console.log(`  → No image found via cascade — skipping`);
          failed++;
          continue;
        }
      } catch (err) {
        console.log(`  → Resolver error: ${err.message}`);
        failed++;
        continue;
      }
    }

    // Download the image
    try {
      console.log(`[DOWNLOADING] ${story.story_id} from ${sourceUrl.substring(0, 80)}...`);
      await downloadImage(sourceUrl, destPath);
      story.hero_image = relPath;
      story.image_missing = 0;
      diskFiles.add(fname);
      fixed++;
      console.log(`  ✓ Saved as ${relPath}`);
    } catch (err) {
      console.warn(`  ✗ Download failed: ${err.message}`);
      // If it was a remote URL, keep it as the hero_image (better than null)
      if (img && img.startsWith('http') && !img.includes('unsplash.com/photo-1509248961158')) {
        // Keep the remote URL as-is, don't change
      }
      failed++;
    }
  }

  // Write updated stories.json
  fs.writeFileSync(STORIES_FILE, JSON.stringify(data, null, 2));

  // Rebuild manifest
  const allImages = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify({ committed: allImages, generated_at: new Date().toISOString() }, null, 2));

  console.log(`\n=== DONE ===`);
  console.log(`Fixed: ${fixed} | Failed: ${failed} | Skipped (already OK): ${skipped}`);
  console.log(`Manifest updated: ${allImages.length} images`);
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
