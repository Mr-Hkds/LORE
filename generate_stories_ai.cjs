const fs = require('fs');
const path = require('path');
const https = require('https');

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
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: checkPrompt }] }]
        })
      });
      if (response.ok) {
        const checkData = await response.json();
        const decision = checkData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toUpperCase() || 'NO';
        hasPerfectPhoto = decision.includes('YES');
        console.log(`[IMAGE ENGINE] Gemini decision on perfect real photo for "${topic}": ${decision}`);
      }
    } catch (err) {
      console.warn(`[IMAGE ENGINE] Failed to check perfect photo status for "${topic}":`, err.message);
    }
  }

  // Step 1: Try Wikipedia first if iconic real photo exists
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
    const promptInstructions = `Create a highly descriptive, visually stunning image generation prompt for the dark historical/psychological topic: "${topic}".
This image will be the main cover art of a thriller/mystery story. Design an attractive, clickable, eye-catching concept.
Write a single descriptive sentence for a cinematic, atmospheric photo. Keep it highly realistic, dark, moody, with dramatic lighting, deep shadows, and rich textures, highlighting a mysterious and suspenseful focal point that makes the reader curious to click and read.
Do NOT use words like "photorealistic", "ultra-detailed", or markdown styling. Output the prompt text only.`;
    
    let aiPrompt = `A cinematic, atmospheric dark photo of ${topic}, highly realistic, dramatic lighting`;
    if (apiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: promptInstructions }] }]
        })
      });
      if (response.ok) {
        const geminiRes = await response.json();
        const generated = geminiRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generated) {
          aiPrompt = generated;
        }
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

const apiKey = getApiKey();
if (!apiKey) {
  console.error('ERROR: No Gemini API Key found in env or .env file.');
  process.exit(1);
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

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini.');
  return text.trim();
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

  const recommendations = await getRecommendations();
  
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
      const categoryOptions = 'psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries';
      const selectPrompt = `Select 2 distinct, highly engaging, creepy, or dark real-world topics (historical mysteries, psychology phenomena, digital shadows, or classified experiments).
CRITICAL: You must choose well-documented, established historical, scientific, or psychological cases that have a robust factual standing and high-integrity information. Absolutely avoid very recent or trending topics (which could be fake, unverified, or sensationalized news).
They must NOT be similar to these existing archive stories:
[${existingTitles}]

Return a JSON array of objects, each with 'topic' (string) and 'category' (must be one of: ${categoryOptions}). Example:
[
  {"topic": "Project MKUltra", "category": "gov_experiments"},
  {"topic": "The Mariana Web", "category": "cyber_mysteries"}
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
      topicsToGenerate = [
        { topic: 'Project MKUltra', category: 'gov_experiments', recId: null },
        { topic: 'The Salem Witch Trials', category: 'true_crime', recId: null }
      ];
    }
  }

  console.log('Topics to generate today:', topicsToGenerate.map(t => t.topic).join(' | '));

  // 2. Generate stories for selected topics
  for (const item of topicsToGenerate) {
    console.log(`\nGenerating story for: "${item.topic}"...`);
    try {
      const storiesSummary = storiesData.stories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
      
      const prompt = `Write a complete, highly-detailed 7-layer documentary story about the topic: "${item.topic}".
Suggested Category: ${item.category} (Use this as a suggestion, but you must auto-classify the topic into the single most appropriate category from the valid categories list below)
Severity Level: unsettling, disturbing, or chilling

CRITICAL LANGUAGE RULE: Write all story content (including title, hook, layer names, layer content, cliffhangers, and transition lines) in high-quality, engaging Hinglish (Hindi written in the English/Latin alphabet, naturally blended with English words as spoken by urban Indians). For example, write "Living room mein family ke 11 members hanging position mein mile" instead of "Eleven family members were found hanging in the living room." The tone should be extremely dark, conversational, and dramatic, like a local podcast host or YouTube narrator telling a mystery story in Hinglish. Keep it facts-based and true; do NOT fabricate.

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

      // Fetch and generate cover image (Wikipedia with AI generation fallback)
      console.log('Resolving cover image (Wikipedia with AI generation fallback)...');
      try {
        const heroImg = await generateAndSaveImage(storyObj.story_id, item.topic, apiKey);
        storyObj.hero_image = heroImg;
        console.log('Cover image compiled and saved locally.');
      } catch (imgErr) {
        console.warn('Cover image generation failed:', imgErr.message);
      }

      // Add to stories array
      storiesData.stories = storiesData.stories.filter(s => s.story_id !== storyObj.story_id);
      storiesData.stories.push(storyObj);
      console.log(`Story generated successfully: "${storyObj.title}"`);

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

      // Mark recommendation as generated
      if (item.recId) {
        const idx = recommendations.findIndex(r => r.id === item.recId);
        if (idx !== -1) {
          recommendations[idx].status = 'generated';
          console.log(`Updated recommendation status to 'generated' for ID: ${item.recId}`);
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
  console.log('\n--- ARCHIVE REPOSITORY FILES UPDATED SUCCESSFULLY ---');
}

run();
