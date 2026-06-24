import { useState, useMemo, useEffect } from 'react';
import { TOPICS } from '../constants/topics';
import LoreMark from './LoreMark';
import { useReadingProgress } from '../hooks/useReadingProgress';
import TodayInShadows from './TodayInShadows';

// Mini image helper using local or Wikipedia cover art with self-healing fallback
function StoryMiniImage({ story }) {
  const [fetchedUrl, setFetchedUrl] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    // If there is no hero_image, fetch Wikipedia immediately
    if (!story.hero_image) {
      let active = true;
      const query = story.image_query || story.title;
      if (!query) return;

      // Bypassing Wikipedia API search if it is a direct image URL or path
      if (query.startsWith('http') || query.startsWith('/')) {
        return;
      }

      fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=120&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&origin=*`)
        .then(res => res.json())
        .then(data => {
          const pages = data.query?.pages;
          if (pages && active) {
            const firstPageId = Object.keys(pages)[0];
            const url = pages[firstPageId]?.thumbnail?.source;
            if (url) setFetchedUrl(url);
          }
        })
        .catch(() => {});
        
      return () => { active = false; };
    }
  }, [story.hero_image, story.image_query, story.title]);

  const handleImageError = () => {
    if (story.hero_image && !fallbackAttempted) {
      setFallbackAttempted(true);
      const query = story.image_query || story.title;
      if (!query) {
        setImgFailed(true);
        return;
      }
      fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=120&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&origin=*`)
        .then(res => res.json())
        .then(data => {
          const pages = data.query?.pages;
          if (pages) {
            const firstPageId = Object.keys(pages)[0];
            const url = pages[firstPageId]?.thumbnail?.source;
            if (url) {
              setFetchedUrl(url);
            } else {
              setImgFailed(true);
            }
          } else {
            setImgFailed(true);
          }
        })
        .catch(() => {
          setImgFailed(true);
        });
    } else {
      setImgFailed(true);
    }
  };

  const isDirectUrl = story.image_query && (story.image_query.startsWith('http') || story.image_query.startsWith('/'));
  const displayUrl = (!fallbackAttempted && story.hero_image) ? story.hero_image : ((isDirectUrl && !fallbackAttempted) ? story.image_query : (fetchedUrl || story.hero_image));

  if (!displayUrl || imgFailed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
        <LoreMark size={16} color="currentColor" />
        <span className="text-[7px] font-mono tracking-[0.1em] uppercase mt-1">CLASSIFIED</span>
      </div>
    );
  }

  return (
    <img 
      src={displayUrl} 
      alt="" 
      onError={handleImageError}
      className="w-full h-full object-cover grayscale opacity-65 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" 
      loading="lazy" 
    />
  );
}

const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

