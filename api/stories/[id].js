import db from '../../db.cjs';

export default async function handler(req, res) {
  const { id } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'PUT') {
    try {
      const updates = req.body || {};
      const story = db.getStory(id);
      if (!story) {
        return res.status(404).json({ error: 'Story not found' });
      }
      db.updateStory(id, updates);
      if (!story.draft) {
        db.exportStoriesToJSON();
      }
      return res.status(200).json({ success: true, story: db.getStory(id) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const story = db.getStory(id);
      if (story) {
        db.deleteStory(id);
        if (!story.draft) {
          db.exportStoriesToJSON();
        }
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
