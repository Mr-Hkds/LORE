const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;

const EXISTING_LOCAL_IMAGES = new Set([
  'aman_andom_001.jpg',
  'burari_deaths_001.jpg',
  'burari_deaths_001_1782152849860.jpg',
  'burari_diary.jpg',
  'burari_family.jpg',
  'cia_mk_ultra_program.jpg',
  'daily_dossier.jpg',
  'facundo_astudillo_castro_001.jpg',
  'fakhraddin_aboszoda_001.jpg',
  'pipes_toi.jpg',
  'said_s_bedair_001.jpg',
  'the_asch_conformity_experiments.jpg',
  'the_dyatlov_pass_incident.jpg',
  'the_philadelphia_experiment.jpg',
  'unit_731_experiments.jpg',
  'uwe_barschel_001.jpg'
]);
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

  CREATE TABLE IF NOT EXISTS daily_reactions (
    date TEXT PRIMARY KEY,
    likes INTEGER DEFAULT 0,
    gripping INTEGER DEFAULT 0,
    scared INTEGER DEFAULT 0,
    mindblown INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    session_id TEXT,
    path TEXT,
    referrer TEXT,
    user_agent TEXT,
    timestamp TEXT,
    ip TEXT,
    city TEXT,
    region TEXT,
    country TEXT,
    country_code TEXT,
    org TEXT
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT,
    username TEXT,
    comment TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_dossier (
    date TEXT PRIMARY KEY,
    story_id TEXT
  );
`);

// Try to alter pageviews table if it was created without geolocation columns
try { db.exec("ALTER TABLE pageviews ADD COLUMN ip TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pageviews ADD COLUMN city TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pageviews ADD COLUMN region TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pageviews ADD COLUMN country TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pageviews ADD COLUMN country_code TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pageviews ADD COLUMN org TEXT"); } catch(e){}

function ensureStoryReactions(story) {
  const rx = story.reactions || {};
  const total = (rx.like || 0) + (rx.gripping || 0) + (rx.scared || 0) + (rx.mindblown || 0);
  if (total > 0) return rx;

  const hash = (story.title || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + (story.story_id || '').length;
  const category = story.category || '';
  const severity = story.severity || '';

  const seeded = {
    like: 12 + (hash % 45),
    gripping: 10 + (hash % 35),
    scared: (category === 'paranormal' || category === 'true_crime' || severity === 'extreme') ? 22 + (hash % 50) : 1 + (hash % 6),
    mindblown: (category === 'psychology' || category === 'conspiracy') ? 25 + (hash % 55) : 3 + (hash % 10)
  };

  try {
    db.prepare('UPDATE stories SET reactions = ? WHERE story_id = ?').run(JSON.stringify(seeded), story.story_id);
  } catch (err) {
    console.warn(`[DB Reactions] Failed to save seeded reactions for story ${story.story_id}:`, err.message);
  }

  return seeded;
}

function getStories(includeDrafts = false) {
  const stmt = includeDrafts 
    ? db.prepare('SELECT * FROM stories') 
    : db.prepare('SELECT * FROM stories WHERE draft = 0');
  
  const rows = stmt.all();
  return rows.map(row => {
    let isImageMissingOnServer = false;
    const img = row.hero_image;
    if (!img || img === 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800') {
      isImageMissingOnServer = true;
    } else if (img.startsWith('/content/images/')) {
      const filename = img.substring('/content/images/'.length);
      if (!EXISTING_LOCAL_IMAGES.has(filename)) {
        isImageMissingOnServer = true;
      }
    }

    const s = {
      ...row,
      draft: !!row.draft,
      concepts: JSON.parse(row.concepts || '[]'),
      reactions: JSON.parse(row.reactions || '{}'),
      evidence_links: JSON.parse(row.evidence_links || '[]'),
      connections: JSON.parse(row.connections || '[]'),
      layers: JSON.parse(row.layers || '[]'),
      image_missing: isImageMissingOnServer
    };
    s.reactions = ensureStoryReactions(s);
    // Stable fallback: hash story_id to a deterministic date in the 2026 range
    if (s.added_date) {
      s.added_date = s.added_date.substring(0, 10);
    } else {
      const hash = (s.story_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const base = new Date('2026-01-01').getTime();
      const spread = 180 * 24 * 60 * 60 * 1000; // spread over 180 days
      s.added_date = new Date(base + (hash % spread)).toISOString().split('T')[0];
    }
    return s;
  });
}

function getStory(story_id) {
  const row = db.prepare('SELECT * FROM stories WHERE story_id = ?').get(story_id);
  if (!row) return null;

  let isImageMissingOnServer = false;
  const img = row.hero_image;
  if (!img || img === 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800') {
    isImageMissingOnServer = true;
  } else if (img.startsWith('/content/images/')) {
    const filename = img.substring('/content/images/'.length);
    if (!EXISTING_LOCAL_IMAGES.has(filename)) {
      isImageMissingOnServer = true;
    }
  }

  const s = {
    ...row,
    draft: !!row.draft,
    concepts: JSON.parse(row.concepts || '[]'),
    reactions: JSON.parse(row.reactions || '{}'),
    evidence_links: JSON.parse(row.evidence_links || '[]'),
    connections: JSON.parse(row.connections || '[]'),
    layers: JSON.parse(row.layers || '[]'),
    image_missing: isImageMissingOnServer
  };
  s.reactions = ensureStoryReactions(s);
  if (s.added_date) {
    s.added_date = s.added_date.substring(0, 10);
  } else {
    const hash = (s.story_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = new Date('2026-01-01').getTime();
    s.added_date = new Date(base + (hash % (180 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
  }
  return s;
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
    story.added_date || new Date().toLocaleDateString('en-CA'),
    story.draft ? 1 : 0,
    JSON.stringify(story.reactions || { gripping: 0, scared: 0, mindblown: 0, like: 0 }),
    JSON.stringify(story.evidence_links || []),
    JSON.stringify(story.connections || []),
    JSON.stringify(story.layers || [])
  );
  return getStory(story.story_id);
}

function updateStory(story_id, updates) {
  const existing = getStory(story_id);
  if (!existing) return false;
  const merged = { ...existing, ...updates };
  insertStory(merged);
  return true;
}

function deleteStory(story_id) {
  if (!story_id || story_id === 'undefined' || story_id === 'null' || story_id === '') {
    db.prepare("DELETE FROM stories WHERE story_id IS NULL OR story_id = '' OR story_id = 'undefined' OR story_id = 'null'").run();
  } else {
    db.prepare('DELETE FROM stories WHERE story_id = ?').run(story_id);
  }
}

function hasProperThumbnail(story) {
  if (!story || !story.hero_image) return false;
  const img = story.hero_image;
  if (img === 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800') return false;
  return img.startsWith('http') || img.startsWith('/') || img.startsWith('data:');
}

function publishStory(story_id) {
  const story = getStory(story_id);
  if (!story) return false;
  if (!hasProperThumbnail(story)) {
    throw new Error('Story lacks a proper thumbnail image.');
  }
  db.prepare('UPDATE stories SET draft = 0 WHERE story_id = ?').run(story_id);
  
  // Export updated stories database back to static content folder
  exportStoriesToJSON();
  return true;
}

function publishAllStories() {
  const drafts = db.prepare('SELECT * FROM stories WHERE draft = 1').all();
  let count = 0;
  drafts.forEach(row => {
    const s = {
      ...row,
      concepts: JSON.parse(row.concepts || '[]'),
      reactions: JSON.parse(row.reactions || '{}'),
      evidence_links: JSON.parse(row.evidence_links || '[]'),
      connections: JSON.parse(row.connections || '[]'),
      layers: JSON.parse(row.layers || '[]')
    };
    if (hasProperThumbnail(s)) {
      db.prepare('UPDATE stories SET draft = 0 WHERE story_id = ?').run(s.story_id);
      count++;
    }
  });
  if (count > 0) {
    exportStoriesToJSON();
  }
  return count;
}

// Recommendations Helpers
function getRecommendations() {
  return db.prepare('SELECT * FROM recommendations ORDER BY date DESC').all();
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

function getDailyReactions(date) {
  const row = db.prepare('SELECT * FROM daily_reactions WHERE date = ?').get(date);
  if (!row) return { intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 };
  return {
    intriguing: row.likes || 0,
    gripping: row.gripping || 0,
    chilling: row.scared || 0,
    mind_blowing: row.mindblown || 0
  };
}

function updateDailyReaction(date, reaction_type, undo = false) {
  let colName = reaction_type;
  if (reaction_type === 'intriguing' || reaction_type === 'like') colName = 'likes';
  if (reaction_type === 'chilling' || reaction_type === 'scared') colName = 'scared';
  if (reaction_type === 'mind_blowing' || reaction_type === 'mindblown') colName = 'mindblown';

  if (!['likes', 'gripping', 'scared', 'mindblown'].includes(colName)) return false;

  db.prepare('INSERT OR IGNORE INTO daily_reactions (date) VALUES (?)').run(date);
  const change = undo ? -1 : 1;
  db.prepare(`UPDATE daily_reactions SET ${colName} = MAX(0, COALESCE(${colName}, 0) + ?) WHERE date = ?`).run(change, date);
  return true;
}

function setDailyReactions(date, reactions) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_reactions (date, likes, gripping, scared, mindblown)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    date,
    reactions.intriguing || reactions.likes || 0,
    reactions.gripping || 0,
    reactions.chilling || reactions.scared || 0,
    reactions.mind_blowing || reactions.mindblown || 0
  );
}

function logPageView(pv) {
  const stmt = db.prepare(`
    INSERT INTO pageviews (visitor_id, session_id, path, referrer, user_agent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    pv.visitor_id,
    pv.session_id,
    pv.path,
    pv.referrer,
    pv.user_agent,
    pv.timestamp || new Date().toISOString()
  );
}

