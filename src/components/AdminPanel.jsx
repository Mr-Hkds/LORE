import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LoreMark from './LoreMark';

// Helper to clean and parse JSON from AI model response
function cleanAndParseJSON(text) {
  if (!text) throw new Error('Input text is empty');
  let cleaned = text.trim();
  
  // Remove markdown code block wrapping
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

  // Remove trailing commas
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(cleaned);
}

// Rebuild Concept Index for stories mapping
function rebuildConceptIndex(storiesArray) {
  const index = {};
  storiesArray.forEach(story => {
    (story.concepts || []).forEach(concept => {
      const c = concept.trim().toLowerCase();
      if (!index[c]) {
        index[c] = [];
      }
      if (!index[c].includes(story.story_id)) {
        index[c].push(story.story_id);
      }
    });
  });
  return index;
}

// XOR obfuscation for config storage on GitHub
const ADMIN_KEY = '0407';
function xorObfuscate(str, key) {
  return Array.from(str).map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
}
function tokenToStored(token) {
  return btoa(xorObfuscate(token, ADMIN_KEY));
}
function storedToToken(stored) {
  try {
    return xorObfuscate(atob(stored), ADMIN_KEY);
  } catch { return ''; }
}

const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies',
  cyber_mysteries: 'Digital Shadows'
};

