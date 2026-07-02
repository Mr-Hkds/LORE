/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LoreMark from './LoreMark';
import ApprovalCard from './ApprovalCard';

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
      if (concept && typeof concept === 'string') {
        const c = concept.trim().toLowerCase();
        if (!index[c]) {
          index[c] = [];
        }
        if (!index[c].includes(story.story_id)) {
          index[c].push(story.story_id);
        }
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

// Story Quality Score calculation helper
export function getQualityScore(story) {
  let score = 0;
  // 1. Cover Image (25 pts)
  const hasCover = story.hero_image && 
                   story.hero_image.startsWith('http') && 
                   !story.hero_image.includes('unsplash.com/photo-1509248961158-e54f6934749c');
  if (hasCover) score += 25;

  // 2. Word Count (25 pts)
  let totalWords = 0;
  if (story.layers && Array.isArray(story.layers)) {
    story.layers.forEach(l => {
      if (l && l.content) {
        totalWords += l.content.split(/\s+/).filter(Boolean).length;
      }
    });
  } else if (story.content) {
    totalWords += story.content.split(/\s+/).filter(Boolean).length;
  }
  if (totalWords > 400) score += 25;
  else if (totalWords > 200) score += 15;
  else if (totalWords > 100) score += 5;

  // 3. Layer Count (25 pts)
  const layerCount = story.layers ? story.layers.filter(l => l && l.content && l.content.trim() !== '').length : 0;
  if (layerCount >= 5) score += 25;
  else if (layerCount >= 3) score += 15;
  else if (layerCount >= 1) score += 5;

  // 4. Hook Length (15 pts)
  const hookLen = story.hook ? story.hook.trim().length : 0;
  if (hookLen >= 80 && hookLen <= 200) score += 15;
  else if (hookLen > 0) score += 5;

  // 5. Concepts (10 pts)
  const conceptCount = story.concepts ? story.concepts.filter(Boolean).length : 0;
  if (conceptCount >= 3) score += 10;
  else if (conceptCount >= 1) score += 5;

  return score;
}

export function getQualityBadge(story) {
  const score = getQualityScore(story);
  let grade = 'F';
  let color = '#EF4444';
  let bg = 'rgba(239, 68, 68, 0.08)';
  let border = 'rgba(239, 68, 68, 0.2)';

  if (score >= 90) {
    grade = 'A+';
    color = '#10B981';
    bg = 'rgba(16, 185, 129, 0.08)';
    border = 'rgba(16, 185, 129, 0.2)';
  } else if (score >= 75) {
    grade = 'A';
    color = '#10B981';
    bg = 'rgba(16, 185, 129, 0.08)';
    border = 'rgba(16, 185, 129, 0.2)';
  } else if (score >= 60) {
    grade = 'B';
    color = '#F59E0B';
    bg = 'rgba(245, 158, 11, 0.08)';
    border = 'rgba(245, 158, 11, 0.2)';
  } else if (score >= 40) {
    grade = 'C';
    color = '#F97316';
    bg = 'rgba(249, 115, 22, 0.08)';
    border = 'rgba(249, 115, 22, 0.2)';
  }
  
  return { score, grade, color, bg, border };
}

// Concept tags & Title overlap duplicate check helper
export function findPotentialDuplicate(story, allStories) {
  if (!allStories || !Array.isArray(allStories)) return null;

  const currentTitleWords = (story.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (currentTitleWords.length === 0) return null;

  for (const other of allStories) {
    if (other.story_id === story.story_id) continue;
    
    // Exact title match
    if ((other.title || '').trim().toLowerCase() === (story.title || '').trim().toLowerCase()) {
      return { title: other.title, reason: 'Exact title match' };
    }

    // Overlap match (title words)
    const otherTitleWords = (other.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (otherTitleWords.length === 0) continue;

    let overlap = 0;
    currentTitleWords.forEach(w => {
      if (otherTitleWords.includes(w)) overlap++;
    });

    const ratio = overlap / Math.max(currentTitleWords.length, otherTitleWords.length);
    if (ratio >= 0.6) {
      return { title: other.title, reason: `${Math.round(ratio * 100)}% title similarity` };
    }

    // Concept tags match
    const otherConcepts = other.concepts || [];
    const currentConcepts = story.concepts || [];
    if (currentConcepts.length >= 3 && otherConcepts.length >= 3) {
      let conceptOverlap = 0;
      currentConcepts.forEach(c => {
        if (otherConcepts.map(x => x.toLowerCase()).includes(c.toLowerCase())) conceptOverlap++;
      });
      if (conceptOverlap >= 3 && conceptOverlap === currentConcepts.length) {
        return { title: other.title, reason: 'Identical concepts' };
      }
    }
  }
  return null;
}

export function isThumbnailFormatInvalid(story) {
  if (!story || !story.hero_image) return true;
  const img = story.hero_image;
  if (img === 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800') return true;
  return !img.startsWith('http') && !img.startsWith('/') && !img.startsWith('data:');
}

export function hasProperThumbnail(story) {
  return !isThumbnailFormatInvalid(story);
}

export async function robustFetchWikipediaThumbnail(query) {
  if (!query) return null;
  try {
    // 1. Try search API first to resolve capitalization/spelling mismatches
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    let resolvedTitle = query;
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData?.query?.search && searchData.query.search.length > 0) {
        resolvedTitle = searchData.query.search[0].title;
      }
    }
    
    // 2. Query Page Summary with the resolved title
    const formattedQuery = encodeURIComponent(resolvedTitle.trim().replace(/ /g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${formattedQuery}`);
    let imgUrl = null;
    if (res.ok) {
      const matched = await res.json();
      imgUrl = matched?.thumbnail?.source || matched?.originalimage?.source || null;
    }
    
    // Fallback directly to original query if resolved title fails or returns no image
    if (!imgUrl && resolvedTitle !== query) {
      const fallbackQuery = encodeURIComponent(query.trim().replace(/ /g, '_'));
      const fallbackRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${fallbackQuery}`);
      if (fallbackRes.ok) {
        const fallbackMatched = await fallbackRes.json();
        imgUrl = fallbackMatched?.thumbnail?.source || fallbackMatched?.originalimage?.source || null;
      }
    }
    
    return imgUrl;
  } catch (err) {
    console.warn(`[WikiCache] Failed to fetch Wikipedia thumbnail for "${query}":`, err);
    // Simple direct fallback as last resort
    try {
      const fallbackQuery = encodeURIComponent(query.trim().replace(/ /g, '_'));
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${fallbackQuery}`);
      if (res.ok) {
        const matched = await res.json();
        return matched?.thumbnail?.source || matched?.originalimage?.source || null;
      }
    } catch {
      return null;
    }
  }
  return null;
}


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

  // Analytics Dashboard state
  const [analyticsData, setAnalyticsData] = useState({
    totalPageviews: 0,
    uniqueVisitors: 0,
    activeSessions: 0,
    recentPageviews: []
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

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
  const [aiJsonInput, setAiJsonInput] = useState('');
  const [aiJsonError, setAiJsonError] = useState(null);
  const [aiPromptTopic, setAiPromptTopic] = useState('');
  const [aiPromptCategory, setAiPromptCategory] = useState('auto');
  const [copiedPromptStatus, setCopiedPromptStatus] = useState(false);

  // Wikipedia image search preview engine
  const [wikiSearchTerm, setWikiSearchTerm] = useState('');
  const [wikiPreviewState, setWikiPreviewState] = useState('idle'); // idle | loading | found | notfound
  const [wikiPreviewImg, setWikiPreviewImg] = useState(null);
  const [wikiPreviewTitle, setWikiPreviewTitle] = useState('');

  // Database Console states
  const [dbSqlQuery, setDbSqlQuery] = useState('SELECT story_id, title, category, severity, draft FROM stories LIMIT 10;');
  const [dbQueryResults, setDbQueryResults] = useState(null);
  const [dbQueryError, setDbQueryError] = useState(null);
  const [dbQueryExecuting, setDbQueryExecuting] = useState(false);

  // Search & Filter in Catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterMissingImages, setFilterMissingImages] = useState(false);
  const [rowPreviews, setRowPreviews] = useState({});
  const [editImageFailed, setEditImageFailed] = useState(false);
  const [pasteConfirmation, setPasteConfirmation] = useState(null);
  const [pasteUploading, setPasteUploading] = useState(false);
  const [pasteError, setPasteError] = useState(null);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [pasteStatusText, setPasteStatusText] = useState('');
  const [pasteProgress, setPasteProgress] = useState(0);

  const getShortTitle = (title) => {
    if (!title) return '';
    const parts = title.split(/[:\-–—]/);
    return parts[0].trim();
  };

  const getHashGradient = (id) => {
    const hash = (id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const gradients = [
      'radial-gradient(circle at center, #261E14 0%, #0F0B08 100%)',
      'radial-gradient(circle at center, #221415 0%, #0F0808 100%)',
      'radial-gradient(circle at center, #152219 0%, #080F0A 100%)',
      'radial-gradient(circle at center, #141B26 0%, #080B0F 100%)',
      'radial-gradient(circle at center, #1E1426 0%, #0B080F 100%)',
      'radial-gradient(circle at center, #262414 0%, #0F0E08 100%)'
    ];
    return gradients[hash % gradients.length];
  };

  const isImageMissing = useCallback((story) => {
    if (!story) return true;
    return !!story.image_missing;
  }, []);

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

  // Fetches a remote image's base64 content via the serverless CORS proxy
  const fetchRemoteImageBase64 = async (remoteUrl) => {
    if (!remoteUrl) return null;
    // If it's already a base64 string, parse out metadata and return it
    if (remoteUrl.startsWith('data:image/')) {
      const clean = remoteUrl.replace(/^data:image\/\w+;base64,/, '');
      return { base64Clean: clean, contentType: 'image/jpeg' };
    }
    try {
      const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(remoteUrl)}`;
      const proxyRes = await fetch(proxyUrl);
      if (!proxyRes.ok) {
        throw new Error(`CORS proxy failed with status ${proxyRes.status}`);
      }
      const data = await proxyRes.json();
      return {
        base64Clean: data.base64Clean,
        contentType: data.contentType
      };
    } catch (err) {
      console.warn(`[fetchRemoteImageBase64] Failed to fetch remote image via CORS proxy:`, err.message);
      return null;
    }
  };

  // Archives a remote image (local dev write + returns details for GitHub commit)
  const archiveRemoteImage = async (storyId, remoteUrl) => {
    if (!remoteUrl) return { path: '', base64Clean: null };
    
    // If already local, just return it
    if (remoteUrl.startsWith('/content/images/')) {
      return { path: remoteUrl, base64Clean: null };
    }

    const folderName = storyId || 'general';
    const filename = 'cover.jpg';
    const relativePath = `/content/images/${folderName}/${filename}`;

    // 1. Fetch base64 content
    const imgData = await fetchRemoteImageBase64(remoteUrl);
    if (!imgData) {
      // Failed to download: return original url as fallback
      return { path: remoteUrl, base64Clean: null };
    }

    // 2. Save locally if on dev server (optional, best-effort)
    if (isLocal && !serverOffline) {
      try {
        await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId: folderName,
            filename,
            base64Data: imgData.base64Clean
          })
        });
      } catch (err) {
        console.warn('Local dev save failed:', err.message);
      }
    }

    return {
      path: relativePath,
      base64Clean: imgData.base64Clean
    };
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

    const prompt = `Write a complete, highly-detailed 7-layer documentary story in clean, simple, and professional English about the famous, documented, real-world case or event: "${topic}".
    
    Suggested Category: ${targetCategory}
    Severity Level: ${targetSeverity}
    
     CRITICAL FACTUAL AND PACING RULES:
     1. Only real, historically documented cases. Absolutely no creepypastas or internet rumors.
     2. Write the title, hook, layer names, layer content, cliffhangers, and transition lines in extremely simple, direct, and clear English (perfectly suited for non-native English readers and an Indian audience). Keep sentence structures short and straightforward. Avoid complex vocabulary, academic jargon, or obscure words (e.g., use 'secret' instead of 'clandestine', 'clear' instead of 'conspicuous', 'explain' instead of 'delineate', 'puzzling' instead of 'enigmatic'). The tone should be similar to a simple, premium educational video essay—highly accessible yet serious and respectful. Do NOT use Hinglish, slang, or cheap sensationalism.
     3. The narrative must flow layer by layer: Layer 1 introduces the whisper, Layer 4 details the event, and Layer 7 delivers the absolute darkest documented truth.
     4. Layer 1 MUST start with a unique, gripping, topic-specific factual hook to capture the reader's attention. Rhetorical questions or generic conversational openings are ABSOLUTELY FORBIDDEN. Specifically, do NOT use: "Did you know?", "Have you ever wondered?", "What if...", "Kya aapne kabhi socha hai?", "Chalo aaj le chalte hain", "Let us explore", "Imagine a world where", or similar cliches. Go straight into a concrete, chilling, or fascinating historical fact or observation (e.g. "On July 1, 2018, eleven bodies hung in perfect circular alignment...").
     5. Each layer content must be 2-3 detailed paragraphs. Use double newlines \n\n between paragraphs.
     6. Place quotes inside text using single quotes ('). Do not use unescaped double quotes inside values.
     7. RESPECT AND SENSITIVITY FOR MYTHOLOGY/RELIGION: When writing about religious, sacred, or mythological topics (e.g., Shiva / Shiv Ji, ancient deities, sacred rituals, scriptures), you MUST remain strictly respectful and objective. Write the story as an informative, intellectually interesting, and historically/philosophically sound account. DO NOT exaggerate, dark-frame, or invent cheap, sinister, or morbid narrative elements that could hurt religious sentiments. Focus on the mystery, philosophy, and awe, keeping it premium and educational, not cheap or offensive.
     8. INLINE FACT-CHECKING TAGS: Throughout the content paragraphs, you are encouraged to inject the following uppercase tags to denote evidence strength:
         - [VERIFIED] for claims backed directly by official declassified documents, court files, or standard forensics.
         - [CLAIMED] for official statements, press releases, or institutional/mainstream accounts.
         - [DISPUTED] for claims contradicted by eyewitness testimonies, biological evidence, or other official records.
         - [UNVERIFIED] for rumors, claims lacking files, or speculation.
         Use these tags naturally in the sentences (e.g., 'The CIA formally authorized Project MKULTRA in a memo signed by Dulles on [VERIFIED] April 13, 1953...' or 'The agency originally [CLAIMED] the records were destroyed in a routine cleanup...'). Use them sparingly but effectively (about 1-2 tags per layer).
    
    Structure the story exactly in the following JSON format:
    {
      "story_id": "lowercase_slug_with_underscores",
      "title": "Compelling Title",
      "category": "must be one of: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries (Choose the single best category match for this topic)",
      "hook": "Teaser description of this case (max 150 chars) in clean, professional English.",
      "concepts": ["concept1", "concept2", "concept3"],
      "severity": "unsettling | disturbing | extreme (choose based on topic intensity)",
      "image_query": "The exact Wikipedia article title representing this topic for thumbnail fetching (e.g. Mary Celeste)",
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

      storyObj.added_date = new Date().toLocaleDateString('en-CA');
      setProgress(75);

      // Search Wikipedia for image
      addLog(`Searching Wikipedia for cover photo: "${storyObj.image_query || storyObj.title}"`);
      const imgSearchQuery = storyObj.image_query || storyObj.title;
      let imageUrl = null;
      try {
        imageUrl = await robustFetchWikipediaThumbnail(imgSearchQuery);
      } catch (err) {
        console.warn('Wikipedia image search failed:', err);
      }
      let imageBase64ToCommit = null;
      if (imageUrl) {
        addLog(`Downloading Wikipedia cover photo...`);
        const archiveResult = await archiveRemoteImage(storyObj.story_id, imageUrl);
        storyObj.hero_image = archiveResult.path;
        imageBase64ToCommit = archiveResult.base64Clean;
      } else {
        addLog(`No Wikipedia photo found. Using typographic fallback cover.`);
        storyObj.hero_image = null;
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
            { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) },
          ];
          if (imageBase64ToCommit) {
            filesToCommit.push({
              path: `public${storyObj.hero_image}`,
              content: imageBase64ToCommit,
              isBinary: true
            });
          }
          try {
            await commitFilesToGitHub(filesToCommit, `admin: generate story "${storyObj.title}" via manual generator`);
            addLog('🚀 Successfully committed generated story and images to GitHub repo!');
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
      } else {
        if (stories && stories.length > 0) {
          setAdminStories(stories);
        }
      }
    } catch (err) {
      console.warn('Failed to load admin stories from database, using static fallback:', err);
      if (stories && stories.length > 0) {
        setAdminStories(stories);
      }
    } finally {
      setAdminStoriesLoading(false);
    }
  }, [stories]);

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

  const handleUseTopic = (topic) => {
    setGenTopic(topic);
    setActiveTab('generator');
    setToast({ text: `Loaded topic "${topic}" into the AI Generator form.`, type: 'info' });
  };

  const handleSaveImageSource = async (storyId, imageSource) => {
    try {
      const targetStory = adminStories.find(s => s.story_id === storyId);
      if (!targetStory) return null;

      const archiveResult = await archiveRemoteImage(storyId, imageSource);
      const newHeroImage = archiveResult.path;
      
      const updatedStoryObj = { 
        ...targetStory, 
        hero_image: newHeroImage,
        image_missing: 0,
        draft: 0
      };
      
      if (!updatedStoryObj.added_date || updatedStoryObj.added_date === '2026-01-01') {
        updatedStoryObj.added_date = new Date().toLocaleDateString('en-CA');
      }
      
      // Update SQLite (best-effort on production — ephemeral containers)
      try {
        await fetch(`/api/stories/${storyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStoryObj)
        });
      } catch (dbErr) {
        console.warn('SQLite update skipped (expected on production):', dbErr.message);
      }
      
      // Commit to GitHub — this is the real source of truth
      if (ghToken) {
        const updatedStories = adminStories
          .filter(s => s.story_id !== storyId && !s.draft)
          .concat(updatedStoryObj);
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        if (archiveResult.base64Clean) {
          filesToCommit.push({
            path: `public${newHeroImage}`,
            content: archiveResult.base64Clean,
            isBinary: true
          });
        }
        await commitFilesToGitHub(filesToCommit, `admin: sync cover image for story ${storyId}`);
      }
      
      return newHeroImage;
    } catch (err) {
      setToast({ text: `Failed to save cover image: ${err.message}`, type: 'error' });
      throw err;
    }
  };

  // Publish / Push to Live story logic
  const handlePublishStory = async (storyId, bypassImageCheck = false) => {
    const targetStory = adminStories.find(s => s.story_id === storyId);
    if (!bypassImageCheck && isImageMissing(targetStory)) {
      setToast({ text: 'Story lacks a proper thumbnail. Transferred to Approval Queue.', type: 'error' });
      setActiveTab('approval');
      return;
    }

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
        const resLocal = await fetch(`/api/stories?t=${Date.now()}`);
        if (resLocal.ok) {
          const localList = await resLocal.json();
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
        const resLocal = await fetch(`/api/stories?t=${Date.now()}`);
        if (resLocal.ok) {
          const localList = await resLocal.json();
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

  const handlePasteTrigger = (story, sourceUrl) => {
    setRowPreviews(prev => ({ ...prev, [story.story_id]: sourceUrl }));
    setPasteConfirmation({
      story_id: story.story_id,
      title: story.title,
      imageSource: sourceUrl,
      story
    });
  };

  const handleConfirmPastePublish = async () => {
    if (!pasteConfirmation) return;
    setPasteUploading(true);
    setPasteError(null);
    setPasteProgress(0);
    setPasteStatusText('Initiating database sync...');
    
    const { story_id, imageSource } = pasteConfirmation;
    let savedImageUrl = imageSource;
    
    const progressTimer = setInterval(() => {
      setPasteProgress(prev => {
        if (prev < 50) return prev + 12;
        if (prev < 80) return prev + 6;
        if (prev < 95) return prev + 2;
        return prev;
      });
    }, 400);
    
    try {
      setPasteStatusText('Updating database & syncing to GitHub...');
      const savedImg = await handleSaveImageSource(story_id, imageSource);
      if (savedImg) {
        savedImageUrl = savedImg;
      }
      
      // Commit succeeded — update state optimistically and close
      clearInterval(progressTimer);
      setPasteProgress(100);
      setPasteSuccess(true);
      setPasteStatusText(ghToken ? 'Committed to GitHub — Vercel will deploy automatically.' : 'Database synchronized.');
      
      setAdminStories(prev => prev.map(s => s.story_id === story_id ? { 
        ...s, 
        hero_image: savedImageUrl, 
        image_missing: 0, 
        draft: 0,
        added_date: s.added_date && s.added_date !== '2026-01-01' ? s.added_date : new Date().toLocaleDateString('en-CA')
      } : s));
      
      setTimeout(() => {
        setPasteConfirmation(null);
        setPasteSuccess(false);
        setPasteUploading(false);
        setRowPreviews(prev => {
          const next = { ...prev };
          delete next[story_id];
          return next;
        });
      }, 1500);
      
    } catch (err) {
      clearInterval(progressTimer);
      setPasteError(err.message || 'Sync failed. Please try again.');
      setPasteUploading(false);
      setRowPreviews(prev => {
        const next = { ...prev };
        delete next[story_id];
        return next;
      });
    }
  };

  // Story editor utilities
  const startEditing = (story) => {
    setEditingStoryId(story.story_id);
    setEditImageFailed(false);
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
      hook: 'Introduce the mystery here in 1-2 professional English sentences...',
      category: 'psychology',
      severity: 'unsettling',
      concepts: [],
      layers: Array.from({ length: 7 }).map((_, idx) => ({
        layer: idx + 1,
        layer_name: idx === 0 ? 'The Whisper' : idx === 3 ? 'The Incident' : idx === 6 ? 'The Dark Corner' : `Layer ${idx + 1}`,
        content: idx === 0 ? 'Introduce the initial whisper or mystery hook here...' : 'Provide details...',
        cliffhanger: idx < 6 ? 'Next layer hook...' : null
      }))
    });
    setEditFormActiveLayer(1);
  };

  const handleImportAiJson = () => {
    try {
      setAiJsonError(null);
      if (!aiJsonInput.trim()) {
        throw new Error('Please paste some text first.');
      }
      const storyObj = cleanAndParseJSON(aiJsonInput);
      
      // Ensure storyObj has layers, or construct them
      let parsedLayers = storyObj.layers || [];
      if (!Array.isArray(parsedLayers) || parsedLayers.length === 0) {
        parsedLayers = Array.from({ length: 7 }).map((_, idx) => ({
          layer: idx + 1,
          layer_name: `Layer ${idx + 1}`,
          content: '',
          cliffhanger: idx < 6 ? 'Next layer hook...' : null
        }));
      } else {
        // Map and fill up to 7 layers
        parsedLayers = Array.from({ length: 7 }).map((_, idx) => {
          const found = parsedLayers.find(l => l.layer === idx + 1);
          return {
            layer: idx + 1,
            layer_name: found?.layer_name || found?.name || `Layer ${idx + 1}`,
            content: found?.content || found?.text || found?.body || '',
            cliffhanger: idx < 6 ? (found?.cliffhanger || found?.next_hook || 'Next layer hook...') : null
          };
        });
      }

      setEditForm({
        story_id: storyObj.story_id || editForm.story_id || ('dossier_' + Date.now()),
        title: storyObj.title || editForm.title || 'New Imported Dossier',
        hero_image: storyObj.hero_image || editForm.hero_image || 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800',
        image_query: storyObj.image_query || editForm.image_query || '',
        hook: storyObj.hook || editForm.hook || 'Dossier hook...',
        category: storyObj.category || editForm.category || 'psychology',
        severity: storyObj.severity || editForm.severity || 'unsettling',
        concepts: Array.isArray(storyObj.concepts) ? storyObj.concepts : (editForm.concepts || []),
        layers: parsedLayers
      });
      setEditFormActiveLayer(1);
      setAiJsonInput('');
    } catch (err) {
      console.error('Failed to parse AI JSON:', err);
      setAiJsonError('Parsing failed: ' + err.message);
    }
  };

  const handleCopyGeneratedPrompt = () => {
    if (!aiPromptTopic.trim()) {
      alert('Please enter a topic name first.');
      return;
    }
    const slugBase = aiPromptTopic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');

    const CATEGORY_TONE_GUIDE = {
      auto:             'Choose the single best category from: psychology, true_crime, paranormal, mythology, gov_experiments, conspiracy, cyber_mysteries. Match the tone accordingly.',
      psychology:       'Clinical, forensic psychological tone. Focus on human behavior, cognitive distortions, case studies. Use terminology from forensic psychology.',
      true_crime:       'Investigative journalism tone. Timeline-based, evidence-driven, factual. Like a true crime documentary with cold precision.',
      paranormal:       'Eerie, atmospheric, measured skepticism. Present documented anomalies without dismissing them. X-Files meets academic research.',
      mythology:        'Ancient scholar tone. Mythological narratives as cultural records. Reference real historical sources, archaeological findings, and oral traditions.',
      gov_experiments:  'Declassified document tone. Cold, bureaucratic language revealing hidden truths. Reference real FOIA documents where possible.',
      conspiracy:       'Research analyst tone. Examine the evidence on both sides. Clinical, not sensationalist. Focus on documented inconsistencies.',
      cyber_mysteries:  'Tech journalist meets dark web investigator. Code, cryptography, digital forensics. Reference real vulnerabilities, breaches, and anomalies.',
    };

    const tone = CATEGORY_TONE_GUIDE[aiPromptCategory] || CATEGORY_TONE_GUIDE.auto;
    const categoryHint = aiPromptCategory === 'auto'
      ? '"category": "Choose the best fit: psychology | true_crime | paranormal | mythology | gov_experiments | conspiracy | cyber_mysteries",'
      : `"category": "${aiPromptCategory}",`;

    const promptText = `You are the lead narrative architect and forensic researcher for LORE — an atmospheric archive documenting the darkest corners of human history, psychology, mythology, and anomalous phenomena.

## WRITING TONE
${tone}

## SEVERITY SCALE (choose the most accurate for this topic)
- "curious"    → Mildly intriguing, strange or unexplained, but not dark
- "unsettling" → Builds unease and psychological tension
- "disturbing" → Dark themes, moral violations, disturbing truths
- "harrowing"  → Deeply traumatic, intense historical horror
- "forbidden"  → Extreme, occult, deeply classified, or transgressive content

## CRITICAL RULES
1. All details must be historically accurate and verifiable. Never fabricate facts.
2. Output ONLY valid raw JSON — no markdown fences, no explanations.
3. Start with \`{\` and end with \`}\`.
4. Escape all inner double-quotes.
5. No trailing commas.
6. Exactly 7 descent layers — escalating depth and intensity.
7. Use \\n\\n to separate paragraphs in "content" values.

## JSON SCHEMA
{
  "story_id": "${slugBase}_dossier",
  "title": "Compelling, evocative title",
  ${categoryHint}
  "hook": "A gripping one-sentence teaser for the catalog (max 150 chars).",
  "severity": "curious | unsettling | disturbing | harrowing | forbidden",
  "image_query": "The exact Wikipedia article title for this topic (used to auto-fetch a cover image). Example: Project MKUltra",
  "concepts": ["concept_one", "concept_two", "concept_three"],
  "layers": [
    {
      "layer": 1,
      "layer_name": "The Public Surface — what everyone knows",
      "content": "Layer 1 content — documented public facts.\\n\\nAdditional background detail.",
      "cliffhanger": "A chilling hook pulling the reader deeper."
    },
    {
      "layer": 2,
      "layer_name": "The First Crack",
      "content": "Layer 2 content — first inconsistencies appear.",
      "cliffhanger": "Escalating tension hook."
    },
    {
      "layer": 3,
      "layer_name": "Hidden Patterns",
      "content": "Layer 3 content — patterns emerge, evidence mounts.",
      "cliffhanger": "The reader starts questioning everything."
    },
    {
      "layer": 4,
      "layer_name": "The Deeper Archive",
      "content": "Layer 4 content — suppressed or overlooked records.",
      "cliffhanger": "Something much darker is coming."
    },
    {
      "layer": 5,
      "layer_name": "The Shadow Network",
      "content": "Layer 5 content — key players, hidden connections.",
      "cliffhanger": "The trail leads somewhere few have gone."
    },
    {
      "layer": 6,
      "layer_name": "Entering the Abyss",
      "content": "Layer 6 content — the darkest documented truths.",
      "cliffhanger": "One final revelation remains."
    },
    {
      "layer": 7,
      "layer_name": "The Absolute Truth",
      "content": "The final devastating, chilling conclusion. The full weight of the truth.",
      "cliffhanger": null
    }
  ]
}

## TOPIC
${aiPromptTopic}`;

    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedPromptStatus(true);
        setTimeout(() => setCopiedPromptStatus(false), 3000);
      })
      .catch(err => {
        console.error('Failed to copy prompt:', err);
        alert('Could not copy automatically. Check console.');
      });
  };

  // ── Wikipedia Image Search Engine ────────────────────────────────────────
  const handleWikiImageSearch = async () => {
    const term = wikiSearchTerm.trim() || editForm.image_query?.trim() || editForm.title?.trim();
    if (!term) return;
    setWikiPreviewState('loading');
    setWikiPreviewImg(null);
    try {
      const imgUrl = await robustFetchWikipediaThumbnail(term);
      if (imgUrl) {
        setWikiPreviewImg(imgUrl);
        setWikiPreviewTitle(term);
        setWikiPreviewState('found');
      } else {
        setWikiPreviewState('notfound');
      }
    } catch {
      setWikiPreviewState('notfound');
    }
  };

  const handleApproveWikiImage = () => {
    if (wikiPreviewImg) {
      setEditForm(prev => ({ ...prev, hero_image: wikiPreviewImg, image_query: wikiSearchTerm || prev.image_query }));
      setWikiPreviewState('idle');
      setWikiPreviewImg(null);
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

  const handleSaveStory = async (storyId) => {
    // Validate form
    const storyIdVal = (editForm.story_id || '').trim();
    const titleVal = (editForm.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');
    const finalId = storyIdVal || titleVal;
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
        const imageFiles = await getLocalImageCommitFiles(updatedStories, [finalId]);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) },
          ...imageFiles
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

  const handleDeleteStory = async (storyId, storyObj) => {
    if (!window.confirm('Delete this story from the archive permanently?')) return;
    
    let serverDeleted = false;
    if (isLocal && !serverOffline) {
      try {
        const idToSend = storyId || 'undefined';
        const res = await fetch(`/api/stories/${idToSend}`, { method: 'DELETE' });
        if (res.ok) {
          serverDeleted = true;
        }
      } catch (e) {
        console.warn('Local server delete failed:', e);
      }
    }
    
    const updated = localStories.filter(s => {
      if (storyObj && s === storyObj) return false;
      if (storyId && s.story_id === storyId) return false;
      if (!storyId && !s.story_id) return false;
      return true;
    });
    setLocalStories(updated);
    localStorage.setItem('lore:custom_stories', JSON.stringify(updated));

    // Save to local blacklist
    if (storyId) {
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
    }

    if (onStoryDeleted) {
      onStoryDeleted(storyId);
    }

    if (!serverDeleted) {
      if (ghToken) {
        const updatedStories = stories.filter(s => {
          if (storyObj && s === storyObj) return false;
          if (storyId && s.story_id === storyId) return false;
          if (!storyId && !s.story_id) return false;
          return true;
        });
        const newConceptIndex = rebuildConceptIndex(updatedStories);
        const filesToCommit = [
          { path: 'public/content/stories.json', content: JSON.stringify({ stories: updatedStories }, null, 2) },
          { path: 'public/content/concept_index.json', content: JSON.stringify(newConceptIndex, null, 2) }
        ];
        try {
          await commitFilesToGitHub(filesToCommit, `admin: delete story ${storyId || 'empty'} via GitHub Sync`);
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

    await loadAdminStories();
    if (refetchStories) refetchStories();
  };

  const handleExecuteSqlQuery = async () => {
    if (!dbSqlQuery.trim()) return;
    setDbQueryExecuting(true);
    setDbQueryError(null);
    setDbQueryResults(null);
    try {
      const res = await fetch('/api/database-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: dbSqlQuery.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setDbQueryResults(data.result);
        setToast({ text: 'SQL Query executed successfully!', type: 'success' });
        if (refetchStories) refetchStories();
        loadAdminStories();
      } else {
        setDbQueryError(data.error || 'Failed to execute query');
      }
    } catch (err) {
      setDbQueryError(err.message || 'Network error executing SQL');
    } finally {
      setDbQueryExecuting(false);
    }
  };



  // Image Upload handler
  const handleUploadImage = async (e, storyId) => {
    if ((!isLocal || serverOffline) && !ghToken) {
      alert('Custom image uploading requires running locally or configuring GitHub Sync in settings.');
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
        const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const filename = 'cover.jpg';
        const folderName = storyId || 'general';
        const relativePath = `/content/images/${folderName}/${filename}`;

        if (isLocal && !serverOffline) {
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storyId: folderName,
              filename,
              base64Data,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            addLog(`Successfully uploaded custom image to local server: ${data.path}`);
          }
        }

        // Commit directly to GitHub if token is present
        if (ghToken) {
          addLog(`Uploading cover image directly to GitHub repository...`);
          const filesToCommit = [
            {
              path: `public${relativePath}`,
              content: base64Clean,
              isBinary: true
            }
          ];
          await commitFilesToGitHub(filesToCommit, `admin: upload cover image for ${storyId || 'new_story'}`);
          addLog(`🚀 Cover image successfully committed to GitHub: public${relativePath}`);
        }

        setEditForm(prev => ({ ...prev, hero_image: relativePath }));
        setToast({ text: 'Image uploaded and synced successfully!', type: 'success' });
      } catch (err) {
        console.error(err);
        alert(`Error uploading image: ${err.message}`);
      } finally {
        setUploadingState('idle');
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper to fetch local cover images and format them as GitHub commit files in parallel
  const getLocalImageCommitFiles = async (storiesList, limitStoryIds = null) => {
    const targets = storiesList.filter(story => {
      if (limitStoryIds && !limitStoryIds.includes(story.story_id)) {
        return false;
      }
      return story.hero_image && story.hero_image.startsWith('/content/images/');
    });

    const filePromises = targets.map(async (story) => {
      try {
        const checkUrl = `${window.location.origin}${story.hero_image.startsWith('/') ? '' : '/'}${story.hero_image}`;
        const res = await fetch(checkUrl);
        if (res.ok) {
          const blob = await res.blob();
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const base64Clean = base64.replace(/^data:image\/\w+;base64,/, '');
          const cleanPath = story.hero_image.startsWith('/') ? story.hero_image.substring(1) : story.hero_image;
          return {
            path: `public/${cleanPath}`,
            content: base64Clean,
            isBinary: true
          };
        }
      } catch (err) {
        console.warn(`Failed to read local image for story ${story.story_id}:`, err);
      }
      return null;
    });

    const files = await Promise.all(filePromises);
    return files.filter(f => f !== null);
  };

  // Commit files directly using REST API (Git Database Trees & Commits API for atomic, high-speed multi-file commits)
  const commitFilesToGitHub = async (filesToCommit, commitMessage) => {
    const token = ghToken ? ghToken.trim() : '';
    const owner = ghOwner ? ghOwner.trim() : '';
    const repo = ghRepo ? ghRepo.trim() : '';
    const branch = ghBranch ? ghBranch.trim() : '';

    if (!token) {
      throw new Error('GitHub Personal Access Token is required.');
    }

    // Retry-enabled fetch wrapper with exponential backoff
    const ghFetch = async (url, options = {}, label = 'GitHub API') => {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, {
            ...options,
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              ...(options.headers || {})
            }
          });
          if (res.ok) return res;
          // Retry on server errors and rate limits
          if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
            console.warn(`[${label}] HTTP ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          const errBody = await res.json().catch(() => ({}));
          throw new Error(`${label} failed (HTTP ${res.status}): ${errBody.message || res.statusText}`);
        } catch (err) {
          if (err.message?.includes('failed (HTTP')) throw err; // Don't retry client errors
          if (attempt >= maxRetries) throw new Error(`${label} failed after ${maxRetries} attempts: ${err.message}`, { cause: err });
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[${label}] Network error, retrying in ${delay}ms:`, err.message);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    };

    setIsPublishing(true);
    const maxGlobalRetries = 3;
    
    for (let gAttempt = 1; gAttempt <= maxGlobalRetries; gAttempt++) {
      try {
        setPublishStatus(`Initializing GitHub publish (attempt ${gAttempt}/${maxGlobalRetries})...`);
        
        // 1. Get the latest commit and tree SHA from the branch
        setPublishStatus('Fetching latest branch reference...');
        const branchRes = await ghFetch(
          `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
          {},
          'Branch ref'
        );
        const branchData = await branchRes.json();
        const latestCommitSha = branchData.commit.sha;
        const latestTreeSha = branchData.commit.commit.tree.sha;

        // 2. Upload blobs in parallel
        setPublishStatus(`Uploading ${filesToCommit.length} files to GitHub (attempt ${gAttempt})...`);
        const blobPromises = filesToCommit.map(async (file) => {
          const contentBase64 = file.isBinary 
            ? file.content 
            : btoa(unescape(encodeURIComponent(file.content)));
          
          const blobRes = await ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: contentBase64, encoding: 'base64' })
            },
            `Blob upload (${file.path.split('/').pop()})`
          );
          const blobData = await blobRes.json();
          return {
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha
          };
        });

        const treeEntries = await Promise.all(blobPromises);

        // 3. Create a new Tree pointing to the base tree
        setPublishStatus('Assembling commit tree...');
        const treeRes = await ghFetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_tree: latestTreeSha, tree: treeEntries })
          },
          'Tree assembly'
        );
        const treeData = await treeRes.json();

        // 4. Create the Commit
        setPublishStatus('Creating commit...');
        const commitRes = await ghFetch(
          `https://api.github.com/repos/${owner}/${repo}/git/commits`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `${commitMessage} [skip ci]`, tree: treeData.sha, parents: [latestCommitSha] })
          },
          'Commit creation'
        );
        const commitData = await commitRes.json();

        // 5. Update the branch ref (with retry for replica propagation lag)
        setPublishStatus('Finalizing branch sync...');
        const maxRefUpdateAttempts = 3;
        for (let refAttempt = 1; refAttempt <= maxRefUpdateAttempts; refAttempt++) {
          try {
            await ghFetch(
              `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sha: commitData.sha, force: true })
              },
              'Ref update'
            );
            break; // Success, proceed
          } catch (refErr) {
            if (refAttempt >= maxRefUpdateAttempts) {
              throw refErr; // Rethrow to trigger outer global retry loop
            }
            console.warn(`[GitHub Sync] Ref update attempt ${refAttempt} failed, retrying in 1.5s:`, refErr.message);
            await new Promise(r => setTimeout(r, 1500));
          }
        }

        setPublishStatus('Publish successful!');
        addLog(`🚀 Successfully committed updates directly to GitHub repo ${owner}/${repo} on branch ${branch}`);
        setGhSyncSuccess(true);
        localStorage.setItem('lore:github:success', 'true');
        
        setTimeout(() => {
          setIsPublishing(false);
          setPublishStatus('');
        }, 1500);
        return true;
      } catch (err) {
        console.warn(`[GitHub Sync] Attempt ${gAttempt} failed:`, err.message);
        addLog(`⚠️ Attempt ${gAttempt} failed: ${err.message}`);
        
        if (gAttempt >= maxGlobalRetries) {
          console.error('GitHub Sync failed completely:', err);
          setPublishStatus(`Error: ${err.message}`);
          addLog(`❌ GitHub Commit Sync Failed: ${err.message}`);
          setGhSyncSuccess(false);
          localStorage.setItem('lore:github:success', 'false');
          setTimeout(() => {
            setIsPublishing(false);
            setPublishStatus('');
          }, 1500);
          throw err;
        }
        
        const delay = gAttempt * 2500;
        setPublishStatus(`Sync conflict or error detected. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
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

      const imageFiles = await getLocalImageCommitFiles(mergedStories);
      const filesToCommit = [
        { path: 'public/content/stories.json', content: JSON.stringify({ stories: mergedStories }, null, 2) },
        { path: 'public/content/concept_index.json', content: JSON.stringify(mergedConceptIndex, null, 2) },
        ...imageFiles
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

  // Filtered stories in catalog (includes drafts and live)
  const filteredStories = useMemo(() => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoTime = sevenDaysAgo.getTime();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAgoTime = thirtyDaysAgo.getTime();

    return adminStories.filter(story => {
      const title = story.title || '';
      const storyId = story.story_id || '';
      const hook = story.hook || '';
      const query = searchQuery ? searchQuery.toLowerCase() : '';
      
      const matchesSearch = title.toLowerCase().includes(query) || 
                            storyId.toLowerCase().includes(query) ||
                            hook.toLowerCase().includes(query);
      
      const matchesCategory = filterCategory === 'all' || story.category === filterCategory;
      
      let matchesDate = true;
      if (filterDate !== 'all') {
        if (!story.added_date) {
          matchesDate = false;
        } else {
          const cleanDate = story.added_date.substring(0, 10);
          const storyTime = new Date(story.added_date).getTime();
          
          if (filterDate === 'today') {
            matchesDate = cleanDate === todayStr;
          } else if (filterDate === 'yesterday') {
            matchesDate = cleanDate === yesterdayStr;
          } else if (filterDate === 'week') {
            matchesDate = storyTime >= sevenDaysAgoTime;
          } else if (filterDate === 'month') {
            matchesDate = storyTime >= thirtyDaysAgoTime;
          }
        }
      }
      
      const matchesMissingImage = !filterMissingImages || isImageMissing(story);
      
      return matchesSearch && matchesCategory && matchesDate && matchesMissingImage;
    });
  }, [adminStories, searchQuery, filterCategory, filterDate, filterMissingImages, isImageMissing]);

  // Grouped filtered stories by category, sorted by date descending
  const groupedStories = useMemo(() => {
    const groups = {};
    Object.keys(CATEGORY_LABELS).forEach(cat => {
      groups[cat] = [];
    });
    filteredStories.forEach(story => {
      const cat = story.category || 'other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(story);
    });

    // Sort stories within each group by date descending
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => {
        const dateA = a.added_date ? new Date(a.added_date).getTime() : 0;
        const dateB = b.added_date ? new Date(b.added_date).getTime() : 0;
        return dateB - dateA;
      });
    });

    // Return only groups that have stories
    return Object.entries(groups).filter(([, list]) => list.length > 0);
  }, [filteredStories]);

  const storiesAddedToday = useMemo(() => {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    return adminStories.filter(s => {
      if (!s.added_date) return false;
      const cleanDate = s.added_date.substring(0, 10);
      if (cleanDate === today) return true;
      try {
        const addedTime = new Date(s.added_date).getTime();
        const diffMs = now.getTime() - addedTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 24;
      } catch {
        return false;
      }
    });
  }, [adminStories]);

  const draftStories = useMemo(() => {
    return adminStories.filter(s => s.draft && !isImageMissing(s));
  }, [adminStories, isImageMissing]);

  const approvalStories = useMemo(() => {
    return adminStories.filter(s => s.draft && isImageMissing(s));
  }, [adminStories, isImageMissing]);

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

  const missingImageStoriesCount = useMemo(() => {
    return adminStories.filter(s => isImageMissing(s)).length;
  }, [adminStories, isImageMissing]);

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
            onClick={() => setActiveTab('approval')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer flex justify-between items-center ${
              activeTab === 'approval' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            <span>Approval Queue</span>
            {approvalStories.length > 0 && (
              <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold animate-pulse">
                {approvalStories.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('recommendations');
              loadRecommendations();
            }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'recommendations' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Recommendations ({recommendations.filter(r => r.status === 'pending' || !r.status).length})
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
            onClick={() => {
              setActiveTab('analytics');
              loadAnalytics();
            }}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'analytics' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Visitor Analytics
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'database' ? 'bg-[#9E7B4C] text-white font-bold' : 'hover:bg-neutral-800/40 text-[#8F8A82]'
            }`}
          >
            Database Console
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 text-left" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Dossier Catalog</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Manage and edit the story archive files</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {draftStories.length > 0 && (
                    <button
                      onClick={handlePublishAllDrafts}
                      disabled={isPublishing}
                      className="px-3.5 py-2 bg-emerald-800/80 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all duration-200 active:scale-95 cursor-pointer font-bold"
                    >
                      Publish All Drafts ({draftStories.length})
                    </button>
                  )}
                  <button
                    onClick={handleCreateNewStory}
                    className="px-3.5 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-bold tracking-wider uppercase rounded-lg active:scale-95 transition-all cursor-pointer font-bold"
                  >
                    + Create New Story
                  </button>
                </div>
              </div>

              {/* Asset Health Warning Alert Banner */}
              {!editingStoryId && missingImageStoriesCount > 0 && (
                <div 
                  className="p-4 rounded-lg text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300 font-mono"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.02)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <span>[!] SYSTEM ALERT: DEGRADED MEDIA SIGNAL</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      Detected <strong className="text-red-400 font-bold">{missingImageStoriesCount} {missingImageStoriesCount === 1 ? "dossier" : "dossiers"}</strong> with missing cover assets. Upload or paste media to restore system integrity.
                    </p>
                  </div>
                  <button
                    onClick={() => setFilterMissingImages(prev => !prev)}
                    className="px-3.5 py-1.5 text-[9px] font-mono font-bold tracking-[0.15em] uppercase rounded border transition-all duration-200 active:scale-95 flex-shrink-0 cursor-pointer select-none"
                    style={{
                      color: filterMissingImages ? '#EDE8DF' : '#EF4444',
                      borderColor: filterMissingImages ? 'rgba(237, 232, 223, 0.2)' : 'rgba(239, 68, 68, 0.35)',
                      backgroundColor: filterMissingImages ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.06)'
                    }}
                  >
                    {filterMissingImages ? "Show All Archives" : "Filter Missing"}
                  </button>
                </div>
              )}



              {editingStoryId ? (
                // Story Editor Panel
                <div className="space-y-4 p-5 bg-[#0D0B08] rounded-xl border" style={{ borderColor: ru }}>
                  <h3 className="font-serif italic text-lg text-left" style={{ color: ac }}>
                    {editForm.title ? `Editing: ${editForm.title}` : 'New Dossier Compiler'}
                  </h3>

                  {/* AI Import Utility */}
                  <div className="p-4 bg-[#110F0D] border border-neutral-800 rounded-lg mb-4 text-left space-y-4">
                    {/* Section 1: Prompt Generator */}
                    <div className="border-b border-neutral-900 pb-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-[9.5px] font-mono tracking-wider uppercase text-[#9E7B4C] font-bold">
                          // Step 1: Generate Category-Aware AI Story Prompt
                        </label>
                        {copiedPromptStatus && (
                          <span className="text-[9.5px] font-mono text-emerald-500 uppercase tracking-wider animate-pulse">
                            ✓ Copied to Clipboard!
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mb-2">
                        <select
                          value={aiPromptCategory}
                          onChange={(e) => setAiPromptCategory(e.target.value)}
                          className="px-2 py-1.5 bg-black text-[#9E7B4C] text-[9px] font-mono rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer uppercase tracking-wider min-w-[130px]"
                        >
                          <option value="auto">Auto-Detect</option>
                          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={aiPromptTopic}
                          onChange={(e) => setAiPromptTopic(e.target.value)}
                          placeholder="Enter dossier topic (e.g. The Trojan War, Zodiac Killer)..."
                          className="flex-1 px-3 py-1.5 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none"
                        />
                        <button
                          onClick={handleCopyGeneratedPrompt}
                          type="button"
                          className="px-3.5 py-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-800/40 text-indigo-300 text-[9px] font-mono font-bold tracking-widest uppercase rounded transition-all cursor-pointer"
                        >
                          Copy Prompt
                        </button>
                      </div>
                      <p className="text-[8px] text-[#6A6560] font-mono">
                        // Select the category first for a tone-matched prompt, then copy and paste into ChatGPT/Claude.
                      </p>
                    </div>

                    {/* Section 2: JSON Importer */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-[9.5px] font-mono tracking-wider uppercase text-[#9E7B4C] font-bold">
                          // Step 2: Paste Raw AI JSON Output
                        </label>
                        {aiJsonError && (
                          <span className="text-[9.5px] font-mono text-red-500 uppercase tracking-wider animate-pulse">
                            {aiJsonError}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={aiJsonInput}
                        onChange={(e) => {
                          setAiJsonInput(e.target.value);
                          if (aiJsonError) setAiJsonError(null);
                        }}
                        rows={3}
                        className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                        placeholder="Paste the raw JSON generated by your AI story writer..."
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={handleImportAiJson}
                          type="button"
                          className="px-3 py-1.5 bg-[#9E7B4C]/25 hover:bg-[#9E7B4C]/45 border border-[#9E7B4C]/40 text-[#EDE8DF] text-[9px] font-mono font-bold tracking-widest uppercase rounded transition-all cursor-pointer"
                        >
                          Parse & Populate Form
                        </button>
                      </div>
                    </div>
                  </div>

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

                  <div className="text-left space-y-3">
                    {/* Current image preview */}
                    {editForm.hero_image && (
                      <div className="flex gap-3 items-center p-2.5 bg-neutral-950/60 rounded-lg border border-neutral-800 font-mono">
                        <div className="w-20 h-16 rounded border border-neutral-800 overflow-hidden bg-black flex-shrink-0 flex items-center justify-center relative select-none">
                          {!editImageFailed ? (
                            <img 
                              src={editForm.hero_image} 
                              alt="Cover preview" 
                              className="w-full h-full object-cover" 
                              onError={() => setEditImageFailed(true)} 
                            />
                          ) : (
                            /* Small typographic cover helper */
                            <div 
                              className="w-full h-full flex flex-col justify-between p-1.5 overflow-hidden text-[5px]"
                              style={{ background: getHashGradient(editForm.story_id) }}
                            >
                              <div className="text-[4px] tracking-widest text-[#9E7B4C] uppercase text-left font-bold">
                                // OFFLINE
                              </div>
                              <div className="text-center font-serif italic text-[#EDE8DF]/90 text-[7px] leading-tight line-clamp-2 px-0.5">
                                {getShortTitle(editForm.title)}
                              </div>
                              <div className="text-[4px] tracking-widest text-neutral-500 text-right uppercase">
                                CL-4 // ERR
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-mono text-[#9E7B4C] uppercase tracking-wider mb-1">Current Cover Image</p>
                          <p className="text-[8.5px] text-[#6A6560] font-mono truncate" title={editForm.hero_image}>{editForm.hero_image}</p>
                        </div>
                      </div>
                    )}

                    {/* Image URL direct input */}
                    <div>
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Cover Image URL / Path</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.hero_image}
                          onChange={(e) => {
                            setEditForm(prev => ({ ...prev, hero_image: e.target.value }));
                            setEditImageFailed(false);
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pasted = e.clipboardData?.getData('text')?.trim() || '';
                            setEditForm(prev => ({ ...prev, hero_image: pasted }));
                            setEditImageFailed(false);
                          }}
                          className="flex-1 px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                          placeholder="/content/images/... or https://"
                        />
                        <label
                          htmlFor="editor-cover-upload"
                          className={`px-3 py-2 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[9px] font-mono tracking-wider uppercase rounded flex items-center justify-center min-w-[80px] transition-all select-none font-bold ${(isLocal && !serverOffline) ? 'hover:bg-neutral-800 cursor-pointer active:scale-95' : 'opacity-40 cursor-not-allowed'}`}
                        >
                          {uploadingState === 'uploading' ? '...' : 'Upload'}
                        </label>
                        <input type="file" accept="image/*" id="editor-cover-upload" className="hidden" onChange={(e) => handleUploadImage(e, editForm.story_id)} disabled={uploadingState === 'uploading' || !isLocal || serverOffline} />
                      </div>
                    </div>

                    {/* Smart Wikipedia Image Search Engine */}
                    <div className="p-3 rounded-lg border border-neutral-800/60 bg-black/30 space-y-2">
                      <label className="block text-[9px] font-mono tracking-wider uppercase text-[#9E7B4C] mb-1">🔍 Smart Wikipedia Image Search</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={wikiSearchTerm}
                          onChange={(e) => setWikiSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleWikiImageSearch()}
                          placeholder={editForm.image_query || editForm.title || 'Type Wikipedia article title...'}
                          className="flex-1 px-3 py-1.5 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleWikiImageSearch}
                          disabled={wikiPreviewState === 'loading'}
                          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[#EDE8DF] text-[9px] font-mono tracking-widest uppercase rounded transition-all cursor-pointer disabled:opacity-50"
                        >
                          {wikiPreviewState === 'loading' ? '...' : 'Search'}
                        </button>
                      </div>

                      {/* Preview result */}
                      {wikiPreviewState === 'found' && wikiPreviewImg && (
                        <div className="flex gap-3 items-center p-2.5 bg-neutral-950/60 rounded-lg border border-emerald-900/40 mt-2">
                          <img src={wikiPreviewImg} alt={wikiPreviewTitle} className="w-16 h-14 object-cover rounded border border-neutral-800 bg-black flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[8.5px] font-mono text-emerald-400 uppercase tracking-wider mb-0.5">✓ Found: {wikiPreviewTitle}</p>
                            <p className="text-[7.5px] text-[#6A6560] font-mono truncate">{wikiPreviewImg}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleApproveWikiImage}
                            className="px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-700/50 text-emerald-300 text-[9px] font-mono tracking-widest uppercase rounded transition-all cursor-pointer flex-shrink-0"
                          >
                            Use This
                          </button>
                        </div>
                      )}
                      {wikiPreviewState === 'notfound' && (
                        <p className="text-[8px] text-red-400 font-mono mt-1">// No image found. Try a different keyword or use AI generation below.</p>
                      )}

                      {/* Store image_query separately */}
                      <div>
                        <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-1">Wikipedia Fetch Keyword (saved in story)</label>
                        <input
                          type="text"
                          value={editForm.image_query || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, image_query: e.target.value }))}
                          className="w-full px-3 py-1.5 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                          placeholder="Wikipedia article title (e.g. Project MKUltra)"
                        />
                      </div>
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
                        <option value="curious">🟢 Curious — Mildly Intriguing</option>
                        <option value="unsettling">🟡 Unsettling — Builds Unease</option>
                        <option value="disturbing">🟠 Disturbing — Dark Themes</option>
                        <option value="harrowing">🔴 Harrowing — Deeply Intense</option>
                        <option value="forbidden">🟣 Forbidden — Extreme / Occult</option>
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
                              placeholder="Type story text details in clean, professional English. Separate paragraphs with double newlines."
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
                    <select
                      value={filterDate}
                      onChange={e => setFilterDate(e.target.value)}
                      className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none cursor-pointer min-w-[150px]"
                    >
                      <option value="all">All Dates</option>
                      <option value="today">Added Today</option>
                      <option value="yesterday">Added Yesterday</option>
                      <option value="week">Past 7 Days</option>
                      <option value="month">Past 30 Days</option>
                    </select>
                  </div>

                  {/* Grouped Catalog List */}
                  <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1 text-left">
                    {adminStoriesLoading ? (
                      <div className="py-12 text-center text-neutral-500 italic text-sm animate-pulse">
                        Loading story archive...
                      </div>
                    ) : groupedStories.map(([categoryKey, list]) => (
                      <div key={categoryKey} className="space-y-3">
                        <h3 className="font-serif italic text-base text-[#9E7B4C] border-b border-neutral-800/40 pb-1.5 mt-4 first:mt-0">
                          {CATEGORY_LABELS[categoryKey] || categoryKey} ({list.length})
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {list.map(story => {
                            const qb = getQualityBadge(story);
                            const dup = findPotentialDuplicate(story, stories);

                            return (
                              <div
                                key={story.story_id}
                                className="p-4 rounded-xl border transition-all hover:bg-white/2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0D0B08]"
                                style={{ borderColor: story.draft ? 'rgba(158, 123, 76, 0.25)' : ru }}
                              >
                                <div className="text-left min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-serif italic text-[#EDE8DF] text-base leading-snug">{story.title}</span>
                                    {story.draft ? (
                                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                                        Draft
                                      </span>
                                    ) : (
                                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
                                        Live
                                      </span>
                                    )}

                                    {isImageMissing(story) && (
                                      <span 
                                        className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase"
                                        title="No cover image set or file path is offline."
                                      >
                                        ⚠️ Missing Image
                                      </span>
                                    )}

                                    {/* Quality Score Badge */}
                                    <span 
                                      className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase"
                                      style={{ color: qb.color, backgroundColor: qb.bg, borderColor: qb.border }}
                                      title={`Quality Score: ${qb.score}/100. Based on words, cover, layers, and tags.`}
                                    >
                                      Score: {qb.grade} ({qb.score}%)
                                    </span>

                                    {/* Duplicate Warning */}
                                    {dup && (
                                      <span 
                                        className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 uppercase"
                                        title={`Warning: shares similarity with "${dup.title}" (${dup.reason})`}
                                      >
                                        ⚠️ Duplicate ({dup.reason})
                                      </span>
                                    )}

                                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 uppercase tracking-widest">
                                      {story.severity}
                                    </span>
                                    {story.added_date && (
                                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 uppercase tracking-widest">
                                        PUBLISHED: {story.added_date}
                                      </span>
                                    )}
                                  </div>
                                  {story.hook && <p className="text-xs text-[#6A6560] mt-1.5 line-clamp-1 italic">"{story.hook}"</p>}
                                  {isImageMissing(story) && (
                                    <div className="mt-2.5 pt-2 border-t border-dashed border-neutral-900/60 flex items-center gap-3">
                                      <a
                                        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent((story.title || '').split(/[:-]/)[0].trim() + ' conceptual art')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[8px] font-mono tracking-widest text-[#F59E0B] hover:text-[#F59E0B]/90 bg-[#F59E0B]/5 hover:bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded cursor-pointer select-none transition-all duration-200"
                                        style={{ textDecoration: 'none' }}
                                      >
                                        🔍 Search Google
                                      </a>
                                      <div className="flex-1 flex items-center gap-2">
                                        {rowPreviews[story.story_id] && (
                                          <div className="w-8 h-6 rounded border border-neutral-800 overflow-hidden flex-shrink-0 bg-black flex items-center justify-center relative">
                                            <img src={rowPreviews[story.story_id]} alt="Pasted preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                              <span className="w-2 h-2 rounded-full border-t border-b border-amber-500 animate-spin" />
                                            </div>
                                          </div>
                                        )}
                                        <input
                                          type="text"
                                          placeholder={rowPreviews[story.story_id] ? "Signal acquired, synchronizing database..." : "Ctrl+V here to paste cover image or URL..."}
                                          disabled={!!rowPreviews[story.story_id]}
                                          onClick={(e) => e.stopPropagation()}
                                          onPaste={async (e) => {
                                             e.preventDefault();
                                             e.stopPropagation();
                                             
                                             let pastedText = e.clipboardData?.getData('text')?.trim() || '';
                                             if (pastedText.startsWith('//')) {
                                               pastedText = 'https:' + pastedText;
                                             } else if (pastedText.startsWith('/') && !pastedText.startsWith('/content/')) {
                                               pastedText = 'https://media.cnn.com' + pastedText;
                                             }
                                             
                                             if (pastedText.startsWith('http') || pastedText.startsWith('data:image')) {
                                               handlePasteTrigger(story, pastedText);
                                               return;
                                             }
                                             
                                             const items = e.clipboardData?.items;
                                             if (items) {
                                               for (let i = 0; i < items.length; i++) {
                                                 const item = items[i];
                                                 if (item.type.indexOf('image') !== -1) {
                                                   const file = item.getAsFile();
                                                   if (file) {
                                                     const reader = new FileReader();
                                                     reader.onloadend = async () => {
                                                       handlePasteTrigger(story, reader.result);
                                                     };
                                                     reader.readAsDataURL(file);
                                                     return;
                                                   }
                                                 }
                                               }
                                             }
                                           }}
                                          className="w-full px-2.5 py-1 bg-black text-[#EDE8DF]/90 text-[9px] rounded border border-neutral-900 focus:border-[#F59E0B]/50 focus:outline-none placeholder-neutral-700 font-mono disabled:opacity-50"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              <div className="flex gap-2 flex-shrink-0">
                                {story.draft && (
                                  <button
                                    onClick={() => handlePublishStory(story.story_id)}
                                    disabled={isPublishing}
                                    className="text-[9px] font-mono font-bold tracking-wider px-2.5 py-1.5 bg-emerald-800/20 border border-emerald-800/40 text-emerald-400 rounded-lg hover:bg-emerald-800/30 cursor-pointer transition-colors active:scale-95 disabled:opacity-40"
                                  >
                                    Push to Live
                                  </button>
                                )}
                                <button
                                  onClick={() => startEditing(story)}
                                  className="text-[9px] font-mono px-2.5 py-1.5 border border-neutral-800 rounded-lg hover:bg-white/5 text-neutral-400 cursor-pointer transition-colors active:scale-95"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteStory(story.story_id, story)}
                                  className="text-[9px] font-mono px-2.5 py-1.5 border border-red-950/30 text-red-500 rounded-lg hover:bg-red-950/10 cursor-pointer transition-colors active:scale-95"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    ))}
                    {groupedStories.length === 0 && (
                      <div className="py-12 text-center text-neutral-500 italic text-sm">
                        No stories match search criteria.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Approval Queue */}
          {activeTab === 'approval' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4 text-left" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Approval Queue</h2>
                  <p className="text-xs text-[#6A6560] mt-1">
                    Dossier drafts missing a valid cover thumbnail. Add an image or generate one using Flux AI to publish.
                  </p>
                </div>
              </div>

              {approvalStories.length === 0 ? (
                <div className="py-16 text-center border border-dashed rounded-xl bg-neutral-950/10 border-neutral-800 space-y-3">
                  <div className="text-2xl text-[#9E7B4C]/40">✓</div>
                  <p className="font-serif italic text-[#EDE8DF]/75">No dossiers require approval.</p>
                  <p className="text-[10px] font-mono text-[#6A6560] uppercase tracking-wider">
                    All current drafts have valid thumbnail images assigned.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {approvalStories.map((story) => (
                    <ApprovalCard
                      key={story.story_id}
                      story={story}
                      onSaveImage={handleSaveImageSource}
                      onPublish={handlePublishStory}
                      onEdit={() => startEditing(story)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Recommendations Queue */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4 text-left" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Recommendations Queue</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Pending and approved topics submitted by readers or added by admins</p>
                </div>
                <button
                  onClick={loadRecommendations}
                  className="px-3 py-1.5 border rounded text-[10px] font-mono hover:bg-white/5 cursor-pointer transition-all uppercase font-bold"
                  style={{ borderColor: ru }}
                >
                  ⟳ Reload
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Column */}
                <div className="lg:col-span-1 space-y-4 text-left">
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

                {/* List Column */}
                <div className="lg:col-span-2 space-y-6 text-left">
                  {recsLoading ? (
                    <div className="text-center py-12 text-[#6A6560] font-mono text-xs animate-pulse">
                      Loading recommendations queue...
                    </div>
                  ) : (
                    <>
                      {/* Pending Topics */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-[#9E7B4C] font-bold">Pending Topics</h4>
                        {recommendations.filter(r => r.status === 'pending' || !r.status).length === 0 ? (
                          <div className="p-4 text-center bg-black/20 rounded-xl border border-neutral-800/40 text-neutral-500 text-xs italic">
                            No pending topics.
                          </div>
                        ) : (
                          <div className="border rounded-xl overflow-hidden bg-black/10" style={{ borderColor: ru }}>
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b" style={{ borderColor: ru, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Topic Name</th>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Date Added</th>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560] text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recommendations.filter(r => r.status === 'pending' || !r.status).map((rec) => (
                                  <tr key={rec.id} className="border-b transition-colors hover:bg-white/2" style={{ borderColor: ru }}>
                                    <td className="p-3 font-serif text-sm text-neutral-200 font-medium">{rec.topic}</td>
                                    <td className="p-3 text-[#8F8A82] font-mono text-[10px]">{rec.date}</td>
                                    <td className="p-3 text-right flex gap-2 justify-end">
                                      <button
                                        onClick={() => handleUseTopic(rec.topic)}
                                        className="text-[10px] font-mono text-[#9E7B4C] hover:text-[#b08c5c] cursor-pointer px-2 py-1 hover:bg-[#9E7B4C]/10 rounded transition-colors"
                                      >
                                        Use Topic
                                      </button>
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
                        )}
                      </div>

                      {/* Generated Topics */}
                      <div className="space-y-3 pt-4">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-[#6A6560] font-bold">Generated Topics</h4>
                        {recommendations.filter(r => r.status === 'generated').length === 0 ? (
                          <div className="p-4 text-center bg-black/20 rounded-xl border border-neutral-800/40 text-neutral-600 text-xs italic">
                            No generated topics yet.
                          </div>
                        ) : (
                          <div className="border rounded-xl overflow-hidden bg-black/10" style={{ borderColor: ru }}>
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b" style={{ borderColor: ru, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Topic Name</th>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560]">Date Added</th>
                                  <th className="p-3 font-mono text-[9px] uppercase tracking-wider text-[#6A6560] text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recommendations.filter(r => r.status === 'generated').map((rec) => (
                                  <tr key={rec.id} className="border-b transition-colors hover:bg-white/2" style={{ borderColor: ru }}>
                                    <td className="p-3 font-serif text-sm text-neutral-400 line-through decoration-neutral-700">{rec.topic}</td>
                                    <td className="p-3 text-[#6A6560] font-mono text-[10px]">{rec.date}</td>
                                    <td className="p-3 text-right">
                                      <button
                                        onClick={() => handleDeleteRecommendation(rec.id)}
                                        className="text-[10px] font-mono text-red-500 hover:text-red-400 cursor-pointer px-2 py-1 hover:bg-red-500/10 rounded transition-colors"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: AI Generator */}
          {activeTab === 'generator' && (
            <div className="space-y-6">
              
              {/* Header & Stats bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b gap-4 text-left" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">AI Generator</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Compile new stories or manage background runner settings</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTriggerAutomation}
                    disabled={isGenerating || autoStatus.isRunning || (isLocal ? serverOffline : true)}
                    className="px-3.5 py-2 bg-emerald-800/80 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold tracking-wider uppercase rounded-lg active:scale-95 transition-all cursor-pointer font-bold"
                  >
                    Force Background Run
                  </button>
                </div>
              </div>

              {/* Stats & Last run */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <div className="p-4 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Stories Created Today</span>
                  <span className="font-serif italic text-2xl text-[#9E7B4C]">{storiesAddedToday.length}</span>
                </div>
                <div className="p-4 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Last Run Done</span>
                  <span className="text-xs font-mono font-bold block mt-1.5 text-neutral-200">
                    {autoStatus.lastRunAt ? new Date(autoStatus.lastRunAt).toLocaleString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'Never'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Column 1: Manual Generator */}
                <div className="space-y-6 text-left">
                  <div className="border-b pb-2" style={{ borderColor: ru }}>
                    <h3 className="font-serif italic text-lg text-neutral-300">Manual Topic Compiler</h3>
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
                        className="w-full py-2.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-widest uppercase rounded hover:bg-[#b08c5c] active:scale-95 disabled:opacity-40 transition-all cursor-pointer font-bold"
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
                  <div className="border-b pb-2" style={{ borderColor: ru }}>
                    <h3 className="font-serif italic text-lg text-neutral-300">Auto-Generator Settings</h3>
                  </div>

                  <div className="space-y-4 p-5 bg-[#0D0B08] rounded-xl border" style={{ borderColor: ru }}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-400">Background Engine Status</span>
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
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="p-3 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                        <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Runner State</span>
                        <span className="text-xs font-mono font-bold" style={{ color: autoStatus.isRunning ? '#F59E0B' : autoStatus.enabled ? '#10B981' : '#6A6560' }}>
                          {autoStatus.isRunning ? '⚡ RUNNING' : autoStatus.enabled ? '● ACTIVE' : '◌ DISABLED'}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border bg-black/30 text-left" style={{ borderColor: ru }}>
                        <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Auto Interval</span>
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
            </div>
          )}

          {/* Tab 4: User Feedback */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4 text-left" style={{ borderColor: ru }}>
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
                    className={`px-3 py-1.5 text-[10px] font-mono rounded cursor-pointer transition-all uppercase font-bold border border-neutral-800 ${
                      feedbackFilter === mode 
                        ? 'bg-[#9E7B4C]/10 border-[#9E7B4C] text-[#9E7B4C]' 
                        : 'text-neutral-400 hover:text-neutral-200'
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

          {/* Tab 5: Settings & Sync */}
          {/* Tab 5: Database Console */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="border-b pb-4 text-left gap-3 flex flex-col sm:flex-row sm:items-center justify-between" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Database Console</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Execute raw SQL queries directly on the SQLite database (lore.db)</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDbSqlQuery("SELECT name, tbl_name FROM sqlite_master WHERE type='table';")}
                    className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[9px] font-mono tracking-wider uppercase rounded hover:bg-neutral-800 cursor-pointer"
                  >
                    List Tables
                  </button>
                  <button
                    onClick={() => setDbSqlQuery("SELECT story_id, title, category, severity, draft FROM stories LIMIT 10;")}
                    className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[9px] font-mono tracking-wider uppercase rounded hover:bg-neutral-800 cursor-pointer"
                  >
                    Select Stories
                  </button>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">SQL Query</label>
                  <textarea
                    value={dbSqlQuery}
                    onChange={e => setDbSqlQuery(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors font-mono resize-y"
                    placeholder="DELETE FROM stories WHERE story_id = 'your_story_id';"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Write raw SQLite queries. Modifying queries on the <code>stories</code> table will automatically regenerate the static JSON files.
                  </p>
                </div>

                <button
                  onClick={handleExecuteSqlQuery}
                  disabled={dbQueryExecuting || !dbSqlQuery.trim()}
                  className="px-4 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-mono font-bold uppercase rounded-lg active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer text-center"
                >
                  {dbQueryExecuting ? 'Executing Query...' : 'Execute SQL Query'}
                </button>

                {dbQueryError && (
                  <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs font-mono text-left">
                    <strong>Error:</strong> {dbQueryError}
                  </div>
                )}

                {dbQueryResults && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-mono tracking-widest uppercase text-[#9E7B4C] font-bold">Query Results</h4>
                    <div className="border border-neutral-850 rounded-xl overflow-hidden bg-black/25 max-h-[300px] overflow-y-auto">
                      {Array.isArray(dbQueryResults) ? (
                        dbQueryResults.length === 0 ? (
                          <div className="p-4 text-center text-neutral-500 italic text-xs">
                            Query returned 0 rows.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                              <tr className="border-b border-neutral-800 bg-neutral-900/60 font-bold">
                                {Object.keys(dbQueryResults[0]).map(key => (
                                  <th key={key} className="p-3 text-[9px] uppercase tracking-wider text-[#6A6560] border-r border-neutral-800 last:border-0">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {dbQueryResults.map((row, idx) => (
                                <tr key={idx} className="border-b border-neutral-850 last:border-0 hover:bg-white/2">
                                  {Object.entries(row).map(([key, val]) => (
                                    <td key={key} className="p-3 text-neutral-350 border-r border-neutral-850 last:border-0 truncate max-w-[200px]" title={String(val)}>
                                      {val === null ? <em className="text-neutral-600">NULL</em> : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      ) : (
                        <div className="p-4 text-left text-neutral-300 text-xs font-mono whitespace-pre-wrap">
                          {JSON.stringify(dbQueryResults, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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

                <div className="pt-2 flex flex-col gap-3 text-left">
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
                    className="px-4 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-mono font-bold uppercase rounded-lg active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer w-full text-center"
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

          {/* Tab 8: Visitor Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 text-left" style={{ borderColor: ru }}>
                <div className="text-left">
                  <h2 className="font-serif italic text-2xl">Visitor Analytics</h2>
                  <p className="text-xs text-[#6A6560] mt-1">Lightweight self-hosted SQLite pageview tracker metrics</p>
                </div>
                <button
                  onClick={loadAnalytics}
                  disabled={analyticsLoading}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] font-mono font-bold uppercase rounded-lg active:scale-95 transition-all cursor-pointer font-bold"
                >
                  {analyticsLoading ? 'Refreshing...' : 'Refresh Stats'}
                </button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                <div className="p-4 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Total Pageviews</span>
                  <span className="font-serif italic text-2xl text-[#EDE8DF]">{analyticsData.totalPageviews}</span>
                </div>
                <div className="p-4 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Unique Visitors</span>
                  <span className="font-serif italic text-2xl text-[#9E7B4C]">{analyticsData.uniqueVisitors}</span>
                </div>
                <div className="p-4 rounded-xl border bg-black/30" style={{ borderColor: ru }}>
                  <span className="text-[9px] font-mono tracking-wider uppercase block mb-1 text-[#6A6560]">Active Sessions (30m)</span>
                  <span className="font-serif italic text-2xl text-[#10B981]">{analyticsData.activeSessions}</span>
                </div>
              </div>

              {/* Pageviews Table */}
              <div className="space-y-3 text-left">
                <div className="border-b pb-2 flex items-center justify-between" style={{ borderColor: ru }}>
                  <h3 className="font-serif italic text-lg text-neutral-300">Recent Logs (Last 50 Views)</h3>
                  <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">REALTIME STREAM</span>
                </div>
                {analyticsData.recentPageviews.length === 0 ? (
                  <div className="text-center py-12 text-[#6A6560]">
                    <p className="font-serif italic text-base">No visitor traffic logged yet.</p>
                    <p className="text-[9px] font-mono uppercase mt-1">Navigate pages on the main site to trigger logs.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-neutral-900 bg-neutral-950/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900 bg-neutral-950 font-mono text-[9px] text-[#6A6560] uppercase tracking-wider">
                          <th className="p-3">Timestamp</th>
                          <th className="p-3">Path</th>
                          <th className="p-3">Visitor ID</th>
                          <th className="p-3">Session ID</th>
                          <th className="p-3">Referrer</th>
                          <th className="p-3">Device / User Agent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-950 font-mono text-[10.5px]">
                        {analyticsData.recentPageviews.map((pv) => {
                          const dateObj = new Date(pv.timestamp);
                          const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                          
                          let uaShort = 'Desktop / Browser';
                          if (pv.user_agent) {
                            const ua = pv.user_agent;
                            if (ua.includes('Mobi') || ua.includes('Android') || ua.includes('iPhone')) {
                              uaShort = 'Mobile Device';
                            }
                            if (ua.includes('Chrome') && !ua.includes('Edg')) uaShort += ' (Chrome)';
                            else if (ua.includes('Safari') && !ua.includes('Chrome')) uaShort += ' (Safari)';
                            else if (ua.includes('Edg')) uaShort += ' (Edge)';
                            else if (ua.includes('Firefox')) uaShort += ' (Firefox)';
                          }

                          return (
                            <tr key={pv.id} className="hover:bg-neutral-900/10 text-neutral-300">
                              <td className="p-3 text-[#6A6560] whitespace-nowrap">{formattedTime}</td>
                              <td className="p-3 text-[#9E7B4C] font-semibold">{pv.path}</td>
                              <td className="p-3 select-all" title={pv.visitor_id}>{pv.visitor_id?.substring(2, 8)}...</td>
                              <td className="p-3 select-all" title={pv.session_id}>{pv.session_id?.substring(2, 8)}...</td>
                              <td className="p-3 truncate max-w-[120px]" title={pv.referrer}>{pv.referrer || 'direct'}</td>
                              <td className="p-3 truncate max-w-[200px]" title={pv.user_agent}>{uaShort}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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

      {/* Paste Confirmation Modal Popup */}
      {pasteConfirmation && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md bg-[#0C0A08] border rounded-2xl overflow-hidden shadow-2xl flex flex-col font-mono text-left"
            style={{ borderColor: 'rgba(158,123,76,0.3)' }}
          >
            {/* Header */}
            <div className="p-4 border-b border-neutral-900 bg-neutral-950 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[7.5px] tracking-widest text-[#9E7B4C] uppercase font-bold">
                  // TELEMETRY IMAGE SYNC GATING
                </span>
                <h3 className="font-serif italic text-sm text-[#EDE8DF] truncate max-w-[280px]">
                  {pasteConfirmation.title}
                </h3>
              </div>
              <button
                disabled={pasteUploading}
                onClick={() => {
                  setPasteConfirmation(null);
                  setPasteError(null);
                  setPasteSuccess(false);
                  setPasteUploading(false);
                  setRowPreviews(prev => {
                    const next = { ...prev };
                    delete next[pasteConfirmation.story_id];
                    return next;
                  });
                }}
                className="text-[9px] font-mono tracking-widest uppercase hover:opacity-60 cursor-pointer text-neutral-500 disabled:opacity-30"
              >
                [ESC]
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950 flex items-center justify-center">
                {pasteUploading && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center">
                    <span className="w-8 h-8 rounded-full border-2 border-t-transparent border-[#9E7B4C] animate-spin" />
                    <div className="space-y-1 w-full max-w-[240px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#9E7B4C] font-bold animate-pulse">Syncing visual telemetry...</p>
                      <p className="text-[7.5px] text-neutral-400 font-mono truncate">{pasteStatusText}</p>
                    </div>
                    <div className="w-full max-w-[200px] h-1 bg-neutral-900 rounded-full overflow-hidden border border-neutral-950 mt-1">
                      <div 
                        className="h-full bg-[#9E7B4C] transition-all duration-300 ease-out"
                        style={{ width: `${pasteProgress}%` }}
                      />
                    </div>
                    <span className="text-[7.5px] font-mono text-[#9E7B4C]/80">{pasteProgress}%</span>
                  </div>
                )}
                {pasteSuccess && (
                  <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center gap-2.5 z-10 px-6 text-center">
                    <span className="text-xl text-[#10B981]">✓</span>
                    <div className="space-y-1 w-full max-w-[240px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#10B981] font-bold">Signal Synchronized</p>
                      <p className="text-[7.5px] text-neutral-400 font-mono truncate">{pasteStatusText || 'Dossier successfully published live.'}</p>
                    </div>
                    <div className="w-full max-w-[200px] h-1 bg-[#10B981]/20 rounded-full overflow-hidden border border-neutral-950 mt-1">
                      <div 
                        className="h-full bg-[#10B981] transition-all duration-300 ease-out"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}
                {pasteError ? (
                  <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center gap-2 p-4 text-center z-10">
                    <span className="text-xl">⚠️</span>
                    <p className="text-[9px] uppercase tracking-widest text-red-500 font-bold">Signal Error</p>
                    <p className="text-[8px] text-neutral-400 mt-1 max-w-[280px] break-words line-clamp-3">{pasteError}</p>
                    <button
                      onClick={() => handleConfirmPastePublish()}
                      className="mt-2 text-[8px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                    >
                      Retry sync
                    </button>
                  </div>
                ) : null}
                <img 
                  src={pasteConfirmation.imageSource} 
                  alt="Pasted preview" 
                  className="w-full h-full object-cover"
                  onError={() => {
                    console.warn('Pasted image failed to load in frontend canvas.');
                  }}
                />
              </div>

              <div className="space-y-3">
                <div className="rounded-lg bg-black/40 border border-neutral-900 p-2.5 space-y-1 text-[8px]">
                  <div className="flex justify-between">
                    <span className="text-[#6A6560]">DOSSIER ID:</span>
                    <span className="text-neutral-400 font-bold">{pasteConfirmation.story_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6A6560]">STATUS:</span>
                    <span className={pasteConfirmation.story.draft ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
                      {pasteConfirmation.story.draft ? "DRAFT (AUTO-PUBLISH ON SAVE)" : "LIVE"}
                    </span>
                  </div>
                  <div className="space-y-0.5 mt-1 border-t border-neutral-900 pt-1.5 text-left">
                    <span className="text-[#6A6560] block">RESOLVED SOURCE URI:</span>
                    <span className="text-neutral-500 font-mono break-all line-clamp-2 block bg-black/60 p-1 rounded mt-0.5 select-all">
                      {pasteConfirmation.imageSource}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-900 bg-neutral-950 flex justify-between gap-3">
              <button
                disabled={pasteUploading || pasteSuccess}
                onClick={() => {
                  setPasteConfirmation(null);
                  setPasteError(null);
                  setPasteSuccess(false);
                  setPasteUploading(false);
                  setRowPreviews(prev => {
                    const next = { ...prev };
                    delete next[pasteConfirmation.story_id];
                    return next;
                  });
                }}
                className="px-3.5 py-2 bg-transparent hover:bg-white/5 border border-neutral-800 text-neutral-400 hover:text-[#EDE8DF] text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-all cursor-pointer disabled:opacity-30"
              >
                Abort Sync
              </button>
              <button
                disabled={pasteUploading || pasteSuccess}
                onClick={handleConfirmPastePublish}
                className="px-4 py-2 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-30"
                style={{
                  background: 'rgba(158,123,76,0.25)',
                  border: '1px solid rgba(158,123,76,0.4)',
                  color: '#EDE8DF',
                }}
              >
                {pasteUploading ? 'Synchronizing...' : '✓ Confirm & Publish Live'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
