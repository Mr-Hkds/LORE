const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('./db.cjs');

// Helper to find API key
function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY;

  // Try reading .env file manually
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/VITE_GEMINI_API_KEY\s*=\s*([^\s#]+)/);
    if (match) return match[1];
  }
  return '';
}

// Helper to find OpenRouter API key
function getOpenRouterApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (process.env.VITE_OPENROUTER_API_KEY) return process.env.VITE_OPENROUTER_API_KEY;

  // Try reading .env file manually
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/VITE_OPENROUTER_API_KEY\s*=\s*([^\s#]+)/);
    if (match) return match[1];
  }
  return '';
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

const { resolveStoryImage } = require('./lib/image-resolver.cjs');

// Downloads a resolved image URL and saves it locally
async function downloadAndSaveImage(storyId, imageResult) {
  if (!imageResult || !imageResult.url) return null;

  const imagesDir = path.join(__dirname, 'public', 'content', 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  const localPath = path.join(imagesDir, `${storyId}.jpg`);
  const relativePath = `/content/images/${storyId}.jpg`;

  try {
    console.log(`[IMAGE RESOLVER] Downloading ${imageResult.source} image to ${relativePath}...`);
    await downloadImage(imageResult.url, localPath);
    console.log(`[IMAGE RESOLVER] ✓ Saved to ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.warn(`[IMAGE RESOLVER] Download failed: ${err.message}`);
    // Return the remote URL as hero_image so the frontend can use it directly
    return imageResult.url;
  }
}

const apiKey = getApiKey();
const openRouterKey = getOpenRouterApiKey();

if (!apiKey && !openRouterKey) {
  console.warn('WARNING: Neither Gemini API Key nor OpenRouter API Key was found in the environment. Falling back entirely to Pollinations AI free-tier.');
}

const RECS_FILE = path.join(__dirname, 'public', 'content', 'recommendations.json');
const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
const CONCEPTS_FILE = path.join(__dirname, 'public', 'content', 'concept_index.json');

// Ensure files exist
function ensureFiles() {
  if (!fs.existsSync(RECS_FILE)) fs.writeFileSync(RECS_FILE, JSON.stringify([], null, 2));
  if (!fs.existsSync(STORIES_FILE)) fs.writeFileSync(STORIES_FILE, JSON.stringify({ stories: [] }, null, 2));
  if (!fs.existsSync(CONCEPTS_FILE)) fs.writeFileSync(CONCEPTS_FILE, JSON.stringify({}, null, 2));
}
ensureFiles();

// Load data
const storiesData = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf-8'));
const conceptIndex = JSON.parse(fs.readFileSync(CONCEPTS_FILE, 'utf-8'));

// Generic helper to call Gemini API with retries and fallback from 2.5-flash to 1.5-flash
async function callGeminiApi(contents, config = {}) {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            ...config
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${res.statusText || errText}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text.trim();
        }
        throw new Error('Empty response from model');
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini API] Attempt ${attempt} failed for model ${model}:`, err.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }
  }
  throw lastError || new Error('Failed to generate content from Gemini API');
}

// Call OpenRouter API with fallback models (Gemini-2.5-free and Llama-3-8b-free)
async function callOpenRouterApi(contents, config = {}) {
  if (!openRouterKey) {
    throw new Error('OpenRouter API key is not configured.');
  }

  // Convert Gemini message format to OpenAI chat messages format
  const messages = contents.map(c => {
    if (c.parts && c.parts[0] && c.parts[0].text) {
      return {
        role: c.role === 'user' ? 'user' : 'assistant',
        content: c.parts[0].text
      };
    }
    return {
      role: c.role || 'user',
      content: c.content || c.text || ''
    };
  });

  const models = ['google/gemini-2.5-flash:free', 'meta-llama/llama-3-8b-instruct:free'];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[OpenRouter API] Querying model ${model}...`);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Mr-Hkds/LORE',
          'X-Title': 'LORE Content Engine'
        },
        body: JSON.stringify({
          model,
          messages,
          ...config
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${res.statusText || errText}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) {
        return text.trim();
      }
      throw new Error(`OpenRouter ${model} returned empty response`);
    } catch (err) {
      lastError = err;
      console.warn(`[OpenRouter API] Model ${model} call failed:`, err.message);
    }
  }
  throw lastError || new Error('All OpenRouter models failed.');
}

// Call Pollinations AI Text API with model rotation and retries
async function callPollinationsText(prompt, systemPrompt = '') {
  const models = ['openai', 'mistral', 'claude'];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const payload = {
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          model
        };

        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error(`Pollinations ${model} returned HTTP ${res.status}`);
        }

        const text = await res.text();
        if (text && text.trim().length >= 5) {
          return text.trim();
        }
        throw new Error(`Pollinations ${model} returned empty response`);
      } catch (err) {
        lastError = err;
        console.warn(`[Pollinations AI] Model ${model} attempt ${attempt} failed:`, err.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }
  }
  throw lastError || new Error('All Pollinations AI models failed');
}

// Robust unified AI router that cascades through all available providers
async function callRobustAI(prompt, expectJSON = false) {
  let lastError = null;

  // 1. Try Direct Gemini
  if (apiKey) {
    try {
      console.log('[Content Engine] Running via Direct Gemini API...');
      return await callGeminiApi(
        [{ role: 'user', parts: [{ text: prompt }] }],
        expectJSON ? { generationConfig: { responseMimeType: 'application/json' } } : {}
      );
    } catch (err) {
      lastError = err;
      console.warn('[Content Engine] Direct Gemini failed:', err.message);
    }
  }

  // 2. Try OpenRouter
  if (openRouterKey) {
    try {
      console.log('[Content Engine] Falling back to OpenRouter free-tier...');
      return await callOpenRouterApi(
        [{ role: 'user', parts: [{ text: prompt }] }],
        expectJSON ? { response_format: { type: 'json_object' } } : {}
      );
    } catch (err) {
      lastError = err;
      console.warn('[Content Engine] OpenRouter failed:', err.message);
    }
  }

  // 3. Try Pollinations AI (Zero Key Fallback)
  try {
    console.log('[Content Engine] Falling back to zero-config Pollinations AI...');
    const suffix = expectJSON ? '\n\nReturn ONLY the raw JSON. Do not wrap in markdown or add explanations.' : '';
    return await callPollinationsText(
      prompt + suffix,
      expectJSON ? 'You are a dark historian database compiler. Output valid JSON only, no markdown wrapping.' : 'You are a helpful assistant.'
    );
  } catch (err) {
    lastError = err;
    console.error('[Content Engine] Critical: Pollinations AI fallback failed:', err.message);
  }

  throw lastError || new Error('All AI providers in the fallback chain failed.');
}

async function callGemini(prompt) {
  return callRobustAI(prompt, true);
}

async function fetchOpenAlexPapers(topic) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(topic)}&filter=is_oa:true&per_page=3`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return (data.results || []).map(work => {
        const authors = (work.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 2).join(', ');
        return {
          label: `${work.display_name || 'Scholarly Article'} (${authors ? authors + ', ' : ''}${work.publication_year || 'N/A'})`,
          url: work.best_oa_location?.pdf_url || work.primary_location?.landing_page_url || `https://doi.org/${work.doi}`
        };
      });
    }
  } catch (err) {
    console.warn('Failed to fetch related PDFs from OpenAlex:', err.message);
  }
  return [];
}

