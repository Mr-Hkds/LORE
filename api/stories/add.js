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
      const newStory = req.body;
      if (!newStory || !newStory.story_id || !newStory.title || !newStory.layers) {
        return res.status(400).json({ error: 'Invalid story payload' });
      }

      // If draft is not explicitly specified, save as draft by default
      if (newStory.draft === undefined) {
        newStory.draft = true;
      }

      db.insertStory(newStory);

      if (!newStory.draft) {
        db.exportStoriesToJSON();
      }

      // Check if this matches a recommended topic and mark as generated in the queue
      try {
        const recs = db.getRecommendations();
        const storyTitle = newStory.title.trim().toLowerCase();
        for (const r of recs) {
          const recTopic = r.topic.trim().toLowerCase();
          if (recTopic === storyTitle || storyTitle.includes(recTopic) || recTopic.includes(storyTitle)) {
            db.updateRecommendationStatus(r.id, 'generated');
          }
        }
      } catch (err) {
        console.error('[RECOMMENDATION] Failed to update status in queue:', err.message);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
