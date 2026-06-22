import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStaticContent } from './hooks/useStaticContent';
import { getLayer } from './constants/layers';
import TopicSelector from './components/TopicSelector';
import StoryCatalog from './components/StoryCatalog';
import LayerReader from './components/LayerReader';
import DepthMeter from './components/DepthMeter';
import AdminPanel from './components/AdminPanel';
import LoreMark from './components/LoreMark';
import { TOPICS } from './constants/topics';

const TOTAL_LAYERS = 7;

export default function App() {
  // Phase: 'select' → 'catalog' → 'reading' → 'admin'
  const [phase, setPhase] = useState(() => {
    return window.location.hash === '#console' ? 'admin' : 'select';
  });
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentStory, setCurrentStory] = useState(null);
  const [activeLayer, setActiveLayer] = useState(1);
  const [localStories, setLocalStories] = useState([]);
  
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem('lore:admin_unlocked') === 'true';
    } catch (e) {
      return false;
    }
  });

  const {
    allStories,
    loading: storiesLoading,
    error: storiesError,
    getConnectedStories,
    getCategoryCounts,
    refetchStories,
  } = useStaticContent();



  // Load custom stories from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lore:custom_stories');
      if (stored) {
        setLocalStories(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load custom stories from localStorage', e);
    }
  }, []);

  // Merge static and locally generated stories
  const stories = useMemo(() => {
    // Avoid duplicates by checking story_id
    const combined = [...allStories];
    localStories.forEach(ls => {
      if (!combined.some(s => s.story_id === ls.story_id)) {
        combined.push(ls);
      }
    });
    return combined;
  }, [allStories, localStories]);

  const activeLayerConfig = getLayer(activeLayer);

  // Sync body background
  useEffect(() => {
    if (phase === 'reading') {
      document.body.style.backgroundColor = activeLayerConfig.bg;
      document.body.style.color = activeLayerConfig.text;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.backgroundColor = '#0D0B08';
      document.body.style.color = '#EDE8DF';
      document.body.style.overflow = 'auto';
    }
  }, [phase, activeLayerConfig]);

  // Get all stories for a given category (merged list)
  const getStoriesByCategory = useCallback((categoryId) => {
    const categoryMap = {
      'psychology': 'psychology',
      'mythology': 'mythology',
      'true-crime': 'true_crime',
      'gov-experiments': 'gov_experiments',
      'paranormal-reports': 'paranormal',
      'conspiracy': 'conspiracy',
      'cyber-mysteries': 'cyber_mysteries',
    };
    const mapped = categoryMap[categoryId] || categoryId;
    return stories.filter(s => s.category === mapped);
  }, [stories]);

  // Get a single story by ID (merged list)
  const getStoryById = useCallback((storyId) => {
    return stories.find(s => s.story_id === storyId) || null;
  }, [stories]);

  // Phase 1: Select a category
  const handleSelectTopic = useCallback((topic) => {
    window.location.hash = `#category-${topic.id}`;
  }, []);

  // Phase 2: Select a story from catalog
  const handleSelectStory = useCallback((story) => {
    window.location.hash = `#story-${story.story_id}-layer-1`;
  }, []);

  // Navigate to a connected story
  const handleSelectConnectedStory = useCallback((storyId) => {
    window.location.hash = `#story-${storyId}-layer-1`;
    // Scroll snap container back to top
    const container = document.querySelector('.snap-container');
    if (container) container.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Go back to catalog
  const handleBackToCatalog = useCallback(() => {
    if (selectedCategory) {
      window.location.hash = `#category-${selectedCategory.id}`;
    } else {
      window.location.hash = '';
    }
  }, [selectedCategory]);

  // Go back to topic selection
  const handleBackToTopics = useCallback(() => {
    window.location.hash = '';
  }, []);

  const handleExitAdmin = useCallback(() => {
    window.location.hash = '';
  }, []);

  // Sync state from hash routing
  const syncStateFromHash = useCallback(() => {
    const hash = window.location.hash;
    if (!hash || hash === '#') {
      setPhase('select');
      setSelectedCategory(null);
      setCurrentStory(null);
      setActiveLayer(1);
    } else if (hash === '#console') {
      setPhase('admin');
    } else if (hash.startsWith('#category-')) {
      const catId = hash.replace('#category-', '');
      const matchedTopic = TOPICS.find(t => t.id === catId);
      if (matchedTopic) {
        setSelectedCategory(matchedTopic);
        setPhase('catalog');
        setCurrentStory(null);
        setActiveLayer(1);
      } else {
        setPhase('select');
      }
    } else if (hash.startsWith('#story-')) {
      const parts = hash.replace('#story-', '').split('-layer-');
      const storyId = parts[0];
      const layerNum = parts[1] ? parseInt(parts[1], 10) : 1;
      
      const story = stories.find(s => s.story_id === storyId);
      if (story) {
        const categoryMapInverse = {
          'psychology': 'psychology',
          'mythology': 'mythology',
          'true_crime': 'true-crime',
          'gov_experiments': 'gov-experiments',
          'paranormal': 'paranormal-reports',
          'conspiracy': 'conspiracy',
          'cyber_mysteries': 'cyber-mysteries',
        };
        const catId = categoryMapInverse[story.category] || story.category;
        const matchedTopic = TOPICS.find(t => t.id === catId);
        
        setSelectedCategory(matchedTopic || { id: catId, label: catId });
        setCurrentStory(story);
        setActiveLayer(layerNum);
        setPhase('reading');
      } else {
        if (stories.length > 0) {
          setPhase('select');
        }
      }
    }
  }, [stories]);

  // Handle hash updates on mount and reload
  useEffect(() => {
    if (stories.length > 0) {
      syncStateFromHash();
    }
  }, [stories, syncStateFromHash]);

  // Listen for hashchange event for back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      syncStateFromHash();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [syncStateFromHash]);

  // Sync current reading layer to history hash (replaceState to avoid polluting back history)
  useEffect(() => {
    if (phase === 'reading' && currentStory) {
      const targetHash = `#story-${currentStory.story_id}-layer-${activeLayer}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    }
  }, [phase, currentStory, activeLayer]);

  // Scroll to active layer when changed (e.g. from hash change or initial load)
  useEffect(() => {
    if (phase === 'reading' && currentStory) {
      const container = document.querySelector('.snap-container');
      if (container) {
        const children = container.children;
        const targetIndex = activeLayer - 1;
        const targetEl = children && children[targetIndex];
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          if (Math.abs(rect.top) > 50) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    }
  }, [phase, currentStory, activeLayer]);

  // Keyboard shortcut Ctrl+Shift+A for Admin Console
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.location.hash = '#console';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---------- RENDER ----------

  // Phase: Select topic
  if (phase === 'select') {
    return (
      <TopicSelector
        onSelect={handleSelectTopic}
        categoryCounts={getCategoryCounts()}
      />
    );
  }

  // Phase: Browse catalog
  if (phase === 'catalog') {
    // Map the frontend topic ID to the stories category
    const categoryMap = {
      'psychology': 'psychology',
      'mythology': 'mythology',
      'true-crime': 'true_crime',
      'gov-experiments': 'gov_experiments',
      'paranormal-reports': 'paranormal',
      'conspiracy': 'conspiracy',
      'cyber-mysteries': 'cyber_mysteries',
    };
    const mappedCategory = categoryMap[selectedCategory?.id] || selectedCategory?.id;
    const categoryStories = getStoriesByCategory(selectedCategory?.id);

    return (
      <StoryCatalog
        category={mappedCategory}
        stories={categoryStories}
        onSelectStory={handleSelectStory}
        onBack={handleBackToTopics}
      />
    );
  }

  // Phase: Admin dashboard
  if (phase === 'admin') {
    if (!isAdminUnlocked) {
      return (
        <PasscodeScreen
          onUnlock={() => {
            setIsAdminUnlocked(true);
            try { sessionStorage.setItem('lore:admin_unlocked', 'true'); } catch (e) {}
          }}
          onCancel={handleExitAdmin}
        />
      );
    }

    return (
      <AdminPanel
        stories={stories}
        localStories={localStories}
        setLocalStories={setLocalStories}
        refetchStories={refetchStories}
        onBack={handleExitAdmin}
      />
    );
  }

  // Phase: Reading a story
  if (!currentStory) return null;

  const layers = currentStory.layers || [];
  const connections = getConnectedStories(currentStory.story_id);

  // Build layer data in the format LayerReader expects
  const getLayerData = (layerNum) => {
    const layerData = layers.find(l => l.layer === layerNum);
    if (!layerData) return null;

    // Convert the static format to the format LayerReader uses
    const cards = [];

    // Split content into paragraphs for the card structure
    const paragraphs = (layerData.content || '').split('\n\n').filter(p => p.trim());

    if (paragraphs.length > 0) {
      // First paragraph = hook
      cards.push({ text: paragraphs[0] });
      // Middle paragraphs = case notes
      for (let i = 1; i < paragraphs.length; i++) {
        cards.push({ text: paragraphs[i] });
      }
    }

    // Add cliffhanger as the last card
    if (layerData.cliffhanger) {
      cards.push({ text: layerData.cliffhanger });
    }

    return {
      storyId: currentStory.story_id,
      reactions: currentStory.reactions || { gripping: 0, scared: 0, mindblown: 0 },
      layerName: layerData.layer_name || null,
      cards,
      imageUrl: layerNum === 1 ? currentStory.hero_image : null,
      evidenceLinks: layerNum === 1 ? currentStory.evidence_links : [],
      wikipediaSearchQuery: '',
    };
  };

  const activeData = getLayerData(activeLayer);

  return (
    <div
      className="relative w-full h-screen overflow-hidden transition-colors duration-[1600ms]"
      style={{ backgroundColor: activeLayerConfig.bg, color: activeLayerConfig.text }}
    >
      {/* Vignette overlay */}
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <DepthMeter
        currentLayer={activeLayer}
        totalLayers={TOTAL_LAYERS}
        layerName={activeData?.layerName || activeLayerConfig.name}
        bg={activeLayerConfig.bg}
        text={activeLayerConfig.text}
        muted={activeLayerConfig.muted}
        border={activeLayerConfig.border}
        onBack={handleBackToCatalog}
      />

      {/* Content Scroll Container */}
      <div className="snap-container absolute inset-0 z-10">
        {layers.map((layerData) => (
          <LayerReader
            key={layerData.layer}
            topic={{ id: currentStory.category, label: currentStory.title }}
            layerNum={layerData.layer}
            data={getLayerData(layerData.layer)}
            layer={getLayer(layerData.layer)}
            onLayerActive={() => setActiveLayer(layerData.layer)}
            connections={layerData.layer === TOTAL_LAYERS ? connections : []}
            onSelectConnectedStory={handleSelectConnectedStory}
          />
        ))}
      </div>
    </div>
  );
}

function PasscodeScreen({ onUnlock, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const correctCode = '0407';
    if (code === correctCode) {
      onUnlock();
    } else {
      setError(true);
      setCode('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D0B08] text-[#EDE8DF] px-6 relative">
      <div className="vignette" />
      <div 
        className="w-full max-w-[420px] p-8 rounded-2xl border bg-[#110F0D] text-center space-y-6 shadow-2xl transition-all duration-300"
        style={{ borderColor: error ? '#8B2F2F' : 'rgba(237,232,223,0.07)' }}
      >
        <div className="flex justify-center mb-2">
          <LoreMark size={32} color={error ? '#8B2F2F' : '#9E7B4C'} />
        </div>
        
        <div className="space-y-2">
          <h2 className="font-serif italic text-2xl tracking-wide">
            {error ? 'ACCESS DENIED' : 'SECURE CONSOLE'}
          </h2>
          <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#6A6560]">
            {error ? 'AUTHORIZATION CODE INVALID' : 'ENTER SYSTEM DECRYPTION KEY'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SYSTEM PASSWORD"
            className="w-full text-center px-4 py-3 bg-[#13110E] text-[#EDE8DF] text-sm rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none font-mono tracking-widest transition-colors duration-200"
            required
            autoFocus
          />
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 border border-neutral-800 text-[#6A6560] text-[10px] font-bold tracking-widest uppercase rounded hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#9E7B4C] text-white text-[10px] font-bold tracking-widest uppercase rounded hover:bg-[#b08c5c] active:scale-95 transition-all cursor-pointer"
            >
              Decrypt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
