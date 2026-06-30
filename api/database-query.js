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
      const resQuery = await db.client.execute({ sql, args: params || [] });
      
      let result;
      if (sqlTrimmed.startsWith('SELECT') || sqlTrimmed.startsWith('PRAGMA') || sqlTrimmed.startsWith('EXPLAIN')) {
        result = resQuery.rows;
      } else {
        result = {
          changes: resQuery.rowsAffected,
          lastInsertRowid: resQuery.lastInsertRowid !== undefined ? String(resQuery.lastInsertRowid) : null
        };
        // Regenerate static content if stories table was altered
        if (sqlTrimmed.includes('STORIES')) {
          await db.exportStoriesToJSON();
        }
      }

      return res.status(200).json({ success: true, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
