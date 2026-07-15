import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const DICT_FILE = path.join(process.cwd(), 'public', 'content', 'dictionary.json');

  if (req.method === 'GET') {
    try {
      if (fs.existsSync(DICT_FILE)) {
        const data = fs.readFileSync(DICT_FILE, 'utf8');
        return res.status(200).json(JSON.parse(data));
      } else {
        return res.status(200).json({});
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid dictionary payload' });
      }
      if (!process.env.VERCEL) {
        fs.writeFileSync(DICT_FILE, JSON.stringify(data, null, 2));
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
