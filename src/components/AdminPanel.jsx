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

export default function AdminPanel({ stories, localStories, setLocalStories, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  // Tabs: 'catalog' | 'recommendations' | 'generator'
  const [activeTab, setActiveTab] = useState('catalog');
  
  // Custom stories state
  const [recommendations, setRecommendations] = useState([]);
  const [expandedStoryId, setExpandedStoryId] = useState(null);

  // Generator form state
  const [genTopic, setGenTopic] = useState('');
  const [genCategory, setGenCategory] = useState('psychology');
  const [genSeverity, setGenSeverity] = useState('unsettling');
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
    } catch (err) {
      console.warn('Could not connect to local server for recommendations, using local state.');
    }

    setRecommendations(localRecs);
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  // Handle deleting a custom story
  const handleDeleteStory = (storyId) => {
    if (!window.confirm('Are you sure you want to delete this story from your local catalog?')) return;
    
    const updated = localStories.filter(s => s.story_id !== storyId);
    setLocalStories(updated);
    try {
      localStorage.setItem('lore:custom_stories', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // Add a message to the console logger
  const addLog = (msg) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
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
    addLog(`Target Category: ${genCategory} | Severity: ${genSeverity}`);
    
    // Prepare list of existing stories so AI can connect them
    const storiesSummary = stories.map(s => `- ID: "${s.story_id}", Title: "${s.title}", Category: "${s.category}", Concepts: ${JSON.stringify(s.concepts || [])}`).join('\n');
    
    const prompt = `Write a complete, highly-detailed 7-layer documentary story about the topic: "${topic}".
Category: ${genCategory}
Severity Level: ${genSeverity}

You must write a true, documented historical, scientific, or psychological case. Do NOT fabricate facts. Keep the language simple, easy to understand, and follow a dramatic, engaging, documentary-style voice (like reading a script for a true crime or mystery documentary). Avoid unnecessary quotes, introductions, or generic fluff.

CRITICAL JSON FORMATTING RULES:
1. Do not use double quotes inside string fields unless they are escaped as \\". Prefer using single quotes (') for any quotes or titles inside the story text (e.g., 'Bermuda Triangle' instead of \"Bermuda Triangle\").
2. Ensure there are no trailing commas in arrays or objects.
3. The response must be strictly valid, clean JSON that can be parsed by JSON.parse() without errors.

Structure the story exactly in the following JSON format:
{
  "story_id": "lowercase_slug_with_underscores",
  "title": "A compelling, title for the dossier",
  "category": "${genCategory}",
  "hook": "A 1-2 sentence teaser (max 150 chars) for the catalog",
  "concepts": ["concept1", "concept2", "concept3"],
  "severity": "${genSeverity}",
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
      } catch (err) {
        addLog(`Running in standalone client mode. Saved to browser storage.`);
      }

      // Mark the recommendation as completed if it matches
      const matchedRec = recommendations.find(r => r.topic.toLowerCase() === topic.toLowerCase());
      if (matchedRec) {
        const updatedRecs = recommendations.map(r => r.id === matchedRec.id ? { ...r, status: 'generated' } : r);
        setRecommendations(updatedRecs);
        localStorage.setItem('lore:recommendations', JSON.stringify(updatedRecs));
        try {
          await fetch(`/api/recommendations/${matchedRec.id}`, { method: 'PUT' });
        } catch (e) { /* ignore */ }
      }

      setProgress(100);
      addLog(`Success! Folder updated. Story compiled.`);
      setIsGenerating(false);
      setGenTopic('');
    } catch (err) {
      console.error(err);
      addLog(`ERROR: ${err.message}`);
      setIsGenerating(false);
      setProgress(0);
    }
  };

  // Run the nightly trigger simulation (generates 2 stories from recommendations or searches)
  const handleAutoRunNightly = async () => {
    if (!apiKey) {
      alert('Gemini API key is required.');
      return;
    }
    
    setIsGenerating(true);
    setLogs([]);
    setProgress(5);
    setActiveTab('generator');
    addLog(`Starting Nightly Automated Content Engine Run...`);

    // Get pending recommendations
    const pending = recommendations.filter(r => r.status === 'pending');
    let topicsToRun = [];

    if (pending.length > 0) {
      addLog(`Found ${pending.length} pending user topic recommendations.`);
      topicsToRun = pending.slice(0, 2).map(r => r.topic);
    } else {
      addLog(`No user recommendations found. Generating automated search queries...`);
      addLog(`Calling AI to find 2 creepy or dark topics...`);
      try {
        const prompt = `Find 2 creepy, disturbing, or highly engaging real historical mysteries, psychology concepts, hidden government experiments, digital shadows, or paranormal cases that are NOT in this list:
${stories.map(s => s.title).join(', ')}

CRITICAL: You must choose well-documented, established historical, scientific, or psychological cases that have a robust factual standing and high-integrity information. Absolutely avoid very recent or trending topics (which could be fake, unverified, or sensationalized news).

Return a JSON array of strings containing only the topic names. Example: ["The Dyatlov Pass Incident", "The Asch Conformity Experiments"]`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        topicsToRun = cleanAndParseJSON(text);
        addLog(`AI selected topics: ${JSON.stringify(topicsToRun)}`);
      } catch (err) {
        addLog(`Failed to get automated topics: ${err.message}. Falling back to default topics.`);
        topicsToRun = ['Project MKUltra', 'The Salem Witch Trials'];
      }
    }

    for (let i = 0; i < topicsToRun.length; i++) {
      const topic = topicsToRun[i];
      addLog(`----------------------------------------`);
      addLog(`Generating Story ${i + 1}/${topicsToRun.length}: ${topic}...`);
      await handleGenerateStory(topic);
    }

    addLog(`========================================`);
    addLog(`Nightly Automated Content Run Completed. Added ${topicsToRun.length} stories.`);
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
          <button
            onClick={onBack}
            className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-2 border rounded-lg hover:opacity-60 transition-opacity cursor-pointer"
            style={{ borderColor: ru }}
          >
            ← Exit Console
          </button>
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
            onClick={() => setActiveTab('catalog')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'catalog' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            Archive Catalog
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
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
            onClick={() => setActiveTab('generator')}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'generator' ? 'bg-[#9E7B4C] text-white' : 'hover:bg-neutral-800/40 text-[#6A6560]'
            }`}
          >
            Content Engine Console
          </button>
        </aside>

        {/* Console Content Area */}
        <main className="flex-1 min-w-0">
          
          {/* Tab 1: Catalog */}
          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">Archived Case Files</h2>
                <button
                  onClick={handleExportJSON}
                  className="px-4 py-2 border rounded text-xs font-mono hover:bg-white/5 cursor-pointer"
                  style={{ borderColor: ru }}
                >
                  Export stories.json
                </button>
              </div>

              {/* Table / List */}
              <div className="space-y-4">
                {stories.map(story => (
                  <div
                    key={story.story_id}
                    className="p-5 rounded-xl border transition-all duration-350"
                    style={{ borderColor: ru, backgroundColor: '#110F0D' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif italic text-lg text-[#EDE8DF]">{story.title}</span>
                        <span className="text-[8px] font-mono tracking-widest px-2 py-0.5 rounded bg-neutral-900 border" style={{ borderColor: ru, color: ac }}>
                          {CATEGORY_LABELS[story.category] || story.category}
                        </span>
                        <span className="text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-red-950/20 text-red-400 border border-red-900/30">
                          {story.severity}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#6A6560]">Added: {story.added_date}</span>
                    </div>
                    
                    <p className="text-xs text-[#6A6560] mb-4 leading-relaxed max-w-3xl">{story.hook}</p>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {story.concepts?.map(c => (
                        <span key={c} className="text-[9px] font-mono text-[#6A6560] bg-neutral-900 border px-2 py-0.5 rounded" style={{ borderColor: ru }}>
                          #{c.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: ru }}>
                      <button
                        onClick={() => setExpandedStoryId(expandedStoryId === story.story_id ? null : story.story_id)}
                        className="text-[10px] font-bold tracking-wider uppercase text-[#9E7B4C] hover:underline cursor-pointer"
                      >
                        {expandedStoryId === story.story_id ? 'Hide Layers' : 'Inspect 7 Layers'}
                      </button>
                      {localStories.some(s => s.story_id === story.story_id) && (
                        <button
                          onClick={() => handleDeleteStory(story.story_id)}
                          className="text-[10px] font-bold tracking-wider uppercase text-red-500 hover:underline cursor-pointer ml-auto"
                        >
                          Delete Local
                        </button>
                      )}
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
              <div className="border-b pb-4" style={{ borderColor: ru }}>
                <h2 className="font-serif italic text-2xl">User Recommended Topics</h2>
                <p className="text-xs text-[#6A6560] mt-1">
                  Topics recommended by users browsing the website.
                </p>
              </div>

              {recommendations.length === 0 ? (
                <div className="text-center py-16 border rounded-xl" style={{ borderColor: ru, backgroundColor: '#110F0D' }}>
                  <p className="font-serif italic text-lg text-[#6A6560] mb-2">No recommendations logged.</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6A6560]/50">Submit a recommendation from the home page.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map(rec => (
                    <div
                      key={rec.id}
                      className="p-4 rounded-xl border flex items-center justify-between gap-4"
                      style={{ borderColor: ru, backgroundColor: '#110F0D' }}
                    >
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
                      {rec.status !== 'generated' && (
                        <button
                          onClick={() => {
                            setGenTopic(rec.topic);
                            setActiveTab('generator');
                          }}
                          className="px-3 py-1.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-wider uppercase rounded hover:bg-[#b08c5c] cursor-pointer"
                        >
                          AI Generate
                        </button>
                      )}
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
                      disabled={isGenerating || !genTopic}
                      className="flex-1 py-3 bg-[#9E7B4C] text-white text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-[#b08c5c] active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Generate Story
                    </button>
                    <button
                      onClick={handleAutoRunNightly}
                      disabled={isGenerating}
                      className="flex-1 py-3 border text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-white/5 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                      style={{ borderColor: ru }}
                    >
                      Trigger Nightly Run
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress and Logger console */}
              {(isGenerating || logs.length > 0) && (
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-mono text-[#6A6560]">
                    <span>Content Engine Process Logs</span>
                    <span>{progress}%</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full h-[3px] bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#9E7B4C] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Terminal console */}
                  <div className="p-4 bg-black rounded-lg border font-mono text-[11px] leading-relaxed space-y-1 h-[240px] overflow-y-auto" style={{ borderColor: ru }}>
                    {logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes('ERROR') ? 'text-red-400' :
                          log.includes('Success') || log.includes('SUCCESS') ? 'text-emerald-400' :
                          log.includes('Generating Story') ? 'text-[#9E7B4C] font-bold mt-2' :
                          'text-neutral-300'
                        }
                      >
                        {log}
                      </div>
                    ))}
                    {isGenerating && (
                      <div className="text-neutral-500 animate-pulse mt-1">▋ Executing engine thread...</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </main>
      </div>
    </div>
  );
}
