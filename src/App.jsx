import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useStaticContent } from './hooks/useStaticContent';
import { useReadingProgress } from './hooks/useReadingProgress';
import { getLayer } from './constants/layers';
import TopicSelector from './components/TopicSelector';
import StoryCatalog from './components/StoryCatalog';
import LayerReader from './components/LayerReader';
import DepthMeter from './components/DepthMeter';
import LoreMark from './components/LoreMark';
import LoadingState from './components/LoadingState';
import ShareModal from './components/ShareModal';
import SearchOverlay from './components/SearchOverlay';
import { TOPICS } from './constants/topics';

const AdminPanel = lazy(() => import('./components/AdminPanel'));
const SiteFeedback = lazy(() => import('./components/SiteFeedback'));

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
  const [shareTarget, setShareTarget] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [deletedStories, setDeletedStories] = useState(() => {
    try {
      const stored = localStorage.getItem('lore:deleted_stories');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    try {
      return localStorage.getItem('lore:admin_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  const {
    allStories,
    getConnectedStories,
    refetchStories,
    updateStoryReactions,
  } = useStaticContent();

  const {
    trackLayerRead,
    startTimeTracking,
    stopTimeTracking,
  } = useReadingProgress();



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

  // Merge static and locally generated stories, filtering out deleted ones.
  // Merge server reactions into local storage overrides so reload doesn't wipe them.
  const stories = useMemo(() => {
    const combined = allStories.map(s => {
      const edited = localStories.find(ls => ls.story_id === s.story_id);
      if (edited) {
        return {
          ...edited,
          reactions: { ...edited.reactions, ...s.reactions }
        };
      }
      return s;
    });
    localStories.forEach(ls => {
      if (!combined.some(s => s.story_id === ls.story_id)) {
        combined.push(ls);
      }
    });
    return combined.filter(s => !deletedStories.includes(s.story_id) && !s.draft);
  }, [allStories, localStories, deletedStories]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    stories.forEach(s => {
      counts[s.category] = (counts[s.category] || 0) + 1;
    });
    return counts;
  }, [stories]);

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

  // Scroll to top on navigation phase/category/story change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase, selectedCategory, currentStory]);

  // Global Pageview Analytics Tracker (with free Geolocation lookup)
  useEffect(() => {
    const logPageView = async () => {
      try {
        let visitorId = localStorage.getItem('lore:analytics:visitor_id');
        if (!visitorId) {
          visitorId = 'v_' + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('lore:analytics:visitor_id', visitorId);
        }
        let sessionId = sessionStorage.getItem('lore:analytics:session_id');
        if (!sessionId) {
          sessionId = 's_' + Math.random().toString(36).substring(2, 15);
          sessionStorage.setItem('lore:analytics:session_id', sessionId);
        }

        // Check sessionStorage cache for IP geolocation details first
        let geoData = {};
        try {
          const cachedGeo = sessionStorage.getItem('lore:analytics:geo_cache');
          if (cachedGeo) {
            geoData = JSON.parse(cachedGeo);
          } else {
            // Fetch fresh from free ipapi.co json endpoint
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
              const parsed = await res.json();
              if (parsed && parsed.ip) {
                geoData = {
                  ip: parsed.ip,
                  city: parsed.city || 'unknown',
                  region: parsed.region || 'unknown',
                  country: parsed.country_name || 'unknown',
                  country_code: parsed.country_code || 'unknown',
                  org: parsed.org || 'unknown'
                };
                sessionStorage.setItem('lore:analytics:geo_cache', JSON.stringify(geoData));
              }
            }
          }
        } catch (e) {
          console.warn('[Analytics Geo] Failed to fetch IP geolocation:', e.message);
        }

        await fetch('/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitor_id: visitorId,
            session_id: sessionId,
            path: window.location.hash || '/',
            referrer: document.referrer || '',
            user_agent: navigator.userAgent,
            ...geoData
          })
        });
      } catch {
        // Silent catch
      }
    };
    logPageView();

    window.addEventListener('hashchange', logPageView);
    return () => window.removeEventListener('hashchange', logPageView);
  }, []);

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

  const handleReactionUpdate = useCallback((storyId, updatedReactions) => {
    setCurrentStory(prev => {
      if (prev && prev.story_id === storyId) {
        return { ...prev, reactions: updatedReactions };
      }
      return prev;
    });
    setLocalStories(prev => {
      const exists = prev.some(s => s.story_id === storyId);
      if (!exists) return prev;
      const next = prev.map(s => s.story_id === storyId ? { ...s, reactions: updatedReactions } : s);
      try {
        localStorage.setItem('lore:custom_stories', JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save custom stories to localStorage', e);
      }
      return next;
    });
    updateStoryReactions(storyId, updatedReactions);
  }, [updateStoryReactions]);

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

  // Track reading progress when layer changes
  useEffect(() => {
    if (phase === 'reading' && currentStory && activeLayer) {
      trackLayerRead(currentStory.story_id, activeLayer, currentStory.category);
    }
  }, [phase, currentStory, activeLayer, trackLayerRead]);

  // Start/stop time tracking when entering/leaving reading phase
  useEffect(() => {
    if (phase === 'reading' && currentStory) {
      startTimeTracking(currentStory.story_id);
    } else {
      stopTimeTracking();
    }
    return () => stopTimeTracking();
  }, [phase, currentStory, startTimeTracking, stopTimeTracking]);

  // Sync current reading layer to history hash (replaceState to avoid polluting back history)
  useEffect(() => {
    if (phase === 'reading' && currentStory) {
      const targetHash = `#story-${currentStory.story_id}-layer-${activeLayer}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    }
  }, [phase, currentStory?.story_id, activeLayer]);

  // Scroll to active layer when changed (e.g. from hash change or initial load)
  useEffect(() => {
    if (phase === 'reading' && currentStory) {
      if (window.innerWidth <= 768) return; // Prevent jumpy scrolls on mobile
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
  }, [phase, currentStory?.story_id, activeLayer]);

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
      <>
        <TopicSelector
          onSelect={handleSelectTopic}
          categoryCounts={categoryCounts}
          allStories={stories}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          stories={stories}
          onSelectStory={handleSelectStory}
        />
        <Suspense fallback={null}>
          <SiteFeedback />
        </Suspense>
      </>
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
      <>
        <StoryCatalog
          category={mappedCategory}
          stories={categoryStories}
          allStories={stories}
          onSelectStory={handleSelectStory}
          onBack={handleBackToTopics}
          onShareStory={(story) => setShareTarget({ story, layerNum: 1 })}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          stories={stories}
          onSelectStory={handleSelectStory}
        />
        <ShareModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          storyTitle={shareTarget?.story?.title}
          storyId={shareTarget?.story?.story_id}
          layerNum={shareTarget?.layerNum || 1}
        />
        <Suspense fallback={null}>
          <SiteFeedback />
        </Suspense>
      </>
    );
  }

  // Phase: Admin dashboard
  if (phase === 'admin') {
    if (!isAdminUnlocked) {
      return (
        <PasscodeScreen
          onUnlock={() => {
            setIsAdminUnlocked(true);
            try { localStorage.setItem('lore:admin_unlocked', 'true'); } catch { /* ignore */ }
          }}
          onCancel={handleExitAdmin}
        />
      );
    }

    return (
      <Suspense fallback={<LoadingState />}>
        <AdminPanel
          stories={stories}
          localStories={localStories}
          setLocalStories={setLocalStories}
          refetchStories={refetchStories}
          onBack={handleExitAdmin}
          passcode="0407"
          onStoryDeleted={(deletedId) => {
            setDeletedStories(prev => {
              if (prev.includes(deletedId)) return prev;
              const next = [...prev, deletedId];
              try {
                localStorage.setItem('lore:deleted_stories', JSON.stringify(next));
              } catch { /* ignore */ }
              return next;
            });
          }}
        />
      </Suspense>
    );
  }

  // Phase: Reading a story
  if (!currentStory) return null;

  const layers = currentStory.layers || [];
  const connections = getConnectedStories(currentStory.story_id).filter(
    conn => !deletedStories.includes(conn.story_id)
  );

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
      reactions: currentStory.reactions || { intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 },
      layerName: layerData.layer_name || null,
      cards,
      imageUrl: layerNum === 1 ? currentStory.hero_image : null,
      contextImage: (currentStory.context_images || []).find(ci => ci.layer === layerNum) || null,
      evidenceLinks: layerNum === 7 ? (currentStory.evidence_links || []) : [],
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
        onShare={() => setShareTarget({ story: currentStory, layerNum: activeLayer })}
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
            onReactionUpdate={(reactions) => handleReactionUpdate(currentStory.story_id, reactions)}
            onShare={() => setShareTarget({ story: currentStory, layerNum: layerData.layer })}
          />
        ))}
      </div>

      <ShareModal
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        storyTitle={shareTarget?.story?.title}
        storyId={shareTarget?.story?.story_id}
        layerNum={shareTarget?.layerNum || 1}
      />
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
          <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#8F8A82]">
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
              className="flex-1 py-2.5 border border-neutral-800 text-[#8F8A82] text-[10px] font-bold tracking-widest uppercase rounded hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
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
