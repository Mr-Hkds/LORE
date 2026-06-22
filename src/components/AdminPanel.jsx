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

export default function AdminPanel({ stories, localStories, setLocalStories, refetchStories, onBack, onStoryDeleted }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  // Tabs: 'catalog' | 'recommendations' | 'generator' | 'automation' | 'feedback' | 'ai-editor' | 'github-sync'
  const [activeTab, setActiveTab] = useState('catalog');

  // GitHub Sync Configuration States
  const [ghOwner, setGhOwner] = useState(() => localStorage.getItem('lore:github:owner') || import.meta.env.VITE_GITHUB_OWNER || 'Mr-Hkds');
  const [ghRepo, setGhRepo] = useState(() => localStorage.getItem('lore:github:repo') || import.meta.env.VITE_GITHUB_REPO || 'LORE');
  const [ghBranch, setGhBranch] = useState(() => localStorage.getItem('lore:github:branch') || import.meta.env.VITE_GITHUB_BRANCH || 'main');
  const [ghToken, setGhToken] = useState(() => localStorage.getItem('lore:github:token') || import.meta.env.VITE_GITHUB_TOKEN || '');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('lore:github:owner', ghOwner);
    localStorage.setItem('lore:github:repo', ghRepo);
    localStorage.setItem('lore:github:branch', ghBranch);
    localStorage.setItem('lore:github:token', ghToken);
  }, [ghOwner, ghRepo, ghBranch, ghToken]);

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
  const [autoStatus, setAutoStatus] = useState({ isRunning: false, logCount: 0 });
  const [autoLogs, setAutoLogs] = useState([]);
  const [serverOffline, setServerOffline] = useState(false);
  const consecutiveFailuresRef = useRef(0);

  // Read apiKey from env on load
  useEffect(() => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    setApiKey(envKey);
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

  // Fetch status and logs from server
  const fetchAutomationData = useCallback(async () => {
    try {
      const resStatus = await fetch('/api/automation/status');
      if (resStatus.ok) {
        const status = await resStatus.json();
        setAutoStatus(status);
        setServerOffline(false);
        consecutiveFailuresRef.current = 0;
      } else {
        throw new Error('Server returned non-ok status');
      }
      
      const resLogs = await fetch('/api/automation/logs');
      if (resLogs.ok) {
        const logsData = await resLogs.json();
        setAutoLogs(logsData);
      }
    } catch (err) {
      console.warn('Failed to fetch automation data:', err);
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setServerOffline(true);
      }
    }
  }, []);

  // Poll automation logs and status
  useEffect(() => {
    fetchAutomationData();
    const intervalTime = serverOffline ? 30000 : 2500; // Slow down polling when offline to stop spamming console
    const interval = setInterval(fetchAutomationData, intervalTime);
    return () => clearInterval(interval);
  }, [fetchAutomationData, serverOffline]);

  const [isHarvesting, setIsHarvesting] = useState(false);

  const commitFilesToGitHub = async (filesToCommit, commitMessage) => {
    if (!ghToken) {
      throw new Error('GitHub Personal Access Token is required. Please set it in GitHub Sync Settings.');
    }
    setIsPublishing(true);
    setPublishStatus('Initializing GitHub publish...');
    try {
      for (const file of filesToCommit) {
        setPublishStatus(`Fetching metadata for ${file.path}...`);
        const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${file.path}?ref=${ghBranch}`;
        
        let sha = null;
        try {
          const res = await fetch(url, {
            headers: {
              'Authorization': `token ${ghToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (res.ok) {
            const data = await res.json();
            sha = data.sha;
          }
        } catch (err) {
          console.warn(`File ${file.path} might be new:`, err);
        }

        setPublishStatus(`Committing ${file.path}...`);
        const body = {
          message: commitMessage,
          content: btoa(unescape(encodeURIComponent(file.content))),
          branch: ghBranch
        };
        if (sha) {
          body.sha = sha;
        }

        const putRes = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${file.path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!putRes.ok) {
          const errorData = await putRes.json();
          throw new Error(`GitHub API Error for ${file.path}: ${errorData.message || putRes.statusText}`);
        }
      }
      setPublishStatus('Publish successful!');
      addLog(`🚀 Successfully committed updates directly to GitHub repo ${ghOwner}/${ghRepo} on branch ${ghBranch}`);
      return true;
    } catch (err) {
      console.error('GitHub Sync failed:', err);
      setPublishStatus(`Error: ${err.message}`);
      addLog(`❌ GitHub Commit Sync Failed: ${err.message}`);
      throw err;
    } finally {
      setTimeout(() => {
        setIsPublishing(false);
        setPublishStatus('');
      }, 3000);
    }
  };

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

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: 'You are a data filtering bot. Output only valid JSON arrays, no markdown wrapping.'
        })
      });

      if (!res.ok) throw new Error(`AI proxy error: ${res.status}`);
      const data = await res.json();
      const text = data?.text;
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
    let serverSaved = false;
    try {
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        addLog(`Successfully saved & pushed changes for story: ${storyId}`);
        serverSaved = true;
        const updatedLocal = localStories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
        setLocalStories(updatedLocal);
        localStorage.setItem('lore:custom_stories', JSON.stringify(updatedLocal));
        if (refetchStories) refetchStories();
        setEditingStoryId(null);
      }
    } catch (err) {
      console.warn('Local server save failed:', err);
    }

    if (!serverSaved) {
      // Local fallback
      const updatedLocal = localStories.map(s => s.story_id === storyId ? { ...s, ...editForm } : s);
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
          alert('Story successfully updated and committed to GitHub live site!');
        } catch (err) {
          alert(`Failed to commit changes to GitHub: ${err.message}`);
        }
      } else {
        alert('Local API server is offline. Changes were saved locally to your browser only. Configure GitHub Sync in Settings to push changes live.');
      }
    } else {
      alert('Story successfully updated on the local server.');
    }
  };

  // Handle deleting a story
  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Are you sure you want to delete this story from the archive?')) return;
    
    let serverDeleted = false;
    // Try to delete from local server
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
          alert('Story successfully deleted and changes committed to GitHub live site!');
        } catch (err) {
          alert(`Failed to commit deletion to GitHub: ${err.message}`);
        }
      } else {
        alert('Story deleted locally (removed from your browser view). Configure GitHub Sync in Settings to delete it permanently from the live website.');
      }
    } else {
      alert('Story permanently deleted from server.');
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
    if (!apiKey) {
      alert('A Gemini API Key is required to run the content engine. Please input one or set it in your .env file.');
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
  "severity": "${severityVal}",ncept3"],
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
      let serverSaved = false;
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
              Topic Suggestions
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
            onClick={async () => {
              setActiveTab('feedback');
              setFeedbackLoading(true);
              try { const r = await fetch('/api/feedback'); if (r.ok) setFeedbackItems(await r.json()); } catch { /* ignore */ }
              setFeedbackLoading(false);
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
            GitHub Sync {ghToken ? '✓' : '⚠️'}
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
                          <label className="block text-[8px] font-mono tracking-wider uppercase text-[#6A6560] mb-0.5">Cover Image Path</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editForm.hero_image}
                              onChange={(e) => setEditForm(prev => ({ ...prev, hero_image: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono"
                            />
                            <label
                              htmlFor={`upload-${story.story_id}`}
                              className="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-[#EDE8DF] text-[10px] font-mono tracking-wider uppercase rounded cursor-pointer flex items-center justify-center min-w-[80px] active:scale-95 transition-all select-none font-bold"
                            >
                              {uploadingState === 'uploading' ? '...' : 'Upload'}
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              id={`upload-${story.story_id}`}
                              className="hidden"
                              onChange={(e) => handleUploadImage(e, story.story_id)}
                              disabled={uploadingState === 'uploading'}
                            />
                          </div>
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
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Insert VITE_GEMINI_API_KEY..."
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
                        checked={!!autoStatus.enabled}
                        onChange={handleToggleAutomation}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#EDE8DF] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#9E7B4C]" />
                    </div>
                  </label>
                  <button
                    onClick={handleTriggerAutomation}
                    disabled={isGenerating || autoStatus.isRunning}
                    className="px-3 py-1.5 bg-neutral-900 border rounded text-[10px] font-mono font-bold tracking-wider hover:bg-white/5 disabled:opacity-40 transition-all uppercase cursor-pointer"
                    style={{ borderColor: ru }}
                  >
                    {autoStatus.isRunning ? '⚡ Running...' : 'Force Run'}
                  </button>
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
                  onClick={async () => {
                    setFeedbackLoading(true);
                    try { const r = await fetch('/api/feedback'); if (r.ok) setFeedbackItems(await r.json()); } catch { /* ignore */ }
                    setFeedbackLoading(false);
                  }}
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
                    onChange={e => setGhOwner(e.target.value)}
                    placeholder="e.g. Mr-Hkds"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Repository Name</label>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={e => setGhRepo(e.target.value)}
                    placeholder="e.g. LORE"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Target Branch</label>
                  <input
                    type="text"
                    value={ghBranch}
                    onChange={e => setGhBranch(e.target.value)}
                    placeholder="e.g. main"
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">Personal Access Token (PAT)</label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={e => setGhToken(e.target.value)}
                    placeholder="ghp_..."
                    className="px-3 py-2 bg-black text-[#EDE8DF] text-xs rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                  />
                  <p className="text-[9px] text-[#6A6560] leading-relaxed">
                    Token is stored purely inside your browser's local storage and is never sent anywhere except directly to GitHub's REST API. Required scope: <code>repo</code> or <code>contents:write</code>.
                  </p>
                </div>

                <div className="pt-2 text-left">
                  <button
                    onClick={async () => {
                      if (!ghToken) {
                        alert('Please provide a token first.');
                        return;
                      }
                      setIsPublishing(true);
                      setPublishStatus('Testing connection...');
                      try {
                        const res = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}`, {
                          headers: {
                            'Authorization': `token ${ghToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                          }
                        });
                        if (res.ok) {
                          alert(`Success! Successfully connected to repository ${ghOwner}/${ghRepo}.`);
                        } else {
                          const errData = await res.json();
                          alert(`Failed: ${errData.message || res.statusText}`);
                        }
                      } catch (err) {
                        alert(`Connection error: ${err.message}`);
                      } finally {
                        setIsPublishing(false);
                        setPublishStatus('');
                      }
                    }}
                    disabled={isPublishing}
                    className="px-4 py-2 bg-[#9E7B4C] hover:bg-[#b08c5c] text-white text-[10px] font-mono font-bold uppercase rounded active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer"
                  >
                    {isPublishing ? 'Testing...' : 'Test Sync Connection'}
                  </button>
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
    </div>
  );
}
