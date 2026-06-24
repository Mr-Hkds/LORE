import db from '../db.cjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { sql, params } = req.body;
      if (!sql) {
        return res.status(400).json({ error: 'SQL query is required' });
      }

      const sqlTrimmed = sql.trim().toUpperCase();
      const stmt = db.db.prepare(sql);
      
      let result;
      if (sqlTrimmed.startsWith('SELECT') || sqlTrimmed.startsWith('PRAGMA') || sqlTrimmed.startsWith('EXPLAIN')) {
        result = stmt.all(params || []);
      } else {
        const info = stmt.run(params || []);
        result = {
          changes: info.changes,
          lastInsertRowid: info.lastInsertRowid
        };
        // Regenerate static content if stories table was altered
        if (sqlTrimmed.includes('STORIES')) {
          db.exportStoriesToJSON();
        }
      }

      return res.status(200).json({ success: true, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
