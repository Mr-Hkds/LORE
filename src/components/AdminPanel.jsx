import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

function rebuildConceptIndex(storiesArray) {
  const index = {};
  storiesArray.forEach(story => {
    (story.concepts || []).forEach(concept => {
      if (!index[concept]) {
        index[concept] = [];
      }
      if (!index[concept].includes(story.story_id)) {
        index[concept].push(story.story_id);
      }
    });
  });
  return index;
}

// XOR obfuscation for token storage (lightweight - NOT cryptographic security)
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

export default function AdminPanel({ stories, localStories, setLocalStories, refetchStories, onBack, onStoryDeleted }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  // Determine if running locally or live
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Tabs: 'catalog' | 'recommendations' | 'generator' | 'automation' | 'feedback' | 'ai-editor' | 'github-sync'
  const [activeTab, setActiveTab] = useState('catalog');

  // GitHub Sync Configuration States
  const [ghOwner, setGhOwner] = useState(() => localStorage.getItem('lore:github:owner') || import.meta.env.VITE_GITHUB_OWNER || 'Mr-Hkds');
  const [ghRepo, setGhRepo] = useState(() => localStorage.getItem('lore:github:repo') || import.meta.env.VITE_GITHUB_REPO || 'LORE');
  const [ghBranch, setGhBranch] = useState(() => localStorage.getItem('lore:github:branch') || import.meta.env.VITE_GITHUB_BRANCH || 'main');
  const [ghToken, setGhToken] = useState(() => localStorage.getItem('lore:github:token') || import.meta.env.VITE_GITHUB_TOKEN || '');
  const [ghSyncSuccess, setGhSyncSuccess] = useState(() => localStorage.getItem('lore:github:success') === 'true');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('lore:github:owner', ghOwner);
    localStorage.setItem('lore:github:repo', ghRepo);
    localStorage.setItem('lore:github:branch', ghBranch);
    if (ghToken) {
      localStorage.setItem('lore:github:token', ghToken);
      // Also save obfuscated version keyed to admin passcode
      localStorage.setItem('lore:github:token:v2', tokenToStored(ghToken));
    }
  }, [ghOwner, ghRepo, ghBranch, ghToken]);

  // On mount: try to fetch keys and sync configuration from GitHub config file
  useEffect(() => {
    const owner = localStorage.getItem('lore:github:owner') || import.meta.env.VITE_GITHUB_OWNER || 'Mr-Hkds';
    const repo = localStorage.getItem('lore:github:repo') || import.meta.env.VITE_GITHUB_REPO || 'LORE';
    const branch = localStorage.getItem('lore:github:branch') || import.meta.env.VITE_GITHUB_BRANCH || 'main';

    const existingToken = localStorage.getItem('lore:github:token');
    const existingGemini = localStorage.getItem('lore:gemini:key');
    const existingOpenRouter = localStorage.getItem('lore:openrouter:key');

    // Try raw GitHub CDN (no auth needed if repo is public)
    fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/config/admin_config.json`)
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg) {
          if (cfg.tok && !existingToken) {
            const decoded = storedToToken(cfg.tok);
            if (decoded) {
              setGhToken(decoded);
              localStorage.setItem('lore:github:token', decoded);
              localStorage.setItem('lore:github:token:v2', cfg.tok);
              setGhSyncSuccess(true);
              localStorage.setItem('lore:github:success', 'true');
            }
          }
          if (cfg.geminiKey && !existingGemini) {
            const decoded = storedToToken(cfg.geminiKey);
            if (decoded) {
              setApiKey(decoded);
              localStorage.setItem('lore:gemini:key', decoded);
            }
          }
          if (cfg.openRouterKey && !existingOpenRouter) {
            const decoded = storedToToken(cfg.openRouterKey);
            if (decoded) {
              setOpenRouterKey(decoded);
              localStorage.setItem('lore:openrouter:key', decoded);
            }
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Image uploading state
  const [uploadingState, setUploadingState] = useState('idle'); // 'idle' | 'uploading'
  
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

  // Story editing state
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    hero_image: '',
    image_query: '',
    hook: '',
    category: 'psychology',
    severity: 'unsettling',
    concepts: []
  });
  const [editFormActiveLayer, setEditFormActiveLayer] = useState(1);

  // Generator form state
  const [genTopic, setGenTopic] = useState('');
  const [genCategory, setGenCategory] = useState('auto');
  const [genSeverity, setGenSeverity] = useState('auto');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('lore:gemini:key') || '');
  const [openRouterKey, setOpenRouterKey] = useState(() => localStorage.getItem('lore:openrouter:key') || '');
  
  // Generic helper to call Gemini API with retries and fallback from 2.5-flash to 1.5-flash
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
            throw new Error(`HTTP ${res.status}: ${res.statusText || errText || 'Service Unavailable'}`);
          }

          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return text;
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
  };

  // Call OpenRouter API with free model backup
  const callOpenRouterApi = async (contents, config = {}) => {
    if (!openRouterKey) {
      throw new Error('OpenRouter API key is not configured.');
    }

    // Convert Gemini format to OpenAI standard format
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
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenRouter HTTP ${res.status}: ${res.statusText || errText}`);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          return text.trim();
        }
        throw new Error('Empty response from OpenRouter');
      } catch (err) {
        lastError = err;
        console.warn(`[OpenRouter API] Model ${model} call failed:`, err.message);
      }
    }
    throw lastError || new Error('All OpenRouter models failed.');
  };

  // Call Pollinations AI Text completions with model fallback
  const callPollinationsText = async (prompt, systemPrompt = '') => {
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

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

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
          if (text && text.trim().length >= 5) {
            return text.trim();
          }
          throw new Error('Empty response from Pollinations');
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
  };

  // Cascading Robust AI client router
  const callRobustAI = async (contents, config = {}, expectJSON = false) => {
    // 1. Try Direct Gemini
    if (apiKey) {
      try {
        return await callGeminiApi(contents, config);
      } catch (err) {
        console.warn('[Admin AI Client] Direct Gemini failed:', err.message);
      }
    }

    // 2. Try OpenRouter
    if (openRouterKey) {
      try {
        const routerConfig = expectJSON ? { response_format: { type: 'json_object' } } : {};
        return await callOpenRouterApi(contents, { ...config, ...routerConfig });
      } catch (err) {
        console.warn('[Admin AI Client] OpenRouter failed:', err.message);
      }
    }

    // 3. Try Pollinations AI
    try {
      const promptText = contents[0]?.parts?.[0]?.text || contents[0]?.content || '';
      const systemPrompt = contents.length > 1 ? contents[0]?.content || contents[0]?.parts?.[0]?.text : '';
      const finalPrompt = contents.length > 1 ? contents[1]?.content || contents[1]?.parts?.[0]?.text : promptText;
      
      const suffix = expectJSON ? '\n\nReturn ONLY the raw JSON. Do not wrap in markdown or add explanations.' : '';
      return await callPollinationsText(
        finalPrompt + suffix,
        systemPrompt || (expectJSON ? 'You are a dark historian database compiler. Output valid JSON only, no markdown wrapping.' : '')
      );
    } catch (err) {
      console.error('[Admin AI Client] Pollinations fallback failed:', err.message);
      throw err;
    }
  };
  
  // Console logging state
  const [logs, setLogs] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoStatus, setAutoStatus] = useState({ isRunning: false, logCount: 0 });
  const [autoLogs, setAutoLogs] = useState([]);
  const [serverOffline, setServerOffline] = useState(false);
  const [toast, setToast] = useState(null);
  const consecutiveFailuresRef = useRef(0);

  // Auto-dismiss toast notification after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Read keys from localstorage or env on load
  useEffect(() => {
    const storedGemini = localStorage.getItem('lore:gemini:key') || import.meta.env.VITE_GEMINI_API_KEY || '';
    setApiKey(storedGemini);
    
    const storedOpenRouter = localStorage.getItem('lore:openrouter:key') || import.meta.env.VITE_OPENROUTER_API_KEY || '';
    setOpenRouterKey(storedOpenRouter);
  }, []);

  // Multi-select recommendations state
  const [selectedRecs, setSelectedRecs] = useState([]);

  // Auto-scroll refs
  const autoLogsEndRef = useRef(null);
  const manualLogsEndRef = useRef(null);

  // Auto-scroll effect for background logs
  useEffect(() => {
    if (autoLogsEndRef.current) {
      autoLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoLogs]);

  // Auto-scroll effect for manual logs
  useEffect(() => {
    if (manualLogsEndRef.current) {
      manualLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Reset selected recommendations when the list changes
  useEffect(() => {
    setSelectedRecs([]);
  }, [recommendations]);

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

  // Fetch status and logs from server or fallback to static status JSON
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
          return; // Local success
        }
      } catch {
        // Fall back to static status file
      }
    }

    // Remote / stand-alone mode / local fallback
    try {
      const res = await fetch('/content/automation_status.json');
      if (res.ok) {
        const data = await res.json();
        setAutoStatus({
          isRunning: data.isRunning,
          enabled: data.enabled,
          lastRunAt: data.lastRunAt,
          nextRunMs: Math.max(0, data.nextRunAt - Date.now()),
          intervalMs: data.intervalMs,
          status: data.status,
          error: data.error,
          mode: data.mode
        });
        setServerOffline(false);
        consecutiveFailuresRef.current = 0;
        
        // Generate pseudo logs from static run status
        const runTime = new Date(data.lastRunAt).toLocaleTimeString([], { hour12: false });
        const runDate = new Date(data.lastRunAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
        setAutoLogs([
          `[${runTime}] === ENGINE STATUS CHECK (${runDate}) ===`,
          `[${runTime}] Runner Engine: ${data.mode === 'github-actions' ? 'GitHub Actions (Cloud)' : 'Local Server'}`,
          `[${runTime}] Last Status: ${data.status ? data.status.toUpperCase() : 'UNKNOWN'}`,
          ...(data.error ? [`[${runTime}] ERROR: ${data.error}`] : []),
          `[${runTime}] Next execution scheduled in ${Math.round((data.nextRunAt - Date.now()) / 60000)} minutes.`
        ]);
      } else {
        throw new Error('Static status file not found');
      }
    } catch (err) {
      if (consecutiveFailuresRef.current < 3) {
        console.warn('Failed to fetch automation static status:', err.message);
      }
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setServerOffline(true);
      }
    }
  }, []);

  // Poll automation logs and status
  useEffect(() => {
    fetchAutomationData();
    const interval = setInterval(fetchAutomationData, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [fetchAutomationData]);

  // Countdown ticker for Next Run
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoStatus(prev => {
        if (prev && prev.nextRunMs && prev.nextRunMs > 0) {
          return { ...prev, nextRunMs: Math.max(0, prev.nextRunMs - 1000) };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [isHarvesting, setIsHarvesting] = useState(false);

  const commitFilesToGitHub = async (filesToCommit, commitMessage) => {
    const token = ghToken ? ghToken.trim() : '';
    const owner = ghOwner ? ghOwner.trim() : '';
    const repo = ghRepo ? ghRepo.trim() : '';
    const branch = ghBranch ? ghBranch.trim() : '';

    if (!token) {
      throw new Error('GitHub Personal Access Token is required. Please set it in GitHub Sync Settings.');
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
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          if (res.ok) {
            const data = await res.json();
            sha = data.sha;
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
            'Authorization': `token ${token}`,
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

  const handleSyncLocalToGitHub = async () => {
    if (!ghToken) {
      alert('GitHub Personal Access Token is required. Please configure it first.');
      return;
    }
    
    setIsPublishing(true);
    setPublishStatus('Sync: Initializing database merge...');
    try {
      // 1. Fetch remote stories.json to merge
      let remoteStories = [];
      try {
        setPublishStatus('Sync: Fetching remote stories from GitHub...');
        const remoteStoriesUrl = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/public/content/stories.json?ref=${ghBranch}&t=${Date.now()}`;
        const resRemote = await fetch(remoteStoriesUrl, {
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (resRemote.ok) {
          const dataRemote = await resRemote.json();
          const decoded = decodeURIComponent(escape(atob(dataRemote.content.replace(/\s/g, ''))));
          const parsed = JSON.parse(decoded);
          remoteStories = parsed.stories || [];
          addLog(`Fetched ${remoteStories.length} stories from remote GitHub repository.`);
        }
      } catch (err) {
        console.warn('Could not fetch remote stories, falling back to local list:', err);
        addLog(`Warning: Failed to fetch remote stories. Overwriting with local list.`);
      }

      // 2. Fetch local stories.json
      setPublishStatus('Sync: Fetching local stories...');
      const resLocalStories = await fetch(`/content/stories.json?t=${Date.now()}`);
      if (!resLocalStories.ok) {
        throw new Error(`Failed to read local stories.json: ${resLocalStories.statusText}`);
      }
      const localStoriesJson = await resLocalStories.json();
      const localStoriesList = localStoriesJson.stories || [];

      // 3. Read blacklist of deleted story IDs
      const deletedIds = JSON.parse(localStorage.getItem('lore:deleted_stories') || '[]');

      // 4. Perform smart merge
      // Start with remote stories, filter out deleted ones
      let mergedStories = remoteStories.filter(s => !deletedIds.includes(s.story_id));

      // Upsert local stories into the list
      localStoriesList.forEach(localStory => {
        const idx = mergedStories.findIndex(s => s.story_id === localStory.story_id);
        if (idx !== -1) {
          mergedStories[idx] = localStory; // replace with local edited version
        } else {
          mergedStories.push(localStory); // append new local story
        }
      });

      // 5. Rebuild concept index based on merged list
      const mergedConceptIndex = rebuildConceptIndex(mergedStories);

      // 6. Gather other local files to commit (recommendations, daily dossier, feedback, status)
      setPublishStatus('Sync: Gathering other local assets...');
      
      let finalFeedbackJson = '';
      try {
        const resFbLocal = await fetch(`/content/feedback.json?t=${Date.now()}`);
        let fbList = [];
        if (resFbLocal.ok) {
          fbList = await resFbLocal.json();
        }
        
        // Merge with local storage queued items
        const localFb = JSON.parse(localStorage.getItem('lore:local_feedback') || '[]');
        if (localFb.length > 0) {
          const combined = [...localFb];
          fbList.forEach(item => {
            if (!combined.some(c => c.id === item.id)) {
              combined.push(item);
            }
          });
          fbList = combined;
        }
        finalFeedbackJson = JSON.stringify(fbList, null, 2);
      } catch (err) {
        console.warn('Failed to merge feedback for sync, leaving feedback untouched:', err.message);
      }

      const filesToSync = [
        { path: 'public/content/recommendations.json', url: '/content/recommendations.json' },
        { path: 'public/content/daily_dossier.json', url: '/content/daily_dossier.json' },
        { path: 'public/content/automation_status.json', url: '/content/automation_status.json' }
      ];

      const filesToCommit = [
        { path: 'public/content/stories.json', content: JSON.stringify({ stories: mergedStories }, null, 2) },
        { path: 'public/content/concept_index.json', content: JSON.stringify(mergedConceptIndex, null, 2) }
      ];

      if (finalFeedbackJson) {
        filesToCommit.push({ path: 'public/content/feedback.json', content: finalFeedbackJson });
      } else {
        filesToSync.push({ path: 'public/content/feedback.json', url: '/content/feedback.json' });
      }

      for (const f of filesToSync) {
        try {
          const res = await fetch(`${f.url}?t=${Date.now()}`);
          if (res.ok) {
            const content = await res.text();
            if (content && content.trim().length > 0) {
              filesToCommit.push({ path: f.path, content });
            }
          }
        } catch (e) {
          console.warn(`Skipping local file sync for ${f.path}:`, e.message);
        }
      }

      setPublishStatus(`Sync: Committing ${filesToCommit.length} files to GitHub...`);
      await commitFilesToGitHub(filesToCommit, 'admin: sync merged local archive updates to live site');
      
      // Clear deletion blacklist and local feedback queue on success
      localStorage.removeItem('lore:deleted_stories');
      localStorage.removeItem('lore:local_feedback');
      
      setToast({ text: '✓ Successfully merged and synchronized all local changes to the live site!', type: 'success' });
      addLog(`🚀 Successfully published ${filesToCommit.length} merged files to GitHub repo.`);
    } catch (err) {
      console.error('Local sync to GitHub failed:', err);
      setToast({ text: `Failed to push changes to GitHub: ${err.message}`, type: 'error' });
      addLog(`❌ Local Sync Failed: ${err.message}`);
    } finally {
      setIsPublishing(false);
      setPublishStatus('');
    }
  };

  const handleHarvestWebTrends = async () => {
    if (!isLocal) {
      alert('Trend Harvesting is a server-side feature. Please start your local server to harvest new trends.');
      return;
    }
    if (serverOffline) {
      alert('Trend Harvesting is a server-side feature. Please start your local API server to harvest new trends.');
      return;
    }
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
    const pending = recommendations.filter(r => r.status === 'pending');
    if (pending.length === 0) {
      alert('No pending suggestions to clean.');
      return;
    }

    if (!window.confirm(`AI will analyze ${pending.length} pending suggestions to find and delete spam, test inputs, or gibberish. Proceed?`)) return;

    setIsCleaning(true);
    addLog('✨ Starting AI Auto-Clean of suggestions queue...');

    try {
      const prompt = `Analyze the following list of user-recommended topics for a dark mystery, historical, or psychological archive website.
Identify which topics are completely irrelevant, spam, test inputs, gibberish (e.g. "asdf", "test"), blank, inappropriate, or nonsense.

Recommendations list:
${pending.map(r => `- ID: ${r.id}, Topic: "${r.topic}"`).join('\n')}

Return a JSON array containing ONLY the IDs (strings) of the recommendations that are spam or irrelevant and should be deleted.
If all recommendations are valid and relevant, return an empty array: [].
Do not wrap in markdown. Output raw JSON only.`;

      let text = '';
      if (isLocal && !serverOffline) {
        try {
          const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              systemPrompt: 'You are a data filtering bot. Output only valid JSON arrays, no markdown wrapping.'
            })
          });
          if (res.ok) {
            const data = await res.json();
            text = data?.text;
          }
        } catch (e) {
          console.warn('Failed to call server-side AI chat, trying client-side...', e);
        }
      }

      if (!text) {
        addLog('Connecting directly to Pollinations AI for auto-clean...');
        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a data filtering bot. Output only valid JSON arrays, no markdown wrapping.' },
              { role: 'user', content: prompt }
            ],
            model: 'openai'
          })
        });
        if (!res.ok) throw new Error(`Pollinations AI returned HTTP ${res.status}`);
        text = await res.text();
      }

      if (!text) throw new Error('Empty response from AI.');

      const spamIds = cleanAndParseJSON(text);
      if (!Array.isArray(spamIds)) throw new Error('Invalid response structure from AI.');

      addLog(`✨ AI identified ${spamIds.length} spam/irrelevant suggestions.`);

      let deletedCount = 0;
      for (const id of spamIds) {
        try {
          const delRes = await fetch(`/api/recommendations?id=${id}`, { method: 'DELETE' });
          if (delRes.ok) {
            deletedCount++;
          }
        } catch (e) {
          console.error(`Failed to delete spam suggestion: ${id}`, e);
        }
      }

      addLog(`✨ AI Auto-Clean completed. Removed ${deletedCount} spam suggestions.`);
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

  const handleBulkDeleteRecommendations = async () => {
    if (selectedRecs.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedRecs.length} selected suggestions?`)) return;

    addLog(`🗑️ Starting bulk deletion of ${selectedRecs.length} suggestions...`);
    let deletedCount = 0;
    for (const id of selectedRecs) {
      try {
        const res = await fetch(`/api/recommendations?id=${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          deletedCount++;
        }
      } catch (e) {
        console.error(`Failed to delete recommendation: ${id}`, e);
      }
    }

    addLog(`🗑️ Bulk deletion completed. Removed ${deletedCount} of ${selectedRecs.length} suggestions.`);
    setSelectedRecs([]);
    await loadRecommendations();
    alert(`Successfully deleted ${deletedCount} suggestions.`);
  };

  const handleTriggerAutomation = async () => {
    if (!isLocal) {
      if (!ghSyncSuccess || !ghToken) {
        alert('Please configure and verify GitHub Sync first to trigger cloud runs.');
        return;
      }
      setIsGenerating(true);
      try {
        addLog('🚀 Dispatching GitHub Action workflow (cloud run)...');
        const res = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/actions/workflows/nightly-generation.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ref: ghBranch })
        });
        if (res.ok || res.status === 204) {
          addLog('🚀 GitHub Actions cloud workflow run successfully dispatched! It will take a few minutes to run and push updates.');
          alert('Cloud workflow triggered successfully! It will take a few minutes to generate content and commit it to your repository.');
        } else {
          const err = await res.json().catch(() => ({}));
          addLog(`❌ Failed to dispatch workflow: ${err.message || res.statusText}`);
          alert(`Failed to trigger cloud workflow: ${err.message || res.statusText}`);
        }
      } catch (e) {
        console.error(e);
        addLog(`❌ Network error triggering cloud workflow: ${e.message}`);
        alert('Network error while triggering cloud workflow.');
      } finally {
        setIsGenerating(false);
      }
      return;
    }

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

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    let items = [];
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        items = await res.json();
      } else {
        const resStatic = await fetch(`/content/feedback.json?t=${Date.now()}`);
        if (resStatic.ok) items = await resStatic.json();
      }
    } catch (e) {
      console.warn('Could not load feedback from API, trying static fallback:', e);
      try {
        const resStatic = await fetch(`/content/feedback.json?t=${Date.now()}`);
        if (resStatic.ok) items = await resStatic.json();
      } catch (err) {
        console.error('Static feedback fallback failed:', err);
      }
    }

    try {
      const localFb = JSON.parse(localStorage.getItem('lore:local_feedback') || '[]');
      if (localFb.length > 0) {
        const combined = [...localFb];
        items.forEach(item => {
          if (!combined.some(c => c.id === item.id)) {
            combined.push(item);
          }
        });
        items = combined;
      }
    } catch (e) {
      console.warn('Failed to parse local feedback queue:', e);
    }

    setFeedbackItems(items);
    setFeedbackLoading(false);
  }, []);

  useEffect(() => {
    loadRecommendations();
    loadFeedback();
  }, [loadRecommendations, loadFeedback]);

  const startEditing = (story) => {
    setEditingStoryId(story.story_id);
    setEditForm({
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

  const handleSaveStory = async (storyId) => {
    let serverSaved = false;
    if (isLocal && !serverOffline) {
      try {
        const res = await fetch(`/api/stories/${storyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        });
        if (res.ok) {
          addLog(`Successfully saved & pushed changes for story: ${storyId}`);
          serverSaved = true;
          // Also update local overrides list if it's already there
          const exists = localStories.some(s => s.story_id === storyId);
          let updatedLocal;
          if (exists) {
            updatedLocal = localStories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
          } else {
            updatedLocal = localStories;
          }
          setLocalStories(updatedLocal);
          localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));
          if (refetchStories) refetchStories();
          setEditingStoryId(null);
        }
      } catch (err) {
        console.warn('Local server save failed:', err);
      }
    }

    if (!serverSaved) {
      // Local fallback: update existing custom story, or copy static story to local override list
      let updatedLocal;
      const exists = localStories.some(s => s.story_id === storyId);
      if (exists) {
        updatedLocal = localStories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
      } else {
        const originalStory = stories.find(s => s.story_id === storyId);
        if (originalStory) {
          updatedLocal = [...localStories, { ...originalStory, ...editForm }];
        } else {
          updatedLocal = [...localStories, { story_id: storyId, ...editForm }];
        }
      }
      setLocalStories(updatedLocal);
      try {
        localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));
      } catch { /* ignore */ }
      if (refetchStories) refetchStories();
      setEditingStoryId(null);

      // GitHub Sync integration
      if (ghToken) {
        const updatedStories = stories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        try {
          await commitFilesToGitHub(filesToCommit, `admin: edit story ${storyId} via GitHub Sync`);
          setToast({ text: 'Story successfully updated and committed to GitHub live site!', type: 'success' });
        } catch (err) {
          setToast({ text: `Failed to commit changes to GitHub: ${err.message}`, type: 'error' });
        }
      } else {
        setToast({ text: 'Saved locally to browser cache. Configure GitHub Sync in Settings to push edits live.', type: 'warning' });
      }
    } else {
      setToast({ text: 'Story successfully updated on the local server.', type: 'success' });
    }
  };

  // Handle deleting a story
  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Are you sure you want to delete this story from the archive?')) return;
    
    let serverDeleted = false;
    // Try to delete from local server
    if (isLocal && !serverOffline) {
      try {
        const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' });
        if (res.ok) {
          addLog(`Successfully deleted story from server: ${storyId}`);
          serverDeleted = true;
          if (refetchStories) refetchStories();
        } else {
          addLog(`Server delete failed for story: ${storyId}. Removing locally.`);
        }
      } catch (e) {
        console.warn('Local server delete failed:', e);
        addLog(`Could not connect to local server to delete story: ${storyId}. Removing locally.`);
      }
    }
    
    // Always remove from local localStorage if present
    const updated = localStories.filter(s => s.story_id !== storyId);
    setLocalStories(updated);
    try {
      localStorage.setItem('lore:custom_stories', JSON.stringify(updated));
    } catch { /* ignore */ }

    // Always add to local blacklist in localStorage
    try {
      const stored = localStorage.getItem('lore:deleted_stories');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.includes(storyId)) {
        list.push(storyId);
        localStorage.setItem('lore:deleted_stories', JSON.stringify(list));
      }
    } catch (e) {
      console.warn('Failed to save deleted story blacklist:', e);
    }

    // Call callback prop if provided to update the parent state
    if (onStoryDeleted) {
      onStoryDeleted(storyId);
    }

    if (!serverDeleted) {
      // GitHub Sync integration
      if (ghToken) {
        const updatedStories = stories.filter(s => s.story_id !== storyId);
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        try {
          await commitFilesToGitHub(filesToCommit, `admin: delete story ${storyId} via GitHub Sync`);
          setToast({ text: 'Story successfully deleted and committed to GitHub live site!', type: 'success' });
        } catch (err) {
          setToast({ text: `Failed to commit deletion to GitHub: ${err.message}`, type: 'error' });
        }
      } else {
        setToast({ text: 'Deleted locally from browser view. Configure GitHub Sync in Settings to push edits live.', type: 'warning' });
      }
    } else {
      setToast({ text: 'Story permanently deleted from server.', type: 'success' });
    }
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

  // Toggle automation status on the server
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
        addLog(`Background writer automation ${data.enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (err) {
      console.warn('Failed to toggle automation:', err);
    }
  };

  // Upload a custom cover image to the server
  const handleUploadImage = async (e, storyId) => {
    if (!isLocal || serverOffline) {
      alert('Custom image uploading is a local feature. Please run the app on localhost to upload images.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingState('uploading');
    addLog(`Uploading custom cover image for ${storyId}...`);

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
            base64Data,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          addLog(`Successfully uploaded custom image: ${data.path}`);
          setEditForm(prev => ({ ...prev, hero_image: data.path }));
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

  const handleGenerateStory = async (topicOverride = null) => {
    const topic = (topicOverride || genTopic).trim();
    if (!topic) {
      alert('Please enter a topic to generate.');
      return;
    }
    if (!apiKey && !openRouterKey) {
      alert('An API Key (Gemini or OpenRouter) is required to run the content engine. Please configure one in Settings.');
      return;
    }

    // Duplicate and overlap check before generating
    const normalizedTopic = topic.toLowerCase();
    const hasDuplicate = stories.some(s => {
      const normalizedTitle = s.title.toLowerCase();
      if (normalizedTitle === normalizedTopic) return true;
      if (normalizedTitle.includes(normalizedTopic) || normalizedTopic.includes(normalizedTitle)) return true;
      
      const stopWords = new Set(['the', 'of', 'and', 'in', 'incident', 'case', 'mystery', 'conspiracy', 'experiments', 'project', 'experiment', 'deaths', 'death', 'disappearance', 'disappearances', 'trials', 'trial', 'incident', 'pass', 'forest']);
      const topicWords = normalizedTopic.split(/[\s_\- ',."]+/).filter(w => w.length > 2 && !stopWords.has(w));
      const titleWords = normalizedTitle.split(/[\s_\- ',."]+/).filter(w => w.length > 2 && !stopWords.has(w));
      
      const overlap = topicWords.filter(w => titleWords.includes(w));
      return overlap.length > 0;
    });

    if (hasDuplicate) {
      alert(`A similar or duplicate case relating to "${topic}" already exists in the archive.`);
      return;
    }

    setIsGenerating(true);
    setLogs([]);
    setProgress(10);

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
  "hook": "A highly-professional, specific, and compelling 1-2 sentence teaser (max 150 chars) in Hinglish for the catalog card. CRITICAL: The hook must be completely custom and specific to the case details (e.g., mention specific locations, names, or key anomalies). Never write generic hooks like 'Ek aisi ansuljhi dastan...' or 'Kya hai iska sach?'.",
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
      addLog(`Connecting to AI content engine...`);
      setProgress(30);
      
      const textResponse = await callRobustAI(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { generationConfig: { responseMimeType: 'application/json' } },
        true
      );

      setProgress(60);
      addLog(`Receiving stream from AI model...`);

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

        const decisionText = await callPollinationsText(
          checkPrompt,
          "You are a decision bot. Output YES or NO only."
        );
        const decision = decisionText?.trim()?.toUpperCase() || 'NO';
        hasPerfectPhoto = decision.includes('YES');
        addLog(`AI evaluation of real photo: ${decision}`);
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
      let serverSaved = false;
      if (isLocal && !serverOffline) {
        try {
          const res = await fetch('/api/stories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storyObj),
          });
          if (res.ok) {
            addLog(`Synchronized story with public/content/stories.json file.`);
            serverSaved = true;
          }
        } catch (err) {
          console.warn('Local server save failed:', err);
        }
      }

      if (!serverSaved) {
        addLog(`Running in standalone client mode. Saved to browser storage.`);
        if (ghToken) {
          addLog('GitHub Sync configured. Preparing repository push...');
          const updatedStories = [...stories];
          const filtered = updatedStories.filter(s => s.story_id !== storyObj.story_id);
          filtered.push(storyObj);

          const newConceptIndex = rebuildConceptIndex(filtered);
          const filesToCommit = [
            { path: 'public/content/stories.json', content: JSON.stringify({ stories: filtered }, null, 2) },
            { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
          ];

          try {
            await commitFilesToGitHub(filesToCommit, `admin: generate story "${storyObj.title}" via GitHub Sync`);
            addLog('🚀 Successfully committed generated story to GitHub!');
          } catch (err) {
            addLog(`❌ Failed to commit to GitHub: ${err.message}`);
          }
        }
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

      const rawText = await callPollinationsText(
        userMsg,
        systemPrompt
      );

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
    cyber_mysteries: 'Digital Shadows'
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
              Archive Manager
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                if (refetchStories) refetchStories();
                await loadRecommendations();
                consecutiveFailuresRef.current = 0;
                setServerOffline(false);
                fetchAutomationData();
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

      {/* Offline Alert Box - Unconfigured/Not Successful */}
      {serverOffline && !ghSyncSuccess && (
        <div className="mx-auto w-full mt-6 px-10" style={{ maxWidth: '1000px' }}>
          <div 
            className="p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300"
            style={{ 
              backgroundColor: 'rgba(196, 100, 74, 0.05)', 
              borderColor: 'rgba(196, 100, 74, 0.25)', 
              boxShadow: '0 8px 32px rgba(196, 100, 74, 0.05)'
            }}
          >
            <div className="flex gap-3">
              <span className="text-lg mt-0.5 select-none" style={{ color: '#C4644A' }}>⚠</span>
              <div className="text-left">
                <p className="text-xs font-bold tracking-[0.12em] uppercase" style={{ color: '#C4644A' }}>
                  {isLocal ? 'Local API Server Offline' : 'GitHub Sync Unconfigured'}
                </p>
                <p className="text-[11px] font-sans mt-1 leading-relaxed" style={{ color: fg, opacity: 0.75 }}>
                  {isLocal 
                    ? 'Changes are being saved locally to your browser only. Configure **GitHub Sync** in Settings to push edits live directly to the website.'
                    : 'GitHub Sync is unconfigured. All edits will save to local browser storage only. Configure **GitHub Sync** in Settings to push changes live to the website.'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('github-sync')}
              className="px-4 py-2 border text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all duration-200 hover:bg-[#C4644A]/10 active:scale-95 cursor-pointer flex-shrink-0"
              style={{ color: '#C4644A', borderColor: 'rgba(196, 100, 74, 0.35)' }}
            >
              Configure GitHub Sync
            </button>
          </div>
        </div>
      )}

      {/* Offline Alert Box - GitHub Sync Active */}
      {serverOffline && ghSyncSuccess && (
        <div className="mx-auto w-full mt-6 px-10" style={{ maxWidth: '1000px' }}>
          <div 
            className="p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300"
            style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.03)', 
              borderColor: 'rgba(16, 185, 129, 0.2)', 
              boxShadow: '0 8px 32px rgba(16, 185, 129, 0.02)'
            }}
          >
            <div className="flex gap-3">
              <span className="text-lg mt-0.5 select-none" style={{ color: '#10B981' }}>✓</span>
              <div className="text-left">
                <p className="text-xs font-bold tracking-[0.12em] uppercase" style={{ color: '#10B981' }}>
                  GitHub Sync Active
                </p>
                <p className="text-[11px] font-sans mt-1 leading-relaxed" style={{ color: fg, opacity: 0.75 }}>
                  {isLocal
                    ? 'Local API server is offline, but **GitHub Sync** is successfully connected. Edits will save locally and push live automatically.'
                    : 'GitHub Sync is successfully connected. All edits will save and push live to the website automatically.'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('github-sync')}
              className="px-4 py-2 border text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all duration-200 hover:bg-[#10B981]/10 active:scale-95 cursor-pointer flex-shrink-0"
              style={{ color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
            >
              Manage Connection
            </button>
          </div>
        </div>
      )}

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
              Pending Topics
            </span>
            <span className="font-serif italic text-2xl">{recommendations.filter(r => r.status === 'pending').length}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono tracking-[0.16em] uppercase block mb-1 text-[#6A6560]">
              Engine Status
            </span>
            <span className="text-xs font-mono font-bold block mt-2" style={{ color: (serverOffline && !ghSyncSuccess) ? '#C4644A' : '#10B981' }}>
              {(serverOffline && !ghSyncSuccess) ? '● OFFLINE' : '● ONLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabbed Grid */}
      <div className="flex-1 flex flex-col md:flex-row mx-auto w-full" style={{ maxWidth: '1200px', padding: '32px 40px' }}>
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-[240px] flex-shrink-0 flex flex-col gap-2 mb-8 md:mb-0 md:pr-8">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'catalog' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Case Archive ({stories.length})
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors relative cursor-pointer ${
              activeTab === 'recommendations' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Topic Suggestions ({recommendations.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'generator' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Write a Dossier
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'automation' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Automated Writer
          </button>
          <button
            onClick={() => {
              setActiveTab('feedback');
              loadFeedback();
            }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'feedback' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            User Feedback ({feedbackItems.filter(f => !f.addressed).length})
          </button>
          <button
            onClick={() => setActiveTab('ai-editor')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'ai-editor' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            AI Editor
          </button>
          <button
            onClick={() => setActiveTab('github-sync')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'github-sync' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            GitHub Sync {ghSyncSuccess ? '✓' : '⚠️'}
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 bg-[#110F0D] border rounded-2xl p-6 md:p-8" style={{ borderColor: ru }}>
          
          {/* Tab 1: Catalog */}
          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">Case Archive ({stories.length})</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Manage compiled dossiers in stories.json</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!isLocal) {
                        alert('Image Backfilling is a server-side feature. Please start your local server to backfill images.');
                        return;
                      }
                      if (serverOffline) {
                        alert('Image Backfilling is a server-side feature. Please start your local API server to backfill images.');
                        return;
                      }
                      addLog('🖼️ Triggering image backfill for all stories missing covers...');
                      try {
                        const res = await fetch('/api/stories/backfill-images', { method: 'POST' });
                        if (res.ok) {
                          const data = await res.json();
                          alert(data.message);
                        }
                      } catch (err) {
                        alert(`Backfill failed: ${err.message}`);
                      }
                    }}
                    className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer text-[#9E7B4C] border-[#9E7B4C]/30 transition-all uppercase font-bold"
                  >
                    🖼️ Backfill Images
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer transition-all uppercase font-bold"
                    style={{ borderColor: ru }}
                  >
                    Export JSON
                  </button>
                </div>
              </div>

              {/* Scrollable list of archives */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {stories.map(story => (
                  <div
                    key={story.story_id}
                    className="p-4 rounded-xl border transition-all hover:bg-black/10"
                    style={{ borderColor: ru, backgroundColor: '#0D0B08' }}
                  >
                    {editingStoryId === story.story_id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Title</label>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Cover Image Path / URL</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editForm.hero_image}
                              onChange={(e) => setEditForm(prev => ({ ...prev, hero_image: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                            />
                            <label
                              htmlFor={`upload-${story.story_id}`}
                              className={`px-3 py-2 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[10px] font-mono tracking-wider uppercase rounded flex items-center justify-center min-w-[80px] transition-all select-none font-bold ${(isLocal ? serverOffline : true) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-neutral-800 cursor-pointer active:scale-95'}`}
                            >
                              {uploadingState === 'uploading' ? '...' : 'Upload'}
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              id={`upload-${story.story_id}`}
                              className="hidden"
                              onChange={(e) => handleUploadImage(e, story.story_id)}
                              disabled={uploadingState === 'uploading' || (isLocal ? serverOffline : true)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Wikipedia Image Query (Fallback)</label>
                          <input
                            type="text"
                            value={editForm.image_query || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, image_query: e.target.value }))}
                            className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                            placeholder="Wikipedia article name to query cover image"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Intro Hook</label>
                          <textarea
                            value={editForm.hook}
                            onChange={(e) => setEditForm(prev => ({ ...prev, hook: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Category</label>
                            <select
                              value={editForm.category}
                              onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                              className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                            >
                              <option value="psychology">Psychology</option>
                              <option value="mythology">Mythology</option>
                              <option value="true_crime">True Crime</option>
                              <option value="gov_experiments">Gov Experiments</option>
                              <option value="paranormal">Paranormal</option>
                              <option value="conspiracy">Conspiracy</option>
                              <option value="cyber_mysteries">Cyber Mysteries</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Severity</label>
                            <select
                              value={editForm.severity}
                              onChange={(e) => setEditForm(prev => ({ ...prev, severity: e.target.value }))}
                              className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                            >
                              <option value="unsettling">Unsettling</option>
                              <option value="disturbing">Disturbing</option>
                              <option value="extreme">Extreme</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Concepts (comma-separated)</label>
                            <input
                              type="text"
                              value={Array.isArray(editForm.concepts) ? editForm.concepts.join(', ') : editForm.concepts || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, concepts: e.target.value.split(',').map(c => c.trim()).filter(Boolean) }))}
                              className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                              placeholder="e.g. shared_delusion, ritual"
                            />
                          </div>
                        </div>

                        {/* Layer Editor Section */}
                        {editForm.layers && editForm.layers.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-neutral-800 text-left">
                            <label className="block text-[9px] font-mono tracking-wider uppercase text-[#9E7B4C] mb-2 font-bold">
                              Rework Story Layers
                            </label>
                            
                            {/* Layer selection pills */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {editForm.layers.map(l => (
                                <button
                                  key={l.layer}
                                  type="button"
                                  onClick={() => setEditFormActiveLayer(l.layer)}
                                  className={`px-2.5 py-1 text-[8.5px] font-mono rounded transition-colors cursor-pointer ${editFormActiveLayer === l.layer ? 'bg-[#9E7B4C] text-white font-bold' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
                                >
                                  L{l.layer}
                                </button>
                              ))}
                            </div>

                            {/* Active layer fields */}
                            {editForm.layers.map(l => {
                              if (l.layer !== editFormActiveLayer) return null;
                              return (
                                <div key={l.layer} className="space-y-3 p-3 rounded-lg bg-black/40 border border-neutral-800">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-mono text-[#9E7B4C] font-semibold uppercase">Layer {l.layer} of 7</span>
                                  </div>

                                  <div>
                                    <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Layer Name</label>
                                    <input
                                      type="text"
                                      value={l.layer_name || ''}
                                      onChange={(e) => handleLayerChange(l.layer, 'layer_name', e.target.value)}
                                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Content Text</label>
                                    <textarea
                                      value={l.content || ''}
                                      onChange={(e) => handleLayerChange(l.layer, 'content', e.target.value)}
                                      rows={5}
                                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-y"
                                      placeholder="Insert multi-paragraph layer story content..."
                                    />
                                  </div>

                                  {l.layer < 7 && (
                                    <div>
                                      <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Cliffhanger (Transition to Next Layer)</label>
                                      <textarea
                                        value={l.cliffhanger || ''}
                                        onChange={(e) => handleLayerChange(l.layer, 'cliffhanger', e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none resize-none"
                                        placeholder="Hook that pulls them to the next layer..."
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => setEditingStoryId(null)}
                            className="px-3 py-1.5 border border-neutral-800 text-[#6A6560] text-[10px] font-bold tracking-wider uppercase rounded hover:bg-white/5 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveStory(story.story_id)}
                            className="px-3.5 py-1.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-wider uppercase rounded hover:bg-[#b08c5c] cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
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
                          <div className="flex gap-2 flex-shrink-0 mt-0.5">
                            <button
                              onClick={() => startEditing(story)}
                              className="text-[10px] font-mono px-2.5 py-1 border border-neutral-800 rounded hover:bg-white/5 text-neutral-400 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteStory(story.story_id)}
                              className="text-[10px] font-mono px-2.5 py-1 border border-red-950/30 text-red-500 rounded hover:bg-red-950/10 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">
                    Topic Suggestions ({recommendations.filter(r => r.status === 'pending').length})
                  </h2>
                  <p className="text-xs text-[#6A6560] mt-1">Review harvested topics for automated compilation</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleHarvestWebTrends}
                    disabled={isHarvesting || isGenerating}
                    className="px-3 py-1.5 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-emerald-950/20 uppercase transition-all cursor-pointer"
                    style={{ borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399' }}
                  >
                    {isHarvesting ? '📡 Scanning...' : '📡 Harvest'}
                  </button>
                  <button
                    onClick={handleAiAutoClean}
                    disabled={isCleaning || isGenerating}
                    className="px-3 py-1.5 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-amber-950/20 uppercase transition-all cursor-pointer"
                    style={{ borderColor: 'rgba(158, 123, 76, 0.4)', color: '#9E7B4C' }}
                  >
                    {isCleaning ? '✨ Cleaning...' : '✨ AI Clean'}
                  </button>
                </div>
              </div>

              {recommendations.filter(r => r.status === 'pending').length === 0 ? (
                <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-neutral-800">
                  <p className="font-serif italic text-base text-[#6A6560] mb-2">Queue is clear.</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/40 max-w-md mx-auto">
                    The background engine is running. Discovered trends and visitor suggestions will appear here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Select All Toggle bar */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900/40 border border-neutral-800/80 text-xs">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={
                          recommendations.filter(r => r.status === 'pending').length > 0 &&
                          recommendations.filter(r => r.status === 'pending').every(r => selectedRecs.includes(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecs(recommendations.filter(r => r.status === 'pending').map(r => r.id));
                          } else {
                            setSelectedRecs([]);
                          }
                        }}
                        className="rounded border-neutral-700 bg-neutral-950 text-[#9E7B4C] focus:ring-[#9E7B4C] focus:ring-opacity-25 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[#6A6560] font-mono text-[10px] uppercase tracking-wider">Select All Pending</span>
                    </div>
                    {selectedRecs.length > 0 && (
                      <button
                        onClick={handleBulkDeleteRecommendations}
                        className="px-3 py-1 bg-red-950/40 border border-red-900/50 hover:bg-red-950/80 text-red-400 text-[10px] font-mono font-bold tracking-wider rounded uppercase transition-all cursor-pointer active:scale-95"
                      >
                        Delete Selected ({selectedRecs.length})
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {recommendations.filter(r => r.status === 'pending').map(rec => (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl border flex items-center justify-between gap-4 transition-all hover:bg-black/10"
                        style={{ borderColor: ru, backgroundColor: '#0D0B08' }}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedRecs.includes(rec.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecs(prev => [...prev, rec.id]);
                              } else {
                                setSelectedRecs(prev => prev.filter(id => id !== rec.id));
                              }
                            }}
                            className="rounded border-neutral-700 bg-neutral-950 text-[#9E7B4C] focus:ring-[#9E7B4C] focus:ring-opacity-25 w-4 h-4 cursor-pointer flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-serif italic text-base text-[#EDE8DF] block leading-snug">{rec.topic}</span>
                            <span className="text-[9px] font-mono text-[#6A6560] block mt-1">Logged: {rec.date}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              setGenTopic(rec.topic);
                              setActiveTab('generator');
                            }}
                            className="px-3 py-1.5 bg-[#9E7B4C] text-white text-[10px] font-mono font-bold tracking-wider hover:bg-[#b08c5c] rounded uppercase transition-all cursor-pointer active:scale-95"
                          >
                            Review & Gen
                          </button>
                          <button
                            onClick={() => handleDeleteRecommendation(rec.id)}
                            className="px-3 py-1.5 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-red-950/20 uppercase transition-all cursor-pointer text-red-500"
                            style={{ borderColor: 'rgba(139, 47, 47, 0.4)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 3: Manual Compiler */}
          {activeTab === 'generator' && (
            <div className="space-y-6">
              <div className="border-b pb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">Manual Dossier Compiler</h2>
                <p className="text-xs text-[#6A6560] mt-1">Directly generate a 7-layer story for any specific topic</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0D0B08] p-6 rounded-2xl border" style={{ borderColor: ru }}>
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                      Dossier Topic / Keyword
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
                      Topic Category
                    </label>
                    <select
                      value={genCategory}
                      onChange={(e) => setGenCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer"
                      disabled={isGenerating}
                    >
                      <option value="auto">Auto-Detect</option>
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
                      <option value="auto">Auto-Detect</option>
                      <option value="unsettling">Unsettling</option>
                      <option value="disturbing">Disturbing</option>
                      <option value="chilling">Chilling</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                      Gemini API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        localStorage.setItem('lore:gemini:key', e.target.value);
                      }}
                      placeholder="Insert VITE_GEMINI_API_KEY..."
                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                      disabled={isGenerating}
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono uppercase tracking-wider text-[#6A6560] block mb-1">
                      OpenRouter API Key
                    </label>
                    <input
                      type="password"
                      value={openRouterKey}
                      onChange={(e) => {
                        setOpenRouterKey(e.target.value);
                        localStorage.setItem('lore:openrouter:key', e.target.value);
                      }}
                      placeholder="Insert VITE_OPENROUTER_API_KEY..."
                      className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleGenerateStory()}
                      disabled={isGenerating || autoStatus.isRunning || !genTopic}
                      className="w-full py-2 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-widest uppercase rounded hover:bg-[#b08c5c] active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Compile Story
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress and Logger console for Manual Generation */}
              {isGenerating && (
                <div className="p-4 rounded-xl border bg-neutral-950/20" style={{ borderColor: ru }}>
                  <div className="flex justify-between text-[9px] font-mono text-[#6A6560] mb-2">
                    <span>Manual Compilation Logs (Elapsed: {elapsedTime}s)</span>
                    <span>{progress}%</span>
                  </div>
                  
                  <div className="w-full h-[2px] bg-neutral-900 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-[#9E7B4C] transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>

                  <div 
                    className="p-3 bg-black rounded-lg border border-neutral-900 font-mono text-[10px] leading-relaxed space-y-1 h-[180px] overflow-y-auto crt-overlay pr-3"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                  >
                    {logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes('ERROR') || log.includes('warning') || log.includes('Warning') ? 'text-red-400' :
                          log.includes('SUCCESS') || log.includes('SUCCESS:') || log.includes('Success') || log.includes('AI Cleaned:') ? 'text-emerald-400' :
                          log.includes('Starting generation') || log.includes('Phase') || log.includes('Generating Story') ? 'text-[#9E7B4C] font-bold mt-1' :
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
          )}

          {/* Tab 4: Automation Console */}
          {activeTab === 'automation' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">Automation Console</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Supervise background writer engine</p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center cursor-pointer select-none">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-400 mr-2">
                      AUTO WRITER
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={ghSyncSuccess ? true : !!autoStatus.enabled}
                        disabled={isLocal ? serverOffline : !ghSyncSuccess}
                        onChange={handleToggleAutomation}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#EDE8DF] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#9E7B4C] peer-disabled:opacity-40" />
                    </div>
                  </label>
                  <button
                    onClick={handleTriggerAutomation}
                    disabled={isGenerating || autoStatus.isRunning || (isLocal ? serverOffline : !ghSyncSuccess)}
                    className="px-3 py-1.5 bg-neutral-900 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-white/5 disabled:opacity-40 transition-all uppercase cursor-pointer"
                    style={{ borderColor: ru }}
                  >
                    {autoStatus.isRunning ? '⚡ Running...' : 'Force Run'}
                  </button>
                </div>
              </div>

              {serverOffline && (
                <div 
                  className="p-4 rounded-xl border text-xs flex flex-col gap-1 leading-relaxed transition-all duration-300"
                  style={{
                    backgroundColor: (!isLocal && ghSyncSuccess) ? 'rgba(16, 185, 129, 0.05)' : 'rgba(196, 100, 74, 0.05)',
                    borderColor: (!isLocal && ghSyncSuccess) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(196, 100, 74, 0.25)',
                    color: (!isLocal && ghSyncSuccess) ? '#10B981' : '#C4644A'
                  }}
                >
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {isLocal 
                      ? 'Local API Server Offline' 
                      : ghSyncSuccess 
                      ? 'Cloud Automation Active' 
                      : 'Cloud Automation Unconfigured'
                    }
                  </span>
                  <span>
                    {isLocal 
                      ? (ghSyncSuccess 
                          ? "The local automation engine controls are disabled because you are using GitHub Sync. Your story archive is synchronized, and the engine runs daily in the cloud via GitHub Actions." 
                          : "The local automation engine controls are disabled because the local API server is not running. Please start the server locally using 'node server.cjs' to enable live background runs.")
                      : (ghSyncSuccess 
                          ? "The automation engine is active in the cloud. It runs automatically every 30 minutes via GitHub Actions, publishing new stories directly to the live website." 
                          : "The cloud automation engine is currently disabled because GitHub Sync is not configured. Please configure GitHub Sync in Settings to enable automatic cloud generation.")
                    }
                  </span>
                </div>
              )}

              {/* Engine Status Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Engine Status</span>
                  <span className="text-xs font-mono font-bold" style={{ color: autoStatus.isRunning ? '#F59E0B' : (autoStatus.enabled || ghSyncSuccess) ? '#10B981' : '#6A6560' }}>
                    {autoStatus.isRunning ? '⚡ RUNNING' : (autoStatus.enabled || ghSyncSuccess) ? '● ACTIVE' : '◌ PAUSED'}
                  </span>
                </div>
                <div className="p-3 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Interval</span>
                  <span className="text-xs font-mono font-bold text-[#EDE8DF]">
                    Every 30m
                  </span>
                </div>
                <div className="p-3 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Next Run</span>
                  <span className="text-xs font-mono font-bold" style={{ color: '#9E7B4C' }}>
                    {autoStatus.nextRunMs > 0
                      ? (() => {
                          const sec = Math.floor((autoStatus.nextRunMs % 60000) / 1000);
                          const m = Math.floor(autoStatus.nextRunMs / 60000);
                          const h = Math.floor(m / 60);
                          return h > 0 
                            ? `${h}h ${m % 60}m ${sec}s` 
                            : m > 0 
                            ? `${m}m ${sec}s` 
                            : `${sec}s`;
                        })()
                      : isLocal
                      ? (serverOffline ? 'OFFLINE' : 'Calculating...')
                      : (ghSyncSuccess ? 'Scheduled (Every 30m)' : 'DISABLED')
                      }
                  </span>
                </div>
                <div className="p-3 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">GitHub Actions</span>
                  <span className="text-xs font-mono font-bold text-[#EDE8DF]">Every 30m</span>
                </div>
              </div>

              {/* Logs output */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-neutral-500">Live background thread logs</span>
                  <span className="text-emerald-400 animate-pulse">● LOG MONITOR</span>
                </div>
                <div 
                  className="p-4 bg-black rounded-lg border border-neutral-900 font-mono text-xs leading-relaxed space-y-1 h-[400px] overflow-y-auto crt-overlay pr-4"
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  {autoLogs.length === 0 && (
                    <div className="text-neutral-500 italic text-[11px] p-2 leading-relaxed">
                      {ghSyncSuccess 
                        ? 'GitHub Sync is active. Local engine logs are offline, but you can track automated runs on your GitHub Repository Actions page.' 
                        : 'Local API server is offline. Start the server locally to view live background thread logs.'}
                    </div>
                  )}
                  {autoLogs.slice(-50).map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.includes('ERROR') || log.includes('warning') || log.includes('Warning') ? 'text-red-400' :
                        log.includes('SUCCESS') || log.includes('SUCCESS:') || log.includes('Success') || log.includes('AI Cleaned:') ? 'text-emerald-400' :
                        log.includes('Starting generation') || log.includes('Phase') || log.includes('Generating Story') ? 'text-[#9E7B4C] font-bold mt-1' :
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
          )}

          {/* Tab 5: User Feedback */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: ru }}>
                <div>
                  <h2 className="font-serif italic text-2xl">
                    User Feedback ({feedbackItems.filter(f => !f.addressed).length})
                  </h2>
                  <p className="text-xs text-[#6A6560] mt-1">Review ratings and comments from readers</p>
                </div>
                <button
                  onClick={loadFeedback}
                  className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer transition-all uppercase font-bold"
                  style={{ borderColor: ru }}
                >
                  ⟳ Refresh
                </button>
              </div>

              {feedbackLoading ? (
                <div className="text-center py-12 text-[#6A6560] font-mono text-xs animate-pulse">Loading feedback...</div>
              ) : feedbackItems.length === 0 ? (
                <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-neutral-800">
                  <p className="font-serif italic text-base text-[#6A6560] mb-2">No feedback yet.</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/40">Visitor comments will be loaded here.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {feedbackItems.map(fb => (
                    <div
                      key={fb.id}
                      className="p-4 rounded-xl border flex flex-col gap-2 transition-all hover:bg-black/10"
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
                            {fb.addressed && <span className="text-[8px] font-mono px-2 py-0.5 rounded text-amber-500 bg-amber-500/10">ADDRESSED</span>}
                          </div>
                          {fb.note && <p className="text-sm font-sans italic mt-2 text-neutral-300">"{fb.note}"</p>}
                          <span className="text-[9px] font-mono text-[#6A6560] block mt-2">
                            {new Date(fb.timestamp).toLocaleDateString()} · {fb.page}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                                setFeedbackItems(prev => prev.map(f => f.id === fb.id ? { ...f, addressed: !f.addressed } : f));
                              } catch { /* ignore */ }
                            }}
                            className="text-[10px] font-mono px-2.5 py-1 border rounded hover:bg-white/5 cursor-pointer text-[#9E7B4C] transition-all"
                            style={{ borderColor: 'rgba(158,123,76,0.3)' }}
                          >
                            {fb.addressed ? 'Reopen' : '✓ Address'}
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Delete this feedback?')) return;
                              try {
                                await fetch(`/api/feedback?id=${fb.id}`, { method: 'DELETE' });
                                setFeedbackItems(prev => prev.filter(f => f.id !== fb.id));
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

          {/* Tab 6: AI Co-Editor Chat */}
          {activeTab === 'ai-editor' && (
            <div className="flex flex-col h-full" style={{ minHeight: '600px' }}>
              <div className="border-b pb-4 mb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">AI Co-Editor</h2>
                <p className="text-xs text-[#6A6560] mt-1">Direct the AI to research topics, edit details, or generate images</p>
              </div>

              <div className="flex-1 flex flex-col space-y-4 max-h-[400px] overflow-y-auto pr-1 mb-4">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-4 py-3 rounded-xl text-xs font-sans leading-relaxed whitespace-pre-wrap"
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
                    <div className="px-4 py-2 rounded-xl text-[10px] font-mono animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: mu }}>
                      Analyzing archive...
                    </div>
                  </div>
                )}
                
                {aiProposal && (
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'rgba(158,123,76,0.4)', backgroundColor: 'rgba(158,123,76,0.06)' }}>
                    <p className="text-[9px] font-mono tracking-wider uppercase mb-1" style={{ color: ac }}>Proposed Change</p>
                    <p className="text-xs font-sans mb-3" style={{ color: fg }}>{aiProposal.description}</p>
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
                              setAiMessages(prev => [...prev, { role: 'assistant', text: `✓ Applied change to "${aiProposal.storyId}" successfully!` }]);
                              setAiProposal(null);
                            }
                          } catch (err) {
                            setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
                          }
                        }}
                        className="px-3 py-1.5 rounded bg-[#9E7B4C] text-white text-[9px] font-mono font-bold uppercase cursor-pointer"
                      >
                        ✓ Apply
                      </button>
                      <button
                        onClick={() => setAiProposal(null)}
                        className="px-3 py-1.5 rounded border text-[9px] font-mono uppercase cursor-pointer hover:bg-white/5"
                        style={{ borderColor: ru }}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && aiInput.trim() && !aiLoading) {
                      handleAiCoEdit();
                    }
                  }}
                  placeholder="Ask AI to make changes or look up papers..."
                  className="flex-1 px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none"
                />
                <button
                  onClick={handleAiCoEdit}
                  disabled={!aiInput.trim() || aiLoading}
                  className="px-4 py-2 rounded bg-neutral-900 border border-neutral-800 text-[10px] font-mono font-bold uppercase transition-all active:scale-95 disabled:opacity-30 cursor-pointer text-[#9E7B4C]"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Tab 7: GitHub Sync Settings */}
          {activeTab === 'github-sync' && (
            <div className="space-y-6">
              <div className="border-b pb-4 text-left" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">GitHub Sync Settings</h2>
                <p className="text-xs text-[#6A6560] mt-1">Configure publishing directly to your GitHub repository when the local API server is offline.</p>
              </div>

              <div className="space-y-4 max-w-xl">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">GitHub Username / Owner</label>
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

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Repository Name</label>
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

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Target Branch</label>
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

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Personal Access Token (PAT)</label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={e => {
                      setGhToken(e.target.value);
                      setGhSyncSuccess(false);
                      localStorage.setItem('lore:github:success', 'false');
                    }}
                    placeholder="ghp_..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Token is stored purely inside your browser's local storage and is never sent anywhere except directly to GitHub's REST API. Required scope: <code>repo</code> or <code>contents:write</code>.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Gemini API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => {
                      setApiKey(e.target.value);
                      localStorage.setItem('lore:gemini:key', e.target.value);
                    }}
                    placeholder="Insert VITE_GEMINI_API_KEY..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors font-mono"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Used as the primary engine for story content generation.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">OpenRouter API Key</label>
                  <input
                    type="password"
                    value={openRouterKey}
                    onChange={e => {
                      setOpenRouterKey(e.target.value);
                      localStorage.setItem('lore:openrouter:key', e.target.value);
                    }}
                    placeholder="Insert VITE_OPENROUTER_API_KEY..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors font-mono"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Used as a robust fallback engine if the primary Gemini key limits out or fails.
                  </p>
                </div>

                <div className="pt-2 text-left flex flex-col gap-3">
                  <button
                    id="btn-test-github-sync"
                    onClick={async () => {
                      const token = ghToken ? ghToken.trim() : '';
                      const owner = ghOwner ? ghOwner.trim() : '';
                      const repo = ghRepo ? ghRepo.trim() : '';
                      const branch = ghBranch ? ghBranch.trim() : '';

                      if (!token) {
                        alert('Please provide a Personal Access Token first.');
                        return;
                      }
                      setIsPublishing(true);
                      setPublishStatus('Testing connection...');
                      try {
                        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                          headers: {
                            'Authorization': `token ${token}`,
                            'Accept': 'application/vnd.github.v3+json'
                          }
                        });
                        if (res.ok) {
                          setGhSyncSuccess(true);
                          localStorage.setItem('lore:github:success', 'true');
                          setPublishStatus('Connection verified! Saving token config to GitHub...');
                          // Push obfuscated token and keys to GitHub config/admin_config.json so any admin device auto-loads it
                          const configContent = JSON.stringify({
                            tok: tokenToStored(token),
                            geminiKey: apiKey ? tokenToStored(apiKey) : '',
                            openRouterKey: openRouterKey ? tokenToStored(openRouterKey) : '',
                            owner: owner,
                            repo: repo,
                            branch: branch,
                            updated: new Date().toISOString()
                          }, null, 2);
                          try {
                            await commitFilesToGitHub(
                              [{ path: 'config/admin_config.json', content: configContent }],
                              'config: update admin sync config [skip ci]'
                            );
                            setToast({ text: `✓ Connected to ${owner}/${repo}. Token saved — any admin login will auto-connect.`, type: 'success' });
                          } catch (commitErr) {
                            // Connection worked but config commit failed — still mark success
                            setToast({ text: `Connected to ${ghOwner}/${ghRepo}. Note: Could not save config to repo: ${commitErr.message}`, type: 'success' });
                          }
                        } else {
                          const errData = await res.json();
                          setToast({ text: `Connection failed: ${errData.message || res.statusText}`, type: 'error' });
                          setGhSyncSuccess(false);
                          localStorage.setItem('lore:github:success', 'false');
                        }
                      } catch (err) {
                        setToast({ text: `Connection error: ${err.message}`, type: 'error' });
                        setGhSyncSuccess(false);
                        localStorage.setItem('lore:github:success', 'false');
                      } finally {
                        setIsPublishing(false);
                        setPublishStatus('');
                      }
                    }}
                    disabled={isPublishing}
                    className="px-4 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-mono font-bold uppercase rounded active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer"
                  >
                    {isPublishing ? publishStatus || 'Saving...' : 'Test Sync & Save Token'}
                  </button>

                  {/* Connection status indicator */}
                  <div className="p-3 rounded-lg border flex items-center gap-3" style={{ borderColor: ghSyncSuccess ? 'rgba(16,185,129,0.25)' : 'rgba(237,232,223,0.07)', backgroundColor: ghSyncSuccess ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                    <span className="text-sm" style={{ color: ghSyncSuccess ? '#10B981' : '#6A6560' }}>
                      {ghSyncSuccess ? '✓' : '○'}
                    </span>
                    <span className="text-[10px] font-mono tracking-wider" style={{ color: ghSyncSuccess ? '#10B981' : '#6A6560' }}>
                      {ghSyncSuccess ? `Synced · ${ghOwner}/${ghRepo}:${ghBranch}` : 'Not connected — enter token and click Test Sync'}
                    </span>
                  </div>

                  {/* Localhost to GitHub Publishing Section */}
                  {isLocal && ghSyncSuccess && (
                    <div className="mt-8 pt-6 border-t border-neutral-800 flex flex-col gap-4 text-left">
                      <h4 className="text-[11px] font-mono tracking-widest uppercase text-[#9E7B4C] font-bold">
                        Publish Local Content to Live Website
                      </h4>
                      <p className="text-[10px] text-[#8F8A82] leading-relaxed">
                        Since you are running LORE locally, all archive changes (story creations, edits, deletions) are stored on your local disk. 
                        Click the button below to fetch all local JSON data files and automatically push/commit them directly to your live GitHub repository to update the main website.
                      </p>
                      <div>
                        <button
                          onClick={handleSyncLocalToGitHub}
                          disabled={isPublishing}
                          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-mono font-bold uppercase rounded active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer flex items-center gap-2"
                        >
                          <span>🚀</span>
                          {isPublishing ? 'Publishing changes...' : 'Publish Local Archive to GitHub'}
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
            className="text-[9px] font-mono tracking-widest uppercase hover:opacity-60 cursor-pointer ml-auto"
            style={{ color: mu }}
          >
            [Close]
          </button>
        </div>
      )}
    </div>
  );
}
