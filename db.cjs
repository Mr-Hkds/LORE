const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;
const dbPath = isVercel ? '/tmp/lore.db' : path.join(__dirname, 'lore.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    story_id TEXT PRIMARY KEY,
    title TEXT,
    category TEXT,
    hook TEXT,
    concepts TEXT,
    severity TEXT,
    hero_image TEXT,
    added_date TEXT,
    draft INTEGER DEFAULT 0,
    reactions TEXT,
    evidence_links TEXT,
    connections TEXT,
    layers TEXT
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    topic TEXT,
    date TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    rating INTEGER,
    tags TEXT,
    note TEXT,
    timestamp TEXT,
    page TEXT,
    addressed INTEGER DEFAULT 0
  );
`);

// Helper functions
function getStories(includeDrafts = false) {
  const stmt = includeDrafts 
    ? db.prepare('SELECT * FROM stories') 
    : db.prepare('SELECT * FROM stories WHERE draft = 0');
  
  const rows = stmt.all();
  return rows.map(row => ({
    ...row,
    draft: !!row.draft,
    concepts: JSON.parse(row.concepts || '[]'),
    reactions: JSON.parse(row.reactions || '{}'),
    evidence_links: JSON.parse(row.evidence_links || '[]'),
    connections: JSON.parse(row.connections || '[]'),
    layers: JSON.parse(row.layers || '[]')
  }));
}

function getStory(story_id) {
  const row = db.prepare('SELECT * FROM stories WHERE story_id = ?').get(story_id);
  if (!row) return null;
  return {
    ...row,
    draft: !!row.draft,
    concepts: JSON.parse(row.concepts || '[]'),
    reactions: JSON.parse(row.reactions || '{}'),
    evidence_links: JSON.parse(row.evidence_links || '[]'),
    connections: JSON.parse(row.connections || '[]'),
    layers: JSON.parse(row.layers || '[]')
  };
}

function insertStory(story) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stories (
      story_id, title, category, hook, concepts, severity, hero_image, added_date, draft, reactions, evidence_links, connections, layers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    story.story_id,
    story.title,
    story.category,
    story.hook,
    JSON.stringify(story.concepts || []),
    story.severity,
    story.hero_image || null,
    story.added_date || new Date().toISOString().split('T')[0],
    story.draft ? 1 : 0,
    JSON.stringify(story.reactions || { gripping: 0, scared: 0, mindblown: 0, like: 0 }),
    JSON.stringify(story.evidence_links || []),
    JSON.stringify(story.connections || []),
    JSON.stringify(story.layers || [])
  );
}

function updateStory(story_id, updates) {
  const existing = getStory(story_id);
  if (!existing) return false;
  const merged = { ...existing, ...updates };
  insertStory(merged);
  return true;
}

function deleteStory(story_id) {
  db.prepare('DELETE FROM stories WHERE story_id = ?').run(story_id);
}

function publishStory(story_id) {
  db.prepare('UPDATE stories SET draft = 0 WHERE story_id = ?').run(story_id);
}

function publishAllStories() {
  db.prepare('UPDATE stories SET draft = 0 WHERE draft = 1').run();
}

function getRecommendations() {
  const rows = db.prepare('SELECT * FROM recommendations').all();
  return rows;
}

function insertRecommendation(rec) {
  const stmt = db.prepare('INSERT OR REPLACE INTO recommendations (id, topic, date, status) VALUES (?, ?, ?, ?)');
  stmt.run(rec.id, rec.topic, rec.date, rec.status || 'pending');
}

function deleteRecommendation(id) {
  db.prepare('DELETE FROM recommendations WHERE id = ?').run(id);
}

function updateRecommendationStatus(id, status) {
  db.prepare('UPDATE recommendations SET status = ? WHERE id = ?').run(status, id);
}

function getFeedback() {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY timestamp DESC').all();
  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    addressed: !!row.addressed
  }));
}

function insertFeedback(fb) {
  const stmt = db.prepare('INSERT OR REPLACE INTO feedback (id, rating, tags, note, timestamp, page, addressed) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(
    fb.id,
    fb.rating,
    JSON.stringify(fb.tags || []),
    fb.note || '',
    fb.timestamp || new Date().toISOString(),
    fb.page || '/',
    fb.addressed ? 1 : 0
  );
}

// Check if a topic already exists in either stories or recommendations (case-insensitive)
function checkDuplicate(topic) {
  const topicLower = topic.trim().toLowerCase();
  
  // Check stories
  const storyStmt = db.prepare('SELECT story_id, title FROM stories');
  const storiesList = storyStmt.all();
  const storyDup = storiesList.find(s => {
    const titleLower = s.title.toLowerCase();
    return titleLower === topicLower || titleLower.includes(topicLower) || topicLower.includes(titleLower);
  });
  if (storyDup) return true;

  // Check recommendations
  const recStmt = db.prepare('SELECT topic FROM recommendations');
  const recsList = recStmt.all();
  const recDup = recsList.find(r => {
    const rTopicLower = r.topic.toLowerCase();
    return rTopicLower === topicLower || rTopicLower.includes(topicLower) || topicLower.includes(rTopicLower);
  });
  if (recDup) return true;

  return false;
}

function deleteFeedback(id) {
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
}

function updateFeedbackAddressed(id, addressed) {
  db.prepare('UPDATE feedback SET addressed = ? WHERE id = ?').run(addressed ? 1 : 0, id);
}

// Rebuild Concept Index and Export to stories.json / concept_index.json
function exportStoriesToJSON() {
  if (isVercel) {
    console.log('[DB] Running on Vercel. Skipping static file export (GitHub Sync should be used for persistence).');
    return;
  }
  const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
  const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');
  
  const stories = getStories(false); // Only live stories
  
  try {
    fs.writeFileSync(STORIES_FILE, JSON.stringify({ stories }, null, 2));
    
    // Update concepts index
    const conceptIndex = {};
    stories.forEach(story => {
      if (story.concepts) {
        story.concepts.forEach(concept => {
          const c = concept.trim().toLowerCase();
          if (!conceptIndex[c]) {
            conceptIndex[c] = [];
          }
          if (!conceptIndex[c].includes(story.story_id)) {
            conceptIndex[c].push(story.story_id);
          }
        });
      }
    });
    fs.writeFileSync(CONCEPTS_FILE, JSON.stringify(conceptIndex, null, 2));
    console.log(`[DB] Successfully exported ${stories.length} live stories to stories.json and rebuilt concept index.`);
  } catch (err) {
    console.error('[DB] Failed to export stories to static JSON files:', err.message);
  }
}

// Migration / Seeding from JSON files if tables are empty
function seed() {
  const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
  const RECOMMENDATIONS_FILE = path.join(__dirname, 'public', 'content', 'recommendations.json');
  const FEEDBACK_FILE = path.join(__dirname, 'public', 'content', 'feedback.json');

  // Seed stories
  const storyCount = db.prepare('SELECT COUNT(*) as count FROM stories').get().count;
  if (storyCount === 0) {
    try {
      let data = null;
      try {
        data = require('./public/content/stories.json');
      } catch (err) {
        if (fs.existsSync(STORIES_FILE)) {
          data = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
        }
      }

      if (data && Array.isArray(data.stories)) {
        console.log(`Seeding ${data.stories.length} stories to SQLite database...`);
        const insertStmt = db.prepare(`
          INSERT INTO stories (
            story_id, title, category, hook, concepts, severity, hero_image, added_date, draft, reactions, evidence_links, connections, layers
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const transaction = db.transaction((stories) => {
          for (const s of stories) {
            insertStmt.run(
              s.story_id,
              s.title,
              s.category,
              s.hook,
              JSON.stringify(s.concepts || []),
              s.severity,
              s.hero_image || null,
              s.added_date || null,
              s.draft ? 1 : 0,
              JSON.stringify(s.reactions || { gripping: 0, scared: 0, mindblown: 0, like: 0 }),
              JSON.stringify(s.evidence_links || []),
              JSON.stringify(s.connections || []),
              JSON.stringify(s.layers || [])
            );
          }
        });
        transaction(data.stories);
      }
    } catch (e) {
      console.error('Failed to seed stories:', e);
    }
  }

  // Seed recommendations
  const recCount = db.prepare('SELECT COUNT(*) as count FROM recommendations').get().count;
  if (recCount === 0) {
    try {
      let recs = null;
      try {
        recs = require('./public/content/recommendations.json');
      } catch (err) {
        if (fs.existsSync(RECOMMENDATIONS_FILE)) {
          recs = JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
        }
      }

      if (Array.isArray(recs)) {
        console.log(`Seeding ${recs.length} recommendations to SQLite database...`);
        const insertStmt = db.prepare('INSERT INTO recommendations (id, topic, date, status) VALUES (?, ?, ?, ?)');
        const transaction = db.transaction((items) => {
          for (const r of items) {
            insertStmt.run(r.id, r.topic, r.date, r.status || 'pending');
          }
        });
        transaction(recs);
      }
    } catch (e) {
      console.error('Failed to seed recommendations:', e);
    }
  }

  // Seed feedback
  const fbCount = db.prepare('SELECT COUNT(*) as count FROM feedback').get().count;
  if (fbCount === 0) {
    try {
      let feedback = null;
      try {
        feedback = require('./public/content/feedback.json');
      } catch (err) {
        if (fs.existsSync(FEEDBACK_FILE)) {
          feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
        }
      }

      if (Array.isArray(feedback)) {
        console.log(`Seeding ${feedback.length} feedback entries to SQLite database...`);
        const insertStmt = db.prepare('INSERT INTO feedback (id, rating, tags, note, timestamp, page, addressed) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const transaction = db.transaction((items) => {
          for (const f of items) {
            insertStmt.run(
              f.id,
              f.rating,
              JSON.stringify(f.tags || []),
              f.note || '',
              f.timestamp || new Date().toISOString(),
              f.page || '/',
              f.addressed ? 1 : 0
            );
          }
        });
        transaction(feedback);
      }
    } catch (e) {
      console.error('Failed to seed feedback:', e);
    }
  }
}

seed();

module.exports = {
  db,
  getStories,
  getStory,
  insertStory,
  updateStory,
  deleteStory,
  publishStory,
  publishAllStories,
  getRecommendations,
  insertRecommendation,
  deleteRecommendation,
  updateRecommendationStatus,
  getFeedback,
  insertFeedback,
  deleteFeedback,
  updateFeedbackAddressed,
  exportStoriesToJSON,
  checkDuplicate
};
