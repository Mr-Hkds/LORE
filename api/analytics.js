import db from '../db.cjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { visitor_id, session_id, path, referrer, user_agent } = req.body || {};
      
      await db.logPageView({
        visitor_id: visitor_id || 'unknown',
        session_id: session_id || 'unknown',
        path: path || '/',
        referrer: referrer || '',
        user_agent: user_agent || '',
        timestamp: new Date().toISOString()
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const summary = await db.getAnalyticsSummary();
      return res.status(200).json(summary);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
