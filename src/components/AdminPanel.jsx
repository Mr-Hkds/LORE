import { useState, useEffect, useCallback, useMemo } from 'react';
import LoreMark from './LoreMark';

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

export default function AdminPanel({ stories, localStories, setLocalStories, refetchStories, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  // Tabs: 'catalog' | 'recommendations' | 'generator' | 'feedback' | 'ai-editor'
  const [activeTab, setActiveTab] = useState('catalog');
  
  // Feedback tab state
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // AI Co-Editor state
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hello! I\'m your LORE Co-Editor. I have access to all stories, user feedback, and the image system.\n\nTell me what to improve:\n• "Change the hero image for Burari Deaths to [URL or describe]"\n• "Rewrite Layer 3 of the Asch story to be shorter"\n• "Find OpenAlex papers for the Dyatlov Pass story"\n• "Which story has the lowest reaction score?"' }
  ]);
  const [aiInput, setAiInput]     = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);

  // Custom stories state
  const [recommendations, setRecommendations] = useState([]);
  const [expandedStoryId, setExpandedStoryId] = useState(null);
  const [selectedRecIds, setSelectedRecIds] = useState([]);

  // Story editing state
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', hero_image: '', hook: '' });

  // Generator form state
  const [genTopic, setGenTopic] = useState('');
  const [genCategory, setGenCategory] = useState('auto');
  const [genSeverity, setGenSeverity] = useState('auto');
  const [apiKey, setApiKey] = useState('');
  
  // Console logging state
  const [logs, setLogs] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Read apiKey from env on load
  useEffect(() => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    setApiKey(envKey);
  }, []);

  const [isCleaning, setIsCleaning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval;
    if (isGenerating) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Helper to fetch papers from OpenAlex scholarly database
  const fetchOpenAlexPapers = async (topic) => {
    try {
      const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(topic)}&filter=is_oa:true&per_page=3`);
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
      console.warn('Failed to fetch related PDFs from OpenAlex:', err);
    }
    return [];
  };

  // Helper to fetch high-quality real historical image from Wikipedia (Free, SOTA)
  const fetchWikipediaImage = async (topic) => {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=800&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=1&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const firstPageId = Object.keys(pages)[0];
          const imageUrl = pages[firstPageId]?.thumbnail?.source;
          return imageUrl || null;
        }
      }
    } catch (e) {
      console.warn('Wikipedia image fetch failed:', e);
    }
    return null;
  };

  const [autoStatus, setAutoStatus] = useState({ isRunning: false, logCount: 0 });
  const [autoLogs, setAutoLogs] = useState([]);

  // Fetch status and logs from server
  const fetchAutomationData = useCallback(async () => {
    try {
      const resStatus = await fetch('/api/automation/status');
      if (resStatus.ok) {
        const status = await resStatus.json();
        setAutoStatus(status);
      }
      const resLogs = await fetch('/api/automation/logs');
      if (resLogs.ok) {
        const logsData = await resLogs.json();
        setAutoLogs(logsData);
      }
    } catch (err) {
      console.warn('Failed to fetch automation data:', err);
    }
  }, []);

  // Poll automation logs and status every 2500ms
  useEffect(() => {
    fetchAutomationData();
    const interval = setInterval(fetchAutomationData, 2500);
    return () => clearInterval(interval);
  }, [fetchAutomationData]);

  const [isHarvesting, setIsHarvesting] = useState(false);

  const handleHarvestWebTrends = async () => {
    setIsHarvesting(true);
    addLog('📡 Triggering server-side trends harvest (Reddit)...');
    try {
      const res = await fetch('/api/harvest');
      if (!res.ok) throw new Error('Server returned an error');
      const data = await res.json();
      
      addLog(`📡 Harvest completed. Server discovered ${data.count || 0} new topics.`);
      await loadRecommendations();
      await fetchAutomationData();
      alert(`Harvest complete! Discovered ${data.count || 0} new trending topics.`);
    } catch (err) {
      console.error(err);
      addLog(`📡 Harvest error: ${err.message}`);
      alert('Failed to harvest trends: ' + err.message);
    } finally {
      setIsHarvesting(false);
    }
  };

  const handleAiAutoClean = async () => {
    if (!apiKey) {
      alert('Gemini API Key is required to run the AI Auto-Clean.');
      return;
    }
    const pending = recommendations.filter(r => r.status === 'pending');
    if (pending.length === 0) {
      alert('No pending recommendations to clean.');
      return;
    }

    if (!window.confirm(`AI will analyze ${pending.length} pending recommendations to find and delete spam, test inputs, or gibberish. Proceed?`)) return;

    setIsCleaning(true);
    addLog('✨ Starting AI Auto-Clean of recommendations queue...');

    try {
      const prompt = `Analyze the following list of user-recommended topics for a dark mystery, historical, or psychological archive website.
Identify which topics are completely irrelevant, spam, test inputs, gibberish (e.g. "asdf", "test"), blank, inappropriate, or nonsense.

Recommendations list:
${pending.map(r => `- ID: ${r.id}, Topic: "${r.topic}"`).join('\n')}

Return a JSON array containing ONLY the IDs (strings) of the recommendations that are spam or irrelevant and should be deleted.
If all recommendations are valid and relevant, return an empty array: [].
Do not wrap in markdown. Output raw JSON only.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from AI.');

      const spamIds = cleanAndParseJSON(text);
      if (!Array.isArray(spamIds)) throw new Error('Invalid response structure from AI.');

      addLog(`✨ AI identified ${spamIds.length} spam/irrelevant recommendations.`);

      let deletedCount = 0;
      for (const id of spamIds) {
        try {
          const delRes = await fetch(`/api/recommendations?id=${id}`, { method: 'DELETE' });
          if (delRes.ok) {
            deletedCount++;
          }
        } catch (e) {
          console.error(`Failed to delete spam recommendation: ${id}`, e);
        }
      }

      addLog(`✨ AI Auto-Clean completed. Removed ${deletedCount} spam recommendations.`);
      await loadRecommendations();
      alert(`AI Auto-Clean complete! Removed ${deletedCount} spam/irrelevant topics.`);
    } catch (err) {
      console.error(err);
      addLog(`✨ Auto-Clean error: ${err.message}`);
      alert(`Auto-Clean failed: ${err.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleTriggerAutomation = async () => {
    try {
      addLog('🚀 Triggering server-side automated cron run...');
      const res = await fetch('/api/automation/run', { method: 'POST' });
      if (res.ok) {
        addLog('🚀 Automated background run triggered. Watch server logs below.');
        fetchAutomationData();
      } else {
        alert('Could not trigger automation. Verify server status.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while triggering automation.');
    }
  };

  // Fetch recommendations from API / localStorage
  const loadRecommendations = useCallback(async () => {
    // 1. Load from localStorage first
    let localRecs = [];
    try {
      const stored = localStorage.getItem('lore:recommendations');
      if (stored) localRecs = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }

    // 2. Try fetching from server
    try {
      const res = await fetch('/api/recommendations');
      if (res.ok) {
        const serverRecs = await res.json();
        // Merge without duplicates
        const combined = [...localRecs];
        serverRecs.forEach(sr => {
          if (!combined.some(r => r.id === sr.id)) {
            combined.push(sr);
          }
        });
        setRecommendations(combined);
        return;
      }
    } catch {
      console.warn('Could not connect to local server for recommendations, using local state.');
    }

    setRecommendations(localRecs);
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  // Handle editing a story fields inline
  const startEditing = (story) => {
    setEditingStoryId(story.story_id);
    setEditForm({
      title: story.title || '',
      hero_image: story.hero_image || '',
      hook: story.hook || '',
    });
  };

  const handleSaveStory = async (storyId) => {
    try {
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        addLog(`Successfully saved & pushed changes for story: ${storyId}`);
        const updatedLocal = localStories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
        setLocalStories(updatedLocal);
        localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));
        if (refetchStories) refetchStories();
        setEditingStoryId(null);
      } else {
        alert('Could not update story. Is the local server running?');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving story changes.');
    }
  };

  // Handle deleting a story
  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Are you sure you want to permanently delete this story from the archive? (Requires Local Server)')) return;
    
    // Try to delete from local server
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' });
      if (res.ok) {
        addLog(`Successfully deleted story: ${storyId}`);
        if (refetchStories) refetchStories();
      } else {
        alert('Could not delete story. Are you running the local server?');
      }
    } catch (e) {
      console.warn(e);
      alert('Could not connect to the local server to delete the story.');
    }
    
    // Also remove from local localStorage if present
    const updated = localStories.filter(s => s.story_id !== storyId);
    setLocalStories(updated);
    try {
      localStorage.setItem('lore:custom_stories', JSON.stringify(updated));
    } catch { /* ignore */ }
  };

  // Add a message to the console logger
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Handle deleting a recommendation
  const handleDeleteRecommendation = async (recId) => {
    if (!window.confirm('Are you sure you want to remove this recommendation?')) return;
    
    try {
      const res = await fetch(`/api/recommendations?id=${recId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addLog(`Successfully removed recommendation: ${recId}`);
        loadRecommendations();
      } else {
        alert('Could not delete recommendation. API returned an error.');
      }
    } catch (e) {
      console.warn(e);
      alert('Network error while deleting recommendation.');
    }
  };

  // Handle bulk deleting selected recommendations
  const handleDeleteMultipleRecommendations = async () => {
    if (selectedRecIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete the ${selectedRecIds.length} selected recommendations?`)) return;

    addLog(`Bulk deleting ${selectedRecIds.length} recommendations...`);
    let count = 0;
    for (const id of selectedRecIds) {
      try {
        const res = await fetch(`/api/recommendations?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
          count++;
        }
      } catch (err) {
        console.error(`Failed to delete recommendation ${id}:`, err);
      }
    }
    addLog(`Bulk delete finished. Removed ${count} recommendations.`);
    setSelectedRecIds([]);
    await loadRecommendations();
  };

  // Run the Gemini story generation client-side
  const handleGenerateStory = async (topicOverride = null) => {
    const topic = (topicOverride || genTopic).trim();
    if (!topic) {
      alert('Please enter a topic to generate.');
      return;
    }
    if (!apiKey) {
      alert('A Gemini API Key is required to run the content engine. Please input one or set it in your .env file.');
      return;
    }

    setIsGenerating(true);
    setLogs([]);
    setProgress(10);
    setActiveTab('generator');

    addLog(`Initiating Content Engine for topic: "${topic}"...`);
    addLog(`Target Category: ${genCategory.toUpperCase()} | Severity: ${genSeverity.toUpperCase()}`);
    addLog(`Estimated time to completion: ~15-20 seconds...`);
    
    // Prepare list of existing stories so AI can connect them
    const storiesSummary = stories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
    
    const severityVal = genSeverity === 'auto' ? 'unsettling | disturbing | extreme (auto-detect based on topic intensity)' : genSeverity;
    const prompt = `Write a complete, highly-detailed 7-layer documentary story about the topic: "${topic}".
${genCategory !== 'auto' ? `Suggested Category: ${genCategory}` : 'You MUST auto-classify the topic into the single most appropriate category from the valid categories list below based on the topic.'}
${genSeverity !== 'auto' ? `Severity Level: ${genSeverity}` : 'You MUST auto-determine the severity level (e.g. unsettling, disturbing, extreme) based on the topic.'}

CRITICAL EDITORIAL AND FACTUAL RULES:
1. ONLY TRUE & DOCUMENTED EVENTS: This website documents strictly true, historically verified cases that actually happened. Absolutely NO human-made fantasy, creepypastas, internet urban legends, or rumors. Every single claim, fact, and event mentioned must be historically accurate and documented.
2. IMMERSIVE NARRATIVE STRUCTURE ("THE RIDE"): Do NOT write this like a dry blog post or encyclopedic entry. It must feel like an immersive, terrifying ride. 
   - Layer 1 MUST start with a thought-provoking, engaging hook question in Hinglish like: "Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur jo is baat ko sach kar de..."
   - Put the reader inside the story using vivid details, terrifying examples, and atmospheric narrative pacing. Draw them in progressively layer by layer (Layer 1 is the whisper, Layer 7 is the absolute darkest truth).
3. HINGLISH LANGUAGE RULE: Write all story content (including title, hook, layer names, layer content, cliffhangers, and transition lines) in high-quality, engaging Hinglish (Hindi written in the English/Latin alphabet, naturally blended with English words as spoken by urban Indians). For example, write "Living room mein family ke 11 members hanging position mein mile" instead of "Eleven family members were found hanging in the living room." The tone should be extremely dark, conversational, and dramatic, like a local podcast host or YouTube narrator telling a mystery story in Hinglish. Keep the facts accurate and historically true; do NOT fabricate.

CRITICAL JSON FORMATTING RULES:
1. Do not use double quotes inside string fields unless they are escaped as \\". Prefer using single quotes (') for any quotes or titles inside the story text (e.g., 'Bermuda Triangle' instead of "Bermuda Triangle").
2. Ensure there are no trailing commas in arrays or objects.
3. The response must be strictly valid, clean JSON that can be parsed by JSON.parse() without errors.

Structure the story exactly in the following JSON format:
{
  "story_id": "lowercase_slug_with_underscores",
  "title": "A compelling, title for the dossier",
  "category": "must be one of: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries (Choose the single best category match for this topic)",
  "hook": "A 1-2 sentence teaser (max 150 chars) for the catalog",
  "concepts": ["concept1", "concept2", "concept3"],
  "severity": "${severityVal}",
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

Available stories to connect to:
${storiesSummary}

Ensure the output is strictly valid JSON only. Do not wrap it in markdown code blocks like \`\`\`json. Output raw JSON.`;

    try {
      addLog(`Connecting to Gemini API endpoint...`);
      setProgress(30);
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!res.ok) {
        throw new Error(`API returned HTTP ${res.status}: ${res.statusText}`);
      }

      setProgress(60);
      addLog(`Receiving stream from Gemini AI...`);
      
      const data = await res.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error('Received an empty response from the AI model.');
      }

      setProgress(80);
      addLog(`Parsing story structure...`);
      
      const storyObj = cleanAndParseJSON(textResponse);
      
      // Auto-fill added_date if not present
      if (!storyObj.added_date) {
        storyObj.added_date = new Date().toISOString().split('T')[0];
      }

      addLog(`Story generated: "${storyObj.title}" (${storyObj.story_id})`);
      
      // Fetch related scholarly research PDFs from OpenAlex
      addLog(`Fetching related open-access research papers and PDFs from OpenAlex...`);
      try {
        const papers = await fetchOpenAlexPapers(topic);
        if (papers && papers.length > 0) {
          addLog(`Found ${papers.length} scholarly papers. Attaching to dossier evidence files.`);
          storyObj.evidence_links = papers;
        }
      } catch (err) {
        console.warn('OpenAlex fetch failed:', err);
      }
      
      // Fetch SOTA historical imagery from Wikipedia API if an iconic real photo exists
      addLog(`Evaluating if topic has an iconic real photo...`);
      let hasPerfectPhoto = false;
      try {
        const checkPrompt = `For the topic "${topic}", does there exist a highly iconic, recognizable, and visually compelling real photograph of the event (e.g. the 11 pipes of Burari, or the slashed tent of Dyatlov Pass)?
Reply with YES only if such a specific, famous, iconic, and visually striking real photo exists.
Reply with NO if there is no such iconic photo (e.g., if there are only generic drawings, portraits of individuals, maps, diagrams, or no photos at all).
Output YES or NO only. Do not include markdown or explanations.`;

        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: checkPrompt }] }]
          })
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const decision = checkData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toUpperCase() || 'NO';
          hasPerfectPhoto = decision.includes('YES');
          addLog(`AI evaluation of real photo: ${decision}`);
        }
      } catch (err) {
        console.warn('Perfect photo evaluation failed:', err);
      }

      if (hasPerfectPhoto) {
        addLog(`Fetching real historical evidence imagery from Wikipedia...`);
        try {
          const imageUrl = await fetchWikipediaImage(topic);
          if (imageUrl) {
            addLog(`Found verified historical image. Attaching to dossier.`);
            storyObj.hero_image = imageUrl;
          } else {
            addLog(`No verified historical image found. Fallback to AI generation...`);
            storyObj.hero_image = 'auto';
          }
        } catch (err) {
          console.warn('Wikipedia fetch failed:', err);
          storyObj.hero_image = 'auto';
        }
      } else {
        addLog(`No perfect iconic real photo exists. Requesting AI cover generation...`);
        storyObj.hero_image = 'auto';
      }

      addLog(`Successfully wrote ${storyObj.layers?.length || 0} layers.`);
      
      // Save locally (append to localStories)
      const updatedStories = [...localStories];
      // Remove old version if it has the same ID
      const filtered = updatedStories.filter(s => s.story_id !== storyObj.story_id);
      filtered.push(storyObj);
      
      setLocalStories(filtered);
      localStorage.setItem('lore:custom_stories', JSON.stringify(filtered));

      // Try writing to local server if running
      try {
        await fetch('/api/stories/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storyObj),
        });
        addLog(`Synchronized story with public/content/stories.json file.`);
      } catch {
        addLog(`Running in standalone client mode. Saved to browser storage.`);
      }

      // Mark the recommendation as completed or auto-delete it
      const matchedRec = recommendations.find(r => r.topic.toLowerCase() === topic.toLowerCase());
      if (matchedRec) {
        addLog(`Auto-deleting generated recommendation from queue...`);
        const updatedRecs = recommendations.filter(r => r.id !== matchedRec.id);
        setRecommendations(updatedRecs);
        localStorage.setItem('lore:recommendations', JSON.stringify(updatedRecs));
        try {
          await fetch(`/api/recommendations?id=${matchedRec.id}`, {
            method: 'DELETE'
          });
        } catch { /* ignore */ }
      }

      setProgress(100);
      addLog(`Success! Folder updated. Story compiled.`);
      if (refetchStories) refetchStories();
      loadRecommendations();
      setIsGenerating(false);
      setGenTopic('');
    } catch (err) {
      console.error(err);
      addLog(`ERROR: ${err.message}`);
      setIsGenerating(false);
      setProgress(0);
    }
  };

  // ── AI Co-Editor handler ──────────────────────────────────────────────────
  const handleAiCoEdit = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiLoading(true);
    setAiProposal(null);

    try {
      if (!apiKey) throw new Error('No Gemini API key set. Go to the generator tab to configure it.');

      // Build rich context for the AI
      const storySummaries = stories.map(s => ({
        id: s.story_id,
        title: s.title,
        category: s.category,
        severity: s.severity,
        hero_image: s.hero_image,
        reactions: s.reactions,
        layers: (s.layers || []).map(l => ({ layer: l.layer, name: l.layer_name, content_preview: (l.content || '').slice(0, 80) })),
      }));

      let feedbackContext = '';
      try {
        const fbRes = await fetch('/api/feedback');
        if (fbRes.ok) {
          const fb = await fbRes.json();
          feedbackContext = fb.slice(0, 10).map(f => `rating:${f.rating} tags:[${(f.tags||[]).join(',')}] note:"${f.note || 'none'}"`).join('\n');
        }
      } catch { /* ignore */ }

      const systemPrompt = `You are the AI Co-Editor for LORE — a dark archive of stories.

You have access to all stories and user feedback below.

STORIES (summary):
${JSON.stringify(storySummaries, null, 1)}

RECENT FEEDBACK (up to 10):
${feedbackContext || 'No feedback yet.'}

Your capabilities:
1. ANSWER questions about stories, feedback, engagement.
2. PROPOSE story edits — respond with a JSON block like:
   {"action":"edit","story_id":"xxx","field":"hero_image","value":"/content/images/xxx.jpg","description":"Change hero image"}
   or for layer content:
   {"action":"edit","story_id":"xxx","field":"layers","value":[...full layers array...],"description":"Rewrote Layer 3"}
3. GENERATE IMAGE — if user wants a new image:
   {"action":"image","story_id":"xxx","prompt":"cinematic dark scene...","description":"Generate new cover image"}
4. FETCH EVIDENCE — tell user to use the Backfill or suggest OpenAlex query.

For image changes, if user gives a direct URL, propose:
   {"action":"url_image","story_id":"xxx","url":"https://...","description":"Set image from URL"}

Always respond with plain text explanation FIRST, then the JSON block on a new line if applicable.
Keep responses concise. Be direct and useful.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser request: ' + userMsg }] }],
          generationConfig: { temperature: 0.4 },
        }),
      });

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

      // Try to extract JSON action from response
      const jsonMatch = rawText.match(/\{[\s\S]*?"action"\s*:[\s\S]*?\}/);
      const plainText = rawText.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, '').trim();

      setAiMessages(prev => [...prev, { role: 'assistant', text: plainText || rawText }]);

      if (jsonMatch) {
        try {
          const action = JSON.parse(jsonMatch[0]);
          if (action.action === 'edit') {
            setAiProposal({
              storyId: action.story_id,
              field: action.field,
              value: action.value,
              description: action.description,
              preview: typeof action.value === 'string' ? action.value : action.value,
            });
          } else if (action.action === 'image') {
            // Generate via Pollinations and propose
            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(action.prompt)}?width=800&height=600&nologo=true&private=true&model=flux`;
            setAiMessages(prev => [...prev, { role: 'assistant', text: `Generating image from prompt...\nURL: ${imgUrl}\n\nNote: You can "Apply" to set this as the hero image. The image will be served from Pollinations (external). To save locally, use the Backfill button after applying.` }]);
            setAiProposal({
              storyId: action.story_id,
              field: 'hero_image',
              value: imgUrl,
              description: action.description || 'Generated new hero image from AI prompt.',
              preview: imgUrl,
            });
          } else if (action.action === 'url_image') {
            // Save remote URL as hero image, server will download it on next backfill
            setAiProposal({
              storyId: action.story_id,
              field: 'hero_image',
              value: action.url,
              description: action.description || 'Set hero image from provided URL.',
              preview: action.url,
            });
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    }

    setAiLoading(false);
  };

  // Export merged stories to file
  const handleExportJSON = () => {

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ stories }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "stories.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Count how many stories added today
  const storiesAddedToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return stories.filter(s => s.added_date === today);
  }, [stories]);

  const CATEGORY_LABELS = {
    psychology: 'Psychology',
    true_crime: 'True Crime',
    paranormal: 'Paranormal',
    mythology: 'Mythology',
    gov_experiments: 'Hidden Gov Experiments',
    conspiracy: 'Unresolved Conspiracies',
    cyber_mysteries: 'Digital Shadows',
  };

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: bg, color: fg }}>
      {/* Vignette */}
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header className="border-b" style={{ borderColor: ru, padding: '0 40px' }}>
        <div className="mx-auto h-16 flex items-center justify-between" style={{ maxWidth: '1000px' }}>
          <div className="flex items-center gap-[10px]">
            <LoreMark size={20} color={fg} />
            <span className="text-[11px] font-bold tracking-[0.32em] uppercase">
              ARCHIVE ENGINE CONSOLE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                if (refetchStories) refetchStories();
                await loadRecommendations();
                addLog('Archive logs and recommendations refreshed.');
              }}
              className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-2 border rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-[#9E7B4C]"
              style={{ borderColor: ru }}
            >
              ⟳ Refresh Data
            </button>
            <button
              onClick={onBack}
              className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-2 border rounded-lg hover:opacity-60 transition-opacity cursor-pointer"
              style={{ borderColor: ru }}
            >
              ← Exit Console
            </button>
          </div>
        </div>
      </header>

      {/* Main Stats bar */}
      <div className="bg-[#12100E] border-b py-6 px-10" style={{ borderColor: ru }}>
        <div className="mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center" style={{ maxWidth: '1000px' }}>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Total Dossiers Compiled
            </span>
            <span className="font-serif italic text-2xl">{stories.length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Added Today
            </span>
            <span className="font-serif italic text-2xl text-[#9E7B4C]">{storiesAddedToday.length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              User Recommendations
            </span>
            <span className="font-serif italic text-2xl">{recommendations.length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Engine Status
            </span>
            <span className="text-xs font-mono font-bold text-emerald-600 block mt-2">● ONLINE</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row mx-auto w-full" style={{ maxWidth: '1200px', padding: '32px 40px' }}>
        
        {/* Sidebar Nav */}
        <aside className="w-full md:w-[240px] flex-shrink-0 flex flex-col gap-2 mb-8 md:mb-0 md:pr-8">
          <button
            onClick={() => { setActiveTab('catalog'); setSelectedRecIds([]); }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'catalog' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            Archive Catalog
          </button>
          <button
            onClick={() => { setActiveTab('recommendations'); setSelectedRecIds([]); }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors relative cursor-pointer ${
              activeTab === 'recommendations' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            Recommendations
            {recommendations.filter(r => r.status === 'pending').length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#8B2F2F] text-white rounded-full text-[8px] px-2 py-0.5">
                {recommendations.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('generator'); setSelectedRecIds([]); }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'generator' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            Content Engine Console
          </button>
          <button
            onClick={async () => {
              setActiveTab('feedback');
              setSelectedRecIds([]);
              setFeedbackLoading(true);
              try {
                const res = await fetch('/api/feedback');
                if (res.ok) setFeedbackItems(await res.json());
              } catch { /* server may be down */ }
              setFeedbackLoading(false);
            }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'feedback' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            User Feedback
          </button>
          <button
            onClick={() => { setActiveTab('ai-editor'); setSelectedRecIds([]); }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'ai-editor' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            🤖 AI Co-Editor
          </button>
        </aside>

        {/* Console Content Area */}
        <main className="flex-1 min-w-0">
          
          {/* Tab 1: Catalog */}
          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">Archived Case Files</h2>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      addLog('🖼️ Triggering image backfill for all stories missing covers...');
                      try {
                        const res = await fetch('/api/stories/backfill-images', { method: 'POST' });
                        if (res.ok) {
                          const data = await res.json();
                          addLog(`🖼️ ${data.message}`);
                          if (data.queued === 0) {
                            alert('All stories already have local cover images!');
                          } else {
                            alert(`Image backfill started for ${data.queued} stories. This runs in the background — check server logs.`);
                          }
                        } else {
                          addLog('🖼️ Backfill request failed. Is the server running?');
                        }
                      } catch (err) {
                        addLog(`🖼️ Backfill error: ${err.message}`);
                      }
                    }}
                    className="px-4 py-2 border rounded text-xs font-mono hover:bg-white/5 cursor-pointer"
                    style={{ borderColor: 'rgba(158, 123, 76, 0.4)', color: '#9E7B4C' }}
                  >
                    🖼️ Backfill Images
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="px-4 py-2 border rounded text-xs font-mono hover:bg-white/5 cursor-pointer"
                    style={{ borderColor: ru }}
                  >
                    Export stories.json
                  </button>
                </div>
              </div>

              {/* Table / List */}
              <div className="space-y-4">
                {stories.map(story => (
                  <div
                    key={story.story_id}
                    className="p-5 rounded-xl border transition-all duration-350"
                    style={{ borderColor: ru, backgroundColor: '#110F0D' }}
                  >
                    {editingStoryId === story.story_id ? (
                      <div className="space-y-4 my-3 p-4 rounded-lg bg-black/40 border border-neutral-800">
                        <div>
                          <label className="block text-[10px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Dossier Title</label>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full px-3 py-2 bg-[#13110E] text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-sans"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Thumbnail URL / Local Image Path</label>
                          <input
                            type="text"
                            value={editForm.hero_image}
                            onChange={(e) => setEditForm(prev => ({ ...prev, hero_image: e.target.value }))}
                            className="w-full px-3 py-2 bg-[#13110E] text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Dossier Hook (Narrative Intro)</label>
                          <textarea
                            value={editForm.hook}
                            onChange={(e) => setEditForm(prev => ({ ...prev, hook: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 bg-[#13110E] text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-none font-sans leading-relaxed"
                          />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                          <button
                            onClick={() => setEditingStoryId(null)}
                            className="px-3 py-1.5 border border-neutral-800 text-[#6A6560] text-[10px] font-bold tracking-wider uppercase rounded hover:bg-white/5 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveStory(story.story_id)}
                            className="px-3 py-1.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-wider uppercase rounded hover:bg-[#b08c5c] cursor-pointer"
                          >
                            Save & Push Live
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-serif italic text-lg text-[#EDE8DF]">{story.title}</span>
                            <span className="text-[10px] font-mono tracking-widest px-3 py-1 rounded bg-[#1C1A17] text-[#EDE8DF]">
                              {CATEGORY_LABELS[story.category] || story.category}
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded bg-red-950/30 text-red-400">
                              {story.severity}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-[#6A6560]">Added: {story.added_date}</span>
                        </div>
                        
                        <p className="text-xs text-[#6A6560] mb-4 leading-relaxed max-w-3xl">{story.hook}</p>
                      </>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                      {(story.concepts || []).map(c => (
                        <span key={c} className="text-[10px] font-mono tracking-[0.05em] uppercase px-3 py-1 rounded bg-[#161412] text-amber-200">
                          {c.replace(/_/g, ' ')}
                        </span>
                      ))}              </div>

                    <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: ru }}>
                      <button
                        onClick={() => setExpandedStoryId(expandedStoryId === story.story_id ? null : story.story_id)}
                        className="text-[10px] font-bold tracking-wider uppercase text-[#9E7B4C] hover:underline cursor-pointer"
                      >
                        {expandedStoryId === story.story_id ? 'Hide Layers' : 'Inspect 7 Layers'}
                      </button>

                      {editingStoryId !== story.story_id && (
                        <button
                          onClick={() => startEditing(story)}
                          className="text-[10px] font-bold tracking-wider uppercase text-[#9E7B4C] hover:underline cursor-pointer"
                        >
                          ✎ Edit Case Details
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteStory(story.story_id)}
                        className="text-[10px] font-bold tracking-wider uppercase text-red-500 hover:underline cursor-pointer ml-auto"
                      >
                        Delete Story
                      </button>
                    </div>

                    {/* Expanded Layer View */}
                    {expandedStoryId === story.story_id && (
                      <div className="mt-5 pt-5 border-t border-dashed space-y-4" style={{ borderColor: ru }}>
                        {story.layers?.map(l => (
                          <div key={l.layer} className="p-3 bg-neutral-950/40 rounded border" style={{ borderColor: ru }}>
                            <div className="text-[9px] font-mono font-bold text-[#9E7B4C] mb-1">
                              LAYER {l.layer} // {l.layer_name}
                            </div>
                            <p className="text-xs text-[#EDE8DF] leading-relaxed line-clamp-3">
                              {l.content}
                            </p>
                            {l.cliffhanger && (
                              <div className="text-[10px] font-sans italic text-[#6A6560] mt-2">
                                Cliffhanger: "{l.cliffhanger}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Recommendations */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              <div className="border-b pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">User Recommended Topics</h2>
                  <p className="text-xs text-[#6A6560] mt-1">
                    Topics recommended by users browsing the website.
                  </p>
                </div>
                <div className="flex gap-2 self-start sm:self-auto flex-wrap">
                  <button
                    onClick={handleHarvestWebTrends}
                    disabled={isHarvesting || isGenerating}
                    className="px-4 py-2 border rounded text-xs font-mono font-bold tracking-wider hover:bg-emerald-950/20 uppercase transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
                    style={{ borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399' }}
                  >
                    {isHarvesting ? '📡 Scanning...' : '📡 Harvest Web Trends'}
                  </button>
                  <button
                    onClick={handleAiAutoClean}
                    disabled={isCleaning || isGenerating}
                    className="px-4 py-2 border rounded text-xs font-mono font-bold tracking-wider hover:bg-amber-950/20 uppercase transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
                    style={{ borderColor: 'rgba(158, 123, 76, 0.4)', color: '#9E7B4C' }}
                  >
                    {isCleaning ? '✨ Cleaning...' : '✨ AI Auto-Clean'}
                  </button>
                </div>
              </div>

              {recommendations.length === 0 ? (
                <div className="text-center py-16 border rounded-xl" style={{ borderColor: ru, backgroundColor: '#110F0D' }}>
                  <p className="font-serif italic text-lg text-[#6A6560] mb-2">No recommendations logged.</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/50">Submit a recommendation from the home page.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Bulk Actions Bar */}
                  <div className="flex items-center gap-4 p-3 bg-neutral-950/40 rounded-lg border mb-4 justify-between flex-wrap" style={{ borderColor: ru }}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRecIds.length === recommendations.length && recommendations.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecIds(recommendations.map(r => r.id));
                          } else {
                            setSelectedRecIds([]);
                          }
                        }}
                        className="w-4 h-4 rounded border border-neutral-700 bg-neutral-900 text-[#9E7B4C] focus:ring-0 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                        {selectedRecIds.length} of {recommendations.length} Selected
                      </span>
                    </div>
                    {selectedRecIds.length > 0 && (
                      <button
                        onClick={handleDeleteMultipleRecommendations}
                        className="px-3 py-1.5 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-red-950/20 uppercase transition-colors text-red-500 cursor-pointer"
                        style={{ borderColor: 'rgba(139, 47, 47, 0.4)' }}
                      >
                        Delete Selected ({selectedRecIds.length})
                      </button>
                    )}
                  </div>

                  {recommendations.map(rec => (
                    <div
                      key={rec.id}
                      className="p-4 rounded-xl border flex items-center justify-between gap-4"
                      style={{ borderColor: ru, backgroundColor: '#110F0D' }}
                    >
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedRecIds.includes(rec.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRecIds(prev => [...prev, rec.id]);
                            } else {
                              setSelectedRecIds(prev => prev.filter(id => id !== rec.id));
                            }
                          }}
                          className="w-4 h-4 rounded border border-neutral-700 bg-neutral-900 text-[#9E7B4C] focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <span className="font-serif italic text-base block text-[#EDE8DF]">{rec.topic}</span>
                          <div className="flex gap-2 items-center mt-1">
                            <span className="text-[9px] font-mono text-[#6A6560]">Logged: {rec.date}</span>
                            <span className={`text-[8px] font-mono tracking-widest px-2 py-0.5 rounded ${
                              rec.status === 'generated' ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/30' : 'bg-amber-950/20 text-amber-400 border border-amber-900/30'
                            }`}>
                              {rec.status?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {rec.status !== 'generated' && (
                          <button
                            onClick={() => {
                              setActiveTab('generator');
                              setGenTopic(rec.topic);
                            }}
                            className="px-4 py-2 border rounded text-xs font-mono font-bold tracking-wider hover:bg-white/5 uppercase transition-colors whitespace-nowrap cursor-pointer"
                            style={{ borderColor: ru, color: ac }}
                          >
                            Send to Engine
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRecommendation(rec.id)}
                          className="px-4 py-2 border rounded text-xs font-mono font-bold tracking-wider hover:bg-red-950/20 uppercase transition-colors whitespace-nowrap cursor-pointer"
                          style={{ borderColor: 'rgba(139, 47, 47, 0.4)', color: '#8B2F2F' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Content Generator Console */}
          {activeTab === 'generator' && (
            <div className="space-y-6">
              <div className="border-b pb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">AI Content Engine</h2>
                <p className="text-xs text-[#6A6560] mt-1">
                  Trigger immediate AI case generation or simulate the nightly cron run.
                </p>
              </div>

              {/* Form Config */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-xl border bg-[#110F0D]" style={{ borderColor: ru }}>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#6A6560] block mb-2">
                      Dossier Topic / Keyword
                    </label>
                    <input
                      type="text"
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="e.g. Project MKUltra, The Salem Witch Trials..."
                      className="w-full px-4 py-2 bg-neutral-900 text-[#EDE8DF] text-sm rounded-lg border focus:border-[#9E7B4C] focus:outline-none transition-colors"
                      style={{ borderColor: ru }}
                      disabled={isGenerating}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#6A6560] block mb-2">
                      Topic Category
                    </label>
                    <select
                      value={genCategory}
                      onChange={(e) => setGenCategory(e.target.value)}
                      className="w-full px-4 py-2 bg-neutral-900 text-[#EDE8DF] text-sm rounded-lg border focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                      style={{ borderColor: ru }}
                      disabled={isGenerating}
                    >
                      <option value="auto">Auto-Detect</option>
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#6A6560] block mb-2">
                      Severity Rating
                    </label>
                    <select
                      value={genSeverity}
                      onChange={(e) => setGenSeverity(e.target.value)}
                      className="w-full px-4 py-2 bg-neutral-900 text-[#EDE8DF] text-sm rounded-lg border focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                      style={{ borderColor: ru }}
                      disabled={isGenerating}
                    >
                      <option value="auto">Auto-Detect</option>
                      <option value="unsettling">Unsettling</option>
                      <option value="disturbing">Disturbing</option>
                      <option value="extreme">Extreme</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#6A6560] block mb-2">
                      Gemini API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Insert VITE_GEMINI_API_KEY..."
                      className="w-full px-4 py-2 bg-neutral-900 text-[#EDE8DF] text-sm rounded-lg border focus:border-[#9E7B4C] focus:outline-none font-mono"
                      style={{ borderColor: ru }}
                      disabled={isGenerating}
                    />
                    <p className="text-[9px] text-[#6A6560] mt-1">
                      Read from your .env file or input here to generate directly in browser.
                    </p>
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleGenerateStory()}
                      disabled={isGenerating || autoStatus.isRunning || !genTopic}
                      className="flex-1 py-3 bg-[#9E7B4C] text-white text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-[#b08c5c] active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Generate Story
                    </button>
                    <button
                      onClick={handleTriggerAutomation}
                      disabled={isGenerating || autoStatus.isRunning}
                      className="flex-1 py-3 border text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-white/5 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                      style={{ borderColor: ru }}
                    >
                      {autoStatus.isRunning ? '⚡ Running...' : 'Trigger Full Automation'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress and Logger console */}
              {(isGenerating || autoStatus.isRunning || autoLogs.length > 0 || logs.length > 0) && (
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-mono text-[#6A6560]">
                    <span>
                      {isGenerating ? `Manual Generation Logs (Elapsed: ${elapsedTime}s)` : 'Server Automated Engine Logs'}
                    </span>
                    <span>{isGenerating ? `${progress}%` : autoStatus.isRunning ? 'RUNNING' : 'STANDBY'}</span>
                  </div>
                  
                  {/* Progress bar */}
                  {isGenerating && (
                    <div className="w-full h-[3px] bg-neutral-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#9E7B4C] transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {/* Terminal console */}
                  <div className="p-4 bg-black rounded-lg border font-mono text-[11px] leading-relaxed space-y-1 h-[240px] overflow-y-auto" style={{ borderColor: ru }}>
                    {(isGenerating ? logs : autoLogs).map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes('ERROR') || log.includes('warning') || log.includes('Warning') ? 'text-red-400' :
                          log.includes('SUCCESS') || log.includes('SUCCESS:') || log.includes('Success') || log.includes('AI Cleaned:') ? 'text-emerald-400' :
                          log.includes('Starting generation') || log.includes('Phase') || log.includes('Generating Story') ? 'text-[#9E7B4C] font-bold mt-2' :
                          'text-neutral-300'
                        }
                      >
                        {log}
                      </div>
                    ))}
                    {(isGenerating || autoStatus.isRunning) && (
                      <div className="text-neutral-500 animate-pulse mt-1">▋ Executing engine thread...</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── Tab: User Feedback ── */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">User Feedback</h2>
                  <p className="text-xs font-mono mt-1" style={{ color: mu }}>Site-wide ratings and notes from visitors</p>
                </div>
                <div className="flex items-center gap-4">
                  {feedbackItems.length > 0 && (
                    <span className="text-xs font-mono" style={{ color: ac }}>
                      {feedbackItems.filter(f => !f.addressed).length} unaddressed
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      setFeedbackLoading(true);
                      try { const r = await fetch('/api/feedback'); if (r.ok) setFeedbackItems(await r.json()); } catch { /* ignore */ }
                      setFeedbackLoading(false);
                    }}
                    className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer" style={{ borderColor: ru }}
                  >⟳ Refresh</button>
                </div>
              </div>

              {feedbackLoading ? (
                <div className="text-center py-16 text-[#6A6560] font-mono text-xs animate-pulse">Loading feedback...</div>
              ) : feedbackItems.length === 0 ? (
                <div className="text-center py-16">
                  <p className="font-serif italic text-xl opacity-40">No feedback filed yet.</p>
                  <p className="text-[10px] font-mono uppercase tracking-widest mt-2 opacity-20">The archive awaits your first visitor's voice.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackItems.map(fb => (
                    <div key={fb.id}
                      className="p-4 rounded-xl border"
                      style={{ borderColor: fb.addressed ? 'rgba(237,232,223,0.04)' : 'rgba(158,123,76,0.2)', backgroundColor: fb.addressed ? 'rgba(255,255,255,0.01)' : 'rgba(158,123,76,0.03)', opacity: fb.addressed ? 0.5 : 1 }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Rating dots */}
                          <div className="flex items-center gap-1.5 mb-2">
                            {[1,2,3,4,5].map(n => (
                              <div key={n} className="w-2 h-2 rounded-full" style={{ backgroundColor: n <= fb.rating ? ac : 'rgba(237,232,223,0.1)' }} />
                            ))}
                            <span className="text-[10px] font-mono ml-2" style={{ color: mu }}>{fb.rating}/5</span>
                            {fb.addressed && <span className="text-[9px] font-mono ml-3 px-2 py-0.5 rounded" style={{ color: ac, backgroundColor: `${ac}15` }}>ADDRESSED</span>}
                          </div>
                          {/* Tags */}
                          {fb.tags && fb.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {fb.tags.map(t => (
                                <span key={t} className="text-[8px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: 'rgba(237,232,223,0.08)', color: mu }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Note */}
                          {fb.note && <p className="text-xs font-sans italic leading-relaxed" style={{ color: fg, opacity: 0.8 }}>"{fb.note}"</p>}
                          {/* Meta */}
                          <p className="text-[9px] font-mono mt-2 opacity-35" style={{ color: mu }}>
                            {new Date(fb.timestamp).toLocaleString()} · {fb.page}
                          </p>
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                                setFeedbackItems(prev => prev.map(f => f.id === fb.id ? { ...f, addressed: !f.addressed } : f));
                              } catch { /* ignore */ }
                            }}
                            className="text-[9px] font-mono px-2 py-1 border rounded hover:bg-white/5 cursor-pointer whitespace-nowrap"
                            style={{ borderColor: 'rgba(158,123,76,0.3)', color: ac }}
                          >{fb.addressed ? 'Reopen' : '✓ Address'}</button>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Delete this feedback?')) return;
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'DELETE' });
                                setFeedbackItems(prev => prev.filter(f => f.id !== fb.id));
                              } catch { /* ignore */ }
                            }}
                            className="text-[9px] font-mono px-2 py-1 border rounded hover:bg-white/5 cursor-pointer"
                            style={{ borderColor: 'rgba(139,47,47,0.3)', color: '#8B2F2F' }}
                          >Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: AI Co-Editor ── */}
          {activeTab === 'ai-editor' && (
            <div className="flex flex-col h-full" style={{ minHeight: '600px' }}>
              <div className="border-b pb-4 mb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">AI Co-Editor</h2>
                <p className="text-xs font-mono mt-1" style={{ color: mu }}>
                  Reads all stories + feedback. Can edit, regenerate images, fetch evidence.
                </p>
              </div>

              {/* Message thread */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2" style={{ maxHeight: '400px' }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-4 py-3 rounded-xl text-sm font-sans leading-relaxed whitespace-pre-wrap"
                      style={{
                        backgroundColor: msg.role === 'user' ? 'rgba(158,123,76,0.15)' : 'rgba(255,255,255,0.04)',
                        borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                        color: fg,
                        border: `1px solid ${msg.role === 'user' ? 'rgba(158,123,76,0.25)' : 'rgba(237,232,223,0.06)'}`,
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="px-4 py-3 rounded-xl text-xs font-mono animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: mu }}>
                      Analyzing archive...
                    </div>
                  </div>
                )}
                {/* Proposal card */}
                {aiProposal && (
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'rgba(158,123,76,0.4)', backgroundColor: 'rgba(158,123,76,0.06)' }}>
                    <p className="text-[10px] font-mono tracking-wider uppercase mb-2" style={{ color: ac }}>Proposed Change</p>
                    <p className="text-sm font-sans leading-relaxed mb-3" style={{ color: fg }}>{aiProposal.description}</p>
                    {aiProposal.preview && (
                      <pre className="text-[11px] font-mono p-3 rounded mb-3 overflow-x-auto" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: mu, maxHeight: '120px' }}>
                        {typeof aiProposal.preview === 'string' ? aiProposal.preview : JSON.stringify(aiProposal.preview, null, 2)}
                      </pre>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          try {
                            const r = await fetch(`/api/stories/${aiProposal.storyId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ [aiProposal.field]: aiProposal.value }),
                            });
                            if (r.ok) {
                              if (refetchStories) refetchStories();
                              setAiMessages(prev => [...prev, { role: 'assistant', text: `✓ Applied! The change to "${aiProposal.storyId}" is now live. Refresh the site to see it.` }]);
                              setAiProposal(null);
                            } else {
                              setAiMessages(prev => [...prev, { role: 'assistant', text: 'Failed to apply — is the server running?' }]);
                            }
                          } catch (err) {
                            setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
                          }
                        }}
                        className="px-4 py-2 rounded-lg text-[10px] font-mono tracking-wider uppercase cursor-pointer"
                        style={{ backgroundColor: 'rgba(158,123,76,0.2)', border: '1px solid rgba(158,123,76,0.4)', color: ac }}
                      >
                        ✓ Apply Changes
                      </button>
                      <button
                        onClick={() => setAiProposal(null)}
                        className="px-4 py-2 rounded-lg text-[10px] font-mono tracking-wider uppercase cursor-pointer hover:bg-white/5"
                        style={{ border: '1px solid rgba(237,232,223,0.08)', color: mu }}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-3 mt-auto">
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (aiInput.trim() && !aiLoading) handleAiCoEdit();
                    }
                  }}
                  placeholder="Tell the AI what to change... (Enter to send, Shift+Enter for newline)"
                  rows={2}
                  className="flex-1 px-4 py-3 text-sm rounded-xl border resize-none focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(237,232,223,0.08)',
                    color: fg,
                    caretColor: ac,
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(158,123,76,0.3)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'rgba(237,232,223,0.08)'; }}
                />
                <button
                  onClick={handleAiCoEdit}
                  disabled={!aiInput.trim() || aiLoading}
                  className="px-4 py-3 rounded-xl text-xs font-mono tracking-wider uppercase transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                  style={{ backgroundColor: 'rgba(158,123,76,0.15)', border: '1px solid rgba(158,123,76,0.3)', color: ac }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
