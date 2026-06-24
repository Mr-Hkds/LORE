import db from '../../db.cjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { story_id, publish_all } = req.body || {};
      if (publish_all) {
        db.publishAllStories();
      } else if (story_id) {
        db.publishStory(story_id);
      } else {
        return res.status(400).json({ error: 'Missing story_id or publish_all' });
      }
      db.exportStoriesToJSON();
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
