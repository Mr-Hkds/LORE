import db from '../db.cjs';

async function getCommentsWithAiFallback(targetId, title, category) {
  const existing = db.getComments(targetId);
  if (existing && existing.length > 0) {
    return existing;
  }

  console.log(`[AI Comments] Seeding comments for target: ${targetId}...`);
  
  const fallbackComments = [
    { username: 'shadow_reader', text: 'This is incredibly detailed. Kaise compile kiya ye data?' },
    { username: 'dossier_agent', text: 'Layer 5 details are highly confidential. Be careful sharing this archive.' },
    { username: 'curious_mind', text: 'I heard about this case, but didn’t know there were 7 layers of descent.' }
  ];

  try {
    const prompt = `You are a dark web moderator. Someone posted a classified dossier: "${title || targetId}", category: "${category || 'General'}". Generate exactly 3 creepy, skeptical, or intellectual discussion forum comments from different users in Hinglish/English. Return ONLY a JSON array of objects with keys "username" and "text". Do not include markdown code block formatting. Format: [{"username": "user1", "text": "comment1"}, ...]`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { signal: controller.signal });
    clearTimeout(id);

    if (res.ok) {
      const text = await res.text();
      const cleanJson = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (cleanJson) {
        const parsed = JSON.parse(cleanJson[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.slice(0, 4).map(c => ({
            username: c.username || 'anonymous',
            text: c.text || '...'
          }));
          for (const c of validated) {
            db.insertComment(targetId, c.username, c.text);
          }
          return db.getComments(targetId);
        }
      }
    }
  } catch (err) {
    console.warn('[AI Comments] Failed to generate comments from Pollinations:', err.message);
  }

  // Save fallbacks
  for (const c of fallbackComments) {
    db.insertComment(targetId, c.username, c.text);
  }
  return db.getComments(targetId);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const target_id = url.searchParams.get('target_id');
      const title = url.searchParams.get('title') || '';
      const category = url.searchParams.get('category') || '';
      
      if (!target_id) {
        return res.status(400).json({ error: 'Missing target_id' });
      }

      const comments = await getCommentsWithAiFallback(target_id, title, category);
      return res.status(200).json(comments);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { target_id, username, comment } = req.body || {};
      if (!target_id || !username || !comment) {
        return res.status(400).json({ error: 'Missing target_id, username, or comment' });
      }

      db.insertComment(target_id, username, comment);
      const comments = db.getComments(target_id);
      return res.status(200).json(comments);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
