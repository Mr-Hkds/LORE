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
        
        const normalizeReactionKey = (type) => {
          if (type === 'intriguing')  return 'like';
          if (type === 'chilling')    return 'scared';
          if (type === 'mind_blowing') return 'mindblown';
          return type;
        };
        const canonicalType = normalizeReactionKey(reaction_type);

        if (undo) {
          story.reactions[canonicalType] = Math.max(0, (story.reactions[canonicalType] || 1) - 1);
        } else {
          story.reactions[canonicalType] = (story.reactions[canonicalType] || 0) + 1;
        }
        db.updateStory(story_id, { reactions: story.reactions });
        
        if (!story.draft) {
          db.exportStoriesToJSON();
        }

        // Return both canonical and UI keys for full compatibility
        const rx = story.reactions;
        return res.status(200).json({
          success: true,
          reactions: {
            like: rx.like || 0,
            gripping: rx.gripping || 0,
            scared: rx.scared || 0,
            mindblown: rx.mindblown || 0,
            intriguing: rx.like || 0,
            chilling: rx.scared || 0,
            mind_blowing: rx.mindblown || 0
          }
        });
      } else {
        return res.status(404).json({ error: 'Story not found' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
