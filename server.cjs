const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3001;
const RECS_FILE = path.join(__dirname, 'public', 'content', 'recommendations.json');
const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');

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
    const imagesDir = path.join(__dirname, 'public', 'content', 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const localPath = path.join(imagesDir, `${storyId}.jpg`);
    await downloadImage(imageUrl, localPath);
    return `/content/images/${storyId}.jpg`;
  } catch (err) {
    console.error(`Failed to save image locally for ${storyId}:`, err.message);
    return imageUrl;
  }
}

// Fetch from Wikipedia or fall back to Pollinations AI to generate and save a story cover image
async function generateAndSaveImage(storyId, topic, apiKey) {
  const imagesDir = path.join(__dirname, 'public', 'content', 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  const localPath = path.join(imagesDir, `${storyId}.jpg`);
  const relativePath = `/content/images/${storyId}.jpg`;

  let hasPerfectPhoto = false;
  if (apiKey) {
    try {
      const checkPrompt = `For the topic "${topic}", does there exist a highly iconic, recognizable, and visually compelling real photograph of the event (e.g. the 11 pipes of Burari, or the slashed tent of Dyatlov Pass)?
Reply with YES only if such a specific, famous, iconic, and visually striking real photo exists.
Reply with NO if there is no such iconic photo (e.g., if there are only generic drawings, portraits of individuals, maps, diagrams, or no photos at all).
Output YES or NO only. Do not include markdown or explanations.`;
      
      const geminiCheck = await postUrl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: checkPrompt }] }]
        }
      );
      const decision = geminiCheck?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toUpperCase() || 'NO';
      hasPerfectPhoto = decision.includes('YES');
      console.log(`[IMAGE ENGINE] Gemini decision on perfect real photo for "${topic}": ${decision}`);
    } catch (err) {
      console.warn(`[IMAGE ENGINE] Failed to check perfect photo status for "${topic}":`, err.message);
    }
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
    // Generate a high-quality prompt from Gemini
    const promptInstructions = `Create a highly descriptive, visually stunning image generation prompt for the dark historical/psychological topic: "${topic}".
This image will be the main cover art of a thriller/mystery story. Design an attractive, clickable, eye-catching concept.
Write a single descriptive sentence for a cinematic, atmospheric photo. Keep it highly realistic, dark, moody, with dramatic lighting, deep shadows, and rich textures, highlighting a mysterious and suspenseful focal point that makes the reader curious to click and read.
Do NOT use words like "photorealistic", "ultra-detailed", or markdown styling. Output the prompt text only.`;
    
    let aiPrompt = `A cinematic, atmospheric dark photo of ${topic}, highly realistic, dramatic lighting`;
    if (apiKey) {
      const geminiRes = await postUrl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: promptInstructions }] }]
        }
      );
      const generated = geminiRes?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generated) {
        aiPrompt = generated;
      }
    }
    
    aiPrompt = aiPrompt.trim().replace(/"/g, '').replace(/\n/g, ' ');
    
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=800&height=600&nologo=true&private=true&model=flux`;
    console.log(`[IMAGE ENGINE] Downloading Pollinations AI image from: ${pollinationsUrl}`);
    await downloadImage(pollinationsUrl, localPath);
    return relativePath;
  } catch (err) {
    console.error(`[IMAGE ENGINE] AI Image generation failed for ${topic}:`, err.message);
    return `https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800`;
  }
}

// Native HTTPS helper to POST JSON
function postUrl(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
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
          reject(new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}\nBody: ${data}`));
        }
      });
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
  
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }

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

  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(cleaned);
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

let isAutomationRunning = false;

