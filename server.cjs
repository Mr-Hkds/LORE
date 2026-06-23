const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3001;
const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');
const FEEDBACK_FILE = path.join(__dirname, 'public', 'content', 'feedback.json');
const STATUS_FILE = path.join(__dirname, 'public', 'content', 'automation_status.json');

// Logs memory store
let automationLogs = [];
let isAutomationRunning = false;
let isAutomationEnabled = true;
let lastAutomationRunAt = 0;
const AUTOMATION_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

function addAutomationLog(msg) {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  const logLine = `[${time}] ${msg}`;
  console.log(logLine);
  automationLogs.push(logLine);
  if (automationLogs.length > 200) {
    automationLogs.shift();
  }
}

// Load environment variables manually
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

// Ensure directory and files exist
function ensureFiles() {
  const contentDir = path.dirname(STORIES_FILE);
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  if (!fs.existsSync(STORIES_FILE)) {
    fs.writeFileSync(STORIES_FILE, JSON.stringify({ stories: [] }, null, 2));
  }
  if (!fs.existsSync(CONCEPTS_FILE)) {
    fs.writeFileSync(CONCEPTS_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(FEEDBACK_FILE)) {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2));
  }
  writeAutomationStatus('standby', '');
}

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

// Write status JSON
function writeAutomationStatus(status, errorMsg) {
  const statusObj = {
    isRunning: isAutomationRunning,
    enabled: isAutomationEnabled,
    lastRunAt: lastAutomationRunAt,
    nextRunAt: lastAutomationRunAt > 0 ? lastAutomationRunAt + AUTOMATION_INTERVAL_MS : Date.now() + 10000,
    intervalMs: AUTOMATION_INTERVAL_MS,
    status: status,
    error: errorMsg || '',
    mode: 'local'
  };
  writeJson(STATUS_FILE, statusObj);
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

// Native HTTPS helper to fetch JSON
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201'
    };
    https.get(url, { headers: { ...defaultHeaders, ...headers } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', err => reject(err));
  });
}

// Native helper to download an image
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Resolve and download Wikipedia thumbnail
async function saveAndGetLocalImage(storyId, imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;
  try {
    const storyImagesDir = path.join(__dirname, 'public', 'content', 'images', storyId);
    if (!fs.existsSync(storyImagesDir)) {
      fs.mkdirSync(storyImagesDir, { recursive: true });
    }
    const localPath = path.join(storyImagesDir, 'cover.jpg');
    await downloadImage(imageUrl, localPath);
    return `/content/images/${storyId}/cover.jpg`;
  } catch (err) {
    addAutomationLog(`Cover image download failed for ${storyId}: ${err.message}`);
    return imageUrl;
  }
}

// Clean and parse JSON from AI model response
function cleanAndParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (inner) {}
    }
    return null;
  }
}

// Rebuild Concept Index
function updateConceptIndex(stories) {
  const conceptIndex = {};
  stories.forEach(story => {
    if (story.concepts) {
      story.concepts.forEach(concept => {
        const c = concept.trim().toLowerCase();
        if (!conceptIndex[c]) {
          conceptIndex[c] = [];
        }
        if (!conceptIndex[c].includes(story.story_id)) {
          conceptIndex[c].push(story.story_id);
        }
      });
    }
  });
  writeJson(CONCEPTS_FILE, conceptIndex);
}

