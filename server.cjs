const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('./db.cjs');

const PORT = 3001;
const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');
const FEEDBACK_FILE = path.join(__dirname, 'public', 'content', 'feedback.json');
const STATUS_FILE = path.join(__dirname, 'public', 'content', 'automation_status.json');
const RECOMMENDATIONS_FILE = path.join(__dirname, 'public', 'content', 'recommendations.json');

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
  if (process.env.VERCEL) {
    return true; // Skip writing on Vercel read-only filesystem
  }
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
    const list = db.getStories(true); // Get all, including drafts

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

    // 3. Formulate Prompt for Gemini, integrating recommendations queue
    const existingTitles = list.map(s => s.title).join(', ');
    
    // Read local recommendations queue (only take top 5 pending topics to avoid overwhelming AI/context)
    let pendingTopicsText = '';
    let recs = [];
    try {
      recs = db.getRecommendations();
      const pendingRecs = recs.filter(r => r.status === 'pending');
      if (pendingRecs.length > 0) {
        pendingTopicsText = pendingRecs.slice(0, 5).map(r => `"- Topic: '${r.topic}', Recommendation ID: '${r.id}'"`).join('\n');
        addAutomationLog(`Found ${pendingRecs.length} pending recommendations. Offering top 5 to Gemini.`);
      } else {
        addAutomationLog('No pending recommendations found. Gemini will choose a topic.');
      }
    } catch (err) {
      console.error('[Automation] Failed to read recommendations:', err.message);
    }

    addAutomationLog('Asking Gemini for an unexplored real-world topic...');

    const prompt = `Write a complete, highly-detailed 7-layer documentary story in simple, professional English about a famous, documented, real-world case or event.
    
    Target Category: "${targetCategory}" (If writing about a user-recommended topic, you can classify it into whichever category fits best).
    
    User-Recommended Topics:
    ${pendingTopicsText || 'None. Please choose your own topic.'}
    
    CRITICAL TOPIC SELECTION RULES:
    1. If there are User-Recommended Topics provided above, review them. Select one of them if it is a compelling, historically documented case, OR if it fits the target category. If a user-recommended topic is chosen, you must return its 'Recommendation ID' in the "chosen_recommendation_id" field of the JSON.
    2. If no user-recommended topics are provided, or if none of them are historically verifiable/compelling, choose a completely different, famous unexplored topic that fits the Target Category "${targetCategory}". In this case, set "chosen_recommendation_id" to null.
    3. Exclude these existing story titles (do NOT write about them): [${existingTitles}].

    CRITICAL FACTUAL AND PACING RULES:
    1. Only real, historically documented cases. Absolutely no creepypastas or internet rumors.
    2. Write the title, hook, layer names, layer content, cliffhangers, and transition lines in clean, professional, and clear English. The tone should be similar to an educational video essay or a premium documentary narrator. Keep the vocabulary accessible but serious. Do NOT use cheap sensationalism, clickbait phrasing, or slang. Avoid any Hinglish or Hindi words.
    3. The narrative must flow layer by layer: Layer 1 introduces the whisper, Layer 4 details the event, and Layer 7 delivers the absolute darkest documented truth.
    4. Layer 1 MUST start with a unique, gripping, topic-specific factual hook to capture the reader's attention. Rhetorical questions or generic conversational openings are ABSOLUTELY FORBIDDEN. Specifically, do NOT use: "Did you know?", "Have you ever wondered?", "What if...", "Kya aapne kabhi socha hai?", "Chalo aaj le chalte hain", "Let us explore", "Imagine a world where", or similar cliches. Go straight into a concrete, chilling, or fascinating historical fact or observation (e.g. "On July 1, 2018, eleven bodies hung in perfect circular alignment...").
    5. Each layer content must be 2-3 detailed paragraphs. Use double newlines \n\n between paragraphs.
    6. Place quotes inside text using single quotes ('). Do not use unescaped double quotes inside values.
    
    Structure the story exactly in the following JSON format:
    {
      "story_id": "lowercase_slug_with_underscores",
      "title": "Compelling Title",
      "category": "category_name",
      "hook": "Teaser description of this case (max 150 chars) in clean, professional English.",
      "concepts": ["concept1", "concept2", "concept3"],
      "severity": "unsettling | disturbing | extreme (choose based on topic intensity)",
      "image_query": "The exact Wikipedia article title representing this topic for thumbnail fetching (e.g. Mary Celeste)",
      "chosen_recommendation_id": "The Recommendation ID of the selected topic, or null if you chose your own topic",
      "layers": [
        {
          "layer": 1,
          "layer_name": "Layer 1 title",
          "content": "Fully-written Layer 1 content starting with a unique, topic-specific gripping hook.",
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

    // 6. Save story to SQLite as a DRAFT!
    storyObj.draft = true;
    db.insertStory(storyObj);

    // 7. Auto-mark the chosen recommendation as generated
    if (storyObj.chosen_recommendation_id) {
      try {
        db.updateRecommendationStatus(storyObj.chosen_recommendation_id, 'generated');
        addAutomationLog(`[RECOMMENDATION] Marked topic as generated in queue (ID: ${storyObj.chosen_recommendation_id})`);
      } catch (err) {
        console.error('[Automation] Failed to update recommendation status:', err.message);
      }
    } else {
      // Fallback: search and update matching topics by title/similarity just in case
      try {
        const freshRecs = db.getRecommendations();
        const storyTitle = storyObj.title.trim().toLowerCase();
        for (const r of freshRecs) {
          const recTopic = r.topic.trim().toLowerCase();
          if (recTopic === storyTitle || storyTitle.includes(recTopic) || recTopic.includes(storyTitle)) {
            db.updateRecommendationStatus(r.id, 'generated');
            addAutomationLog(`[RECOMMENDATION] Marked matched topic as generated in queue (title: "${storyObj.title}")`);
          }
        }
      } catch (err) {
        // ignore
      }
    }

    addAutomationLog(`SUCCESS: Story "${storyObj.title}" successfully added to drafts queue.`);
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
  0: { name: 'Secret Sunday', hint: 'secret archives, government coverups, and classified dossiers' },
  1: { name: 'Mystery Monday', hint: 'unexplained mysteries, disappearances, and unsolved riddles' },
  2: { name: 'Thriller Tuesday', hint: 'high-stakes thrillers, espionage, and political assassinations' },
  3: { name: 'Wicked Wednesday', hint: 'wicked scientific experiments, classified research, and dangerous weapons' },
  4: { name: 'Terror Thursday', hint: 'terror-filled events, cults, occult practices, and paranormal encounters' },
  5: { name: 'Fatal Friday', hint: 'fatal tragedies, historical disasters, and fatal accidents' },
  6: { name: 'Sinister Saturday', hint: 'sinister crimes, heist masterminds, and high-profile trials' }
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

const wikiThumbnailCache = new Map();
async function getWikipediaThumbnail(query) {
  if (!query) return null;
  if (wikiThumbnailCache.has(query)) return wikiThumbnailCache.get(query);
  try {
    const formattedQuery = encodeURIComponent(query.trim().replace(/ /g, '_'));
    const matched = await fetchUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${formattedQuery}`);
    const imgUrl = matched?.thumbnail?.source || null;
    wikiThumbnailCache.set(query, imgUrl);
    return imgUrl;
  } catch (err) {
    console.warn(`[WikiCache] Failed to fetch Wikipedia thumbnail for "${query}":`, err.message);
    return null;
  }
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
    
    try {
      const query = dossier.wikiQuery || dossier.title;
      const thumbnail = await getWikipediaThumbnail(query);
      if (thumbnail) {
        dossier.thumbnail = thumbnail;
      }
    } catch (err) {
      // Fallback to unsplash thumbnail is already set
    }

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
        
        // Export updated story to stories.json (only if it's not a draft)
        if (!story.draft) {
          db.exportStoriesToJSON();
        }

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
    const fb = db.getFeedback();
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
      entry.addressed = entry.addressed || false;
      db.insertFeedback(entry);
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
    db.deleteFeedback(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Route: PATCH /api/feedback
  if (req.method === 'PATCH' && pathname === '/api/feedback') {
    const id = urlObj.searchParams.get('id');
    if (!id) { res.writeHead(400); res.end('{"error":"id required"}'); return; }
    const body = await getJsonBody(req);
    const feedbackItems = db.getFeedback();
    const item = feedbackItems.find(f => f.id === id);
    if (item) {
      const nextAddressed = body.addressed !== undefined ? body.addressed : !item.addressed;
      db.updateFeedbackAddressed(id, nextAddressed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, addressed: nextAddressed }));
    } else {
      res.writeHead(404); res.end('{"error":"Not found"}');
    }
    return;
  }

  // Route: GET /api/recommendations
  if (req.method === 'GET' && pathname === '/api/recommendations') {
    const recs = db.getRecommendations();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recs));
    return;
  }

  // Route: POST /api/recommendations
  if (req.method === 'POST' && pathname === '/api/recommendations') {
    try {
      const entry = await getJsonBody(req);
      if (!entry.topic) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Topic required' }));
        return;
      }

      // Check for duplicate in database (both stories and recommendations)
      const duplicate = db.checkDuplicate(entry.topic);
      if (duplicate) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, duplicate: true, status: 'pending' }));
        return;
      }

      entry.id = entry.id || ('rec_' + Date.now());
      entry.date = entry.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      entry.status = 'pending';

      db.insertRecommendation(entry);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: DELETE /api/recommendations
  if (req.method === 'DELETE' && pathname === '/api/recommendations') {
    const id = urlObj.searchParams.get('id');
    if (!id) { res.writeHead(400); res.end('{"error":"id required"}'); return; }
    db.deleteRecommendation(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Route: PUT /api/recommendations
  if (req.method === 'PUT' && pathname === '/api/recommendations') {
    try {
      const body = await getJsonBody(req);
      const { id, status } = body || {};
      if (!id || !status) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'id and status required' }));
        return;
      }
      const recs = db.getRecommendations();
      const item = recs.find(r => r.id === id);
      if (item) {
        db.updateRecommendationStatus(id, status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404); res.end('{"error":"Not found"}');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: GET /api/stories (including drafts if specified)
  if (req.method === 'GET' && pathname === '/api/stories') {
    const includeDrafts = urlObj.searchParams.get('include_drafts') === 'true' || urlObj.searchParams.get('all') === 'true';
    const list = db.getStories(includeDrafts);
    
    // Background seed reactions with AI if needed
    list.forEach(story => {
      if (story.reactions && !story.reactions.ai) {
        ensureStoryReactionsWithAi(story).catch(() => {});
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // Route: POST /api/stories/publish
  if (req.method === 'POST' && pathname === '/api/stories/publish') {
    try {
      const { story_id, publish_all } = await getJsonBody(req);
      if (publish_all) {
        db.publishAllStories();
      } else if (story_id) {
        db.publishStory(story_id);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing story_id or publish_all' }));
        return;
      }
      db.exportStoriesToJSON();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: PUT /api/stories/:id
  const storyPutMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
  if (req.method === 'PUT' && storyPutMatch) {
    try {
      const storyId = storyPutMatch[1];
      const updates = await getJsonBody(req);
      const story = db.getStory(storyId);
      if (!story) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Story not found' }));
        return;
      }
      
      db.updateStory(storyId, updates);
      
      // Export only if not a draft
      if (!story.draft) {
        db.exportStoriesToJSON();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, story: db.getStory(storyId) }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: GET /api/analytics
  if (req.method === 'GET' && pathname === '/api/analytics') {
    const summary = db.getAnalyticsSummary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
    return;
  }

  // Route: POST /api/analytics
  if (req.method === 'POST' && pathname === '/api/analytics') {
    try {
      const pv = await getJsonBody(req);
      db.logPageView({
        visitor_id: pv.visitor_id || 'unknown',
        session_id: pv.session_id || 'unknown',
        path: pv.path || '/',
        referrer: pv.referrer || '',
        user_agent: pv.user_agent || '',
        timestamp: new Date().toISOString(),
        ip: pv.ip || null,
        city: pv.city || null,
        region: pv.region || null,
        country: pv.country || null,
        country_code: pv.country_code || null,
        org: pv.org || null
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
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
            console.log(`[RECOMMENDATION] Marked matched topic as generated in queue (title: "${newStory.title}")`);
          }
        }
      } catch (err) {
        console.error('[RECOMMENDATION] Failed to check and update status in queue:', err.message);
      }

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
    const story = db.getStory(id);
    if (story) {
      db.deleteStory(id);
      
      // Export only if not a draft
      if (!story.draft) {
        db.exportStoriesToJSON();
      }
    }
    
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

      if (process.env.VERCEL) {
        // Vercel filesystem is read-only. Skip local write and instruct client to use remote URL directly.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: null }));
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
