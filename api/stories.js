import db from '../db.cjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse path
  const urlPath = req.url.split('?')[0];
  const parts = urlPath.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1] || '';

  // 1. GET /api/stories (Get all stories)
  if (req.method === 'GET') {
    try {
      const includeDrafts = req.query.include_drafts === 'true' || req.query.all === 'true';
      const list = db.getStories(includeDrafts);
      return res.status(200).json(list);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. POST /api/stories/add
  if (req.method === 'POST' && lastPart === 'add') {
    try {
      const newStory = req.body;
      if (!newStory || !newStory.story_id || !newStory.title || !newStory.layers) {
        return res.status(400).json({ error: 'Invalid story payload' });
      }
      if (newStory.draft === undefined) {
        newStory.draft = true;
      }
      db.insertStory(newStory);
      if (!newStory.draft) {
        db.exportStoriesToJSON();
      }
      // Update recommendation status
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

  // 3. POST /api/stories/publish
  if (req.method === 'POST' && lastPart === 'publish') {
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

  // 4. POST /api/stories/react
  if (req.method === 'POST' && lastPart === 'react') {
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

  // 5. PUT /api/stories/:id
  if (req.method === 'PUT' && lastPart && lastPart !== 'stories') {
    try {
      const updates = req.body || {};
      const story = db.getStory(lastPart);
      if (!story) {
        return res.status(404).json({ error: 'Story not found' });
      }
      db.updateStory(lastPart, updates);
      if (!story.draft) {
        db.exportStoriesToJSON();
      }
      return res.status(200).json({ success: true, story: db.getStory(lastPart) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 6. DELETE /api/stories/:id
  if (req.method === 'DELETE' && lastPart && lastPart !== 'stories') {
    try {
      const isInvalidId = !lastPart || lastPart === 'undefined' || lastPart === 'null';
      const story = isInvalidId ? null : db.getStory(lastPart);
      db.deleteStory(lastPart);
      if (isInvalidId || !story || !story.draft) {
        db.exportStoriesToJSON();
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
