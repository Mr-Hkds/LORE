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
      const { story_id, reaction_type, undo } = req.body || {};
      if (!story_id || !reaction_type) {
        return res.status(400).json({ error: 'Missing story_id or reaction_type' });
      }
      const story = db.getStory(story_id);
      if (story) {
        if (!story.reactions) {
          story.reactions = { gripping: 0, scared: 0, mindblown: 0, like: 0 };
        }
        if (undo) {
          story.reactions[reaction_type] = Math.max(0, (story.reactions[reaction_type] || 1) - 1);
        } else {
          story.reactions[reaction_type] = (story.reactions[reaction_type] || 0) + 1;
        }
        db.updateStory(story_id, { reactions: story.reactions });
        
        if (!story.draft) {
          db.exportStoriesToJSON();
        }
        return res.status(200).json({ success: true, reactions: story.reactions });
      } else {
        return res.status(404).json({ error: 'Story not found' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