function getAnalyticsSummary() {
  try {
    const totalPageviews = db.prepare('SELECT COUNT(*) as count FROM pageviews').get().count;
    const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT visitor_id) as count FROM pageviews').get().count;
    
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const activeSessions = db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM pageviews WHERE timestamp >= ?').get(thirtyMinsAgo).count;
    
    const recentPageviews = db.prepare('SELECT * FROM pageviews ORDER BY timestamp DESC LIMIT 50').all();
    
    return {
      totalPageviews,
      uniqueVisitors,
      activeSessions,
      recentPageviews
    };
  } catch (err) {
    console.error('Failed to query analytics:', err.message);
    return { totalPageviews: 0, uniqueVisitors: 0, activeSessions: 0, recentPageviews: [] };
  }
}

function getDailyDossierStoryId(date) {
  const row = db.prepare('SELECT story_id FROM daily_dossier WHERE date = ?').get(date);
  return row ? row.story_id : null;
}

function setDailyDossierStoryId(date, story_id) {
  db.prepare('INSERT OR REPLACE INTO daily_dossier (date, story_id) VALUES (?, ?)').run(date, story_id);
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
  checkDuplicate,
  getDailyReactions,
  updateDailyReaction,
  setDailyReactions,
  logPageView,
  getAnalyticsSummary,
  getDailyDossierStoryId,
  setDailyDossierStoryId
};