export default function TopicSelector({ onSelect, categoryCounts = {}, allStories = [] }) {

  const bg = '#0D0C0A'; // Darker, premium charcoal background
  const fg = '#EDE8DF';
  const mu = '#8F8A82'; // Higher contrast gray for readability
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [recommendation, setRecommendation] = useState('');
  const [submitStatus, setSubmitStatus] = useState(null);
  const [lastTap, setLastTap]   = useState(0);
  const [tapCount, setTapCount] = useState(0);

  const { getProgress, removeProgress, markProgressAsCompleted, getAffinity } = useReadingProgress();
  const [progressVersion, setProgressVersion] = useState(0);

  // Compute Continue Reading list
  const continueReadingStories = useMemo(() => {
    if (!allStories || allStories.length === 0) return [];
    return allStories.filter(story => {
      const prog = getProgress(story.story_id);
      return prog && !prog.completed && prog.lastLayer > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStories, getProgress, progressVersion]);

  const [activeTab, setActiveTab] = useState('for-you');

  // Rebuild the 3 tabs with deduplicated distinct pools of 3-4 stories each
  const curatedLists = useMemo(() => {
    void progressVersion;
    if (!allStories || allStories.length === 0) {
      return { 'for-you': [], 'recents': [], 'top-rated': [] };
    }

    const affinity = getAffinity();
    const hasAffinity = Object.keys(affinity).length > 0;

    // 1. FOR YOU: Personalized to the user (prioritize uncompleted)
    let uncompleted = allStories.filter(s => {
      const prog = getProgress(s.story_id);
      return !prog || !prog.completed;
    });
    if (uncompleted.length === 0) {
      uncompleted = allStories;
    }

    const forYouPool = uncompleted
      .map(s => {
        const affinityScore = hasAffinity ? (affinity[s.category] || 0) * 10 : 0;
        const rx = s.reactions || {};
        const reactionScore = (rx.gripping || 0) + (rx.scared || 0) + (rx.mindblown || 0) + (rx.like || 0);
        const prog = getProgress(s.story_id);
        const startedBoost = (prog && prog.lastLayer > 0) ? 5 : 0;
        return { ...s, _score: affinityScore + reactionScore + startedBoost };
      })
      .sort((a, b) => b._score - a._score);

    const forYouStories = forYouPool.slice(0, 4);
    const forYouIds = new Set(forYouStories.map(s => s.story_id));

    // 2. RECENTS: Newest stories, excluding For You
    const recentsPool = [...allStories]
      .filter(s => !forYouIds.has(s.story_id))
      .sort((a, b) => (b.added_date || '').localeCompare(a.added_date || ''));

    const recentsStories = recentsPool.slice(0, 4);
    const recentsIds = new Set(recentsStories.map(s => s.story_id));

    // 3. TOP RATED: Highest reactions, excluding For You and Recents
    const topRatedPool = [...allStories]
      .filter(s => !forYouIds.has(s.story_id) && !recentsIds.has(s.story_id))
      .sort((a, b) => {
        const aReactions = (a.reactions?.gripping || 0) + (a.reactions?.scared || 0) + (a.reactions?.mindblown || 0) + (a.reactions?.like || 0);
        const bReactions = (b.reactions?.gripping || 0) + (b.reactions?.scared || 0) + (b.reactions?.mindblown || 0) + (b.reactions?.like || 0);
        if (bReactions !== aReactions) {
          return bReactions - aReactions;
        }
        return (b.added_date || '').localeCompare(a.added_date || '');
      });

    const topRatedStories = topRatedPool.slice(0, 4);

    return {
      'for-you': forYouStories,
      'recents': recentsStories,
      'top-rated': topRatedStories
    };
  }, [allStories, getProgress, getAffinity, progressVersion]);

  // Selected stories to display based on activeTab
  const activeTabStories = useMemo(() => {
    return curatedLists[activeTab] || [];
  }, [curatedLists, activeTab]);


  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTap > 1500) {
      // Reset if more than 1.5s has passed since last tap
      setTapCount(1);
    } else {
      const next = tapCount + 1;
      if (next >= 5) {
        window.location.hash = '#console';
        setTapCount(0);
      } else {
        setTapCount(next);
      }
    }
    setLastTap(now);
  };

  const handleRecommendSubmit = async (e) => {
    e.preventDefault();
    if (!recommendation.trim()) return;

    setSubmitStatus('submitting');
    const newRec = {
      id: 'rec_' + Date.now(),
      topic: recommendation.trim(),
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      status: 'pending'
    };

    // Try posting to local API
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRec),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.duplicate) {
          setSubmitStatus('duplicate');
        } else {
          setSubmitStatus('success');
        }
      } else {
        setSubmitStatus('success'); // Fallback to local success
      }
    } catch (err) {
      console.warn('API submission failed:', err);
      setSubmitStatus('success');
    }

    setRecommendation('');
    setTimeout(() => setSubmitStatus(null), 4000);
  };

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: bg, color: fg }}>

      {/* Vignette */}
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header className="px-4 sm:px-8 md:px-10">
        <div
          className="mx-auto h-14 flex items-center justify-between"
          style={{ maxWidth: '780px' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div 
              className="flex items-center gap-[10px] cursor-pointer" 
              onClick={handleLogoTap}
              title="Tap 5 times to open Admin Console"
            >
              <LoreMark size={18} color={fg} />
              <span
                className="text-[10px] font-bold tracking-[0.32em] uppercase select-none"
                style={{ color: fg, opacity: 0.85 }}
              >
                LORE
              </span>
            </div>
            <span className="text-neutral-800">·</span>
            <span className="text-[8px] font-mono tracking-[0.12em] uppercase px-2 py-0.5 rounded border border-[#9E7B4C]/25 text-[#9E7B4C] bg-[#9E7B4C]/5 select-none font-bold">
              PREMIUM TESTING ACCESS
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-[9px] font-mono tracking-[0.15em] uppercase text-neutral-500 hidden sm:inline"
            >
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase()}
            </span>
            <span className="text-neutral-800 hidden sm:inline">·</span>
            <span
              className="text-[10px] font-medium tracking-[0.12em] uppercase"
              style={{ color: mu }}
            >
              A guided descent
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-end px-4 sm:px-8 md:px-10 py-16 md:py-24">
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Eyebrow */}
          <p
            className="text-[11px] sm:text-xs font-semibold tracking-[0.26em] uppercase"
            style={{ color: ac, opacity: 0.95, marginBottom: '24px' }}
          >
            Select your rabbit hole
          </p>

          {/* Title */}
          <h1
            className="font-serif italic leading-none tracking-tight"
            style={{
              fontSize: 'clamp(2rem, 6.5vw, 3.6rem)',
              fontWeight: 400,
              color: fg,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              marginBottom: '48px',
            }}
          >
            What do you want<br className="hidden sm:inline" /> to explore today?
          </h1>

          {/* Subtitle */}
          <p
            className="font-serif leading-relaxed"
            style={{
              fontSize: 'clamp(1.05rem, 2.2vw, 1.22rem)',
              fontWeight: 400,
              lineHeight: 1.85,
              color: fg,
              opacity: 0.88, // Increased opacity for better mobile contrast
              maxWidth: '42ch',
              marginBottom: '64px',
            }}
          >
            Seven layers of real, documented knowledge.<br />
            Each one darker than the last.
          </p>
          {/* Today in the Shadows */}
          <div className="mb-16">
            <TodayInShadows />
          </div>

          {/* Continue Reading Section */}
          {continueReadingStories.length > 0 && (
            <div className="mb-16 pt-2 text-left">
              {/* Outer premium card */}
              <div
                className="rounded-2xl border p-6 animate-fadeIn"
                style={{
                  backgroundColor: 'rgba(13, 12, 10, 0.72)',
                  borderColor: 'rgba(158, 123, 76, 0.18)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 40px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(158,123,76,0.07)',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-neutral-900" style={{ borderColor: 'rgba(158,123,76,0.10)' }}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="block w-1 h-4 rounded-full"
                      style={{ background: 'linear-gradient(to bottom, #9E7B4C, rgba(158,123,76,0.15))' }}
                    />
                    <p
                      className="text-[10px] font-mono font-bold tracking-[0.24em] uppercase"
                      style={{ color: ac }}
                    >
                      Continue Reading
                    </p>
                  </div>
                </div>

                {/* List */}
                <div className="flex flex-col gap-4">
                  {continueReadingStories.map(story => {
                    const prog = getProgress(story.story_id);
                    const currentL = prog?.lastLayer || 1;
                    const catLabel = CATEGORY_LABELS[story.category] || story.category;
                    return (
                      <div 
                        key={story.story_id} 
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-neutral-900 bg-neutral-950/40 hover:bg-neutral-900/20 hover:border-neutral-800/85 transition-all duration-200 group relative"
                      >
                        <div 
                          onClick={() => window.location.hash = `#story-${story.story_id}-layer-${currentL}`}
                          className="flex flex-row items-center gap-4 flex-1 cursor-pointer w-full min-w-0"
                        >
                          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-900 bg-neutral-950 relative dossier-image-container">
                            <StoryMiniImage story={story} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider uppercase text-[#9E7B4C] mb-1">
                              <span>{catLabel}</span>
                              <span className="text-neutral-800">·</span>
                              <span>Layer {currentL} of 7</span>
                            </div>
                            <h4 className="font-serif italic text-base text-[#EDE8DF] group-hover:text-[#9E7B4C] transition-colors duration-200 truncate">
                              {story.title}
                            </h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                          <button
                            onClick={() => {
                              markProgressAsCompleted(story.story_id);
                              setProgressVersion(prev => prev + 1);
                            }}
                            className="px-3 py-1.5 rounded bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-500 text-[10px] font-mono tracking-wider uppercase border border-emerald-900/40 hover:border-emerald-800/60 active:scale-95 transition-all duration-200 cursor-pointer"
                          >
                            ✓ Complete
                          </button>
                          <button
                            onClick={() => {
                              removeProgress(story.story_id);
                              setProgressVersion(prev => prev + 1);
                            }}
                            className="px-3 py-1.5 rounded bg-red-950/20 hover:bg-red-950/40 text-red-500/80 hover:text-red-400 text-[10px] font-mono tracking-wider uppercase border border-red-900/20 hover:border-red-900/50 active:scale-95 transition-all duration-200 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Editorial and Recommendations Section ── */}
          {activeTabStories.length > 0 && (
            <div className="mb-16 pt-2 text-left">
              {/* Outer premium card */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{
                  backgroundColor: 'rgba(13, 12, 10, 0.72)',
                  borderColor: 'rgba(158, 123, 76, 0.18)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 40px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(158,123,76,0.07)',
                }}
              >
                {/* Card Header Row */}
                <div
                  className="flex items-center justify-between px-5 pt-4 pb-3"
                  style={{ borderBottom: '1px solid rgba(158,123,76,0.10)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="block w-1 h-4 rounded-full"
                      style={{ background: 'linear-gradient(to bottom, #9E7B4C, rgba(158,123,76,0.15))' }}
                    />
                    <p
                      className="text-[9px] font-mono font-bold tracking-[0.24em] uppercase"
                      style={{ color: ac }}
                    >
                      Curated Dossiers
                    </p>
                  </div>
                  {/* Tab pills – segmented control */}
                  <div
                    className="flex items-center gap-1 p-0.5 rounded-lg border overflow-x-auto scrollbar-none max-w-full"
                    style={{
                      backgroundColor: 'rgba(8, 7, 5, 0.6)',
                      borderColor: 'rgba(158, 123, 76, 0.10)',
                    }}
                  >
                    <button
                      onClick={() => setActiveTab('for-you')}
                      className="px-3 py-1.5 text-[8px] sm:text-[9px] font-mono font-bold tracking-[0.18em] uppercase rounded-md transition-all duration-300 cursor-pointer focus:outline-none flex-shrink-0"
                      style={{
                        color: activeTab === 'for-you' ? fg : mu,
                        backgroundColor: activeTab === 'for-you' ? 'rgba(158, 123, 76, 0.18)' : 'transparent',
                      }}
                    >
                      ✦ For You
                    </button>

                    <button
                      onClick={() => setActiveTab('recents')}
                      className="px-3 py-1.5 text-[8px] sm:text-[9px] font-mono font-bold tracking-[0.18em] uppercase rounded-md transition-all duration-300 cursor-pointer focus:outline-none flex-shrink-0"
                      style={{
                        color: activeTab === 'recents' ? fg : mu,
                        backgroundColor: activeTab === 'recents' ? 'rgba(158, 123, 76, 0.18)' : 'transparent',
                      }}
                    >
                      ◉ Recents
                    </button>
                    <button
                      onClick={() => setActiveTab('top-rated')}
                      className="px-3 py-1.5 text-[8px] sm:text-[9px] font-mono font-bold tracking-[0.18em] uppercase rounded-md transition-all duration-300 cursor-pointer focus:outline-none flex-shrink-0"
                      style={{
                        color: activeTab === 'top-rated' ? fg : mu,
                        backgroundColor: activeTab === 'top-rated' ? 'rgba(158, 123, 76, 0.18)' : 'transparent',
                      }}
                    >
                      ◉ Top Rated
                    </button>
                  </div>
                </div>

                {/* Story list inside card */}
                <div className="flex flex-col" style={{ borderColor: 'rgba(158,123,76,0.07)' }}>
                {activeTabStories.map(story => {
                  const prog = getProgress(story.story_id);
                  const isCompleted = prog?.completed;
                  const currentL = prog?.lastLayer || 0;
                  const catLabel = CATEGORY_LABELS[story.category] || story.category;
                  
                  return (
                    <button
                      key={story.story_id}
                      onClick={() => {
                        window.location.hash = `#story-${story.story_id}-layer-${currentL > 0 ? currentL : 1}`;
                      }}
                      className="group relative w-full flex flex-row items-center gap-4 px-5 py-4 text-left cursor-pointer transition-all duration-200"
                      style={{
                        backgroundColor: 'transparent',
                        borderBottom: '1px solid rgba(158, 123, 76, 0.07)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(158, 123, 76, 0.04)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Left Side: Grayscale story thumbnail overlayed with subtle gold border */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-900/80 bg-neutral-950 relative dossier-image-container">
                        <StoryMiniImage story={story} />
                        <div className="absolute inset-0 bg-neutral-950/40 mix-blend-color group-hover:bg-transparent transition-all duration-300" />
                        {currentL > 0 && !isCompleted && (
                          <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-[#9E7B4C] rounded-br-xs animate-pulse" />
                        )}
                      </div>
 
                      {/* Right Side: Typography and Segmented Depth Track */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          {/* Eyebrow: Category & Resume hint */}
                          <div className="flex items-center gap-2 mb-1.5 text-[10px] sm:text-[11px] font-mono tracking-[0.12em] uppercase">
                            <span style={{ color: ac }} className="font-bold opacity-85">{catLabel}</span>
                            <span className="text-neutral-800">·</span>
                            <span style={{ color: mu }}>
                              {isCompleted ? '✓ Completed' : currentL > 0 ? `Layer ${currentL}/7` : 'UNOPENED DOSSIER'}
                            </span>
                          </div>
 
                          {/* Title */}
                          <h4 className="font-serif italic text-base leading-snug group-hover:text-[#9E7B4C] transition-colors duration-300 truncate" style={{ color: fg }}>
                            {story.title}
                          </h4>

                          {/* Hook */}
                          <p className="font-sans text-xs sm:text-[13px] text-neutral-400 line-clamp-1 mt-1">
                            {story.hook}
                          </p>
                        </div>
 
                        {/* Segmented Depth indicator (mirroring DepthMeter progress segments) */}
                        <div className="flex items-center gap-1 mt-3">
                          {Array.from({ length: 7 }).map((_, idx) => {
                            const active = idx + 1 <= (isCompleted ? 7 : currentL);
                            return (
                              <div 
                                key={idx}
                                className="h-[2px] rounded-full transition-all duration-500"
                                style={{
                                  width: idx + 1 === currentL && !isCompleted ? '18px' : '8px',
                                  backgroundColor: active ? ac : '#262421',
                                  opacity: active ? (idx + 1 === currentL && !isCompleted ? 1 : 0.6) : 0.2
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
 
                      {/* Action Arrow */}
                      <div className="flex items-center justify-center self-center px-1 sm:px-2">
                        <span className="text-sm flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1" style={{ color: ac, opacity: 0.45 }}>
                          →
                        </span>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          )}

          {/* Topic list */}
          <div style={{ borderTop: `1px solid ${ru}` }}>
            {TOPICS.map((topic) => {
              const categoryMap = {
                'psychology': 'psychology',
                'mythology': 'mythology',
                'true-crime': 'true_crime',
                'gov-experiments': 'gov_experiments',
                'paranormal-reports': 'paranormal',
                'conspiracy': 'conspiracy',
                'cyber-mysteries': 'cyber_mysteries'
              };
              const count = categoryCounts[categoryMap[topic.id]] || 0;
              return (
              <button
                key={topic.id}
                id={`topic-${topic.id}`}
                onClick={() => onSelect(topic)}
                className="w-full text-left flex items-baseline gap-5 transition-opacity duration-200 hover:opacity-55 active:opacity-35"
                style={{
                  padding: '32px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: `1px solid ${ru}`,
                  cursor: 'pointer',
                }}
              >
                {/* Topic name */}
                <span
                  className="font-serif italic flex-1 leading-snug"
                  style={{
                    fontSize: 'clamp(1.5rem, 4.5vw, 2.2rem)',
                    fontWeight: 400,
                    color: fg,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                  }}
                >
                  {topic.label}
                </span>

                {/* Dossier count */}
                {count > 0 && (
                  <span
                    className="text-[10.5px] sm:text-xs font-mono tracking-[0.1em] flex-shrink-0"
                    style={{ color: ac, opacity: 0.9 }}
                  >
                    {count} {count === 1 ? 'dossier' : 'dossiers'}
                  </span>
                )}

                {/* Hint */}
                <span
                  className="text-[10px] font-normal tracking-[0.1em] uppercase hidden sm:block flex-shrink-0"
                  style={{
                    color: mu,
                    opacity: 0.8,
                    maxWidth: '24ch',
                    textAlign: 'right',
                    flex: 1,
                    paddingLeft: '8px',
                  }}
                >
                  {topic.hint}
                </span>

                {/* Arrow */}
                <span
                  className="text-lg flex-shrink-0 transition-transform duration-300 group-hover:translate-y-1"
                  style={{ color: mu, opacity: 0.35 }}
                >
                  ↓
                </span>
              </button>
              );
            })}
          </div>

          {/* User Recommendation Form */}
          <div className="mt-16 pt-10 border-t" style={{ borderColor: ru }}>
            <h3
              className="font-serif italic text-lg mb-4"
              style={{ color: fg, fontWeight: 400, letterSpacing: '-0.01em' }}
            >
              Recommend a topic for the archive
            </h3>
            <p className="text-xs font-sans mb-6" style={{ color: mu, lineHeight: 1.6 }}>
              Is there a dark corner of history or psychology we should explore? Submit a topic below.
              The AI content engine reviews user submissions during nightly research passes.
            </p>
            <form onSubmit={handleRecommendSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="e.g., The Salem Witch Trials, Sleep Paralysis, Project Sunshine..."
                className="flex-1 px-4 py-3 bg-[#13110E] text-[#EDE8DF] text-sm rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none transition-colors duration-200"
                disabled={submitStatus === 'submitting'}
                required
              />
              <button
                type="submit"
                disabled={submitStatus === 'submitting'}
                className="px-6 py-3 bg-[#9E7B4C] text-white text-xs font-bold tracking-[0.2em] uppercase rounded-lg hover:bg-[#b08c5c] active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                {submitStatus === 'submitting' ? 'Submitting...' : 'File Recommendation'}
              </button>
            </form>
            {submitStatus === 'success' && (
              <div className="mt-3 text-[11px] text-[#9E7B4C] font-mono tracking-widest uppercase fade-in">
                ✓ Success: Topic logged. The archive is expanding.
              </div>
            )}
            {submitStatus === 'duplicate' && (
              <div className="mt-3 text-[11px] text-[#C4644A] font-mono tracking-widest uppercase fade-in">
                ⚠ We already have it in database.
              </div>
            )}
          </div>

        </div>

        <footer className="mt-32 pt-10 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase transition-colors duration-500" style={{ borderColor: ru, color: mu }}>
          <p className="opacity-60">
            © {new Date().getFullYear()} LORE ARCHIVE ·{' '}
            <a href="#console" className="hover:text-[#EDE8DF] transition-colors duration-200" style={{ textDecoration: 'none', borderBottom: '1px dotted rgba(237,232,223,0.3)' }}>
              CONSOLE
            </a>
          </p>
          <p className="mt-4 sm:mt-0 flex items-center gap-2 opacity-95">
            <span className="mr-lotus-premium transition-all duration-300">SYS_OPERATOR // ROOT_ACCESS</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
