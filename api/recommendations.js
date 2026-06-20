/**
 * Vercel Serverless Function: /api/recommendations
 * Interacts with Vercel KV (Upstash Redis) using native fetch REST commands.
 * Zero-dependency, lightweight, and robust.
 */
export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.error('Vercel KV environment variables (KV_REST_API_URL / KV_REST_API_TOKEN) are missing.');
    return res.status(500).json({ error: 'Database configuration missing. Please link a KV database on Vercel.' });
  }

  // Helper to execute Upstash Redis command
  async function execRedis(command) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });
    if (!response.ok) {
      throw new Error(`Upstash API returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.result;
  }

  // Handle request methods
  if (req.method === 'GET') {
    try {
      const raw = await execRedis(['GET', 'lore:recommendations']);
      const recs = raw ? JSON.parse(raw) : [];
      return res.status(200).json(recs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const newRec = req.body;
      if (!newRec || !newRec.id || !newRec.topic) {
        return res.status(400).json({ error: 'Invalid recommendation data' });
      }

      const raw = await execRedis(['GET', 'lore:recommendations']);
      let recs = raw ? JSON.parse(raw) : [];

      // Avoid duplicates
      if (!recs.some(r => r.id === newRec.id)) {
        recs.push(newRec);
        await execRedis(['SET', 'lore:recommendations', JSON.stringify(recs)]);
      }

      return res.status(200).json({ success: true, recommendation: newRec });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, status } = req.body || {};
      if (!id || !status) {
        return res.status(400).json({ error: 'Missing id or status' });
      }

      const raw = await execRedis(['GET', 'lore:recommendations']);
      let recs = raw ? JSON.parse(raw) : [];

      const updated = recs.map(r => r.id === id ? { ...r, status } : r);
      await execRedis(['SET', 'lore:recommendations', JSON.stringify(updated)]);

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
