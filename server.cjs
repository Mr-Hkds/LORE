const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const RECS_FILE = path.join(__dirname, 'public', 'content', 'recommendations.json');
const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');

// Ensure directory and files exist
function ensureFiles() {
  const contentDir = path.dirname(RECS_FILE);
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  if (!fs.existsSync(RECS_FILE)) {
    fs.writeFileSync(RECS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(STORIES_FILE)) {
    fs.writeFileSync(STORIES_FILE, JSON.stringify({ stories: [] }, null, 2));
  }
  if (!fs.existsSync(CONCEPTS_FILE)) {
    fs.writeFileSync(CONCEPTS_FILE, JSON.stringify({}, null, 2));
  }
}

ensureFiles();

// Helper to read JSON file
function readJson(file) {
  try {
    const data = fs.readFileSync(file, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
    return null;
  }
}

// Helper to write JSON file
function writeJson(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return true;
  } catch (e) {
    console.error(`Error writing to ${file}:`, e);
    return false;
  }
}

// Helper to parse JSON body
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', err => reject(err));
  });
}

const server = http.createServer(async (req, res) => {
  // Set CORS headers just in case
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // Route 1: GET /api/recommendations
  if (req.method === 'GET' && pathname === '/api/recommendations') {
    const recs = readJson(RECS_FILE) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recs));
    return;
  }

  // Route 2: POST /api/recommendations
  if (req.method === 'POST' && pathname === '/api/recommendations') {
    try {
      const newRec = await getJsonBody(req);
      if (!newRec.topic) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing topic' }));
        return;
      }

      const recs = readJson(RECS_FILE) || [];
      // Prevent duplicates
      const existing = recs.find(r => r.topic.toLowerCase() === newRec.topic.toLowerCase());
      if (existing) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, duplicate: true, status: existing.status }));
        return;
      }
      
      recs.push({
        id: newRec.id || 'rec_' + Date.now(),
        topic: newRec.topic,
        date: newRec.date || new Date().toLocaleDateString(),
        status: 'pending'
      });
      writeJson(RECS_FILE, recs);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }
    return;
  }

  // Route 3: PUT /api/recommendations/:id (or query parameter ?id=)
  if (req.method === 'PUT' && pathname.startsWith('/api/recommendations/')) {
    const id = pathname.split('/').pop();
    const recs = readJson(RECS_FILE) || [];
    const index = recs.findIndex(r => r.id === id);

    if (index !== -1) {
      recs[index].status = 'generated';
      writeJson(RECS_FILE, recs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Recommendation not found' }));
    }
    return;
  }

  // Route 4: DELETE /api/recommendations/:id (or query parameter ?id=)
  if (req.method === 'DELETE' && pathname.startsWith('/api/recommendations/')) {
    const id = pathname.split('/').pop();
    const recs = readJson(RECS_FILE) || [];
    const index = recs.findIndex(r => r.id === id);

    if (index !== -1) {
      recs.splice(index, 1);
      writeJson(RECS_FILE, recs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Recommendation not found' }));
    }
    return;
  }

  // Route 5: POST /api/stories/add
  if (req.method === 'POST' && pathname === '/api/stories/add') {
    try {
      const newStory = await getJsonBody(req);
      if (!newStory.story_id || !newStory.title || !newStory.layers) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid story payload' }));
        return;
      }

      // 1. Update stories.json
      const storiesData = readJson(STORIES_FILE) || { stories: [] };
      // Filter out duplicate if it exists
      storiesData.stories = storiesData.stories.filter(s => s.story_id !== newStory.story_id);
      storiesData.stories.push(newStory);
      writeJson(STORIES_FILE, storiesData);

      // 2. Update concept_index.json
      const conceptIndex = readJson(CONCEPTS_FILE) || {};
      // Remove this story from all old concepts
      Object.keys(conceptIndex).forEach(concept => {
        conceptIndex[concept] = conceptIndex[concept].filter(id => id !== newStory.story_id);
        if (conceptIndex[concept].length === 0) {
          delete conceptIndex[concept];
        }
      });
      // Add to new concepts
      if (newStory.concepts) {
        newStory.concepts.forEach(concept => {
          if (!conceptIndex[concept]) {
            conceptIndex[concept] = [];
          }
          if (!conceptIndex[concept].includes(newStory.story_id)) {
            conceptIndex[concept].push(newStory.story_id);
          }
        });
      }
      writeJson(CONCEPTS_FILE, conceptIndex);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Route 5: DELETE /api/stories/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/stories/')) {
    const id = pathname.split('/').pop();
    
    // 1. Remove from stories.json
    const storiesData = readJson(STORIES_FILE) || { stories: [] };
    const initialLen = storiesData.stories.length;
    storiesData.stories = storiesData.stories.filter(s => s.story_id !== id);
    if (storiesData.stories.length < initialLen) {
      writeJson(STORIES_FILE, storiesData);
    }
    
    // 2. Remove from concept_index.json
    const conceptIndex = readJson(CONCEPTS_FILE) || {};
    let changed = false;
    Object.keys(conceptIndex).forEach(concept => {
      const filtered = conceptIndex[concept].filter(storyId => storyId !== id);
      if (filtered.length !== conceptIndex[concept].length) {
        changed = true;
        conceptIndex[concept] = filtered;
        if (filtered.length === 0) delete conceptIndex[concept];
      }
    });
    if (changed) writeJson(CONCEPTS_FILE, conceptIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Catch-all
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`Local Archive Console server running at http://localhost:${PORT}`);
});
