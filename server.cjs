const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3001;
const RECS_FILE     = path.join(__dirname, 'public', 'content', 'recommendations.json');
const STORIES_FILE  = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');
const FEEDBACK_FILE = path.join(__dirname, 'public', 'content', 'feedback.json');

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
        // Remove quotes if present
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
  if (!fs.existsSync(FEEDBACK_FILE)) {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2));
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

// Native HTTPS helper to fetch JSON
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    const options = {
      headers: { ...defaultHeaders, ...headers }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Native helper to download an image from a URL and save it locally
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : require('http');
    
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Download image locally and return the relative path served by the server
async function saveAndGetLocalImage(storyId, imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl;
  }
  try {
    const storyImagesDir = path.join(__dirname, 'public', 'content', 'images', storyId);
    if (!fs.existsSync(storyImagesDir)) {
      fs.mkdirSync(storyImagesDir, { recursive: true });
    }
    const localPath = path.join(storyImagesDir, `cover.jpg`);
    await downloadImage(imageUrl, localPath);
    return `/content/images/${storyId}/cover.jpg`;
  } catch (err) {
    console.error(`Failed to save image locally for ${storyId}:`, err.message);
    return imageUrl;
  }
}

// ============================================================================
// ROBUST AI LAYER — Pollinations AI with retries, timeouts, model fallback
// ============================================================================
const AI_MODELS = ['openai', 'mistral', 'claude'];
const AI_MAX_RETRIES = 3;
const AI_TIMEOUT_MS = 15000; // 15 seconds per request
const AI_BACKOFF_BASE_MS = 1500;

/**
 * Robust AI text completion using Pollinations free-tier.
 * Features: 3 retries with exponential backoff, 15s timeout, multi-model fallback.
 * @param {string} prompt - The user prompt
 * @param {string} systemPrompt - Optional system prompt
 * @param {object} opts - { expectJSON: bool, modelOverride: string }
 * @returns {Promise<string>} The AI response text
 */
async function callAI(prompt, systemPrompt = '', opts = {}) {
  const models = opts.modelOverride ? [opts.modelOverride] : [...AI_MODELS];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt++) {
      try {
        const payload = {
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          model
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`Pollinations ${model} returned HTTP ${res.status}`);
        }

        const text = await res.text();

        // Validate response is not empty or garbage
        if (!text || text.trim().length < 5) {
          throw new Error(`Pollinations ${model} returned empty/trivial response`);
        }

        // If we expect JSON, do a quick sanity check
        if (opts.expectJSON) {
          const trimmed = text.trim();
          if (!trimmed.includes('{') && !trimmed.includes('[')) {
            throw new Error(`Expected JSON but got plain text from ${model}`);
          }
        }

        console.log(`[AI] Success: model=${model}, attempt=${attempt}, len=${text.length}`);
        return text;

      } catch (err) {
        const isTimeout = err.name === 'AbortError';
        const label = isTimeout ? 'TIMEOUT' : err.message;
        console.warn(`[AI] Attempt ${attempt}/${AI_MAX_RETRIES} with ${model} failed: ${label}`);
        lastError = err;

        // Wait before retry (exponential backoff)
        if (attempt < AI_MAX_RETRIES) {
          const delay = AI_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    // All retries exhausted for this model, try next model
    console.warn(`[AI] All retries exhausted for model "${model}". Trying next model...`);
  }

  throw new Error(`All AI models failed after ${AI_MAX_RETRIES} retries each. Last error: ${lastError?.message}`);
}

// Backward-compatible alias
const callPollinationsText = callAI;

