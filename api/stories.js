import https from 'https';
import http from 'http';
import db from '../db.cjs';

function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    let cleanUrl = url;
    if (cleanUrl.startsWith('//')) {
      cleanUrl = 'https:' + cleanUrl;
    }
    const client = cleanUrl.startsWith('https') ? https : http;
    
    const req = client.get(cleanUrl, { timeout: 8000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          return downloadImageAsBase64(loc).then(resolve).catch(reject);
        }
        return reject(new Error('Redirect without location'));
      }
      
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP Error ${res.statusCode}`));
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'image/jpeg';
        const base64 = buffer.toString('base64');
        resolve(`data:${mime};base64,${base64}`);
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Image download timed out'));
    });
  });
}

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
      const list = await db.getStories(includeDrafts);
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
      await db.insertStory(newStory);
      if (!newStory.draft) {
        await db.exportStoriesToJSON();
      }
      // Update recommendation status
      try {
        const recs = await db.getRecommendations();
        const storyTitle = newStory.title.trim().toLowerCase();
        for (const r of recs) {
          const recTopic = r.topic.trim().toLowerCase();
          if (recTopic === storyTitle || storyTitle.includes(recTopic) || recTopic.includes(storyTitle)) {
            await db.updateRecommendationStatus(r.id, 'generated');
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
        await db.publishAllStories();
      } else if (story_id) {
        await db.publishStory(story_id);
      } else {
        return res.status(400).json({ error: 'Missing story_id or publish_all' });
      }
      await db.exportStoriesToJSON();
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
      const story = await db.getStory(story_id);
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
        await db.updateStory(story_id, { reactions: story.reactions });
        if (!story.draft) {
          await db.exportStoriesToJSON();
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
      const story = await db.getStory(lastPart);
      if (!story) {
        return res.status(404).json({ error: 'Story not found' });
      }

      // Download remote cover image and convert to base64 for fast DB serving
      if (updates.hero_image && (updates.hero_image.startsWith('http') || updates.hero_image.startsWith('//'))) {
        try {
          console.log(`[SERVER COVER DOWNLOAD] Downloading remote image: ${updates.hero_image}`);
          const base64Img = await downloadImageAsBase64(updates.hero_image);
          updates.hero_image = base64Img;
          console.log(`[SERVER COVER DOWNLOAD] Successfully downloaded and converted to base64.`);
        } catch (downloadErr) {
          console.warn(`[SERVER COVER DOWNLOAD] Failed to download image:`, downloadErr.message);
        }
      }

      await db.updateStory(lastPart, updates);
      if (!story.draft) {
        await db.exportStoriesToJSON();
      }
      return res.status(200).json({ success: true, story: await db.getStory(lastPart) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 6. DELETE /api/stories/:id
  if (req.method === 'DELETE' && lastPart && lastPart !== 'stories') {
    try {
      const isInvalidId = !lastPart || lastPart === 'undefined' || lastPart === 'null';
      const story = isInvalidId ? null : await db.getStory(lastPart);
      await db.deleteStory(lastPart);
      if (isInvalidId || !story || !story.draft) {
        await db.exportStoriesToJSON();
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