async function runAutomation() {
  if (isAutomationRunning) {
    addAutomationLog('Automation already in progress. Skipping.');
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
    addAutomationLog('Phase 1: Harvesting obscure dark mysteries from SOTA Wikipedia Categories...');
    const newTopics = [];
    const categories = [
      'Category:Unsolved_deaths',
      'Category:Unexplained_phenomena',
      'Category:Conspiracy_theories'
    ];
    
    for (const cat of categories) {
      addAutomationLog(`Scanning SOTA Category "${cat}"...`);
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
        const cleanPrompt = `Analyze the following list of user-recommended topics for a dark mystery, historical, or psychological archive website.
Identify which topics are completely irrelevant, spam, test inputs, gibberish (e.g. "asdf", "test"), blank, inappropriate, or nonsense.

Recommendations list:
${pending.map(r => `- ID: ${r.id}, Topic: "${r.topic}"`).join('\n')}

Return a JSON array containing ONLY the IDs (strings) of the recommendations that are spam or irrelevant and should be deleted.
If all recommendations are valid and relevant, return an empty array: [].
Do not wrap in markdown. Output raw JSON only.`;

        const cleanRes = await postUrl(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            contents: [{ role: 'user', parts: [{ text: cleanPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }
        );
        
        const text = cleanRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        const spamIds = cleanAndParseJSON(text);
        
        if (Array.isArray(spamIds) && spamIds.length > 0) {
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
    if (finalPending.length > 0) {
      topicsToGen = finalPending.slice(0, 1).map(r => r.topic);
      addAutomationLog(`Selected 1 pending user topic for compilation: "${topicsToGen[0]}"`);
    } else {
      addAutomationLog('No pending topics. Requesting AI to suggest 1 high-quality obscure case...');
      try {
        const storiesObj = readJson(STORIES_FILE) || { stories: [] };
        const existingTitles = storiesObj.stories.map(s => s.title).join(', ');
        
        const suggestPrompt = `Select 1 distinct, highly engaging, creepy, or dark real-world topic (historical mystery, psychology phenomenon, digital shadow, or classified experiment).
CRITICAL: You must choose a well-documented, established historical, scientific, or psychological case that has a robust factual standing and high-integrity information. Absolutely avoid very recent or trending topics (which could be fake, unverified, or sensationalized news).
It must NOT be similar to these existing archive stories:
[${existingTitles}]

Return a JSON object with 'topic' (string). Example:
{"topic": "The 1948 Tamam Shud Case"}`;

        const suggestRes = await postUrl(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            contents: [{ role: 'user', parts: [{ text: suggestPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }
        );
        
        const text = suggestRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        const suggestion = cleanAndParseJSON(text);
        if (suggestion && suggestion.topic) {
          topicsToGen = [suggestion.topic];
          addAutomationLog(`AI suggested topic: "${suggestion.topic}"`);
        }
      } catch (err) {
        addAutomationLog(`Warning: Failed to get AI suggestions: ${err.message}`);
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
You MUST auto-determine the severity level (unsettling, disturbing, or extreme) based on the topic.

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
  "hook": "A 1-2 sentence teaser (max 150 chars) for the catalog",
  "concepts": ["concept1", "concept2", "concept3"],
  "severity": "unsettling | disturbing | extreme",
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

      const genRes = await postUrl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: genPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }
      );
      
      const genText = genRes?.candidates?.[0]?.content?.parts?.[0]?.text;
      const storyObj = cleanAndParseJSON(genText);
      
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

      // Fetch related PDFs from OpenAlex
      addAutomationLog('Fetching scholarly PDF evidence files from OpenAlex...');
      try {
        const openAlexRes = await fetchUrl(`https://api.openalex.org/works?search=${encodeURIComponent(topic)}&filter=is_oa:true&per_page=3`);
        const papers = (openAlexRes.results || []).map(work => {
          const authors = (work.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 2).join(', ');
          return {
            label: `${work.display_name || 'Scholarly Article'} (${authors ? authors + ', ' : ''}${work.publication_year || 'N/A'})`,
            url: work.best_oa_location?.pdf_url || work.primary_location?.landing_page_url || `https://doi.org/${work.doi}`
          };
        });
        if (papers.length > 0) {
          storyObj.evidence_links = papers;
          addAutomationLog(`Attached ${papers.length} peer-reviewed research PDFs.`);
        }
      } catch (oaErr) {
        addAutomationLog(`OpenAlex fetch failed: ${oaErr.message}`);
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

// Run automation every 30 minutes
setInterval(() => {
  runAutomation();
}, 30 * 60 * 1000);

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

  // Route: GET /api/automation/logs
  if (req.method === 'GET' && pathname === '/api/automation/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(automationLogs));
    return;
  }

  // Route: GET /api/automation/status
  if (req.method === 'GET' && pathname === '/api/automation/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isRunning: isAutomationRunning, logCount: automationLogs.length }));
    return;
  }

  // Route: POST /api/automation/run
  if (req.method === 'POST' && pathname === '/api/automation/run') {
    runAutomation(); // Triggers async
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
        addAutomationLog(`Scanning SOTA Category "${cat}" manually...`);
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
      
      addAutomationLog(`Manual harvest completed. Discovered ${newCount} new SOTA topics.`);
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


  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`Local Archive Console server running at http://localhost:${PORT}`);
});