function cleanAndParseJSON(text) {
  if (!text) throw new Error('Input text is empty');
  let cleaned = text.trim();
  
  // Remove markdown code block wrapping (e.g. ```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }

  // Find first '{' or '[' and last '}' or ']'
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

  // Remove trailing commas in arrays/objects (very common in AI outputs)
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(cleaned);
}

async function run() {
  console.log('--- STARTING AI CONTENT ENGINE ---');

  // GitHub Issues Database Config
  const githubToken = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;
  const isGithubEnabled = !!githubToken;
  const repoOwner = 'Mr-Hkds';
  const repoName = 'LORE';

  const ghHeaders = {
    Authorization: `token ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'LORE-App'
  };

  async function getRecommendations() {
    if (isGithubEnabled) {
      console.log('GitHub Token is enabled. Fetching recommendations from GitHub Issues...');
      try {
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues?labels=recommendation&state=all&per_page=100`, {
          headers: ghHeaders
        });
        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
        }
        const issues = await response.json();
        return issues.map(issue => ({
          id: String(issue.number),
          topic: issue.title,
          date: new Date(issue.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          status: issue.state === 'open' ? 'pending' : 'generated'
        }));
      } catch (err) {
        console.warn('Failed to fetch recommendations from GitHub Issues, falling back to local file. Error:', err.message);
      }
    }
    return JSON.parse(fs.readFileSync(RECS_FILE, 'utf-8'));
  }

  async function saveRecommendations(recsList) {
    if (isGithubEnabled) {
      console.log('Updating recommendation states on GitHub Issues...');
      try {
        for (const item of topicsToGenerate) {
          if (item.recId) {
            console.log(`Closing GitHub Issue #${item.recId}...`);
            await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${item.recId}`, {
              method: 'PATCH',
              headers: ghHeaders,
              body: JSON.stringify({ state: 'closed' })
            });
          }
        }
      } catch (err) {
        console.error('Failed to update GitHub issue states. Error:', err.message);
      }
    }
    fs.writeFileSync(RECS_FILE, JSON.stringify(recsList, null, 2));
  }

  let recommendations = await getRecommendations();
  
  // 1. Identify topics to run
  const pendingRecs = recommendations.filter(r => r.status === 'pending');
  let topicsToGenerate = [];

  if (pendingRecs.length > 0) {
    console.log(`Found ${pendingRecs.length} pending user recommendations.`);
    // Take up to 2 recommendations
    topicsToGenerate = pendingRecs.slice(0, 2).map(r => ({
      topic: r.topic,
      recId: r.id,
      category: 'psychology' // Default category, AI will re-classify
    }));
  } else {
    console.log('No pending recommendations. AI will search/invent new topics...');
    try {
      const existingTitles = storiesData.stories.map(s => s.title).join(', ');
      
      // Calculate category counts to find the 2 least represented categories
      const categories = ['psychology', 'mythology', 'true_crime', 'paranormal', 'conspiracy', 'gov_experiments', 'cyber_mysteries'];
      const counts = {};
      categories.forEach(c => { counts[c] = 0; });
      storiesData.stories.forEach(s => {
        if (counts[s.category] !== undefined) counts[s.category]++;
      });
      
      // Sort categories by count ascending
      const sortedCategories = [...categories].sort((a, b) => counts[a] - counts[b]);
      const targetCat1 = sortedCategories[0];
      const targetCat2 = sortedCategories[1];
      
      console.log(`Least represented categories: "${targetCat1}" (${counts[targetCat1]} stories) and "${targetCat2}" (${counts[targetCat2]} stories).`);
      
      const categoryOptions = 'psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries';
      const selectPrompt = `Select 2 distinct, highly engaging, creepy, or dark real-world topics (historical mysteries, psychology phenomena, digital shadows, or classified experiments).
CRITICAL: You must choose well-documented, established historical, scientific, or psychological cases that have a robust factual standing and high-integrity information. Absolutely avoid very recent or trending topics (which could be fake, unverified, or sensationalized news).
One topic MUST fit the category "${targetCat1}".
The other topic MUST fit the category "${targetCat2}".
They must NOT be similar to these existing archive stories:
[${existingTitles}]

Return a JSON array of objects, each with 'topic' (string) and 'category' (must be "${targetCat1}" for the first topic, and "${targetCat2}" for the second topic). Example:
[
  {"topic": "Project MKUltra", "category": "${targetCat1}"},
  {"topic": "The Mariana Web", "category": "${targetCat2}"}
]`;
      const aiResponse = await callGemini(selectPrompt);
      const chosen = cleanAndParseJSON(aiResponse);
      topicsToGenerate = chosen.map(c => ({
        topic: c.topic,
        category: c.category,
        recId: null
      }));
    } catch (e) {
      console.warn('Failed to choose topics automatically, falling back to defaults. Error:', e.message);
      // Fallback: pick the least represented categories directly
      const categories = ['psychology', 'mythology', 'true_crime', 'paranormal', 'conspiracy', 'gov_experiments', 'cyber_mysteries'];
      const counts = {};
      categories.forEach(c => { counts[c] = 0; });
      storiesData.stories.forEach(s => {
        if (counts[s.category] !== undefined) counts[s.category]++;
      });
      const sortedCategories = [...categories].sort((a, b) => counts[a] - counts[b]);
      topicsToGenerate = [
        { topic: 'Project MKUltra', category: sortedCategories[0], recId: null },
        { topic: 'The Salem Witch Trials', category: sortedCategories[1], recId: null }
      ];
    }
  }

  console.log('Topics to generate today:', topicsToGenerate.map(t => t.topic).join(' | '));

  // 2. Generate stories for selected topics
  for (const item of topicsToGenerate) {
    console.log(`\nGenerating story for: "${item.topic}"...`);
    try {
      const storiesSummary = storiesData.stories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
      
      const prompt = `Write a complete, highly-detailed 7-layer documentary story in clean, simple, and professional English about the famous, documented, real-world case or event: "${item.topic}".
Suggested Category: ${item.category} (Use this as a suggestion, but you must auto-classify the topic into the single most appropriate category from the valid categories list below)
Severity Level: unsettling, disturbing, or chilling

CRITICAL FACTUAL AND PACING RULES:
1. Only real, historically documented cases. Absolutely no creepypastas or internet rumors.
2. Write the title, hook, layer names, layer content, cliffhangers, and transition lines in extremely simple, direct, and clear English (perfectly suited for non-native English readers and an Indian audience). Keep sentence structures short and straightforward. Avoid complex vocabulary, academic jargon, or obscure words (e.g., use 'secret' instead of 'clandestine', 'clear' instead of 'conspicuous', 'explain' instead of 'delineate', 'puzzling' instead of 'enigmatic'). The tone should be similar to a simple, premium educational video essay—highly accessible yet serious and respectful. Do NOT use Hinglish, slang, or cheap sensationalism.
3. The narrative must flow layer by layer: Layer 1 introduces the whisper, Layer 4 details the event, and Layer 7 delivers the absolute darkest documented truth. Layer 1 must start with a unique, gripping, and topic-specific hook to grab attention (avoid generic openings like 'Did you know' or 'Have you ever thought about' or any other generic question. Go straight into a chilling, specific fact).
4. Each layer content must be 2-3 detailed paragraphs. Use double newlines \n\n between paragraphs.
5. Place quotes inside text using single quotes ('). Do not use unescaped double quotes inside values.

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
  "severity": "unsettling | disturbing | chilling",
  "layers": [
    {
      "layer": 1,
      "layer_name": "Name of Layer 1 (The Whisper - introducing the mystery)",
      "content": "Fully-written narrative for Layer 1. Must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.",
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

      const aiResponse = await callGemini(prompt);
      const storyObj = cleanAndParseJSON(aiResponse);
      
      storyObj.added_date = new Date().toISOString().split('T')[0];

      // Fetch related scholarly research PDFs from OpenAlex
      console.log('Fetching related research PDFs from OpenAlex...');
      try {
        const papers = await fetchOpenAlexPapers(item.topic);
        if (papers && papers.length > 0) {
          console.log(`Found ${papers.length} scholarly papers. Attaching to dossier.`);
          storyObj.evidence_links = papers;
        }
      } catch (err) {
        console.warn('OpenAlex fetch failed:', err.message);
      }

      // Resolve cover image via 4-tier cascade (Wikipedia → Commons → Pexels → null)
      console.log('Resolving cover image via multi-tier cascade...');
      try {
        const imageResult = await resolveStoryImage(storyObj.story_id, item.topic, storyObj.category || item.category);
        if (imageResult) {
          const heroImg = await downloadAndSaveImage(storyObj.story_id, imageResult);
          storyObj.hero_image = heroImg;
          storyObj.image_source = imageResult.source; // Track which tier provided the image
          console.log(`Cover image resolved via ${imageResult.source}: ${heroImg}`);
        } else {
          storyObj.hero_image = null;
          console.log('No cover image found — typographic fallback will be used.');
        }
      } catch (imgErr) {
        console.warn('Cover image resolution failed:', imgErr.message);
        storyObj.hero_image = null;
      }

      // Add to stories array
      storiesData.stories = storiesData.stories.filter(s => s.story_id !== storyObj.story_id);
      storiesData.stories.push(storyObj);
      console.log(`Story generated successfully: "${storyObj.title}"`);

      // Save directly to database (remote Turso or local SQLite fallback)
      try {
        console.log(`[DB ENGINE] Saving generated story "${storyObj.title}" to database...`);
        await db.insertStory(storyObj);
        console.log('[DB ENGINE] Successfully saved story to database.');
      } catch (dbErr) {
        console.error('[DB ENGINE] Failed to save story to database:', dbErr.message);
      }

      // Update concept index
      if (storyObj.concepts) {
        // Clear old occurrences
        Object.keys(conceptIndex).forEach(concept => {
          conceptIndex[concept] = conceptIndex[concept].filter(id => id !== storyObj.story_id);
          if (conceptIndex[concept].length === 0) delete conceptIndex[concept];
        });
        // Append new
        storyObj.concepts.forEach(concept => {
          if (!conceptIndex[concept]) conceptIndex[concept] = [];
          if (!conceptIndex[concept].includes(storyObj.story_id)) {
            conceptIndex[concept].push(storyObj.story_id);
          }
        });
      }

      // Mark recommendation as generated in list
      if (item.recId) {
        recommendations = recommendations.map(r => r.id === item.recId ? { ...r, status: 'generated' } : r);
        console.log(`Marked recommendation ID: ${item.recId} as generated.`);
        try {
          await db.updateRecommendationStatus(item.recId, 'generated');
        } catch (dbErr) {
          console.warn('[DB ENGINE] Failed to update recommendation status:', dbErr.message);
        }
      }
    } catch (e) {
      console.error(`FAILED to generate story for: "${item.topic}". Error:`, e.message);
    }
  }

  // 3. Write back to files
  fs.writeFileSync(STORIES_FILE, JSON.stringify(storiesData, null, 2));
  fs.writeFileSync(CONCEPTS_FILE, JSON.stringify(conceptIndex, null, 2));
  await saveRecommendations(recommendations);
  
  // Write automation status JSON
  try {
    const statusFilePath = path.join(__dirname, 'public', 'content', 'automation_status.json');
    const statusData = {
      lastRunAt: Date.now(),
      nextRunAt: Date.now() + 30 * 60 * 1000,
      intervalMs: 30 * 60 * 1000,
      isRunning: false,
      enabled: true,
      status: 'success',
      error: null,
      mode: 'github-actions'
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2));
    console.log('Successfully wrote public/content/automation_status.json');
  } catch (err) {
    console.error('Failed to write automation status file:', err.message);
  }

  // Close database client to allow process to exit cleanly
  try {
    if (db.client && typeof db.client.close === 'function') {
      db.client.close();
    }
  } catch (err) {
    // Ignore close errors
  }

  console.log('\n--- ARCHIVE REPOSITORY FILES UPDATED SUCCESSFULLY ---');
}

run().catch(err => {
  console.error('CRITICAL: Content Engine Run Failed:', err);
  try {
    const statusFilePath = path.join(__dirname, 'public', 'content', 'automation_status.json');
    const statusData = {
      lastRunAt: Date.now(),
      nextRunAt: Date.now() + 30 * 60 * 1000,
      intervalMs: 30 * 60 * 1000,
      isRunning: false,
      enabled: true,
      status: 'failed',
      error: err.message,
      mode: 'github-actions'
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2));
  } catch (writeErr) {
    console.error('Failed to write failure status file:', writeErr.message);
  }
  
  try {
    if (db.client && typeof db.client.close === 'function') {
      db.client.close();
    }
  } catch (e) {}

  process.exit(1);
});
