const fs = require('fs');
const path = require('path');

const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const STORIES_DIR = path.join(__dirname, 'public', 'content', 'stories');

const storiesData = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8')).stories;
console.log(`Loaded ${storiesData.length} stories from stories.json`);

let updatedCount = 0;

for (const s of storiesData) {
  if (!s || !s.story_id) continue;
  const jsonPath = path.join(STORIES_DIR, `${s.story_id}.json`);
  if (!fs.existsSync(jsonPath)) continue;

  try {
    const fullStory = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let modified = false;

    // Check hero_image sync
    if (s.hero_image && fullStory.hero_image !== s.hero_image) {
      console.log(`[SYNC] Updating hero_image for "${s.story_id}":`);
      console.log(`   Old: ${fullStory.hero_image}`);
      console.log(`   New: ${s.hero_image}`);
      fullStory.hero_image = s.hero_image;
      modified = true;
    }

    // Check title sync
    if (s.title && fullStory.title !== s.title) {
      fullStory.title = s.title;
      modified = true;
    }

    // Check hook sync
    if (s.hook && fullStory.hook !== s.hook) {
      fullStory.hook = s.hook;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(jsonPath, JSON.stringify(fullStory, null, 2));
      updatedCount++;
    }
  } catch (err) {
    console.error(`Error reading ${s.story_id}.json:`, err.message);
  }
}

console.log(`\nSuccessfully synced ${updatedCount} individual story JSON files with stories.json!`);