export default function AdminPanel({ stories, localStories, setLocalStories, refetchStories, onBack, onStoryDeleted }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Tabs: 'catalog' (Dossier Catalog) | 'generator' (AI Generator) | 'feedback' (Reader Feedback) | 'github-sync' (Settings & Sync)
  const [activeTab, setActiveTab] = useState('catalog');

  // GitHub Sync & Credentials Settings
  const [ghOwner, setGhOwner] = useState(() => {
    const v = localStorage.getItem('lore:github:owner');
    return v && v !== 'undefined' && v !== 'null' ? v : (import.meta.env.VITE_GITHUB_OWNER || 'Mr-Hkds');
  });
  const [ghRepo, setGhRepo] = useState(() => {
    const v = localStorage.getItem('lore:github:repo');
    return v && v !== 'undefined' && v !== 'null' ? v : (import.meta.env.VITE_GITHUB_REPO || 'LORE');
  });
  const [ghBranch, setGhBranch] = useState(() => {
    const v = localStorage.getItem('lore:github:branch');
    return v && v !== 'undefined' && v !== 'null' ? v : (import.meta.env.VITE_GITHUB_BRANCH || 'main');
  });
  const [ghToken, setGhToken] = useState(() => {
    const v = localStorage.getItem('lore:github:token');
    return v && v !== 'undefined' && v !== 'null' ? v : (import.meta.env.VITE_GITHUB_TOKEN || '');
  });
  const [apiKey, setApiKey] = useState(() => {
    const v = localStorage.getItem('lore:gemini:key');
    return v && v !== 'undefined' && v !== 'null' ? v : (import.meta.env.VITE_GEMINI_API_KEY || '');
  });

  const [ghSyncSuccess, setGhSyncSuccess] = useState(() => localStorage.getItem('lore:github:success') === 'true');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');

  // Write safe localStorage setter
  const setLocalVal = (key, val) => {
    if (val === undefined || val === null || val === 'undefined' || val === 'null' || val.trim() === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, val);
    }
  };

  // Sync settings state to local storage
  useEffect(() => {
    setLocalVal('lore:github:owner', ghOwner);
    setLocalVal('lore:github:repo', ghRepo);
    setLocalVal('lore:github:branch', ghBranch);
    setLocalVal('lore:github:token', ghToken);
    if (ghToken && ghToken.trim() !== '') {
      setLocalVal('lore:github:token:v2', tokenToStored(ghToken));
    } else {
      localStorage.removeItem('lore:github:token:v2');
    }
  }, [ghOwner, ghRepo, ghBranch, ghToken]);

  useEffect(() => {
    setLocalVal('lore:gemini:key', apiKey);
  }, [apiKey]);

  // Load configuration from remote repo on mount
  useEffect(() => {
    const rawOwner = localStorage.getItem('lore:github:owner') || import.meta.env.VITE_GITHUB_OWNER || 'Mr-Hkds';
    const rawRepo = localStorage.getItem('lore:github:repo') || import.meta.env.VITE_GITHUB_REPO || 'LORE';
    const rawBranch = localStorage.getItem('lore:github:branch') || import.meta.env.VITE_GITHUB_BRANCH || 'main';

    const existingToken = localStorage.getItem('lore:github:token');
    const existingGemini = localStorage.getItem('lore:gemini:key');

    fetch(`https://raw.githubusercontent.com/${rawOwner}/${rawRepo}/${rawBranch}/config/admin_config.json`)
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg) {
          if (cfg.owner) { setGhOwner(cfg.owner); localStorage.setItem('lore:github:owner', cfg.owner); }
          if (cfg.repo) { setGhRepo(cfg.repo); localStorage.setItem('lore:github:repo', cfg.repo); }
          if (cfg.branch) { setGhBranch(cfg.branch); localStorage.setItem('lore:github:branch', cfg.branch); }
          if (cfg.tok && (!existingToken || existingToken.trim() === '')) {
            const decoded = storedToToken(cfg.tok);
            if (decoded) {
              setGhToken(decoded);
              localStorage.setItem('lore:github:token', decoded);
              localStorage.setItem('lore:github:token:v2', cfg.tok);
              setGhSyncSuccess(true);
              localStorage.setItem('lore:github:success', 'true');
            }
          }
          if (cfg.geminiKey && (!existingGemini || existingGemini.trim() === '')) {
            const decoded = storedToToken(cfg.geminiKey);
            if (decoded) {
              setApiKey(decoded);
              localStorage.setItem('lore:gemini:key', decoded);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // UI state variables
  const [uploadingState, setUploadingState] = useState('idle'); // 'idle' | 'uploading'
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('pending');
  
  // Recommendations states
  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [newRecTopic, setNewRecTopic] = useState('');
  const [addingRec, setAddingRec] = useState(false);

  // Story editor states
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [editForm, setEditForm] = useState({
    story_id: '',
    title: '',
    hero_image: '',
    image_query: '',
    hook: '',
    category: 'psychology',
    severity: 'unsettling',
    concepts: [],
    layers: []
  });
  const [editFormActiveLayer, setEditFormActiveLayer] = useState(1);

  // Search & Filter in Catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Generator form states
  const [genTopic, setGenTopic] = useState('');
  const [genCategory, setGenCategory] = useState('auto');
  const [genSeverity, setGenSeverity] = useState('auto');

  // Logging & progress states for manual compiler
  const [logs, setLogs] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Automation / Auto-Generator status
  const [autoStatus, setAutoStatus] = useState({ isRunning: false, enabled: false, lastRunAt: 0, nextRunMs: 0 });
  const [autoLogs, setAutoLogs] = useState([]);
  const [serverOffline, setServerOffline] = useState(false);
  const [toast, setToast] = useState(null);
  const consecutiveFailuresRef = useRef(0);

  const autoLogsEndRef = useRef(null);
  const manualLogsEndRef = useRef(null);

  // Timer for manual compiler duration
  useEffect(() => {
    let timer;
    if (isGenerating) {
      timer = setInterval(() => setElapsedTime(t => t + 1), 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(timer);
  }, [isGenerating]);

  // Toast automatic dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auto-scroll manual generator console logs
  useEffect(() => {
    if (manualLogsEndRef.current) {
      manualLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Auto-scroll background engine logs
  useEffect(() => {
    if (autoLogsEndRef.current) {
      autoLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoLogs]);

  // Helper to add log line
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Direct Gemini API Call Handler (Supports Fallback from 2.5-flash to 1.5-flash)
  const callGeminiApi = async (contents, config = {}) => {
    if (!apiKey) {
      throw new Error('Gemini API key is not configured.');
    }
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
          if (text) return text;
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
  };

  // Fetch OpenAlex scholarly evidence papers
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
      console.warn('Failed to fetch PDFs from OpenAlex:', err);
    }
    return [];
  };

  // Client-side image converter & local uploader
  const saveRemoteImageLocally = async (storyId, remoteUrl) => {
    if (!isLocal || serverOffline) return remoteUrl;
    try {
      const response = await fetch(remoteUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result;
            const res = await fetch('/api/upload-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                storyId,
                filename: 'cover.jpg',
                base64Data
              })
            });
            if (res.ok) {
              const data = await res.json();
              resolve(data.path);
              return;
            }
          } catch {
            void 0;
          }
          resolve(remoteUrl);
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      return remoteUrl;
    }
  };

  // Trigger manual compile story
  const handleGenerateStory = async () => {
    const topic = genTopic.trim();
    if (!topic) {
      alert('Please enter a topic.');
      return;
    }
    if (!apiKey) {
      alert('Gemini API key is required. Please set it in Settings & Sync.');
      return;
    }

    setIsGenerating(true);
    setLogs([]);
    setProgress(10);
    setElapsedTime(0);

    addLog(`Initiating Gemini Content Engine for topic: "${topic}"...`);
    addLog(`Target Category: ${genCategory.toUpperCase()} | Severity: ${genSeverity.toUpperCase()}`);
    addLog(`Connecting directly to Gemini API...`);

    const storiesSummary = adminStories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
    const targetCategory = genCategory === 'auto' ? 'Choose the single best category match for this topic from: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries' : genCategory;
    const targetSeverity = genSeverity === 'auto' ? 'unsettling | disturbing | extreme (auto-detect based on topic intensity)' : genSeverity;

    const prompt = `Write a complete, highly-detailed 7-layer documentary story in Hinglish about the famous, documented, real-world case or event: "${topic}".
    
    Suggested Category: ${targetCategory}
    Severity Level: ${targetSeverity}
    
    CRITICAL FACTUAL AND PACING RULES:
    1. Only real, historically documented cases. Absolutely no creepypastas or internet rumors.
    2. Write the title, hook, layer names, layer content, cliffhangers, and transition lines in high-quality, engaging Hinglish (Hindi written in English alphabet, mixed with English words as spoken by mystery/true-crime podcasters).
    3. The narrative must flow layer by layer: Layer 1 introduces the whisper, Layer 4 details the event, and Layer 7 delivers the absolute darkest truth. Layer 1 must start with: 'Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur...'
    4. Each layer content must be 2-3 detailed paragraphs. Use double newlines \\n\\n between paragraphs.
    5. Place quotes inside text using single quotes ('). Do not use unescaped double quotes inside values.
    
    Structure the story exactly in the following JSON format:
    {
      "story_id": "lowercase_slug_with_underscores",
      "title": "Compelling Title",
      "category": "must be one of: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries (Choose the single best category match for this topic)",
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
    
    Respond with strictly valid JSON only. Do not wrap in markdown code blocks like \`\`\`json. Output raw JSON.`;

    try {
      setProgress(30);
      const textResponse = await callGeminiApi(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { generationConfig: { responseMimeType: 'application/json' } }
      );

      setProgress(60);
      addLog(`Parsing story structure...`);
      
      const storyObj = cleanAndParseJSON(textResponse);
      if (!storyObj || !storyObj.story_id || !storyObj.title || !storyObj.layers || storyObj.layers.length < 7) {
        throw new Error('Failed to generate a valid 7-layer story from Gemini response');
      }

      storyObj.added_date = new Date().toISOString().split('T')[0];
      setProgress(75);

      // Search Wikipedia for image
      addLog(`Searching Wikipedia for cover photo: "${storyObj.image_query || storyObj.title}"`);
      const imgSearchQuery = storyObj.image_query || storyObj.title;
      let imageUrl = null;
      try {
        const matched = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(imgSearchQuery.replace(/ /g, '_'))}`);
        if (matched.ok) {
          const matchedData = await matched.json();
          imageUrl = matchedData?.thumbnail?.source || null;
        }
      } catch (err) {
        console.warn('Wikipedia image search failed:', err);
      }

      if (imageUrl) {
        addLog(`Downloading Wikipedia cover photo...`);
        storyObj.hero_image = await saveRemoteImageLocally(storyObj.story_id, imageUrl);
      } else {
        storyObj.hero_image = 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800';
      }

      // Fetch related scholarly research PDFs from OpenAlex
      addLog(`Fetching related open-access research papers from OpenAlex...`);
      try {
        const papers = await fetchOpenAlexPapers(topic);
        if (papers && papers.length > 0) {
          addLog(`Found ${papers.length} scholarly papers. Attaching to dossier evidence files.`);
          storyObj.evidence_links = papers;
        }
      } catch (err) {
        console.warn('OpenAlex fetch failed:', err);
      }

      setProgress(90);
      
      // Save locally or to server
      let serverSaved = false;
      if (isLocal && !serverOffline) {
        try {
          const res = await fetch('/api/stories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storyObj),
          });
          if (res.ok) {
            addLog(`Successfully saved story to local server database.`);
            serverSaved = true;
          }
        } catch (err) {
          console.warn('Failed to save to local server:', err);
        }
      }

      if (!serverSaved) {
        const updated = [...localStories.filter(s => s.story_id !== storyObj.story_id), storyObj];
        setLocalStories(updated);
        localStorage.setItem('lore:custom_stories', JSON.stringify(updated));
        addLog(`Saved story to browser local storage override.`);

        if (ghToken) {
          addLog('GitHub Sync configured. Preparing repository commit...');
          const updatedStories = [...stories.filter(s => s.story_id !== storyObj.story_id), storyObj];
          const newConceptIndex = rebuildConceptIndex(updatedStories);
          const filesToCommit = [
            { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
            { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
          ];
          try {
            await commitFilesToGitHub(filesToCommit, `admin: generate story "${storyObj.title}" via manual generator`);
            addLog('🚀 Successfully committed generated story to GitHub repo!');
          } catch (err) {
            addLog(`❌ Failed to commit to GitHub: ${err.message}`);
          }
        }
      }

      setProgress(100);
      addLog(`SUCCESS: Story "${storyObj.title}" successfully compiled!`);
      
      if (refetchStories) refetchStories();

      // Clear generator input
      setGenTopic('');

      setToast({ text: `Story "${storyObj.title}" compiled successfully!`, type: 'success' });
      
      setTimeout(() => {
        startEditing(storyObj);
        setActiveTab('catalog');
        setIsGenerating(false);
      }, 1000);

    } catch (err) {
      console.error(err);
      addLog(`CRITICAL ERROR during generation: ${err.message}`);
      setToast({ text: `Failed to compile story: ${err.message}`, type: 'error' });
      setIsGenerating(false);
    }
  };

  // Poll automation/auto-generator data from backend
  const fetchAutomationData = useCallback(async () => {
    if (isLocal) {
      try {
        const resStatus = await fetch('/api/automation/status');
        if (resStatus.ok) {
          const status = await resStatus.json();
          setAutoStatus(status);
          setServerOffline(false);
          consecutiveFailuresRef.current = 0;

          const resLogs = await fetch('/api/automation/logs');
          if (resLogs.ok) {
            const logsData = await resLogs.json();
            setAutoLogs(logsData);
          }
          return;
        }
      } catch {
        // ignore & fallback
      }
    }

    // Static fallback
    try {
      const res = await fetch('/content/automation_status.json');
      if (res.ok) {
        const data = await res.json();
        setAutoStatus({
          isRunning: data.isRunning,
          enabled: data.enabled,
          lastRunAt: data.lastRunAt,
          nextRunMs: Math.max(0, data.nextRunAt - Date.now()),
          intervalMs: data.intervalMs
        });
        setServerOffline(false);
        consecutiveFailuresRef.current = 0;
        
        const runTime = new Date(data.lastRunAt).toLocaleTimeString([], { hour12: false });
        setAutoLogs([
          `[${runTime}] === ENGINE STATUS CHECK ===`,
          `[${runTime}] Runner Engine: ${data.mode === 'github-actions' ? 'GitHub Actions' : 'Local Server'}`,
          `[${runTime}] Last Status: ${data.status ? data.status.toUpperCase() : 'UNKNOWN'}`,
          ...(data.error ? [`[${runTime}] ERROR: ${data.error}`] : [])
        ]);
      } else {
        throw new Error('Status file not found');
      }
    } catch {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setServerOffline(true);
      }
    }
  }, [isLocal]);

  useEffect(() => {
    fetchAutomationData();
    const interval = setInterval(fetchAutomationData, 10000);
    return () => clearInterval(interval);
  }, [fetchAutomationData]);

  // Force trigger background auto-generation
  const handleTriggerAutomation = async () => {
    try {
      addLog('Triggering server-side background generator run...');
      const res = await fetch('/api/automation/run', { method: 'POST' });
      if (res.ok) {
        setToast({ text: 'Background auto-generator run started.', type: 'success' });
        fetchAutomationData();
      } else {
        alert('Could not trigger background run. Verify server status.');
      }
    } catch {
      alert('Network error while triggering auto-generation.');
    }
  };

  // Toggle background automation enable/disable state
  const handleToggleAutomation = async () => {
    try {
      const res = await fetch('/api/automation/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoStatus.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoStatus(prev => ({ ...prev, enabled: data.enabled }));
        setToast({ text: `Auto-Generator successfully ${data.enabled ? 'enabled' : 'disabled'}.`, type: 'success' });
      }
    } catch (err) {
      console.warn('Failed to toggle automation:', err);
    }
  };

  // Story catalog state loaded from server (includes drafts)
  const [adminStories, setAdminStories] = useState([]);
  const [adminStoriesLoading, setAdminStoriesLoading] = useState(false);

  // Stories loader
  const loadAdminStories = useCallback(async () => {
    setAdminStoriesLoading(true);
    try {
      const res = await fetch('/api/stories?include_drafts=true');
      if (res.ok) {
        const data = await res.json();
        setAdminStories(data);
      }
    } catch (err) {
      console.warn('Failed to load admin stories from database:', err);
    } finally {
      setAdminStoriesLoading(false);
    }
  }, []);

  // Feedback loader
  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    let items = [];
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        items = await res.json();
      }
    } catch (err) {
      console.warn('Failed to load feedback:', err);
    }
    setFeedbackItems(items);
    setFeedbackLoading(false);
  }, []);

  // Recommendations loader
  const loadRecommendations = useCallback(async () => {
    setRecsLoading(true);
    let items = [];
    try {
      const res = await fetch('/api/recommendations');
      if (res.ok) {
        items = await res.json();
      }
    } catch (err) {
      console.warn('Failed to load recommendations:', err);
    }

    // Sort: pending first, then by date/id descending
    const sorted = items.sort((a, b) => {
      const aPending = (a.status || 'pending') === 'pending';
      const bPending = (b.status || 'pending') === 'pending';
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return b.id.localeCompare(a.id);
    });

    setRecommendations(sorted);
    setRecsLoading(false);
  }, []);

  const handleAddRecommendation = async (e) => {
    e.preventDefault();
    if (!newRecTopic.trim()) return;
    setAddingRec(true);
    const newRec = {
      id: 'rec_' + Date.now(),
      topic: newRecTopic.trim(),
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      status: 'pending'
    };

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRec)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.duplicate) {
          setToast({ text: 'We already have it in database.', type: 'info' });
        } else {
          setToast({ text: 'Recommendation successfully filed in queue!', type: 'success' });
        }
      } else {
        setToast({ text: 'Error saving recommendation', type: 'error' });
      }
      setNewRecTopic('');
      loadRecommendations();
    } catch (err) {
      console.warn(err);
      setToast({ text: 'Error saving recommendation (offline)', type: 'error' });
    } finally {
      setAddingRec(false);
    }
  };

  const handleDeleteRecommendation = async (id) => {
    if (!window.confirm('Delete this recommendation from the queue?')) return;
    
    try {
      const res = await fetch(`/api/recommendations?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setToast({ text: 'Recommendation deleted successfully!', type: 'success' });
      } else {
        throw new Error('Server deletion failed');
      }
    } catch (err) {
      console.warn('Server delete failed:', err.message);
    }
    loadRecommendations();
  };

  // Publish / Push to Live story logic
  const handlePublishStory = async (storyId) => {
    try {
      setPublishStatus('Publishing draft story to archive...');
      setIsPublishing(true);
      
      const res = await fetch('/api/stories/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId })
      });
      
      if (!res.ok) {
        throw new Error('Server publication failed');
      }

      setToast({ text: 'Story published to local archive!', type: 'success' });

      await loadAdminStories();
      if (refetchStories) await refetchStories();

      // Push straight to GitHub if sync credentials are active
      if (ghToken) {
        const resLocal = await fetch(`/content/stories.json?t=${Date.now()}`);
        if (resLocal.ok) {
          const localJson = await resLocal.ok ? await resLocal.json() : { stories: [] };
          const localList = localJson.stories || [];
          const newIndex = rebuildConceptIndex(localList);
          
          const filesToCommit = [
            { path: 'public/content/stories.json', content: JSON.stringify({ stories: localList }, null, 2) },
            { path: 'public/content/concept_index.json', content: JSON.stringify(newIndex, null, 2) }
          ];

          await commitFilesToGitHub(filesToCommit, `admin: publish story ${storyId} live`);
          setToast({ text: 'Story published and synced live to GitHub!', type: 'success' });
        }
      }
    } catch (err) {
      console.error(err);
      setToast({ text: `Failed to publish: ${err.message}`, type: 'error' });
    } finally {
      setIsPublishing(false);
      setPublishStatus('');
    }
  };

  const handlePublishAllDrafts = async () => {
    try {
      setPublishStatus('Publishing all draft stories to archive...');
      setIsPublishing(true);
      
      const res = await fetch('/api/stories/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish_all: true })
      });
      
      if (!res.ok) {
        throw new Error('Server publication failed');
      }

      setToast({ text: 'All draft stories published to local archive!', type: 'success' });

      await loadAdminStories();
      if (refetchStories) await refetchStories();

      if (ghToken) {
        const resLocal = await fetch(`/content/stories.json?t=${Date.now()}`);
        if (resLocal.ok) {
          const localJson = await resLocal.json();
          const localList = localJson.stories || [];
          const newIndex = rebuildConceptIndex(localList);
          
          const filesToCommit = [
            { path: 'public/content/stories.json', content: JSON.stringify({ stories: localList }, null, 2) },
            { path: 'public/content/concept_index.json', content: JSON.stringify(newIndex, null, 2) }
          ];

          await commitFilesToGitHub(filesToCommit, 'admin: publish all draft stories live');
          setToast({ text: 'All stories published and synced live to GitHub!', type: 'success' });
        }
      }
    } catch (err) {
      console.error(err);
      setToast({ text: `Failed to publish all: ${err.message}`, type: 'error' });
    } finally {
      setIsPublishing(false);
      setPublishStatus('');
    }
  };

  useEffect(() => {
    loadFeedback();
    loadRecommendations();
    loadAdminStories();
  }, [loadFeedback, loadRecommendations, loadAdminStories]);

  // Story editor utilities
  const startEditing = (story) => {
    setEditingStoryId(story.story_id);
    setEditForm({
      story_id: story.story_id || '',
      title: story.title || '',
      hero_image: story.hero_image || '',
      image_query: story.image_query || '',
      hook: story.hook || '',
      category: story.category || 'psychology',
      severity: story.severity || 'unsettling',
      concepts: story.concepts || [],
      layers: story.layers ? JSON.parse(JSON.stringify(story.layers)) : Array.from({ length: 7 }).map((_, idx) => ({
        layer: idx + 1,
        layer_name: `Layer ${idx + 1}`,
        content: '',
        cliffhanger: idx < 6 ? 'Next layer hook...' : null
      }))
    });
    setEditFormActiveLayer(1);
  };

  const handleCreateNewStory = () => {
    const tempId = 'dossier_' + Date.now();
    setEditingStoryId(tempId);
    setEditForm({
      story_id: '',
      title: 'New Dossier Title',
      hero_image: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800',
      image_query: '',
      hook: 'Introduce the mystery here in 1-2 Hinglish sentences...',
      category: 'psychology',
      severity: 'unsettling',
      concepts: [],
      layers: Array.from({ length: 7 }).map((_, idx) => ({
        layer: idx + 1,
        layer_name: idx === 0 ? 'The Whisper' : idx === 3 ? 'The Incident' : idx === 6 ? 'The Dark Corner' : `Layer ${idx + 1}`,
        content: idx === 0 ? 'Kya aapne kabhi aisa socha hai? Chalo aaj aapko le chalte hain ek aisi kahani ki aur...' : 'Provide details...',
        cliffhanger: idx < 6 ? 'Next layer hook...' : null
      }))
    });
    setEditFormActiveLayer(1);
  };

  const handleLayerChange = (layerNum, field, value) => {
    setEditForm(prev => {
      if (!prev.layers) return prev;
      const updatedLayers = prev.layers.map(l => {
        if (l.layer === layerNum) {
          return { ...l, [field]: value };
        }
        return l;
      });
      return { ...prev, layers: updatedLayers };
    });
  };

  const handleSaveStory = async (storyId) => {
    // Validate form
    const finalId = editForm.story_id.trim() || editForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');
    if (!finalId) {
      alert('Story ID / Slug is required.');
      return;
    }

    const payload = {
      ...editForm,
      story_id: finalId
    };

    let serverSaved = false;
    if (isLocal && !serverOffline) {
      try {
        const res = await fetch(`/api/stories/${storyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          serverSaved = true;
          const exists = localStories.some(s => s.story_id === storyId);
          let updatedLocal;
          if (exists) {
            updatedLocal = localStories.map(s => s.story_id === storyId ? payload : s);
          } else {
            updatedLocal = localStories;
          }
          setLocalStories(updatedLocal);
          localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));
        }
      } catch (err) {
        console.warn('Local server save failed:', err);
      }
    }

    if (!serverSaved) {
      let updatedLocal;
      const exists = localStories.some(s => s.story_id === storyId);
      if (exists) {
        updatedLocal = localStories.map(s => s.story_id === storyId ? payload : s);
      } else {
        updatedLocal = [...localStories.filter(s => s.story_id !== finalId), payload];
      }
      setLocalStories(updatedLocal);
      localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));

      // Push straight to GitHub if sync credentials are active
      if (ghToken) {
        const updatedStories = [...stories.filter(s => s.story_id !== storyId && s.story_id !== finalId), payload];
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        try {
          await commitFilesToGitHub(filesToCommit, `admin: update story ${finalId} via edit save`);
          setToast({ text: 'Story successfully compiled and pushed live to GitHub!', type: 'success' });
        } catch (err) {
          setToast({ text: `Saved locally. GitHub push failed: ${err.message}`, type: 'error' });
        }
      } else {
        setToast({ text: 'Saved locally to browser cache. Set GitHub settings to sync changes live.', type: 'warning' });
      }
    } else {
      setToast({ text: 'Story successfully updated in local archive.', type: 'success' });
    }

    if (refetchStories) refetchStories();
    setEditingStoryId(null);
  };

  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Delete this story from the archive permanently?')) return;
    
    let serverDeleted = false;
    if (isLocal && !serverOffline) {
      try {
        const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' });
        if (res.ok) {
          serverDeleted = true;
        }
      } catch (e) {
        console.warn('Local server delete failed:', e);
      }
    }
    
    const updated = localStories.filter(s => s.story_id !== storyId);
    setLocalStories(updated);
    localStorage.setItem('lore:custom_stories', JSON.stringify(updated));

    // Save to local blacklist
    try {
      const stored = localStorage.getItem('lore:deleted_stories');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.includes(storyId)) {
        list.push(storyId);
        localStorage.setItem('lore:deleted_stories', JSON.stringify(list));
      }
    } catch {
      void 0;
    }

    if (onStoryDeleted) {
      onStoryDeleted(storyId);
    }

    if (!serverDeleted) {
      if (ghToken) {
        const updatedStories = stories.filter(s => s.story_id !== storyId);
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        try {
          await commitFilesToGitHub(filesToCommit, `admin: delete story ${storyId} via GitHub Sync`);
          setToast({ text: 'Story deleted and synced to GitHub live site!', type: 'success' });
        } catch (err) {
          setToast({ text: `Deleted locally. GitHub Sync failed: ${err.message}`, type: 'error' });
        }
      } else {
        setToast({ text: 'Deleted locally from browser view. Commit sync to apply changes live.', type: 'warning' });
      }
    } else {
      setToast({ text: 'Story deleted from server database successfully.', type: 'success' });
    }

    if (refetchStories) refetchStories();
  };

  // Image Upload handler
  const handleUploadImage = async (e, storyId) => {
    if (!isLocal || serverOffline) {
      alert('Custom image uploading is a local feature. Please run on localhost to upload cover files.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingState('uploading');
    addLog(`Uploading custom cover image for ${storyId || 'new_story'}...`);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Data = reader.result;
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId: storyId || 'general',
            filename: 'cover.jpg',
            base64Data,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          addLog(`Successfully uploaded custom image: ${data.path}`);
          setEditForm(prev => ({ ...prev, hero_image: data.path }));
          setToast({ text: 'Image uploaded successfully!', type: 'success' });
        } else {
          alert('Failed to upload image to server');
        }
      } catch (err) {
        console.error(err);
        alert('Error uploading image');
      } finally {
        setUploadingState('idle');
      }
    };
    reader.readAsDataURL(file);
  };

  // Commit files directly using REST API
  const commitFilesToGitHub = async (filesToCommit, commitMessage) => {
    const token = ghToken ? ghToken.trim() : '';
    const owner = ghOwner ? ghOwner.trim() : '';
    const repo = ghRepo ? ghRepo.trim() : '';
    const branch = ghBranch ? ghBranch.trim() : '';

    if (!token) {
      throw new Error('GitHub Personal Access Token is required.');
    }
    setIsPublishing(true);
    setPublishStatus('Initializing GitHub publish...');
    try {
      for (const file of filesToCommit) {
        setPublishStatus(`Fetching metadata for ${file.path}...`);
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}&t=${Date.now()}`;
        
        let sha = null;
        try {
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (res.ok) {
            const data = await res.json();
            sha = data.sha;
            if (!sha) {
              const etag = res.headers.get('etag');
              if (etag) {
                sha = etag.replace(/^(W\/)?"/i, '').replace(/"/g, '');
              }
            }
          } else if (res.status !== 404) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(`GitHub metadata fetch failed (HTTP ${res.status}): ${errData.message || res.statusText}`);
          }
        } catch (err) {
          if (err.message && err.message.includes('GitHub metadata fetch failed')) {
            throw err;
          }
          console.warn(`File ${file.path} might be new:`, err);
        }

        setPublishStatus(`Committing ${file.path}...`);
        const body = {
          message: commitMessage,
          content: btoa(unescape(encodeURIComponent(file.content))),
          branch: branch
        };
        if (sha) {
          body.sha = sha;
        }

        const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!putRes.ok) {
          const errorData = await putRes.json().catch(() => ({}));
          throw new Error(`GitHub API Error for ${file.path}: ${errorData.message || putRes.statusText}`);
        }
      }
      setPublishStatus('Publish successful!');
      addLog(`🚀 Successfully committed updates directly to GitHub repo ${owner}/${repo} on branch ${branch}`);
      setGhSyncSuccess(true);
      localStorage.setItem('lore:github:success', 'true');
      return true;
    } catch (err) {
      console.error('GitHub Sync failed:', err);
      setPublishStatus(`Error: ${err.message}`);
      addLog(`❌ GitHub Commit Sync Failed: ${err.message}`);
      setGhSyncSuccess(false);
      localStorage.setItem('lore:github:success', 'false');
      throw err;
    } finally {
      setTimeout(() => {
        setIsPublishing(false);
        setPublishStatus('');
      }, 3000);
    }
  };

  // Local archive direct sync publisher
  const handleSyncLocalToGitHub = async () => {
    if (!ghToken) {
      alert('GitHub Token is required to sync.');
      return;
    }
    
    setIsPublishing(true);
    setPublishStatus('Sync: Merging local database with remote archive...');
    try {
      let remoteStories = [];
      try {
        setPublishStatus('Sync: Fetching remote stories from GitHub...');
        const remoteStoriesUrl = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/public/content/stories.json?ref=${ghBranch}&t=${Date.now()}`;
        const resRemote = await fetch(remoteStoriesUrl, {
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (resRemote.ok) {
          const dataRemote = await resRemote.json();
          const decoded = decodeURIComponent(escape(atob(dataRemote.content.replace(/\s/g, ''))));
          const parsed = JSON.parse(decoded);
          remoteStories = parsed.stories || [];
        }
      } catch (err) {
        console.warn('Remote stories fetch failed, using local list:', err);
      }

      setPublishStatus('Sync: Fetching local stories...');
      const resLocalStories = await fetch(`/content/stories.json?t=${Date.now()}`);
      if (!resLocalStories.ok) {
        throw new Error('Failed to read local stories.json');
      }
      const localStoriesJson = await resLocalStories.json();
      const localStoriesList = localStoriesJson.stories || [];
      const deletedIds = JSON.parse(localStorage.getItem('lore:deleted_stories') || '[]');

      // Merge databases
      let mergedStories = remoteStories.filter(s => !deletedIds.includes(s.story_id));
      localStoriesList.forEach(localStory => {
        const idx = mergedStories.findIndex(s => s.story_id === localStory.story_id);
        if (idx !== -1) {
          mergedStories[idx] = localStory;
        } else {
          mergedStories.push(localStory);
        }
      });

      const mergedConceptIndex = rebuildConceptIndex(mergedStories);
      setPublishStatus('Sync: Gathering local files to publish...');

      const filesToCommit = [
        { path: 'public/content/stories.json', content: JSON.stringify({ stories: mergedStories }, null, 2) },
        { path: 'public/content/concept_index.json', content: JSON.stringify(mergedConceptIndex, null, 2) }
      ];

      // Read local feedback file to push
      try {
        const resFbLocal = await fetch(`/content/feedback.json?t=${Date.now()}`);
        if (resFbLocal.ok) {
          const fbList = await resFbLocal.json();
          filesToCommit.push({ path: 'public/content/feedback.json', content: JSON.stringify(fbList, null, 2) });
        }
      } catch {
        void 0;
      }

      // Read local recommendations file to push
      try {
        const resRecLocal = await fetch(`/content/recommendations.json?t=${Date.now()}`);
        if (resRecLocal.ok) {
          const recList = await resRecLocal.json();
          filesToCommit.push({ path: 'public/content/recommendations.json', content: JSON.stringify(recList, null, 2) });
        }
      } catch {
        void 0;
      }

      // Add status files
      try {
        const resStatus = await fetch(`/content/automation_status.json?t=${Date.now()}`);
        if (resStatus.ok) {
          const content = await resStatus.text();
          filesToCommit.push({ path: 'public/content/automation_status.json', content });
        }
      } catch {
        void 0;
      }

      setPublishStatus(`Sync: Pushing ${filesToCommit.length} files to GitHub repository...`);
      await commitFilesToGitHub(filesToCommit, 'admin: sync merged local archive updates to live site');
      
      localStorage.removeItem('lore:deleted_stories');
      localStorage.removeItem('lore:local_feedback');
      
      setToast({ text: '✓ Successfully synchronized all local changes to the live site!', type: 'success' });
      addLog(`🚀 Published ${filesToCommit.length} merged files successfully.`);
    } catch (err) {
      setToast({ text: `Failed to push sync: ${err.message}`, type: 'error' });
      addLog(`❌ Local Sync Failed: ${err.message}`);
    } finally {
      setIsPublishing(false);
      setPublishStatus('');
    }
  };

  // Filtered stories in catalog
  const filteredStories = useMemo(() => {
    // Only show non-draft (published) stories in the main catalog list
    const published = adminStories.filter(s => !s.draft);
    return published.filter(story => {
      const matchesSearch = story.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            story.story_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (story.hook && story.hook.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = filterCategory === 'all' || story.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [adminStories, searchQuery, filterCategory]);

  const storiesAddedToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return adminStories.filter(s => s.added_date === today);
  }, [adminStories]);

  const draftStories = useMemo(() => {
    return adminStories.filter(s => s.draft);
  }, [adminStories]);

  const avgRating = useMemo(() => {
    if (feedbackItems.length === 0) return 0;
    const sum = feedbackItems.reduce((acc, curr) => acc + curr.rating, 0);
    return (sum / feedbackItems.length).toFixed(1);
  }, [feedbackItems]);

  const filteredFeedbackItems = useMemo(() => {
    return feedbackItems.filter(item => {
      if (feedbackFilter === 'pending') return !item.addressed;
      if (feedbackFilter === 'resolved') return item.addressed;
      return true;
    });
  }, [feedbackItems, feedbackFilter]);

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: bg, color: fg }}>
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header className="border-b" style={{ borderColor: ru, padding: '0 40px' }}>
        <div className="mx-auto h-16 flex items-center justify-between" style={{ maxWidth: '1000px' }}>
          <div className="flex items-center gap-[10px]">
            <LoreMark size={20} color={fg} />
            <span className="text-[11px] font-bold tracking-[0.32em] uppercase">
              Archive Console
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (refetchStories) refetchStories();
                loadFeedback();
                fetchAutomationData();
                setToast({ text: 'Data reloaded successfully', type: 'success' });
              }}
              className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-2 border rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-[#9E7B4C]"
              style={{ borderColor: ru }}
            >
              ⟳ Refresh
            </button>
            <button
              onClick={onBack}
              className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-2 border rounded-lg hover:opacity-60 transition-opacity cursor-pointer"
              style={{ borderColor: ru }}
            >
              ← Exit
            </button>
          </div>
        </div>
      </header>

      {/* Offline sync banner */}
      {serverOffline && !ghSyncSuccess && (
        <div className="mx-auto w-full mt-6 px-10" style={{ maxWidth: '1000px' }}>
          <div 
            className="p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300"
            style={{ 
              backgroundColor: 'rgba(196, 100, 74, 0.05)', 
              borderColor: 'rgba(196, 100, 74, 0.25)', 
            }}
          >
            <div className="flex gap-3">
              <span className="text-lg mt-0.5 select-none" style={{ color: '#C4644A' }}>⚠</span>
              <div className="text-left">
                <p className="text-xs font-bold tracking-[0.12em] uppercase" style={{ color: '#C4644A' }}>
                  GitHub Sync Unconfigured
                </p>
                <p className="text-[11px] font-sans mt-1 leading-relaxed" style={{ color: fg, opacity: 0.75 }}>
                  You are editing offline. Edits are saved locally in the browser. Configure GitHub Sync in Settings & Sync to publish changes live to the website.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('github-sync')}
              className="px-4 py-2 border text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all duration-200 hover:bg-[#C4644A]/10 active:scale-95 cursor-pointer flex-shrink-0"
              style={{ color: '#C4644A', borderColor: 'rgba(196, 100, 74, 0.35)' }}
            >
              Set Credentials
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="bg-[#12100E] border-b py-6 px-10" style={{ borderColor: ru }}>
        <div className="mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center" style={{ maxWidth: '1000px' }}>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Total Dossiers
            </span>
            <span className="font-serif italic text-2xl">
              {adminStories.length}{' '}
              <span className="text-[10px] font-mono font-normal text-[#6A6560]">
                ({adminStories.filter(s => !s.draft).length} live · {adminStories.filter(s => s.draft).length} draft)
              </span>
            </span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Added Today
            </span>
            <span className="font-serif italic text-2xl text-[#9E7B4C]">{storiesAddedToday.length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Unread Feedback
            </span>
            <span className="font-serif italic text-2xl">{feedbackItems.filter(f => !f.addressed).length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              GitHub Connection
            </span>
            <span className="text-xs font-mono font-bold block mt-2" style={{ color: ghSyncSuccess ? '#10B981' : '#6A6560' }}>
              {ghSyncSuccess ? '● CONNECTED' : '○ DISCONNECTED'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabbed Grid */}
      <div className="flex-1 flex flex-col md:flex-row mx-auto w-full" style={{ maxWidth: '1200px', padding: '32px 40px' }}>
        {/* Sidebar */}
        <aside className="w-full md:w-[240px] flex-shrink-0 flex flex-col gap-2 mb-8 md:mb-0 md:pr-8">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'catalog' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Dossier Catalog ({adminStories.length})
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'generator' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            AI Generator
          </button>
          <button
            onClick={() => {
              setActiveTab('feedback');
              loadFeedback();
            }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'feedback' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Reader Feedback ({feedbackItems.filter(f => !f.addressed).length})
          </button>
          <button
            onClick={() => setActiveTab('github-sync')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'github-sync' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Settings & Sync {ghSyncSuccess ? '✓' : '⚠️'}
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 bg-[#110F0D] border rounded-2xl p-6 md:p-8" style={{ borderColor: ru }}>
          
          {/* Tab 1: Dossier Catalog */}
          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Dossier Catalog</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Manage and edit the story archive files</p>
                </div>
                <div>
                  <button
                    onClick={handleCreateNewStory}
                    className="px-3.5 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-bold tracking-wider uppercase rounded-lg active:scale-95 transition-all cursor-pointer"
                  >
                    + Create New Story
                  </button>
                </div>
              </div>

              {editingStoryId ? (
                // Story Editor Panel
                <div className="space-y-4 p-5 bg-[#0D0B08] rounded-xl border" style={{ borderColor: ru }}>
                  <h3 className="font-serif italic text-lg text-left" style={{ color: ac }}>
                    {editForm.title ? `Editing: ${editForm.title}` : 'New Dossier Compiler'}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Story Slug / ID</label>
                      <input
                        type="text"
                        value={editForm.story_id}
                        onChange={(e) => setEditForm(prev => ({ ...prev, story_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                        placeholder="e.g. project_mkultra (slug)"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Title</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                        placeholder="Compelling headline"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Cover Image Path / Remote URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.hero_image}
                          onChange={(e) => setEditForm(prev => ({ ...prev, hero_image: e.target.value }))}
                          className="flex-1 px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                          placeholder="/content/images/... or https://"
                        />
                        <label
                          htmlFor="editor-cover-upload"
                          className={`px-3 py-2 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[9px] font-mono tracking-wider uppercase rounded flex items-center justify-center min-w-[80px] transition-all select-none font-bold ${(isLocal && !serverOffline) ? 'hover:bg-neutral-800 cursor-pointer active:scale-95' : 'opacity-40 cursor-not-allowed'}`}
                        >
                          {uploadingState === 'uploading' ? '...' : 'Upload'}
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          id="editor-cover-upload"
                          className="hidden"
                          onChange={(e) => handleUploadImage(e, editForm.story_id)}
                          disabled={uploadingState === 'uploading' || !isLocal || serverOffline}
                        />
                      </div>
                      <p className="text-[8px] text-[#6A6560] mt-0.5">Select a local image to convert to Base64 and upload to server automatically.</p>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Wikipedia Image Fetch Keyword</label>
                      <input
                        type="text"
                        value={editForm.image_query || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, image_query: e.target.value }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                        placeholder="Wikipedia article title (e.g. Project MKUltra)"
                      />
                    </div>
                  </div>

                  <div className="text-left">
                    <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Catalog Hook Teaser</label>
                    <textarea
                      value={editForm.hook}
                      onChange={(e) => setEditForm(prev => ({ ...prev, hook: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-none"
                      placeholder="Introductory teaser paragraph (max 150 chars)..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Severity</label>
                      <select
                        value={editForm.severity}
                        onChange={(e) => setEditForm(prev => ({ ...prev, severity: e.target.value }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                      >
                        <option value="unsettling">Unsettling</option>
                        <option value="disturbing">Disturbing</option>
                        <option value="extreme">Extreme</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Concepts (comma-separated)</label>
                      <input
                        type="text"
                        value={Array.isArray(editForm.concepts) ? editForm.concepts.join(', ') : editForm.concepts || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, concepts: e.target.value.split(',').map(c => c.trim()).filter(Boolean) }))}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                        placeholder="delusion, coverup, experiments"
                      />
                    </div>
                  </div>

                  {/* Story Layers compiler */}
                  <div className="mt-6 pt-4 border-t border-neutral-800 text-left">
                    <label className="block text-[10px] font-mono tracking-wider uppercase text-[#9E7B4C] mb-2 font-bold">
                      Story Descent Layers (1 to 7)
                    </label>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setEditFormActiveLayer(i + 1)}
                          className={`px-3 py-1.5 text-[9px] font-mono rounded cursor-pointer transition-all ${editFormActiveLayer === i + 1 ? 'bg-[#9E7B4C] text-white font-bold' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
                        >
                          L{i + 1}
                        </button>
                      ))}
                    </div>

                    {editForm.layers && editForm.layers.length > 0 && editForm.layers.map(l => {
                      if (l.layer !== editFormActiveLayer) return null;
                      return (
                        <div key={l.layer} className="space-y-4 p-4 rounded-lg bg-black/40 border border-neutral-900">
                          <p className="text-[10px] font-mono text-[#9E7B4C] font-bold uppercase mb-2">Layer {l.layer} Content Settings</p>
                          <div>
                            <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Layer Header Name</label>
                            <input
                              type="text"
                              value={l.layer_name || ''}
                              onChange={(e) => handleLayerChange(l.layer, 'layer_name', e.target.value)}
                              className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                              placeholder="e.g. The Pattern"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Layer Body Paragraphs</label>
                            <textarea
                              value={l.content || ''}
                              onChange={(e) => handleLayerChange(l.layer, 'content', e.target.value)}
                              rows={6}
                              className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-y"
                              placeholder="Type story text details in Hinglish. Separate paragraphs with double newlines."
                            />
                          </div>
                          {l.layer < 7 && (
                            <div>
                              <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Layer Cliffhanger</label>
                              <textarea
                                value={l.cliffhanger || ''}
                                onChange={(e) => handleLayerChange(l.layer, 'cliffhanger', e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-none"
                                placeholder="Sentence pulling readers to the next layer..."
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 justify-end pt-4 border-t border-neutral-800">
                    <button
                      onClick={() => setEditingStoryId(null)}
                      className="px-4 py-2 border border-neutral-800 text-[#6A6560] text-[10px] font-bold tracking-wider uppercase rounded-lg hover:bg-white/5 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveStory(editingStoryId)}
                      className="px-4 py-2 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-wider uppercase rounded-lg hover:bg-[#b08c5c] cursor-pointer"
                    >
                      Save Archive
                    </button>
                  </div>
                </div>
              ) : (
                // Dossier Catalog Search & List View
                <div className="space-y-4">
                  {/* Draft Dossiers Staging Area */}
                  {draftStories.length > 0 && (
                    <div 
                      className="p-5 rounded-xl border flex flex-col gap-4 text-left mb-6"
                      style={{ 
                        backgroundColor: 'rgba(158, 123, 76, 0.03)', 
                        borderColor: 'rgba(158, 123, 76, 0.25)', 
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'rgba(158, 123, 76, 0.15)' }}>
                        <div>
                          <h3 className="text-sm font-bold tracking-[0.12em] uppercase flex items-center gap-2" style={{ color: ac }}>
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Draft Dossiers (Newly Generated by AI)
                          </h3>
                          <p className="text-[10px] text-[#8F8A82] mt-0.5">
                            These stories are staging drafts. They are not visible to public users until published.
                          </p>
                        </div>
                        <button
                          onClick={handlePublishAllDrafts}
                          disabled={isPublishing}
                          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all duration-200 active:scale-95 cursor-pointer font-bold"
                        >
                          Publish All Live
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {draftStories.map(story => (
                          <div 
                            key={story.story_id} 
                            className="p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/40"
                            style={{ borderColor: 'rgba(158, 123, 76, 0.15)' }}
                          >
                            <div className="text-left min-w-0">
                              <span className="font-serif italic text-[#EDE8DF] text-base block leading-snug">{story.title}</span>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 uppercase tracking-widest">
                                  {CATEGORY_LABELS[story.category] || story.category}
                                </span>
                                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-red-950/20 text-red-400 uppercase">
                                  {story.severity}
                                </span>
                                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-950/20 text-amber-400 uppercase font-bold">
                                  Draft
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => handlePublishStory(story.story_id)}
                                disabled={isPublishing}
                                className="text-[9px] font-mono font-bold tracking-wider px-3 py-1.5 bg-emerald-800/20 border border-emerald-800/40 text-emerald-400 rounded-lg hover:bg-emerald-800/30 cursor-pointer transition-colors active:scale-95 disabled:opacity-40"
                              >
                                Push to Live
                              </button>
                              <button
                                onClick={() => startEditing(story)}
                                className="text-[9px] font-mono px-3 py-1.5 border border-neutral-800 rounded-lg hover:bg-white/5 text-neutral-400 cursor-pointer transition-colors active:scale-95"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStory(story.story_id)}
                                className="text-[9px] font-mono px-3 py-1.5 border border-red-950/30 text-red-500 rounded-lg hover:bg-red-950/10 cursor-pointer transition-colors active:scale-95"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search story archive..."
                      className="flex-1 px-4 py-2 bg-black text-[#EDE8DF] text-xs rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none transition-colors"
                    />
                    <select
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                      className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer min-w-[150px]"
                    >
                      <option value="all">All Categories</option>
                      {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stories list */}
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {adminStoriesLoading ? (
                      <div className="py-12 text-center text-neutral-500 italic text-sm animate-pulse">
                        Loading story archive...
                      </div>
                    ) : filteredStories.map(story => (
                      <div
                        key={story.story_id}
                        className="p-4 rounded-xl border transition-all hover:bg-black/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                        style={{ borderColor: ru, backgroundColor: '#0D0B08' }}
                      >
                        <div className="text-left min-w-0">
                          <span className="font-serif italic text-[#EDE8DF] text-lg block leading-snug">{story.title}</span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 uppercase tracking-widest">
                              {CATEGORY_LABELS[story.category] || story.category}
                            </span>
                            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-red-950/20 text-red-400 uppercase">
                              {story.severity}
                            </span>
                            {story.added_date && (
                              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-950/10 text-amber-500 uppercase">
                                Published: {story.added_date}
                              </span>
                            )}
                          </div>
                          {story.hook && <p className="text-xs text-[#6A6560] mt-2 line-clamp-2 italic">"{story.hook}"</p>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => startEditing(story)}
                            className="text-[10px] font-mono px-3 py-1.5 border border-neutral-800 rounded-lg hover:bg-white/5 text-neutral-400 cursor-pointer transition-colors active:scale-95"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteStory(story.story_id)}
                            className="text-[10px] font-mono px-3 py-1.5 border border-red-950/30 text-red-500 rounded-lg hover:bg-red-950/10 cursor-pointer transition-colors active:scale-95"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {filteredStories.length === 0 && (
                      <div className="py-12 text-center text-neutral-500 italic text-sm">
                        No stories match search criteria.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: AI Generator */}
          {activeTab === 'generator' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Column 1: Manual Generator */}
                <div className="space-y-6 text-left">
                  <div className="border-b pb-4" style={{ borderColor: ru }}>
                    <h3 className="font-serif italic text-xl">Manual Generator</h3>
                    <p className="text-xs text-[#6A6560] mt-1">Directly generate a new 7-layer story using Gemini</p>
                  </div>

                  <div className="space-y-4 p-5 bg-[#0D0B08] rounded-xl border" style={{ borderColor: ru }}>
                    <div>
                      <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                        Topic Name / Keyword
                      </label>
                      <input
                        type="text"
                        value={genTopic}
                        onChange={(e) => setGenTopic(e.target.value)}
                        placeholder="e.g. Project MKUltra, Salem Witch Trials..."
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none transition-colors"
                        disabled={isGenerating}
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                        Dossier Category
                      </label>
                      <select
                        value={genCategory}
                        onChange={(e) => setGenCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                        disabled={isGenerating}
                      >
                        <option value="auto">Auto-Detect Category</option>
                        {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                        Severity Rating
                      </label>
                      <select
                        value={genSeverity}
                        onChange={(e) => setGenSeverity(e.target.value)}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                        disabled={isGenerating}
                      >
                        <option value="auto">Auto-Detect Severity</option>
                        <option value="unsettling">Unsettling</option>
                        <option value="disturbing">Disturbing</option>
                        <option value="extreme">Extreme</option>
                      </select>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleGenerateStory}
                        disabled={isGenerating || autoStatus.isRunning || !genTopic}
                        className="w-full py-2.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-widest uppercase rounded hover:bg-[#b08c5c] active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        {isGenerating ? 'Compiling Story...' : 'Compile Story with Gemini'}
                      </button>
                    </div>
                  </div>

                  {/* Manual logs console overlay */}
                  {isGenerating && (
                    <div className="p-4 rounded-xl border bg-neutral-950/20" style={{ borderColor: ru }}>
                      <div className="flex justify-between text-[9px] font-mono text-[#6A6560] mb-2">
                        <span>Compilation Log Monitor (Elapsed: {elapsedTime}s)</span>
                        <span>{progress}%</span>
                      </div>
                      
                      <div className="w-full h-[2px] bg-neutral-900 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-[#9E7B4C] transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>

                      <div 
                        className="p-3 bg-black rounded-lg border border-neutral-900 font-mono text-[10px] leading-relaxed space-y-1 h-[150px] overflow-y-auto pr-3 text-left"
                      >
                        {logs.map((log, idx) => (
                          <div
                            key={idx}
                            className={
                              log.includes('ERROR') || log.includes('failed') ? 'text-red-400' :
                              log.includes('SUCCESS') || log.includes('successfully') ? 'text-emerald-400' :
                              log.includes('Initiating') || log.includes('Connecting') ? 'text-[#9E7B4C] font-bold' :
                              'text-neutral-300'
                            }
                          >
                            {log}
                          </div>
                        ))}
                        <div className="text-neutral-500 animate-pulse mt-1">▋ Executing manual engine thread...</div>
                        <div ref={manualLogsEndRef} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 2: Auto-Generator Control */}
                <div className="space-y-6 text-left">
                  <div className="border-b pb-4" style={{ borderColor: ru }}>
                    <h3 className="font-serif italic text-xl">Auto-Generator Control</h3>
                    <p className="text-xs text-[#6A6560] mt-1">Supervise background content balancing engine</p>
                  </div>

                  <div className="space-y-4 p-5 bg-[#0D0B08] rounded-xl border" style={{ borderColor: ru }}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-400">Background Runner</span>
                      <div className="flex items-center gap-4">
                        <label className="inline-flex items-center cursor-pointer select-none">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={!!autoStatus.enabled}
                              disabled={isLocal ? serverOffline : true}
                              onChange={handleToggleAutomation}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#EDE8DF] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#9E7B4C] peer-disabled:opacity-40" />
                          </div>
                        </label>
                        <button
                          onClick={handleTriggerAutomation}
                          disabled={isGenerating || autoStatus.isRunning || (isLocal ? serverOffline : true)}
                          className="px-3 py-1.5 bg-neutral-900 border rounded text-[9px] font-mono font-bold tracking-wider hover:bg-white/5 disabled:opacity-40 transition-all uppercase cursor-pointer"
                          style={{ borderColor: ru }}
                        >
                          Force Run
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="p-3 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                        <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Runner Status</span>
                        <span className="text-xs font-mono font-bold" style={{ color: autoStatus.isRunning ? '#F59E0B' : autoStatus.enabled ? '#10B981' : '#6A6560' }}>
                          {autoStatus.isRunning ? '⚡ RUNNING' : autoStatus.enabled ? '● ACTIVE' : '◌ DISABLED'}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                        <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Periodicity</span>
                        <span className="text-xs font-mono font-bold text-[#EDE8DF]">Every 3 Hours</span>
                      </div>
                    </div>
                  </div>

                  {/* Logs monitor for Auto Generator */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-neutral-500">Auto background thread logs</span>
                      <span className="text-emerald-400 animate-pulse">● LIVE MONITOR</span>
                    </div>
                    <div 
                      className="p-3.5 bg-black rounded-lg border border-neutral-900 font-mono text-[10px] leading-relaxed space-y-1 h-[200px] overflow-y-auto pr-4 text-left"
                    >
                      {autoLogs.length === 0 && (
                        <div className="text-neutral-500 italic text-[10px] p-2 leading-relaxed">
                          Local API server offline. Start server using 'node server.cjs' to view live background logs.
                        </div>
                      )}
                      {autoLogs.slice(-40).map((log, idx) => (
                        <div
                          key={idx}
                          className={
                            log.includes('ERROR') || log.includes('failed') ? 'text-red-400' :
                            log.includes('SUCCESS') || log.includes('SUCCESS:') || log.includes('added to archive') ? 'text-emerald-400' :
                            log.includes('STARTING') || log.includes('balancing') ? 'text-[#9E7B4C] font-bold' :
                            'text-neutral-300'
                          }
                        >
                          {log}
                        </div>
                      ))}
                      {autoStatus.isRunning && (
                        <div className="text-neutral-500 animate-pulse mt-1">▋ Executing engine thread...</div>
                      )}
                      <div ref={autoLogsEndRef} />
                    </div>
                  </div>

                </div>
              </div>

              {/* Row 2: Reader Recommendations Queue */}
              <div className="border-t pt-8 text-left mt-8" style={{ borderColor: ru }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 mb-6" style={{ borderColor: ru }}>
                  <div>
                    <h3 className="font-serif italic text-xl">Reader Recommendations Queue</h3>
                    <p className="text-xs text-[#6A6560] mt-1">Pending and approved topics submitted by readers or added by admins</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={loadRecommendations}
                      className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer transition-all uppercase font-bold"
                      style={{ borderColor: ru, color: '#EDE8DF' }}
                    >
                      ⟳ Reload
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Form Column */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="p-5 bg-[#0D0B08] rounded-xl border space-y-4" style={{ borderColor: ru }}>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9E7B4C] font-bold">Add Custom Topic</h4>
                      <form onSubmit={handleAddRecommendation} className="space-y-4">
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                            Topic Name / Keyword
                          </label>
                          <input
                            type="text"
                            value={newRecTopic}
                            onChange={(e) => setNewRecTopic(e.target.value)}
                            placeholder="e.g. Project Sunshine, Sleep Paralysis..."
                            className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none transition-colors"
                            disabled={addingRec}
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={addingRec || !newRecTopic.trim()}
                          className="w-full py-2.5 bg-[#9E7B4C]/20 border border-[#9E7B4C]/40 text-[#9E7B4C] text-[10px] font-mono tracking-widest uppercase rounded hover:bg-[#9E7B4C]/30 active:scale-95 disabled:opacity-40 transition-all cursor-pointer font-bold"
                        >
                          {addingRec ? 'Adding...' : 'Add Topic to Queue'}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* List/Table Column */}
                  <div className="lg:col-span-2">
                    {recsLoading ? (
                      <div className="text-center py-12 text-[#6A6560] font-mono text-xs animate-pulse">
                        Loading recommendations queue...
                      </div>
                    ) : recommendations.length === 0 ? (
                      <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-neutral-800">
                        <p className="font-serif italic text-base text-[#6A6560] mb-2">Queue is empty.</p>
                        <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/40">Admin or visitor recommended topics will appear here.</p>
                      </div>
                    ) : (
                      <div className="border rounded-xl overflow-hidden bg-black/10" style={{ borderColor: ru }}>
                        <div className="max-h-[350px] overflow-y-auto pr-1">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b" style={{ borderColor: ru, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Topic Name</th>
                                <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Date Added</th>
                                <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Status</th>
                                <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560] text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recommendations.map((rec) => (
                                <tr key={rec.id} className="border-b transition-colors hover:bg-white/2" style={{ borderColor: ru }}>
                                  <td className="p-3 font-serif text-sm text-neutral-200 font-medium">{rec.topic}</td>
                                  <td className="p-3 text-[#8F8A82] font-mono text-[10px]">{rec.date}</td>
                                  <td className="p-3">
                                    <span 
                                      className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                        rec.status === 'pending' 
                                          ? 'text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/25' 
                                          : 'text-[#6A6560] bg-neutral-800/20'
                                      }`}
                                    >
                                      {rec.status || 'pending'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <button
                                      onClick={() => handleDeleteRecommendation(rec.id)}
                                      className="text-[10px] font-mono text-red-500 hover:text-red-400 cursor-pointer px-2 py-1 hover:bg-red-500/10 rounded transition-colors"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: User Feedback */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">
                    Reader Feedback
                  </h2>
                  <p className="text-xs text-[#6A6560] mt-1">Review ratings, tags, and comments from visitors</p>
                </div>
                <button
                  onClick={loadFeedback}
                  className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer transition-all uppercase font-bold"
                  style={{ borderColor: ru }}
                >
                  ⟳ Reload
                </button>
              </div>

              {/* Feedback Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Average Rating</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif italic text-2xl text-[#9E7B4C]">{avgRating}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: n <= Math.round(avgRating) ? ac : 'rgba(237,232,223,0.1)' }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Total Received</span>
                  <span className="font-serif italic text-2xl text-neutral-200">{feedbackItems.length}</span>
                </div>
                <div className="p-4 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Pending Review</span>
                  <span className="font-serif italic text-2xl text-amber-500">{feedbackItems.filter(f => !f.addressed).length}</span>
                </div>
                <div className="p-4 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Resolved</span>
                  <span className="font-serif italic text-2xl text-emerald-500">{feedbackItems.filter(f => f.addressed).length}</span>
                </div>
              </div>

              {/* Feedback Filter Toggle */}
              <div className="flex gap-2 border-b pb-4 mt-4 text-left" style={{ borderColor: ru }}>
                {['pending', 'resolved', 'all'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFeedbackFilter(mode)}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded cursor-pointer transition-all uppercase font-bold border ${
                      feedbackFilter === mode 
                        ? 'bg-[#9E7B4C]/10 border-[#9E7B4C] text-[#9E7B4C]' 
                        : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {mode === 'pending' ? 'Pending' : mode === 'resolved' ? 'Resolved' : 'All'}
                  </button>
                ))}
              </div>

              {feedbackLoading ? (
                <div className="text-center py-12 text-[#6A6560] font-mono text-xs animate-pulse">Loading feedback archive...</div>
              ) : filteredFeedbackItems.length === 0 ? (
                <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-neutral-800">
                  <p className="font-serif italic text-base text-[#6A6560] mb-2">No feedback found.</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/40">Visitor comments matching this filter will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredFeedbackItems.map(fb => (
                    <div
                      key={fb.id}
                      className="p-4 rounded-xl border flex flex-col gap-2 transition-all hover:bg-black/10 text-left"
                      style={{
                        borderColor: fb.addressed ? 'rgba(237,232,223,0.03)' : 'rgba(158,123,76,0.15)',
                        backgroundColor: fb.addressed ? 'transparent' : 'rgba(158,123,76,0.02)',
                        opacity: fb.addressed ? 0.6 : 1
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[1, 2, 3, 4, 5].map(n => (
                              <div key={n} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: n <= fb.rating ? ac : 'rgba(237,232,223,0.1)' }} />
                            ))}
                            <span className="text-[10px] font-mono text-[#6A6560]">{fb.rating}/5</span>
                            {fb.addressed && <span className="text-[8px] font-mono px-2 py-0.5 rounded text-emerald-500 bg-emerald-500/10">ADDRESSED</span>}
                          </div>
                          {fb.note && <p className="text-sm font-sans italic mt-2 text-neutral-300">"{fb.note}"</p>}
                          
                          {/* Visitor tags badge list */}
                          {fb.tags && fb.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {fb.tags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="text-[9px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-850 uppercase tracking-wider"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          <span className="text-[9px] font-mono text-[#6A6560] block mt-2">
                            {(() => {
                              try {
                                return new Date(fb.timestamp).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                });
                              } catch {
                                return fb.timestamp;
                              }
                            })()} · page: {fb.page}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                                setFeedbackItems(prev => prev.map(f => f.id === fb.id ? { ...f, addressed: !f.addressed } : f));
                                setToast({ text: `Feedback successfully marked as ${fb.addressed ? 'unread' : 'resolved'}!`, type: 'success' });
                              } catch { /* ignore */ }
                            }}
                            className="text-[10px] font-mono px-2.5 py-1 border rounded hover:bg-white/5 cursor-pointer text-[#9E7B4C] transition-all"
                            style={{ borderColor: 'rgba(158,123,76,0.3)' }}
                          >
                            {fb.addressed ? 'Reopen' : '✓ Resolve'}
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Delete this feedback?')) return;
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'DELETE' });
                                setFeedbackItems(prev => prev.filter(f => f.id !== fb.id));
                                setToast({ text: 'Feedback successfully deleted from database!', type: 'success' });
                              } catch { /* ignore */ }
                            }}
                            className="text-[10px] font-mono px-2.5 py-1 border rounded hover:bg-white/5 cursor-pointer text-red-500 transition-all"
                            style={{ borderColor: 'rgba(139,47,47,0.3)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: GitHub Sync Settings & Publishers */}
          {activeTab === 'github-sync' && (
            <div className="space-y-6">
              <div className="border-b pb-4 text-left" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">Settings & Sync</h2>
                <p className="text-xs text-[#6A6560] mt-1">Configure live deployment sync credentials and Gemini keys</p>
              </div>

              <div className="space-y-4 max-w-xl text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">GitHub Owner / Organization</label>
                  <input
                    type="text"
                    value={ghOwner}
                    onChange={e => {
                      setGhOwner(e.target.value);
                      setGhSyncSuccess(false);
                      localStorage.setItem('lore:github:success', 'false');
                    }}
                    placeholder="e.g. Mr-Hkds"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">GitHub Repository Name</label>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={e => {
                      setGhRepo(e.target.value);
                      setGhSyncSuccess(false);
                      localStorage.setItem('lore:github:success', 'false');
                    }}
                    placeholder="e.g. LORE"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Production Branch</label>
                  <input
                    type="text"
                    value={ghBranch}
                    onChange={e => {
                      setGhBranch(e.target.value);
                      setGhSyncSuccess(false);
                      localStorage.setItem('lore:github:success', 'false');
                    }}
                    placeholder="e.g. main"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">GitHub Personal Access Token (PAT)</label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={e => {
                      setGhToken(e.target.value);
                      setGhSyncSuccess(false);
                      localStorage.setItem('lore:github:success', 'false');
                    }}
                    placeholder="ghp_..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors font-mono"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Used strictly inside this browser context to commit stories to GitHub. Requires <code>repo</code> write scopes.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Gemini API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => {
                      setApiKey(e.target.value);
                      localStorage.setItem('lore:gemini:key', e.target.value);
                    }}
                    placeholder="AI content key VITE_GEMINI_API_KEY..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors font-mono"
                  />
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      const token = ghToken ? ghToken.trim() : '';
                      const owner = ghOwner ? ghOwner.trim() : '';
                      const repo = ghRepo ? ghRepo.trim() : '';
                      const branch = ghBranch ? ghBranch.trim() : '';

                      if (!token) {
                        alert('Personal access token required.');
                        return;
                      }
                      setIsPublishing(true);
                      setPublishStatus('Testing connection...');
                      try {
                        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json'
                          }
                        });
                        if (res.ok) {
                          setGhSyncSuccess(true);
                          localStorage.setItem('lore:github:success', 'true');
                          setPublishStatus('Connection verified! Saving configuration file...');
                          const configContent = JSON.stringify({
                            tok: tokenToStored(token),
                            geminiKey: apiKey ? tokenToStored(apiKey) : '',
                            owner,
                            repo,
                            branch,
                            updated: new Date().toISOString()
                          }, null, 2);
                          try {
                            await commitFilesToGitHub(
                              [{ path: 'config/admin_config.json', content: configContent }],
                              'config: update admin credentials [skip ci]'
                            );
                            setToast({ text: `Successfully connected and credentials synchronized with remote repository.`, type: 'success' });
                          } catch (commitErr) {
                            setToast({ text: `Connected. Config could not write: ${commitErr.message}`, type: 'success' });
                          }
                        } else {
                          const errData = await res.json();
                          setToast({ text: `Sync verification failed: ${errData.message || res.statusText}`, type: 'error' });
                          setGhSyncSuccess(false);
                          localStorage.setItem('lore:github:success', 'false');
                        }
                      } catch (err) {
                        setToast({ text: `Sync verification failed: ${err.message}`, type: 'error' });
                        setGhSyncSuccess(false);
                        localStorage.setItem('lore:github:success', 'false');
                      } finally {
                        setIsPublishing(false);
                        setPublishStatus('');
                      }
                    }}
                    disabled={isPublishing}
                    className="px-4 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-mono font-bold uppercase rounded-lg active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer"
                  >
                    {isPublishing ? publishStatus || 'Validating...' : 'Verify & Save Credentials'}
                  </button>

                  <div className="p-3 rounded-lg border flex items-center gap-3" style={{ borderColor: ghSyncSuccess ? 'rgba(16,185,129,0.25)' : 'rgba(237,232,223,0.07)', backgroundColor: ghSyncSuccess ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                    <span className="text-sm" style={{ color: ghSyncSuccess ? '#10B981' : '#6A6560' }}>
                      {ghSyncSuccess ? '✓' : '○'}
                    </span>
                    <span className="text-[10px] font-mono tracking-wider" style={{ color: ghSyncSuccess ? '#10B981' : '#6A6560' }}>
                      {ghSyncSuccess ? `Connected · ${ghOwner}/${ghRepo}:${ghBranch}` : 'Not connected — configure token and verify'}
                    </span>
                  </div>

                  {isLocal && ghSyncSuccess && (
                    <div className="mt-8 pt-6 border-t border-neutral-800 flex flex-col gap-4 text-left">
                      <h4 className="text-[11px] font-mono tracking-widest uppercase text-[#9E7B4C] font-bold">
                        Publish Local Content to Live Website
                      </h4>
                      <p className="text-[10px] text-[#8F8A82] leading-relaxed">
                        Push all your local database edits, deleted items, and feedback lists from this computer directly to the live GitHub production branch.
                      </p>
                      <div>
                        <button
                          onClick={handleSyncLocalToGitHub}
                          disabled={isPublishing}
                          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-mono font-bold uppercase rounded-lg active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer flex items-center gap-2"
                        >
                          <span>🚀</span>
                          {isPublishing ? 'Publishing changes...' : 'Publish Archive updates to GitHub'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {isPublishing && (
                <div className="p-4 rounded-xl border border-[#9E7B4C]/20 bg-[#9E7B4C]/5 text-[#EDE8DF] text-xs font-mono animate-pulse text-left">
                  {publishStatus}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* Floating Toast Notification overlay */}
      {toast && (
        <div 
          className="fixed bottom-6 right-6 z-[9999] px-6 py-4 rounded-xl border backdrop-blur-md flex items-center gap-3 animate-fade-in transition-all duration-300 max-w-sm shadow-xl"
          style={{ 
            backgroundColor: toast.type === 'error' ? 'rgba(239,68,68,0.1)' : toast.type === 'warning' ? 'rgba(196,100,74,0.1)' : 'rgba(158,123,76,0.1)', 
            borderColor: toast.type === 'error' ? '#EF4444' : toast.type === 'warning' ? '#C4644A' : '#9E7B4C',
          }}
        >
          <span className="text-sm select-none">
            {toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠' : '✓'}
          </span>
          <p className="text-xs font-mono tracking-wider uppercase leading-relaxed text-left" style={{ color: fg }}>
            {toast.text}
          </p>
          <button 
            onClick={() => setToast(null)} 
            className="text-[9px] font-mono tracking-widest uppercase hover:opacity-60 cursor-pointer ml-auto text-neutral-400"
          >
            [Close]
          </button>
        </div>
      )}
    </div>
  );
}