// --- GEMINI BACKGROUND AUTO-GENERATION ENGINE ---
async function runAutomation(isManual = false) {
  if (isAutomationRunning) return;
  if (!isAutomationEnabled && !isManual) return;

  isAutomationRunning = true;
  lastAutomationRunAt = Date.now();
  addAutomationLog('=== STARTING AUTOMATED GEMINI ENGINE ===');
  writeAutomationStatus('running', '');

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    addAutomationLog('CRITICAL ERROR: Gemini API key is not configured in .env');
    isAutomationRunning = false;
    writeAutomationStatus('failed', 'Gemini API key is missing');
    return;
  }

  try {
    // 1. Read existing database
    const storiesData = readJson(STORIES_FILE) || { stories: [] };
    const list = storiesData.stories || [];

    // 2. Count categories to balance coverage
    const categories = ['psychology', 'true_crime', 'paranormal', 'conspiracy', 'gov_experiments', 'cyber_mysteries'];
    const counts = {};
    categories.forEach(c => { counts[c] = 0; });
    list.forEach(s => {
      if (counts[s.category] !== undefined) counts[s.category]++;
    });

    // Find the category with the least stories
    let targetCategory = categories[0];
    let minCount = counts[targetCategory];
    categories.forEach(c => {
      if (counts[c] < minCount) {
        minCount = counts[c];
        targetCategory = c;
      }
    });

    addAutomationLog(`Database contains ${list.length} stories. Balancing category focus...`);
    addAutomationLog(`Least represented category: "${targetCategory}" (${minCount} stories)`);

    // 3. Formulate Prompt for Gemini
    const existingTitles = list.map(s => s.title).join(', ');
    addAutomationLog('Asking Gemini for an unexplored real-world topic...');

    const prompt = `Write a complete, highly-detailed 7-layer documentary story in Hinglish about a famous, documented, real-world case or event.
    
    Category to write: "${targetCategory}"
    
    Exclude these existing story titles (do NOT write about them): [${existingTitles}]. Choose a completely different, famous unexplored topic that fits the category.
    
    CRITICAL FACTUAL AND PACING RULES:
    1. Only real, historically documented cases. Absolutely no creepypastas or internet rumors.
    2. Write the title, hook, layer names, layer content, cliffhangers, and transition lines in high-quality, engaging Hinglish (Hindi written in English alphabet, mixed with English words as spoken by mystery/true-crime podcasters).
    3. The narrative must flow layer by layer: Layer 1 introduces the whisper, Layer 4 details the event, and Layer 7 delivers the absolute darkest documented truth. Layer 1 must start with: 'Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur...'
    4. Each layer content must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.
    5. Place quotes inside text using single quotes ('). Do not use unescaped double quotes inside values.
    
    Structure the story exactly in the following JSON format:
    {
      "story_id": "lowercase_slug_with_underscores",
      "title": "Compelling Title",
      "category": "${targetCategory}",
      "hook": "Teaser description of this case (max 150 chars) in Hinglish.",
      "concepts": ["concept1", "concept2", "concept3"],
      "severity": "unsettling | disturbing | extreme (choose based on topic intensity)",
      "image_query": "The exact Wikipedia article title representing this topic for thumbnail fetching (e.g. Mary Celeste)",
      "layers": [
        {
          "layer": 1,
          "layer_name": "Layer 1 title",
          "content": "Fully-written Layer 1 content starting with 'Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain...'",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 2,
          "layer_name": "Layer 2 title",
          "content": "Fully-written Layer 2 content.",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 3,
          "layer_name": "Layer 3 title",
          "content": "Fully-written Layer 3 content.",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 4,
          "layer_name": "Layer 4 title",
          "content": "Fully-written Layer 4 content.",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 5,
          "layer_name": "Layer 5 title",
          "content": "Fully-written Layer 5 content.",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 6,
          "layer_name": "Layer 6 title",
          "content": "Fully-written Layer 6 content.",
          "cliffhanger": "Cliffhanger sentence."
        },
        {
          "layer": 7,
          "layer_name": "Layer 7 title",
          "content": "Fully-written Layer 7 content.",
          "cliffhanger": null
        }
      ]
    }
    
    Respond with strictly valid JSON only. Do not wrap in markdown code blocks like \`\`\`json. Output raw JSON.`;

    // 4. Call Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Gemini returned an empty response');
    }

    const storyObj = cleanAndParseJSON(responseText);
    if (!storyObj || !storyObj.story_id || !storyObj.title || !storyObj.layers || storyObj.layers.length < 7) {
      throw new Error('Failed to parse a valid 7-layer story from Gemini response');
    }

    storyObj.added_date = new Date().toISOString().split('T')[0];
    addLogTopicGenerated(storyObj.title, storyObj.category);

    // 5. Fetch Cover Image from Wikipedia
    const query = storyObj.image_query || storyObj.title;
    addAutomationLog(`Searching Wikipedia for cover photo: "${query}"`);
    
    let imageUrl = null;
    try {
      const matched = await fetchUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`);
      imageUrl = matched?.thumbnail?.source || null;
    } catch {
      // ignore
    }

    if (imageUrl) {
      addAutomationLog(`Downloading Wikipedia cover photo...`);
      storyObj.hero_image = await saveAndGetLocalImage(storyObj.story_id, imageUrl);
    } else {
      addAutomationLog('No cover photo found on Wikipedia. Using default backdrop.');
      storyObj.hero_image = 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800';
    }

    // 6. Save story to file
    storiesData.stories = storiesData.stories.filter(s => s.story_id !== storyObj.story_id);
    storiesData.stories.push(storyObj);
    writeJson(STORIES_FILE, storiesData);
    updateConceptIndex(storiesData.stories);

    addAutomationLog(`SUCCESS: Story "${storyObj.title}" successfully added to archive.`);
    isAutomationRunning = false;
    writeAutomationStatus('standby', '');

  } catch (err) {
    addAutomationLog(`CRITICAL ERROR during generation: ${err.message}`);
    isAutomationRunning = false;
    writeAutomationStatus('failed', err.message);
  }
}

function addLogTopicGenerated(title, category) {
  addAutomationLog(`[GENERATED] "${title}" for category "${category}"`);
}

// Start first run 10 seconds after server starts
setTimeout(() => {
  runAutomation();
}, 10000);

// Setup interval
setInterval(() => {
  runAutomation();
}, AUTOMATION_INTERVAL_MS);

// --- DAILY DOSSIER STATIC DATA ---
const DAILY_THEMES = {
  0: { name: 'Conspiracy Sunday', hint: 'conspiracies, government coverups, and espionage projects' },
  1: { name: 'Mystery Monday', hint: 'unexplained mysteries, disappearances, and unsolved riddles' },
  2: { name: 'Thriller Tuesday', hint: 'high-stakes thrillers, espionage, and political assassinations' },
  3: { name: 'Shadowy Wednesday', hint: 'shadowy scientific experiments, classified research, and dangerous weapons' },
  4: { name: 'Supernatural Thursday', hint: 'supernatural events, cults, occult practices, and paranormal encounters' },
  5: { name: 'Chilling Friday', hint: 'chilling tragedies, historical disasters, and fatal accidents' },
  6: { name: 'Criminal Saturday', hint: 'notorious crimes, heist masterminds, and high-profile trials' }
};

const DAILY_STATIC_FALLBACKS = {
  0: {
    title: 'Project MKUltra',
    year: '1953',
    text: '1953 mein CIA ne ek secret mind control project start kiya tha. Bina consent ke logo par LSD, hypnosis aur sensory deprivation test kiye gaye.',
    wikiQuery: 'Project MKUltra',
    theories: [
      { name: 'Mind Control Success', explanation: 'Suno to, kuch logs sochte hain ki CIA ne actually mind control achieve kar liya tha aur aaj bhi secret agents trigger words se activate hote hain.' },
      { name: 'Mass Drug Tests', explanation: 'Yeh theory kehti hai ki MKUltra sirf ek pilot project tha, aur actual chemicals ko local water supply ya public areas mein test kiya gaya tha.' },
      { name: 'Covert Brainwashing', explanation: 'Kaha jata hai ki project brainwash methods mein convert kar diya gaya aur modern digital methods se use kiya jata hai.' }
    ],
    suspicionLabel: 'Government Coverup Index',
    defaultSuspicion: 92
  },
  1: {
    title: 'Dyatlov Pass Incident',
    year: '1959',
    text: '1959 mein Russian Urals mein 9 experienced hikers ajeeb halat mein mare gaye. Unka tent andar se fata tha aur bodies par radiation ke traces mile.',
    wikiQuery: 'Dyatlov Pass incident',
    theories: [
      { name: 'Infrasound Hysteria', explanation: 'Mausam ke vajah se wind ne infrasound create kiya, jisne hikers ke dimaag mein panic daal diya aur woh bina kapdo ke bhaag nikle.' },
      { name: 'Soviet Weapons Test', explanation: 'Pass ke paas koi secret military testing chal rahi thi, aur wahan ke radioactive fallout ne unhe maar diya.' },
      { name: 'Mansi Tribe Attack', explanation: 'Local tribes ne apne sacred mountain ko defend karne ke liye hikers par secretly war kiya jisse koi external wound na dikhe.' }
    ],
    suspicionLabel: 'Supernatural Odds',
    defaultSuspicion: 85
  },
  2: {
    title: 'Klaus Fuchs Espionage',
    year: '1950',
    text: 'Klaus Fuchs ek German physicist aur atomic spy tha, jisne Manhattan Project ke secrets secretly Soviet Union ko leak kar diye, jiske baad use 9 saal ki saza hui.',
    wikiQuery: 'Klaus Fuchs',
    theories: [
      { name: 'Double Agent Play', explanation: 'Kuch records kehte hain ki Klaus British intelligence ke liye ek double agent tha aur jaanbujhkar atomic parameters leak kar raha tha.' },
      { name: 'Microfilm Cache', explanation: 'Uski leak ki gayi microfilms ka ek bada hissa Dresden ke kisi secret underground vault mein chhupa hua hai.' },
      { name: 'Los Alamos Ring', explanation: 'Fuchs akele kaam nahi kar raha tha, Los Alamos ke-andar ek aur bada spy network tha jise FBI kabhi trace nahi kar payi.' }
    ],
    suspicionLabel: 'Espionage Intrigue Level',
    defaultSuspicion: 78
  },
  3: {
    title: 'Tuskegee Syphilis Study',
    year: '1932',
    text: '1932 mein government doctors ne 600 black individuals par bina consent ke clinical trials chalaye aur unhe treatment se door rakha taaki disease ka development track ho sake.',
    wikiQuery: 'Tuskegee Syphilis Study',
    theories: [
      { name: 'Deliberate Infection', explanation: 'Doctors ne participants ko track hi nahi kiya balki unhe intentionally virus se inject kiya tha.' },
      { name: 'Institutional Racism Test', explanation: 'Yeh study healthcare systems mein minority populations ko check karne ke liye ek pre-planned benchmark bani thi.' },
      { name: 'Post-war Coverup', explanation: '1940s mein penicillin standard treatment banne ke baad bhi government ne information deliberately suppress kiya taaki experiment continue rahe.' }
    ],
    suspicionLabel: 'Medical Betrayal Index',
    defaultSuspicion: 95
  },
  4: {
    title: 'Salem Witch Trials',
    year: '1692',
    text: '1692 mein Salem Massachusetts mein mass hysteria fail gaya. Aapas mein hi ek doosre par witchcraft ka jhootha arop lagakar kai masoom logo ko execute kar diya gaya.',
    wikiQuery: 'Salem witch trials',
    theories: [
      { name: 'Ergot Poisoning', explanation: 'Rye grain par ergot fungus grow ho gaya tha, jise khane se logon ko hallucinogenic fits aur seizures pad rahe the.' },
      { name: 'Property Land Grabbing', explanation: 'Wealthy landowners ne witch accuse kiya taaki court unki land seize kar le aur use saste mein auction kiya ja sake.' },
      { name: 'Puritan Mass Delusion', explanation: 'Intense religious environment aur native American attacks ke darr se pure community ka mental health collapse ho gaya.' }
    ],
    suspicionLabel: 'Mass Hysteria Probability',
    defaultSuspicion: 88
  },
  5: {
    title: 'Sinking of the Titanic',
    year: '1912',
    text: '1912 ki raat ko us waqt ka sabse bada aur secure ship Titanic ek iceberg se takra kar Atlantic Ocean ke freezing paani mein doob gaya, jismein 1500 se zyada log maare gaye.',
    wikiQuery: 'Sinking of the Titanic',
    theories: [
      { name: 'Olympic Swap', explanation: 'Owner company JP Morgan ne actual Titanic ko damaged sister ship Olympic se swap kar diya insurance money recover karne ke liye.' },
      { name: 'Deliberate Speed Course', explanation: 'Captain Smith ko ice warnings milne ke baad bhi speed badhane ka order mila tha taaki records break ho sakein.' },
      { name: 'Secret Target Assassination', explanation: 'Federal Reserve ke against khade teen billionaires (Astor, Guggenheim, Straus) is ship par the aur unhe eliminate karne ke liye ship doobayi gayi.' }
    ],
    suspicionLabel: 'Sinking Conspiracy Index',
    defaultSuspicion: 65
  },
  6: {
    title: 'Isabella Stewart Gardner Heist',
    year: '1990',
    text: '1990 mein do chor police officer bankar Boston ke museum mein ghuse aur 500 million dollars ki paintings chura kar gayab ho gaye. Yeh robbery aaj tak unresolved hai.',
    wikiQuery: 'Isabella Stewart Gardner Museum heist',
    theories: [
      { name: 'Inside Security Job', explanation: 'Museum guard Richard Abath ne doors unlock kiya aur motion detectors ke signals bypass karne mein choro ki madad ki.' },
      { name: 'Irish Mob Funding', explanation: 'Churayi gayi paintings Boston ke Irish Mob ke paas gayi aur unhe collateral ke roop mein arms deals aur drug trafficking ke liye use kiya gaya.' },
      { name: 'Hidden European Collector', explanation: 'Robbery ek wealthy European collector ke command par hui thi, jisne paintings ko kisi bunker mein chhipakar rakha hai.' }
    ],
    suspicionLabel: 'Insider Assistance Odds',
    defaultSuspicion: 82
  }
};

function generateDailyDossier(dayOfWeek) {
  const dossier = { ...DAILY_STATIC_FALLBACKS[dayOfWeek] };
  dossier.theme = DAILY_THEMES[dayOfWeek].name;
  dossier.wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(dossier.wikiQuery || dossier.title)}`;
  dossier.wikiSummary = dossier.text;
  dossier.thumbnail = `https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800`;
  return dossier;
}

