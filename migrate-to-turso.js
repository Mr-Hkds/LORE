/* eslint-disable no-undef, no-unused-vars, no-empty */
const Database = require('better-sqlite3');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// Read env variables
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error('ERROR: Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.');
  console.log('Usage example:');
  console.log('  $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"');
  console.log('  $env:TURSO_AUTH_TOKEN="your-token"');
  console.log('  node migrate-to-turso.js');
  process.exit(1);
}

const localDbPath = path.join(__dirname, 'lore.db');
if (!fs.existsSync(localDbPath)) {
  console.error(`ERROR: Local SQLite database not found at ${localDbPath}`);
  process.exit(1);
}

console.log(`Connecting to local SQLite database at: ${localDbPath}`);
const localDb = new Database(localDbPath);

console.log(`Connecting to remote Turso database at: ${tursoUrl}`);
const remoteClient = createClient({
  url: tursoUrl,
  authToken: tursoToken
});

async function runMigration() {
  console.log('Initializing remote Turso database tables...');
  await remoteClient.executeMultiple(`
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
      layers TEXT,
      custom_image_prompt TEXT
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
  
  // Alter tables for missing columns if needed
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN ip TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN city TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN region TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN country TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN country_code TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE pageviews ADD COLUMN org TEXT"); } catch(e){}
  try { await remoteClient.execute("ALTER TABLE stories ADD COLUMN custom_image_prompt TEXT"); } catch(e){}

  const tables = [
    {
      name: 'stories',
      query: 'SELECT * FROM stories',
      insertSql: `INSERT OR REPLACE INTO stories (
        story_id, title, category, hook, concepts, severity, hero_image, added_date, draft, reactions, evidence_links, connections, layers, custom_image_prompt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    },
    {
      name: 'recommendations',
      query: 'SELECT * FROM recommendations',
      insertSql: 'INSERT OR REPLACE INTO recommendations (id, topic, date, status) VALUES (?, ?, ?, ?)'
    },
    {
      name: 'feedback',
      query: 'SELECT * FROM feedback',
      insertSql: 'INSERT OR REPLACE INTO feedback (id, rating, tags, note, timestamp, page, addressed) VALUES (?, ?, ?, ?, ?, ?, ?)'
    },
    {
      name: 'daily_reactions',
      query: 'SELECT * FROM daily_reactions',
      insertSql: 'INSERT OR REPLACE INTO daily_reactions (date, likes, gripping, scared, mindblown) VALUES (?, ?, ?, ?, ?)'
    },
    {
      name: 'pageviews',
      query: 'SELECT * FROM pageviews',
      insertSql: 'INSERT OR REPLACE INTO pageviews (id, visitor_id, session_id, path, referrer, user_agent, timestamp, ip, city, region, country, country_code, org) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    },
    {
      name: 'comments',
      query: 'SELECT * FROM comments',
      insertSql: 'INSERT OR REPLACE INTO comments (id, target_id, username, comment, timestamp) VALUES (?, ?, ?, ?, ?)'
    },
    {
      name: 'daily_dossier',
      query: 'SELECT * FROM daily_dossier',
      insertSql: 'INSERT OR REPLACE INTO daily_dossier (date, story_id) VALUES (?, ?)'
    }
  ];

  for (const table of tables) {
    console.log(`Reading from local table "${table.name}"...`);
    const rows = localDb.prepare(table.query).all();
    console.log(`Found ${rows.length} rows inside table "${table.name}".`);

    if (rows.length > 0) {
      console.log(`Migrating ${rows.length} rows to remote Turso table "${table.name}"...`);
      
      // Batch rows in chunks of 50 to avoid network payload limits
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const batchQueries = chunk.map(row => {
          // Map properties to query arguments in order
          const keys = table.name === 'stories' 
            ? ['story_id', 'title', 'category', 'hook', 'concepts', 'severity', 'hero_image', 'added_date', 'draft', 'reactions', 'evidence_links', 'connections', 'layers', 'custom_image_prompt']
            : table.name === 'recommendations'
            ? ['id', 'topic', 'date', 'status']
            : table.name === 'feedback'
            ? ['id', 'rating', 'tags', 'note', 'timestamp', 'page', 'addressed']
            : table.name === 'daily_reactions'
            ? ['date', 'likes', 'gripping', 'scared', 'mindblown']
            : table.name === 'pageviews'
            ? ['id', 'visitor_id', 'session_id', 'path', 'referrer', 'user_agent', 'timestamp', 'ip', 'city', 'region', 'country', 'country_code', 'org']
            : table.name === 'comments'
            ? ['id', 'target_id', 'username', 'comment', 'timestamp']
            : ['date', 'story_id'];

          const args = keys.map(k => {
            const val = row[k];
            if (val === undefined) return null;
            return val;
          });

          return { sql: table.insertSql, args };
        });

        await remoteClient.batch(batchQueries, 'write');
        console.log(`  - Migrated records ${i + 1} to ${Math.min(i + chunkSize, rows.length)}`);
      }
    }
    console.log(`Table "${table.name}" migration complete!`);
  }

  console.log('\nMIGRATION COMPLETED SUCCESSFULLY!');
}

runMigration().catch(err => {
  console.error('\nCRITICAL MIGRATION ERROR:', err.message);
  process.exit(1);
});
