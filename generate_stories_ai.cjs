const fs = require('fs');
const path = require('path');

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
const recommendations = JSON.parse(fs.readFileSync(RECS_FILE, 'utf-8'));
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
Category: ${item.category}
Severity Level: unsettling, disturbing, or extreme

You must write a true, documented historical, scientific, or psychological case. Do NOT fabricate facts. Keep the language simple, easy to understand, and follow a dramatic, engaging, documentary-style voice (like reading a script for a true crime or mystery documentary). Avoid unnecessary quotes, introductions, or generic fluff.

CRITICAL JSON FORMATTING RULES:
1. Do not use double quotes inside string fields unless they are escaped as \\". Prefer using single quotes (') for any quotes or titles inside the story text (e.g., 'Bermuda Triangle' instead of \"Bermuda Triangle\").
2. Ensure there are no trailing commas in arrays or objects.
3. The response must be strictly valid, clean JSON that can be parsed by JSON.parse() without errors.

Structure the story exactly in the following JSON format:
{
  "story_id": "lowercase_slug_with_underscores",
  "title": "A compelling, title for the dossier",
  "category": "must be one of: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries",
  "hook": "A 1-2 sentence teaser (max 150 chars) for the catalog",
  "concepts": ["concept1", "concept2", "concept3"],
  "severity": "unsettling | disturbing | extreme",
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
  fs.writeFileSync(RECS_FILE, JSON.stringify(recommendations, null, 2));
  console.log('\n--- ARCHIVE REPOSITORY FILES UPDATED SUCCESSFULLY ---');
}

run();