// --- HTTP SERVER MAIN ROUTER ---
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // Route: GET /api/daily-dossier
  if (req.method === 'GET' && pathname === '/api/daily-dossier') {
    const todayObj = new Date();
    const dayOfWeek = todayObj.getDay();
    const dossier = generateDailyDossier(dayOfWeek);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dossier));
    return;
  }

  // Route: GET /api/automation/status
  if (req.method === 'GET' && pathname === '/api/automation/status') {
    const nextRunMs = lastAutomationRunAt > 0
      ? Math.max(0, lastAutomationRunAt + AUTOMATION_INTERVAL_MS - Date.now())
      : 10000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      isRunning: isAutomationRunning,
      enabled: isAutomationEnabled,
      logCount: automationLogs.length,
      lastRunAt: lastAutomationRunAt,
      nextRunMs,
      intervalMs: AUTOMATION_INTERVAL_MS
    }));
    return;
  }

  // Route: GET /api/automation/logs
  if (req.method === 'GET' && pathname === '/api/automation/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(automationLogs));
    return;
  }

  // Route: POST /api/automation/run
  if (req.method === 'POST' && pathname === '/api/automation/run') {
    runAutomation(true);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Gemini Auto-Generation triggered.' }));
    return;
  }

  // Route: POST /api/automation/toggle
  if (req.method === 'POST' && pathname === '/api/automation/toggle') {
    try {
      const body = await getJsonBody(req);
      if (body.enabled !== undefined) {
        isAutomationEnabled = !!body.enabled;
      } else {
        isAutomationEnabled = !isAutomationEnabled;
      }
      addAutomationLog(`Automation state changed: ${isAutomationEnabled ? 'ENABLED' : 'DISABLED'}`);
      writeAutomationStatus('standby', '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled: isAutomationEnabled }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: POST /api/stories/react
  if (req.method === 'POST' && pathname === '/api/stories/react') {
    try {
      const { story_id, reaction_type, undo } = await getJsonBody(req);
      if (!story_id || !reaction_type) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing story_id or reaction_type' }));
        return;
      }
      const storiesData = readJson(STORIES_FILE) || { stories: [] };
      const story = storiesData.stories.find(s => s.story_id === story_id);
      if (story) {
        if (!story.reactions) {
          story.reactions = { gripping: 0, scared: 0, mindblown: 0, like: 0 };
        }
        if (undo) {
          story.reactions[reaction_type] = Math.max(0, (story.reactions[reaction_type] || 1) - 1);
        } else {
          story.reactions[reaction_type] = (story.reactions[reaction_type] || 0) + 1;
        }
        writeJson(STORIES_FILE, storiesData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, reactions: story.reactions }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Story not found' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Route: GET /api/feedback
  if (req.method === 'GET' && pathname === '/api/feedback') {
    const fb = readJson(FEEDBACK_FILE) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fb));
    return;
  }

  // Route: POST /api/feedback
  if (req.method === 'POST' && pathname === '/api/feedback') {
    try {
      const entry = await getJsonBody(req);
      if (!entry.rating) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rating required' }));
        return;
      }
      entry.id = entry.id || ('fb_' + Date.now());
      entry.timestamp = entry.timestamp || new Date().toISOString();
      entry.addressed = false;
      const feedback = readJson(FEEDBACK_FILE) || [];
      feedback.unshift(entry);
      writeJson(FEEDBACK_FILE, feedback);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: DELETE /api/feedback
  if (req.method === 'DELETE' && pathname === '/api/feedback') {
    const id = urlObj.searchParams.get('id');
    if (!id) { res.writeHead(400); res.end('{"error":"id required"}'); return; }
    let feedback = readJson(FEEDBACK_FILE) || [];
    feedback = feedback.filter(f => f.id !== id);
    writeJson(FEEDBACK_FILE, feedback);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Route: PATCH /api/feedback
  if (req.method === 'PATCH' && pathname === '/api/feedback') {
    const id = urlObj.searchParams.get('id');
    if (!id) { res.writeHead(400); res.end('{"error":"id required"}'); return; }
    const body = await getJsonBody(req);
    const feedback = readJson(FEEDBACK_FILE) || [];
    const item = feedback.find(f => f.id === id);
    if (item) {
      item.addressed = body.addressed !== undefined ? body.addressed : !item.addressed;
      writeJson(FEEDBACK_FILE, feedback);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, addressed: item.addressed }));
    } else {
      res.writeHead(404); res.end('{"error":"Not found"}');
    }
    return;
  }

  // Route: PUT /api/stories/:id
  const storyPutMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
  if (req.method === 'PUT' && storyPutMatch) {
    try {
      const storyId = storyPutMatch[1];
      const updates = await getJsonBody(req);
      const storiesData = readJson(STORIES_FILE) || { stories: [] };
      const storyIdx = storiesData.stories.findIndex(s => s.story_id === storyId);
      if (storyIdx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Story not found' }));
        return;
      }
      storiesData.stories[storyIdx] = { ...storiesData.stories[storyIdx], ...updates };
      writeJson(STORIES_FILE, storiesData);
      
      updateConceptIndex(storiesData.stories);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, story: storiesData.stories[storyIdx] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: POST /api/stories/add
  if (req.method === 'POST' && pathname === '/api/stories/add') {
    try {
      const newStory = await getJsonBody(req);
      if (!newStory.story_id || !newStory.title || !newStory.layers) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid story payload' }));
        return;
      }

      const storiesData = readJson(STORIES_FILE) || { stories: [] };
      storiesData.stories = storiesData.stories.filter(s => s.story_id !== newStory.story_id);
      storiesData.stories.push(newStory);
      writeJson(STORIES_FILE, storiesData);

      updateConceptIndex(storiesData.stories);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Route: DELETE /api/stories/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/stories/')) {
    const id = pathname.split('/').pop();
    
    const storiesData = readJson(STORIES_FILE) || { stories: [] };
    const initialLen = storiesData.stories.length;
    storiesData.stories = storiesData.stories.filter(s => s.story_id !== id);
    if (storiesData.stories.length < initialLen) {
      writeJson(STORIES_FILE, storiesData);
    }
    
    updateConceptIndex(storiesData.stories);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Route: POST /api/upload-image
  if (req.method === 'POST' && pathname === '/api/upload-image') {
    try {
      const { storyId, filename, base64Data } = await getJsonBody(req);
      if (!filename || !base64Data) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing filename or base64Data' }));
        return;
      }

      const folderName = storyId || 'general';
      const storyImagesDir = path.join(__dirname, 'public', 'content', 'images', folderName);
      if (!fs.existsSync(storyImagesDir)) {
        fs.mkdirSync(storyImagesDir, { recursive: true });
      }

      const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      
      const localPath = path.join(storyImagesDir, filename);
      fs.writeFileSync(localPath, buffer);

      const relativePath = `/content/images/${folderName}/${filename}`;
      console.log(`[UPLOAD] Image saved locally: ${relativePath}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, path: relativePath }));
    } catch (err) {
      console.error('[UPLOAD] Error saving uploaded image:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

ensureFiles();

server.listen(PORT, () => {
  console.log(`Local Archive Console server running at http://localhost:${PORT}`);
});