// Fetch from Wikipedia or fall back to Pollinations AI to generate and save a story cover image
async function generateAndSaveImage(storyId, topic, apiKey) {
  const storyImagesDir = path.join(__dirname, 'public', 'content', 'images', storyId);
  if (!fs.existsSync(storyImagesDir)) {
    fs.mkdirSync(storyImagesDir, { recursive: true });
  }
  const localPath = path.join(storyImagesDir, `cover.jpg`);
  const relativePath = `/content/images/${storyId}/cover.jpg`;

  let hasPerfectPhoto = false;
  try {
    const checkPrompt = `For the topic "${topic}", does there exist a highly iconic, recognizable, and visually compelling real photograph of the event (e.g. the 11 pipes of Burari, or the slashed tent of Dyatlov Pass)?
Reply with YES only if such a specific, famous, iconic, and visually striking real photo exists.
Reply with NO if there is no such iconic photo (e.g., if there are only generic drawings, portraits of individuals, maps, diagrams, or no photos at all).
Output YES or NO only. Do not include markdown or explanations.`;
    
    const decisionText = await callPollinationsText(checkPrompt, "You are a factual historical researcher.");
    const decision = decisionText.trim().toUpperCase();
    hasPerfectPhoto = decision.includes('YES');
    console.log(`[IMAGE ENGINE] Pollinations decision on perfect real photo for "${topic}": ${decision}`);
  } catch (err) {
    console.warn(`[IMAGE ENGINE] Failed to check perfect photo status for "${topic}":`, err.message);
  }

  // Step 1: Try Wikipedia first if an iconic real photo exists
  if (hasPerfectPhoto) {
    try {
      const imgRes = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=800&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=1&origin=*`);
      const pages = imgRes.query?.pages;
      if (pages) {
        const firstPageId = Object.keys(pages)[0];
        const imageUrl = pages[firstPageId]?.thumbnail?.source;
        if (imageUrl) {
          console.log(`[IMAGE ENGINE] Downloading Wikipedia image for ${topic}...`);
          await downloadImage(imageUrl, localPath);
          return relativePath;
        }
      }
    } catch (err) {
      console.warn(`[IMAGE ENGINE] Wikipedia image search failed for ${topic}:`, err.message);
    }
  }

  // Step 2: Fallback to Pollinations AI
  console.log(`[IMAGE ENGINE] No perfect real photo available for ${topic}. Generating AI cover image...`);
  try {
    // Generate a high-quality prompt from Pollinations
    const promptInstructions = `Create a highly descriptive, visually stunning image generation prompt for the dark historical/psychological topic: "${topic}".
The image will be the main cover art of a premium thriller/mystery editorial dossier. Design a highly aesthetic, clickable, and impactful concept.
Write a single descriptive sentence for a cinematic, moody, atmospheric photograph. Incorporate elements of high-contrast chiaroscuro lighting, deep shadows, bronze/gold tones, historical/mysterious artifact details, or a striking symbolic focal point. Avoid cheap cliches. Do NOT use buzzwords like "photorealistic", "ultra-detailed", "hyperrealistic", or markdown styling. Output the prompt text only.`;
    
    let aiPrompt = `A cinematic, atmospheric dark photo of ${topic}, highly realistic, dramatic lighting`;
    try {
      const generated = await callPollinationsText(promptInstructions, "You are an expert image generation prompt engineer.");
      if (generated) {
        aiPrompt = generated.trim();
      }
    } catch (err) {
      console.warn(`[IMAGE ENGINE] Failed to generate AI prompt for "${topic}":`, err.message);
    }
    
    aiPrompt = aiPrompt.replace(/"/g, '').replace(/\n/g, ' ');
    
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=800&height=600&nologo=true&private=true&model=flux`;
    console.log(`[IMAGE ENGINE] Downloading Pollinations AI image from: ${pollinationsUrl}`);
    await downloadImage(pollinationsUrl, localPath);
    return relativePath;
  } catch (err) {
    console.error(`[IMAGE ENGINE] AI Image generation failed for ${topic}:`, err.message);
    return `https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800`;
  }
}

// Native HTTPS helper to POST JSON — with 60s timeout
function postUrl(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'LORE-Archive-Console/2.0',
        ...headers
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}\nBody: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after 60s: ${url}`));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(bodyStr);
    req.end();
  });
}

function cleanAndParseJSON(text) {
  if (!text) throw new Error('Input text is empty');
  let cleaned = text.trim();
  
  // Strip markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }

  // Find the JSON boundaries
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  let endToken = '';
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endToken = '}';
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endToken = ']';
  }
  
  if (startIdx !== -1) {
    const lastIdx = cleaned.lastIndexOf(endToken);
    if (lastIdx !== -1 && lastIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, lastIdx + 1);
    }
  }

  // Fix common AI output issues
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');  // trailing commas

  // Attempt 1: Direct parse
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Attempt 2: Fix unescaped control chars inside string values
    try {
      // Replace literal newlines/tabs inside strings (not \\n which is already escaped)
      let fixed = cleaned.replace(/(["'])([^"']*?)\r?\n([^"']*?)(\1)/g, (m, q, a, b, q2) => {
        return q + a + '\\n' + b + q2;
      });
      // Remove any other control characters
      fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (ch) => {
        if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
        return '';
      });
      return JSON.parse(fixed);
    } catch (secondErr) {
      // Attempt 3: Aggressive cleanup — strip all control chars, re-try
      try {
        const aggressive = cleaned
          .replace(/[\x00-\x1F\x7F]/g, ' ')
          .replace(/\\'/g, "'")
          .replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(aggressive);
      } catch (thirdErr) {
        throw new Error(`JSON parse failed after 3 attempts. Original: ${firstErr.message}. Input preview: ${cleaned.substring(0, 200)}`);
      }
    }
  }
}

// Validate a generated story object has all required fields
function validateStoryStructure(story) {
  const errors = [];
  if (!story.story_id || typeof story.story_id !== 'string') errors.push('Missing/invalid story_id');
  if (!story.title || typeof story.title !== 'string') errors.push('Missing/invalid title');
  
  const validCategories = ['psychology', 'true_crime', 'paranormal', 'mythology', 'gov_experiments', 'conspiracy', 'cyber_mysteries'];
  if (!validCategories.includes(story.category)) errors.push(`Invalid category: "${story.category}"`);
  
  if (!Array.isArray(story.layers)) {
    errors.push('Missing layers array');
  } else {
    if (story.layers.length < 5) errors.push(`Only ${story.layers.length} layers (need at least 5)`);
    for (let i = 0; i < story.layers.length; i++) {
      const l = story.layers[i];
      if (!l.layer_name) errors.push(`Layer ${i + 1}: missing layer_name`);
      if (!l.content || l.content.length < 50) errors.push(`Layer ${i + 1}: content too short or missing`);
    }
  }

  if (!story.hook) errors.push('Missing hook');
  if (!Array.isArray(story.concepts) || story.concepts.length === 0) errors.push('Missing concepts array');

  return { valid: errors.length === 0, errors };
}

function isDuplicateStory(topic, existingStories) {
  const normalizedTopic = topic.toLowerCase();
  return existingStories.some(s => {
    const normalizedTitle = s.title.toLowerCase();
    if (normalizedTitle === normalizedTopic) return true;
    if (normalizedTitle.includes(normalizedTopic) || normalizedTopic.includes(normalizedTitle)) return true;
    
    const stopWords = new Set(['the', 'of', 'and', 'in', 'incident', 'case', 'mystery', 'conspiracy', 'experiments', 'project', 'experiment', 'deaths', 'death', 'disappearance', 'disappearances', 'trials', 'trial', 'incident', 'pass', 'forest']);
    const topicWords = normalizedTopic.split(/[\s_\- ',."]+/).filter(w => w.length > 2 && !stopWords.has(w));
    const titleWords = normalizedTitle.split(/[\s_\- ',."]+/).filter(w => w.length > 2 && !stopWords.has(w));
    
    const overlap = topicWords.filter(w => titleWords.includes(w));
    return overlap.length > 0;
  });
}

// Generate a valid fallback story object locally if all AI APIs fail completely
function getStaticFallbackStory(topic) {
  const cleanTopic = topic || 'The Unsolved Case';
  const id = cleanTopic.toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  
  const hookTemplates = [
    `Official archives se lekar ajeeb theories tak—kya hai ${cleanTopic} ka asal rahasya aur iske piche chhupe ankahe sach?`,
    `Documents ki suppression aur mysterious events—kya hai ${cleanTopic} ki files mein chhupa wo chilling truth jise public se chhupaya gaya?`,
    `Decades se unsolved aur classified—kya hai ${cleanTopic} ke case ka wo khaufnak pehlu jise investigators bhi kabhi samajh nahi paaye?`
  ];
  const hook = hookTemplates[Math.floor(Math.random() * hookTemplates.length)];
  
  return {
    story_id: id || 'fallback_story_' + Date.now(),
    title: cleanTopic,
    category: 'paranormal',
    hook,
    concepts: ['unexplained_phenomena', 'mystery'],
    severity: 'disturbing',
    layers: [
      {
        layer: 1,
        layer_name: 'The Whisper',
        content: `Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur jo is baat ko sach kar de. Hum baat kar rahe hain ${cleanTopic} ke baare mein. Yeh ek aisi ghatna hai jise sunkar kisi ke bhi roongte khade ho jayein.\n\nShuruat hoti hai ek chhote se surag se, jise log aksar ignore kar dete hain. Lekin dheere dheere yeh ek bada roop le leta hai.`,
        cliffhanger: 'Lekin asal sach toh abhi aage aane wala tha.'
      },
      {
        layer: 2,
        layer_name: 'The Pattern',
        content: `Jaise jaise jaanch aage badhi, ek ajeeb sa pattern samne aane laga. Har ek chiz kisi gahre rahasya ki taraf ishara kar rahi thi.\n\nLogon ne ajeeb ajeeb aawazein sunne ka daawa kiya. Police aur investigators bhi is ajeeb paheli ko suljhane mein nakam rahe.`,
        cliffhanger: 'Aur tabhi ek aisi chiz mili jisne sabko hairan kar diya.'
      },
      {
        layer: 3,
        layer_name: 'The Incident',
        content: `Ghatna wale din kuch aisa hua jo kisi ne nahi socha tha. Sabhi saboot mita diye gaye the aur sirf ek ajeeb sa nishaan bacha tha.\n\nChashmadido ke mutabik, wahan ki hawa mein ek ajeeb si thandak thi aur darr ka mahaul ban gaya tha.`,
        cliffhanger: 'Kya yeh kisi badi sajish ka hissa tha?'
      },
      {
        layer: 4,
        layer_name: 'The System',
        content: `Iske baad government aur local authorities ne is case ko dabane ki koshish ki. Files ko classified kar diya gaya aur public ko sach se door rakha gaya.\n\nKuch aisi agency shamil thi jo is rahasya ko hamesha ke liye dafnana chahti thi.`,
        cliffhanger: 'Lekin sach ko kab tak chhupaya ja sakta tha?'
      },
      {
        layer: 5,
        layer_name: 'The Research',
        content: `Saalon baad, researchers ne purani files ko fir se khola. Unhone paya ki ghatna ke piche kuch aisi scientific ya paranormal takatei thi jo aam samajh se pare hain.\n\nData aur records se pata chala ki yeh koi aam haadsa nahi tha, balki ek sochee samjhi saazish thi.`,
        cliffhanger: 'Ab hum us gahrayi mein utarne wale hain jahan darr ka asal roop hai.'
      },
      {
        layer: 6,
        layer_name: 'The Abyss',
        content: `Case ki sabse khaufnak chiz samne aayi jab humne iske gahre pehluon ko dekha. Victims ke sath jo hua, woh kisi nightmare se kam nahi tha.\n\nHar ek kadam par darr aur badhta chala gaya aur ab piche mudne ka koi raasta nahi tha.`,
        cliffhanger: 'Aur ab aakhiri layer, jahan sabse bada sach samne aayega.'
      },
      {
        layer: 7,
        layer_name: 'The Dark Corner',
        content: `Aakhirkar hum us dark corner mein pahunch gaye hain jahan har ek paheli ka jawab hai. Lekin kya hum is sach ko sahan karne ke liye taiyar hain?\n\nYeh case aaj bhi ek bada rahasya bana hua hai, aur shayad iska jawab hume kabhi na mile. Tab tak ke liye, satark rahein aur dhyan dein ki aapke aaspaas kya ho raha hai.`,
        cliffhanger: null
      }
    ],
    connections: []
  };
}

// In-memory logs for the background task
const automationLogs = [];
function addAutomationLog(msg) {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  const formatted = `[${time}] ${msg}`;
  console.log(`[AUTOMATION] ${msg}`);
  automationLogs.push(formatted);
  if (automationLogs.length > 200) {
    automationLogs.shift();
  }
}

let isAutomationEnabled = true;
let isAutomationRunning = false;
let rateLimitSuspendedUntil = 0;

async function runAutomation(isManual = false) {
  if (isAutomationRunning) {
    addAutomationLog('Automation already in progress. Skipping.');
    return;
  }
  if (Date.now() < rateLimitSuspendedUntil && !isManual) {
    const timeLeftHours = ((rateLimitSuspendedUntil - Date.now()) / (1000 * 60 * 60)).toFixed(2);
    addAutomationLog(`Automation suspended due to Gemini 429 quota cooling period. Remaining: ${timeLeftHours} hours. Skipping.`);
    return;
  }
  if (!isAutomationEnabled && !isManual) {
    return;
  }
  isAutomationRunning = true;
  addAutomationLog('=== STARTING AUTOMATED CRON ENGINE ===');
  
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    addAutomationLog('ERROR: Gemini API Key not found in environment. Automation aborted.');
    isAutomationRunning = false;
    return;
  }

  try {
    // 1. Harvest Trends (using Wikipedia's Unsolved Deaths, Unexplained Phenomena, and Conspiracy Theories API)
    addAutomationLog('Phase 1: Harvesting obscure dark mysteries from Wikipedia Categories...');
    const newTopics = [];
    const categories = [
      'Category:Unsolved_deaths',
      'Category:Unexplained_phenomena',
      'Category:Conspiracy_theories',
      'Category:Cold_cases',
      'Category:Mythological_creatures',
      'Category:Urban_legends'
    ];
    
    for (const cat of categories) {
      addAutomationLog(`Scanning Wikipedia Category "${cat}"...`);
      try {
        const data = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmlimit=25&format=json&origin=*`);
        const members = data.query?.categorymembers || [];
        for (const item of members) {
          let title = item.title;
          
          // Ignore general index/list articles
          if (title.toLowerCase().startsWith('list of') || 
              title.toLowerCase() === 'conspiracy theory' ||
              title.toLowerCase() === 'unexplained phenomena' ||
              title.length < 10) continue;
              
          // Check if already in queue or catalog
          const recs = readJson(RECS_FILE) || [];
          const storiesObj = readJson(STORIES_FILE) || { stories: [] };
          const alreadyRec = recs.some(r => r.topic.toLowerCase() === title.toLowerCase());
          const alreadyStory = storiesObj.stories.some(s => s.title.toLowerCase() === title.toLowerCase());
          
          if (!alreadyRec && !alreadyStory) {
            newTopics.push(title);
            recs.push({
              id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              topic: title,
              date: new Date().toLocaleDateString(),
              status: 'pending'
            });
            writeJson(RECS_FILE, recs);
          }
        }
      } catch (err) {
        addAutomationLog(`Warning: Failed to scan Category "${cat}": ${err.message}`);
      }
    }
    
    addAutomationLog(`Harvest finished. Discovered ${newTopics.length} new topics.`);

    // 2. AI Auto-Clean of pending recommendations
    addAutomationLog('Phase 2: Running AI Auto-Clean filter...');
    const recs = readJson(RECS_FILE) || [];
    const pending = recs.filter(r => r.status === 'pending');
    
    if (pending.length > 0) {
      try {
        const BATCH_SIZE = 20;
        let spamIds = [];
        
        for (let i = 0; i < pending.length; i += BATCH_SIZE) {
          const batch = pending.slice(i, i + BATCH_SIZE);
          addAutomationLog(`AI Cleaned: Filtering batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} (${batch.length} items)...`);
          
          const cleanPrompt = `Analyze the following list of user-recommended topics for a dark mystery, historical, or psychological archive website.
Identify which topics are completely irrelevant, spam, test inputs, gibberish (e.g. "asdf", "test"), blank, inappropriate, or nonsense.

Recommendations list:
${batch.map(r => `- ID: ${r.id}, Topic: "${r.topic}"`).join('\n')}

Return a JSON array containing ONLY the IDs (strings) of the recommendations that are spam or irrelevant and should be deleted.
If all recommendations are valid and relevant, return an empty array: [].
Do not wrap in markdown. Output raw JSON only.`;

          const text = await callPollinationsText(cleanPrompt, "You are a data filtering bot. Output only valid JSON arrays, no markdown wrapping.");
          const batchSpamIds = cleanAndParseJSON(text);
          if (Array.isArray(batchSpamIds)) {
            spamIds = spamIds.concat(batchSpamIds);
          }
        }
        
        if (spamIds.length > 0) {
          const currentRecs = readJson(RECS_FILE) || [];
          const filteredRecs = currentRecs.filter(r => !spamIds.includes(r.id));
          writeJson(RECS_FILE, filteredRecs);
          addAutomationLog(`AI Cleaned: Deleted ${spamIds.length} spam/test recommendations.`);
        } else {
          addAutomationLog('AI Cleaned: No spam recommendations detected.');
        }
      } catch (err) {
        addAutomationLog(`Warning: AI Clean failed: ${err.message}`);
      }
    } else {
      addAutomationLog('AI Cleaned: No pending recommendations to clean.');
    }

    // 3. AI Story Generation
    addAutomationLog('Phase 3: Dispatching AI Dossier Generator...');
    const finalRecs = readJson(RECS_FILE) || [];
    const finalPending = finalRecs.filter(r => r.status === 'pending');
    
    let topicsToGen = [];
    const storiesObj = readJson(STORIES_FILE) || { stories: [] };
    const existingStoriesList = storiesObj.stories || [];

    if (finalPending.length > 0) {
      // Find first pending recommendation that is not a duplicate of existing stories
      const nonDuplicateRec = finalPending.find(r => !isDuplicateStory(r.topic, existingStoriesList));
      if (nonDuplicateRec) {
        topicsToGen = [nonDuplicateRec.topic];
        addAutomationLog(`Selected pending user topic for compilation: "${topicsToGen[0]}"`);
      } else {
        addAutomationLog(`All pending user topics are duplicates of existing stories. Skipping queue.`);
      }
    } else {
      addAutomationLog('No pending topics. Requesting AI to suggest 1 high-quality obscure case based on category balance...');
      try {
        const existingTitles = existingStoriesList.map(s => s.title).join(', ');
        
        const categoryList = ['psychology', 'true_crime', 'paranormal', 'mythology', 'gov_experiments', 'conspiracy', 'cyber_mysteries'];
        const counts = {};
        categoryList.forEach(cat => { counts[cat] = 0; });
        existingStoriesList.forEach(s => {
          if (s.category && counts[s.category] !== undefined) {
            counts[s.category]++;
          }
        });
        
        let targetCategory = categoryList[0];
        let minCount = counts[targetCategory];
        for (const cat of categoryList) {
          if (counts[cat] < minCount) {
            minCount = counts[cat];
            targetCategory = cat;
          }
        }
        
        const CATEGORY_LABELS = {
          psychology: 'Psychology',
          true_crime: 'True Crime',
          paranormal: 'Paranormal',
          mythology: 'Mythology',
          gov_experiments: 'Hidden Gov Experiments',
          conspiracy: 'Unresolved Conspiracies',
          cyber_mysteries: 'Digital Shadows',
        };
        const label = CATEGORY_LABELS[targetCategory];
        addAutomationLog(`Category distribution: ${JSON.stringify(counts)}. Target for balance: "${targetCategory}" (${label})`);
        
        const suggestPrompt = `Select 1 distinct, highly engaging, creepy, or dark real-world topic specifically in the category of "${label}" (historical mystery, mythology/folklore, psychological phenomenon, digital shadow, or classified experiment).
CRITICAL: You must choose a well-documented, established historical, scientific, or psychological case that has a robust factual standing and high-integrity information. Absolutely avoid very recent or trending topics (which could be fake, unverified, or sensationalized news).
It must NOT be similar to these existing archive stories:
[${existingTitles}]

Return a JSON object with 'topic' (string). Example:
{"topic": "The 1948 Tamam Shud Case"}`;

        // Use Pollinations AI (free, no quota limit) for topic suggestions
        // Gemini API quota is reserved for full story generation only
        const suggestText = await callAI(suggestPrompt, 'You are a dark history curator. Output raw JSON only.', { expectJSON: true });
        const suggestion = cleanAndParseJSON(suggestText);
        if (suggestion && suggestion.topic) {
          if (!isDuplicateStory(suggestion.topic, existingStoriesList)) {
            topicsToGen = [suggestion.topic];
            addAutomationLog(`AI balanced suggestion for "${targetCategory}": "${suggestion.topic}"`);
          } else {
            addAutomationLog(`AI suggested a duplicate topic: "${suggestion.topic}". Skipping.`);
          }
        }
      } catch (err) {
        addAutomationLog(`Warning: Failed to get AI balanced suggestion: ${err.message}`);
      }
    }
    
    // If we have a topic to generate
    if (topicsToGen.length > 0) {
      const topic = topicsToGen[0];
      addAutomationLog(`Starting generation for: "${topic}"...`);
      
      const storiesObj = readJson(STORIES_FILE) || { stories: [] };
      const storiesSummary = storiesObj.stories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
      
      const genPrompt = `Write a complete, highly-detailed 7-layer documentary story about the topic: "${topic}".
You MUST auto-classify the topic into the single most appropriate category from the valid categories list below based on the topic.
You MUST auto-determine the severity level (unsettling, disturbing, or chilling) based on the topic.

CRITICAL EDITORIAL AND FACTUAL RULES:
1. ONLY TRUE & DOCUMENTED EVENTS: This website documents strictly true, historically verified cases that actually happened. Absolutely NO human-made fantasy, creepypastas, internet urban legends, or rumors. Every single claim, fact, and event mentioned must be historically accurate and documented.
2. IMMERSIVE NARRATIVE STRUCTURE ("THE RIDE"): Do NOT write this like a dry blog post or encyclopedic entry. It must feel like an immersive, terrifying ride. 
   - Layer 1 MUST start with a thought-provoking, engaging hook question in Hinglish like: "Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur jo is baat ko sach kar de..."
   - Put the reader inside the story using vivid details, terrifying examples, and atmospheric narrative pacing. Draw them in progressively layer by layer (Layer 1 is the whisper, Layer 7 is the absolute darkest truth).
3. HINGLISH LANGUAGE RULE: Write all story content (including title, hook, layer names, layer content, cliffhangers, and transition lines) in high-quality, engaging Hinglish (Hindi written in the English/Latin alphabet, naturally blended with English words as spoken by urban Indians). For example, write "Living room mein family ke 11 members hanging position mein mile" instead of "Eleven family members were found hanging in the living room." The tone should be extremely dark, conversational, and dramatic, like a local podcast host or YouTube narrator telling a mystery story in Hinglish. Keep the facts accurate and historically true; do NOT fabricate.

CRITICAL JSON FORMATTING RULES:
1. Do not use double quotes inside string fields unless they are escaped as \\". Prefer using single quotes (') for any quotes or titles inside the story text (e.g., 'Bermuda Triangle' instead of \"Bermuda Triangle\").
2. Ensure there are no trailing commas in arrays or objects.
3. The response must be strictly valid, clean JSON that can be parsed by JSON.parse() without errors.

Structure the story exactly in the following JSON format:
{
  "story_id": "lowercase_slug_with_underscores",
  "title": "A compelling, title for the dossier",
  "category": "must be one of: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries (Choose the single best category match for this topic)",
  "hook": "A highly-professional, specific, and compelling 1-2 sentence teaser (max 150 chars) in Hinglish for the catalog card. CRITICAL: The hook must be completely custom and specific to the case details (e.g., mention specific locations, names, or key anomalies). Never write generic hooks like 'Ek aisi ansuljhi dastan...' or 'Kya hai iska sach?'.",
  "concepts": ["concept1", "concept2", "concept3"],
  "severity": "unsettling | disturbing | chilling",
  "layers": [
    {
      "layer": 1,
      "layer_name": "Name of Layer 1 (The Whisper - introducing the mystery)",
      "content": "Fully-written narrative for Layer 1. Must start with the Hinglish ride introduction: 'Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain...' followed by 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 2,
      "layer_name": "Name of Layer 2 (The Pattern)",
      "content": "Fully-written narrative for Layer 2. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 3,
      "layer_name": "Name of Layer 3 (The Incident)",
      "content": "Fully-written narrative for Layer 3. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 4,
      "layer_name": "Name of Layer 4 (The System)",
      "content": "Fully-written narrative for Layer 4. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 5,
      "layer_name": "Name of Layer 5 (The Research)",
      "content": "Fully-written narrative for Layer 5. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 6,
      "layer_name": "Name of Layer 6 (The Abyss)",
      "content": "Fully-written narrative for Layer 6. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": "A gripping cliffhanger sentence pointing to the next layer."
    },
    {
      "layer": 7,
      "layer_name": "Name of Layer 7 (The Dark Corner)",
      "content": "Fully-written narrative for Layer 7. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
      "cliffhanger": null
    }
  ],
  "connections": [
    {
      "story_id": "id_of_existing_story_to_connect_to",
      "shared_concept": "concept_name",
      "transition_line": "A compelling, dramatic sentence linking this new story to the existing one."
    }
  ]
}

Available stories in catalog to connect to:
${storiesSummary}

Ensure the output is strictly valid JSON only. Output raw JSON.`;

      // Call Gemini API with retry-on-429 logic (free tier has rate limits)
      let genRes = null;
      try {
        for (let geminiAttempt = 1; geminiAttempt <= 3; geminiAttempt++) {
          try {
            genRes = await postUrl(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
              {
                contents: [{ role: 'user', parts: [{ text: genPrompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
              }
            );
            break; // success
          } catch (geminiErr) {
            if (geminiErr.message.includes('429') && geminiAttempt < 3) {
              const waitSec = 10 * geminiAttempt; // 10s, 20s
              addAutomationLog(`Gemini rate limited (429). Waiting ${waitSec}s before retry ${geminiAttempt + 1}/3...`);
              await new Promise(r => setTimeout(r, waitSec * 1000));
            } else {
              throw geminiErr; // non-429 error or final attempt
            }
          }
        }
      } catch (geminiErr) {
        addAutomationLog(`WARNING: Gemini API call failed completely: ${geminiErr.message}`);
        if (geminiErr.message.includes('429')) {
          rateLimitSuspendedUntil = Date.now() + 4 * 60 * 60 * 1000;
          addAutomationLog(`Gemini quota limit (429) hit. Background runner suspended for 4 hours (until ${new Date(rateLimitSuspendedUntil).toLocaleTimeString()}).`);
        }
      }
      
      let storyObj = null;
      
      if (genRes) {
        try {
          const genText = genRes?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (genText) {
            const parsed = cleanAndParseJSON(genText);
            const validation = validateStoryStructure(parsed);
            if (validation.valid) {
              storyObj = parsed;
              addAutomationLog(`Story successfully generated and validated via Gemini API.`);
            } else {
              addAutomationLog(`WARNING: Gemini response failed story structure validation: ${validation.errors.join('; ')}`);
            }
          }
        } catch (err) {
          addAutomationLog(`WARNING: Failed to parse or validate Gemini story response: ${err.message}`);
        }
      }

      // Fallback 1: Try Pollinations AI to generate the story
      if (!storyObj) {
        addAutomationLog(`Gemini generation failed or returned invalid data. Falling back to robust Pollinations AI (openai) for story compilation...`);
        try {
          const pollinationsPrompt = genPrompt + `\n\nReturn ONLY the raw JSON. Do not wrap in markdown or add explanations.`;
          const text = await callAI(pollinationsPrompt, 'You are a dark historian who writes premium Hinglish dossiers. Output valid JSON only, no markdown wrapping.', { expectJSON: true, modelOverride: 'openai' });
          const parsed = cleanAndParseJSON(text);
          const validation = validateStoryStructure(parsed);
          if (validation.valid) {
            storyObj = parsed;
            addAutomationLog(`SUCCESS: Story successfully compiled using Pollinations AI.`);
          } else {
            throw new Error(`Pollinations story failed structure validation: ${validation.errors.join('; ')}`);
          }
        } catch (err) {
          addAutomationLog(`WARNING: Pollinations AI story generation fallback failed: ${err.message}`);
        }
      }

      // Fallback 2: Static pre-defined story generator (Never fails)
      if (!storyObj) {
        addAutomationLog(`All AI generators failed. Loading local static fallback dossier for "${topic}" to prevent pipeline failure...`);
        storyObj = getStaticFallbackStory(topic);
      }

      storyObj.added_date = new Date().toISOString().split('T')[0];
      
      // Wikipedia Summary API integration - FREE and SOTA!
      addAutomationLog('Fetching real-world Wikipedia summary for contextual mapping...');
      try {
        const wikiSearchRes = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*`);
        const firstMatch = wikiSearchRes.query?.search?.[0];
        if (firstMatch) {
          const wikiTitle = firstMatch.title;
          const wikiSummaryRes = await fetchUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`);
          if (wikiSummaryRes && wikiSummaryRes.extract) {
            storyObj.wikipedia_summary = {
              title: wikiSummaryRes.title,
              extract: wikiSummaryRes.extract,
              url: wikiSummaryRes.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`
            };
            addAutomationLog(`Wikipedia Context mapped: "${wikiSummaryRes.title}"`);
          }
        }
      } catch (wikiErr) {
        addAutomationLog(`Wikipedia Context fetch failed: ${wikiErr.message}`);
      }



      // Fetch and generate cover image
      addAutomationLog('Resolving cover image (Wikipedia with AI generation fallback)...');
      try {
        const heroImg = await generateAndSaveImage(storyObj.story_id, topic, apiKey);
        storyObj.hero_image = heroImg;
        addAutomationLog('Cover image compiled and saved locally.');
      } catch (imgErr) {
        addAutomationLog(`Cover image generation failed: ${imgErr.message}`);
      }

      // Save storyObj to stories.json
      const currentStoriesObj = readJson(STORIES_FILE) || { stories: [] };
      currentStoriesObj.stories = currentStoriesObj.stories.filter(s => s.story_id !== storyObj.story_id);
      currentStoriesObj.stories.push(storyObj);
      writeJson(STORIES_FILE, currentStoriesObj);
      
      // Update concept index
      if (storyObj.concepts) {
        const conceptIndex = readJson(CONCEPTS_FILE) || {};
        Object.keys(conceptIndex).forEach(concept => {
          conceptIndex[concept] = conceptIndex[concept].filter(id => id !== storyObj.story_id);
          if (conceptIndex[concept].length === 0) delete conceptIndex[concept];
        });
        storyObj.concepts.forEach(concept => {
          if (!conceptIndex[concept]) conceptIndex[concept] = [];
          if (!conceptIndex[concept].includes(storyObj.story_id)) {
            conceptIndex[concept].push(storyObj.story_id);
          }
        });
        writeJson(CONCEPTS_FILE, conceptIndex);
      }

      // Delete the pending recommendation matching this topic
      const currentRecsList = readJson(RECS_FILE) || [];
      const updatedRecsList = currentRecsList.filter(r => r.topic.toLowerCase() !== topic.toLowerCase());
      writeJson(RECS_FILE, updatedRecsList);
      
      addAutomationLog(`SUCCESS: Story "${storyObj.title}" successfully compiled and archives updated.`);
    } else {
      addAutomationLog('No topics to generate today.');
    }

  } catch (err) {
    addAutomationLog(`CRITICAL ERROR during automation: ${err.message}`);
  } finally {
    isAutomationRunning = false;
    addAutomationLog('=== AUTOMATED CRON ENGINE STANDBY ===');
  }
}

// Start first automation run 5 seconds after server starts
setTimeout(() => {
  runAutomation();
}, 5000);

// Run automation every 3 hours
setInterval(() => {
  runAutomation();
}, 3 * 60 * 60 * 1000);

// --- DAILY DOSSIER CONSTANTS & ENGINE ---
const DOSSIER_FILE = path.join(__dirname, 'public', 'content', 'daily_dossier.json');

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
      { name: 'Covert Brainwashing', explanation: 'Kaha jata hai ki project band nahi hua, balki use modern digital methods aur sub-audible frequencies mein convert kar diya gaya.' }
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
      { name: 'Infrasound Hysteria', explanation: 'Mausam ke vajah se wind ne infrasound create kiya, jisne hikers ke dimaag mein panic daal diya aur woh bina kapdo ke baahar bhaag nikle.' },
      { name: 'Soviet Weapons Test', explanation: 'Pass ke paas koi secret military testing chal rahi thi, aur wahan ke radioactive fallout ya kisi shockwave ne unhe maar diya.' },
      { name: 'Indigenous Mansi Attack', explanation: 'Local tribes ne apne sacred mountain ko defend karne ke liye hikers par secretly aisi techniques se war kiya jisse koi external wound na dikhe.' }
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
      { name: 'Double Agent Play', explanation: 'Kuch records kehte hain ki Klaus British intelligence ke liye ek double agent tha aur jaanbujhkar misinformation leak kar raha tha.' },
      { name: 'Hidden Microfilm Cache', explanation: 'Uski leak ki gayi microfilms ka ek bada hissa aaj bhi Dresden ke kisi secret underground vault mein chhupa hua hai.' },
      { name: 'Los Alamos Ring', explanation: 'Fuchs akele kaam nahi kar raha tha, balki Los Alamos ke andar ek aur bada spy network tha jise FBI kabhi pakad nahi payi.' }
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
      { name: 'Deliberate Infection', explanation: 'Kuch claims kehte hain ki doctors ne participants ko track hi nahi kiya balki unhe intentionally virus se inject kiya tha.' },
      { name: 'Institutional Racism Test', explanation: 'Yeh study healthcare systems mein minority populations ko check karne ke liye ek pre-planned psychological benchmark bani thi.' },
      { name: 'Post-war Coverup', explanation: '1940s mein penicillin standard treatment banne ke baad bhi government ne information ko deliberately suppress kiya taaki experiment continue rahe.' }
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
      { name: 'Ergot Poisoning', explanation: 'Rye grain par ek fungus (ergot) grow ho gaya tha, jise khane se logon ko hallucinogenic fits aur seizures pad rahe the, jise unhone witchcraft samajh liya.' },
      { name: 'Property Land Grabbing', explanation: 'Wealthy landowners ne poor families ko witch accuse kiya taaki court unki land seize kar le aur use saste mein auction kiya ja sake.' },
      { name: 'Puritan Mass Delusion', explanation: 'Ek intense religious environment aur native American attacks ke darr se pure community ka mental health collapse ho gaya tha.' }
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
      { name: 'Olympic Insurance Swap', explanation: 'Owner company JP Morgan ne actual Titanic ko uski damaged sister ship Olympic se swap kar diya tha insurance money recover karne ke liye.' },
      { name: 'Deliberate Iceberg Course', explanation: 'Kaha jata hai ki Captain Smith ko ice warnings milne ke baad bhi speed badhane ka order mila tha taaki travel records break ho sakein.' },
      { name: 'Secret Target Assassination', explanation: 'Federal Reserve ke against khade teen sabse bade billionaires (Astor, Guggenheim, Straus) is ship par the aur unhe eliminate karne ke liye ship doobayi gayi.' }
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
      { name: 'Inside Security Job', explanation: 'Museum guard Richard Abath ne doors ko unlock kiya aur motion detectors ke signals bypass karne mein choro ki madad ki.' },
      { name: 'Irish Mob Funding', explanation: 'Churayi gayi paintings Boston ke Irish Mob ke paas gayi aur unhe collateral ke roop mein arms deals aur drug trafficking ke liye use kiya gaya.' },
      { name: 'Hidden European Collector', explanation: 'Yeh theft ek wealthy European private collector ke command par hui thi, jisne paintings ko kisi bunker mein chhipakar rakha hai.' }
    ],
    suspicionLabel: 'Insider Assistance Odds',
    defaultSuspicion: 82
  }
};

async function generateDailyDossier(dayOfWeek) {
  const theme = DAILY_THEMES[dayOfWeek];
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  let dossierObj = null;

  const prompt = `Today is ${theme.name}. Select a famous, real-world, documented historical mystery, conspiracy, or thriller event related to the theme: "${theme.hint}".
Do NOT write about these static fallback cases (we already have them): Project MKUltra, Dyatlov Pass, Klaus Fuchs, Tuskegee Syphilis Study, Salem Witch Trials, Titanic, Gardner Museum Heist.
Choose a different famous real-world case.

Generate a JSON object with exactly the following structure:
{
  "title": "The official Wikipedia article title of this event (e.g. Mary Celeste, or D. B. Cooper)",
  "year": "The year it happened (e.g. 1872)",
  "text": "A chilling 1-2 sentence description of the event in Hinglish (Hindi written in Latin alphabet naturally mixed with English, like a true-crime podcaster). Keep the facts 100% accurate.",
  "wikiQuery": "The exact Wikipedia search query to resolve the article (e.g. Mary Celeste, or D. B. Cooper)",
  "theories": [
    {
      "name": "Name of Theory 1",
      "explanation": "Chilling 1-2 sentence explanation in Hinglish."
    },
    {
      "name": "Name of Theory 2",
      "explanation": "Chilling 1-2 sentence explanation in Hinglish."
    },
    {
      "name": "Name of Theory 3",
      "explanation": "Chilling 1-2 sentence explanation in Hinglish."
    }
  ],
  "suspicionLabel": "A creative label for a conspiracy suspicion slider (e.g. Alien Presence, Cover-up Index, supernatural odds)",
  "defaultSuspicion": 75
}
Output raw JSON only. Do not wrap in markdown or add explanations.`;

  // Try generating via Pollinations AI
  try {
    const text = await callAI(prompt, 'You are a dark historian who writes premium Hinglish dossiers. Output valid JSON only, no markdown wrapping.', { expectJSON: true });
    const parsed = cleanAndParseJSON(text);
    if (parsed && parsed.title && parsed.text && Array.isArray(parsed.theories) && parsed.theories.length >= 2) {
      dossierObj = parsed;
      console.log(`[DAILY ENGINE] Successfully generated dossier for: ${dossierObj.title}`);
    }
  } catch (err) {
    console.error('[DAILY ENGINE] AI generation failed:', err.message);
  }

  // Fallback to static if AI fails
  if (!dossierObj) {
    console.log('[DAILY ENGINE] Falling back to static daily dossier...');
    dossierObj = { ...DAILY_STATIC_FALLBACKS[dayOfWeek] };
  }

  // Resolve Wikipedia article using search and summary
  console.log(`[DAILY ENGINE] Resolving Wikipedia mapping for: ${dossierObj.wikiQuery || dossierObj.title}`);
  let resolvedWiki = null;
  try {
    const query = dossierObj.wikiQuery || dossierObj.title;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchData = await fetchUrl(searchUrl);
    const firstMatch = searchData.query?.search?.[0];
    if (firstMatch) {
      const matchedTitle = firstMatch.title;
      console.log(`[DAILY ENGINE] Wikipedia Resolved: "${query}" -> "${matchedTitle}"`);
      const summaryData = await fetchUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(matchedTitle.replace(/ /g, '_'))}`);
      if (summaryData) {
        resolvedWiki = {
          title: summaryData.title,
          extract: summaryData.extract,
          url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(matchedTitle.replace(/ /g, '_'))}`,
          imageUrl: summaryData.thumbnail?.source || null
        };
      }
    }
  } catch (err) {
    console.warn('[DAILY ENGINE] Wikipedia resolution failed:', err.message);
  }

  if (!resolvedWiki) {
    // Failsafe Wikipedia mapping
    const query = dossierObj.wikiQuery || dossierObj.title;
    resolvedWiki = {
      title: dossierObj.title,
      extract: dossierObj.text,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/ /g, '_'))}`,
      imageUrl: null
    };
  }

  const destDir = path.join(__dirname, 'public', 'content', 'images');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const localImgPath = path.join(destDir, 'daily_dossier.jpg');
  const relativeImgPath = `/content/images/daily_dossier.jpg`;
  let imageDownloaded = false;

  // Try Wikipedia image first if available
  if (resolvedWiki.imageUrl) {
    try {
      console.log(`[DAILY ENGINE] Downloading Wikipedia cover image: ${resolvedWiki.imageUrl}`);
      await downloadImage(resolvedWiki.imageUrl, localImgPath);
      dossierObj.thumbnail = relativeImgPath;
      imageDownloaded = true;
      console.log('[DAILY ENGINE] Wikipedia cover image saved locally.');
    } catch (err) {
      console.warn('[DAILY ENGINE] Wikipedia image download failed, falling back to AI:', err.message);
    }
  }

  // Fallback to Pollinations AI image if Wikipedia image failed or doesn't exist
  if (!imageDownloaded) {
    try {
      console.log(`[DAILY ENGINE] Generating Pollinations Image for: ${dossierObj.title}`);
      const imagePrompt = `A cinematic, dramatic, high-contrast, low-key photograph representing ${dossierObj.title}, dark ambient lighting, deep shadows, gold and bronze color tones, mystery, high detail, 35mm photograph, chiaroscuro`;
      const imageApiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=800&height=600&nologo=true&private=true&model=flux`;
      await downloadImage(imageApiUrl, localImgPath);
      dossierObj.thumbnail = relativeImgPath;
      imageDownloaded = true;
      console.log('[DAILY ENGINE] Fallback cover image generated and saved locally.');
    } catch (err) {
      console.error('[DAILY ENGINE] Fallback image generation failed:', err.message);
      dossierObj.thumbnail = `https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800`;
    }
  }

  dossierObj.wikiUrl = resolvedWiki.url;
  dossierObj.wikiSummary = resolvedWiki.extract;
  dossierObj.theme = theme.name;

  return dossierObj;
}

const server = http.createServer(async (req, res) => {
  // Set CORS headers
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

  // Route: GET /api/daily-dossier
  if (req.method === 'GET' && pathname === '/api/daily-dossier') {
    try {
      const todayObj = new Date();
      const dateStr = todayObj.toISOString().split('T')[0]; // YYYY-MM-DD
      
      let currentDossier = null;
      if (fs.existsSync(DOSSIER_FILE)) {
        const cached = readJson(DOSSIER_FILE);
        if (cached && cached.date === dateStr && cached.title) {
          currentDossier = cached;
        }
      }
      
      if (!currentDossier) {
        console.log(`[DAILY DOSSIER] Cache miss for ${dateStr}. Compiling new daily dossier...`);
        const dayOfWeek = todayObj.getDay();
        const generated = await generateDailyDossier(dayOfWeek);
        generated.date = dateStr;
        writeJson(DOSSIER_FILE, generated);
        currentDossier = generated;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentDossier));
    } catch (err) {
      console.error('[DAILY DOSSIER] Failed to serve daily dossier:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: GET /api/automation/logs
  if (req.method === 'GET' && pathname === '/api/automation/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(automationLogs));
    return;
  }

  // Route: GET /api/automation/status
  if (req.method === 'GET' && pathname === '/api/automation/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isRunning: isAutomationRunning, enabled: isAutomationEnabled, logCount: automationLogs.length }));
    return;
  }

  // Route: GET /api/automation/config
  if (req.method === 'GET' && pathname === '/api/automation/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: isAutomationEnabled, intervalMs: 3 * 60 * 60 * 1000 }));
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
      addAutomationLog(`Automation state changed via API: ${isAutomationEnabled ? 'ENABLED' : 'DISABLED'}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled: isAutomationEnabled }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: POST /api/automation/run
  if (req.method === 'POST' && pathname === '/api/automation/run') {
    runAutomation(true); // Triggers async with isManual = true
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Automation started.' }));
    return;
  }

  // Route: GET /api/harvest
  if (req.method === 'GET' && pathname === '/api/harvest') {
    addAutomationLog('Manual harvest triggered via API...');
    try {
      const recs = readJson(RECS_FILE) || [];
      const categories = [
        'Category:Unsolved_deaths',
        'Category:Unexplained_phenomena',
        'Category:Conspiracy_theories'
      ];
      let newCount = 0;
      
      for (const cat of categories) {
        addAutomationLog(`Scanning Wikipedia Category "${cat}" manually...`);
        const data = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmlimit=25&format=json&origin=*`);
        const members = data.query?.categorymembers || [];
        for (const item of members) {
          let title = item.title;
          
          if (title.toLowerCase().startsWith('list of') || 
              title.toLowerCase() === 'conspiracy theory' ||
              title.toLowerCase() === 'unexplained phenomena' ||
              title.length < 10) continue;
              
          const storiesObj = readJson(STORIES_FILE) || { stories: [] };
          const alreadyRec = recs.some(r => r.topic.toLowerCase() === title.toLowerCase());
          const alreadyStory = storiesObj.stories.some(s => s.title.toLowerCase() === title.toLowerCase());
          
          if (!alreadyRec && !alreadyStory) {
            recs.push({
              id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              topic: title,
              date: new Date().toLocaleDateString(),
              status: 'pending'
            });
            newCount++;
          }
        }
      }
      
      if (newCount > 0) {
        writeJson(RECS_FILE, recs);
      }
      
      addAutomationLog(`Manual harvest completed. Discovered ${newCount} new topics.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: newCount }));
    } catch (err) {
      addAutomationLog(`Manual harvest failed: ${err.message}`);
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
          story.reactions = { gripping: 0, scared: 0, mindblown: 0 };
        }
        // Ensure gripping key exists (migrate from old 'heart' key)
        if (story.reactions.heart !== undefined && story.reactions.gripping === undefined) {
          story.reactions.gripping = story.reactions.heart;
          delete story.reactions.heart;
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


  // ── Feedback Routes ───────────────────────────────────────────────────────

  // GET /api/feedback — return all site feedback (admin only)
  if (req.method === 'GET' && pathname === '/api/feedback') {
    const fb = readJson(FEEDBACK_FILE) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fb));
    return;
  }

  // POST /api/feedback — submit new site feedback
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

  // DELETE /api/feedback?id=... — delete one feedback item
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

  // PATCH /api/feedback?id=... — mark as addressed/unaddressed
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

  // ── Story PUT — AI Co-Editor full story field update ──────────────────────
  // PUT /api/stories/:id  — update any field of a story (used by AI Co-Editor)
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
      // Deep merge: allow updating any field including nested layers
      storiesData.stories[storyIdx] = { ...storiesData.stories[storyIdx], ...updates };
      writeJson(STORIES_FILE, storiesData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, story: storiesData.stories[storyIdx] }));
      console.log(`[AI-EDITOR] Updated story: ${storyId}`);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

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

  // Route 3: PUT /api/recommendations/:id (or query parameter ?id= or JSON body)
  if (req.method === 'PUT' && (pathname.startsWith('/api/recommendations/') || pathname === '/api/recommendations')) {
    let id = pathname.startsWith('/api/recommendations/') ? pathname.split('/').pop() : urlObj.searchParams.get('id');
    if (!id) {
      try {
        const body = await getJsonBody(req);
        id = body.id;
      } catch (e) {}
    }
    
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

  // Route 4: DELETE /api/recommendations/:id (or query parameter ?id= or JSON body)
  if (req.method === 'DELETE' && (pathname.startsWith('/api/recommendations/') || pathname === '/api/recommendations')) {
    let id = pathname.startsWith('/api/recommendations/') ? pathname.split('/').pop() : urlObj.searchParams.get('id');
    if (!id) {
      try {
        const body = await getJsonBody(req);
        id = body.id;
      } catch (e) {}
    }
    
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
      storiesData.stories = storiesData.stories.filter(s => s.story_id !== newStory.story_id);

      // Download and save cover image locally
      const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (newStory.hero_image && newStory.hero_image.startsWith('http')) {
        newStory.hero_image = await saveAndGetLocalImage(newStory.story_id, newStory.hero_image);
      } else if (!newStory.hero_image || newStory.hero_image === 'auto' || newStory.hero_image.trim() === '') {
        newStory.hero_image = await generateAndSaveImage(newStory.story_id, newStory.title, apiKey);
      }

      storiesData.stories.push(newStory);
      writeJson(STORIES_FILE, storiesData);

      // Delete matching recommendation if it exists
      const recs = readJson(RECS_FILE) || [];
      const updatedRecs = recs.filter(r => r.topic.toLowerCase() !== newStory.title.toLowerCase());
      writeJson(RECS_FILE, updatedRecs);

      // 2. Update concept_index.json
      const conceptIndex = readJson(CONCEPTS_FILE) || {};
      Object.keys(conceptIndex).forEach(concept => {
        conceptIndex[concept] = conceptIndex[concept].filter(id => id !== newStory.story_id);
        if (conceptIndex[concept].length === 0) {
          delete conceptIndex[concept];
        }
      });
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
    
    const storiesData = readJson(STORIES_FILE) || { stories: [] };
    const initialLen = storiesData.stories.length;
    storiesData.stories = storiesData.stories.filter(s => s.story_id !== id);
    if (storiesData.stories.length < initialLen) {
      writeJson(STORIES_FILE, storiesData);
    }
    
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

  // Route: POST /api/stories/backfill-images
  // Trigger background image generation for all stories that are missing hero images
  if (req.method === 'POST' && pathname === '/api/stories/backfill-images') {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const storiesData = readJson(STORIES_FILE) || { stories: [] };
    const missing = storiesData.stories.filter(s => {
      if (!s.hero_image) return true;
      if (s.hero_image.startsWith('http')) return true; // remote, should be local
      const localPath = path.join(__dirname, 'public', s.hero_image);
      return !fs.existsSync(localPath);
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, queued: missing.length, message: `Backfilling images for ${missing.length} stories in background.` }));
    
    // Run in background (don't await)
    (async () => {
      for (const story of missing) {
        try {
          const localPath = path.join(__dirname, 'public', 'content', 'images', `${story.story_id}.jpg`);
          
          // If it's a remote URL, try downloading it
          if (story.hero_image && story.hero_image.startsWith('http')) {
            try {
              await downloadImage(story.hero_image, localPath);
              story.hero_image = `/content/images/${story.story_id}.jpg`;
              writeJson(STORIES_FILE, storiesData);
              console.log(`[BACKFILL] Downloaded remote image for ${story.story_id}`);
              continue;
            } catch {}
          }
          
          // Generate or fetch fresh image
          const topic = story.image_query || story.title;
          const relativePath = await generateAndSaveImage(story.story_id, topic, apiKey);
          story.hero_image = relativePath;
          writeJson(STORIES_FILE, storiesData);
          console.log(`[BACKFILL] Image saved for ${story.story_id}: ${relativePath}`);
        } catch (err) {
          console.error(`[BACKFILL] Failed for ${story.story_id}:`, err.message);
        }
      }
      console.log('[BACKFILL] All done.');
    })();
    return;
  }
  // Route: POST /api/upload-image — save Base64 uploaded images
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

      // Clean base64 header
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

  // Route: POST /api/ai-chat — robust proxy to Pollinations AI with retries + model fallback
  if (req.method === 'POST' && pathname === '/api/ai-chat') {
    try {
      const { prompt, systemPrompt } = await getJsonBody(req);
      console.log(`[AI-CHAT] Processing request via robust callAI pipeline...`);
      const text = await callAI(prompt, systemPrompt || '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    } catch (err) {
      console.error('[AI-CHAT] All AI models failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }


  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`Local Archive Console server running at http://localhost:${PORT}`);
});
