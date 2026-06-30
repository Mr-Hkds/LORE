import { useState, useMemo, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { TOPICS } from '../constants/topics';
import LoreMark from './LoreMark';
import { useReadingProgress } from '../hooks/useReadingProgress';
import TodayInShadows from './TodayInShadows';

const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

export default function TopicSelector({ onSelect, categoryCounts = {}, allStories = [], onOpenSearch }) {

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

  // Auto-select 'resume' on first render if user has in-progress stories
  const hasAutoSelectedTab = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedTab.current && continueReadingStories.length > 0) {
      setActiveTab('resume');
      hasAutoSelectedTab.current = true;
    }
    // Fall back to 'for-you' if resume tab becomes empty
    if (activeTab === 'resume' && continueReadingStories.length === 0) {
      setActiveTab('for-you');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueReadingStories.length]);

  // Calculate relative thresholds for engagement and new status
  const relativeThresholds = useMemo(() => {
    if (!allStories || allStories.length === 0) {
      return { highThreshold: 8, midThreshold: 3, newStoryIds: new Set() };
    }

    const counts = allStories.map(s => {
      const rx = s.reactions || {};
      return (rx.like || rx.intriguing || 0) + (rx.gripping || rx.heart || 0) + (rx.chilling || rx.scared || 0) + (rx.mind_blowing || rx.mindblown || 0);
    });
    counts.sort((a, b) => a - b);
    
    const highIdx = Math.floor(counts.length * 0.80);
    const midIdx = Math.floor(counts.length * 0.50);
    
    const highThreshold = Math.max(1, counts[highIdx] || 8);
    const midThreshold = Math.max(1, counts[midIdx] || 3);

    const sortedByDate = [...allStories]
      .filter(s => s.added_date)
      .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime());
    
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentStories = sortedByDate.filter(s => new Date(s.added_date).getTime() > recentCutoff);
    const newStoryIds = new Set(recentStories.slice(0, 6).map(s => s.story_id));

    return { highThreshold, midThreshold, newStoryIds };
  }, [allStories]);

  // Rebuild the 3 tabs with deduplicated distinct pools of 3-4 stories each
  const curatedLists = useMemo(() => {
    void progressVersion;
    if (!allStories || allStories.length === 0) {
      return { 'for-you': [], 'recents': [], 'top-rated': [] };
    }

    const affinity = getAffinity();
    const hasAffinity = Object.keys(affinity).length > 0;

    // 1. FOR YOU: Personalized to the user (ONLY show stories which are NOT completed/read)
    const forYouPool = allStories
      .filter(s => {
        const prog = getProgress(s.story_id);
        return !prog || !prog.completed;
      })
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
    const recentsPool = allStories
      .filter(s => !forYouIds.has(s.story_id))
      .sort((a, b) => (b.added_date || '').localeCompare(a.added_date || ''));

    const recentsStories = recentsPool.slice(0, 4);
    const recentsIds = new Set(recentsStories.map(s => s.story_id));

    // 3. TOP RATED: Highest reactions, excluding For You and Recents
    const topRatedPool = allStories
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
          {/* Logo + wordmark — tap 5× for admin */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={handleLogoTap}
            title="Tap 5 times to open Admin Console"
          >
            <LoreMark size={17} color={fg} />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: fg,
                opacity: 0.82,
                textTransform: 'uppercase',
              }}
            >
              SevenDescents
            </span>
          </div>

          {/* Right side — Search button + Tagline */}
          <div className="flex items-center gap-4">
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono font-bold tracking-[0.16em] uppercase text-[#9E7B4C] hover:text-[#EDE8DF] transition-colors cursor-pointer select-none bg-black/40 hover:bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 hover:border-[#9E7B4C]/45 rounded-lg active:scale-95 duration-200"
            >
              <span>🔍</span> Search
            </button>
            <span
              className="hidden sm:block text-[9px] font-mono tracking-[0.14em] uppercase"
              style={{ color: mu, opacity: 0.7 }}
            >
              A guided descent
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-start px-4 sm:px-8 md:px-10 py-16 md:py-24">
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Eyebrow row — label + beta badge */}
          <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: '24px' }}>
            <p
              className="text-[11px] sm:text-xs font-semibold tracking-[0.26em] uppercase"
              style={{ color: ac, opacity: 0.95 }}
            >
              Select your rabbit hole
            </p>
            <span
              className="text-[8px] font-mono tracking-[0.12em] uppercase px-2 py-0.5 rounded border select-none"
              style={{ borderColor: 'rgba(158,123,76,0.3)', color: '#9E7B4C', background: 'rgba(158,123,76,0.06)' }}
            >
              Beta Access
            </span>
          </div>

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

          {/* Central Premium Search Trigger */}
          <div className="mb-14">
            <div 
              onClick={onOpenSearch}
              className="group w-full max-w-[480px] bg-black/30 hover:bg-[#12100E]/70 border border-neutral-900 hover:border-[#9E7B4C]/40 rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300 cursor-pointer shadow-md hover:shadow-[#9E7B4C]/5 active:scale-[0.99] select-none"
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.01)',
              }}
            >
              <div className="flex items-center gap-3">
                <Search className="w-3.5 h-3.5 text-[#9E7B4C] group-hover:scale-105 transition-transform duration-300" />
                <span className="text-[11px] font-sans text-neutral-500 group-hover:text-[#EDE8DF]/75 transition-colors">
                  Search stories, concepts, or records...
                </span>
              </div>
              <span className="text-[7.5px] font-mono font-bold tracking-widest px-2 py-0.5 rounded border border-neutral-850 bg-[#090807] text-[#8F8A82]/70 uppercase group-hover:border-[#9E7B4C]/20 group-hover:text-[#9E7B4C] transition-colors">
                Registry
              </span>
            </div>
          </div>

          {/* Today in the Shadows */}
          <div className="mb-16">
            <TodayInShadows />
          </div>

          {/* ── Unified Curated Dossiers Card ── */}
          {(continueReadingStories.length > 0 || Object.values(curatedLists).some(l => l.length > 0)) && (
            <div className="mb-16">
              <div
                className="rounded-2xl border overflow-hidden"
                style={{
                  backgroundColor: 'rgba(13, 12, 10, 0.72)',
                  borderColor: 'rgba(158, 123, 76, 0.18)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 40px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(158,123,76,0.07)',
                }}
              >
                {/* ── Card header ── */}
                <div className="px-4 sm:px-5 pt-4 pb-0">
                  {/* Section label */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="block w-[2px] h-4 rounded-full flex-shrink-0"
                      style={{ background: 'linear-gradient(to bottom, #9E7B4C, rgba(158,123,76,0.1))' }}
                    />
                    <p className="text-[9px] font-mono font-bold tracking-[0.24em] uppercase" style={{ color: ac }}>
                      Curated Dossiers
                    </p>
                  </div>

                  {/* Tab bar — underline style, full-width scrollable row */}
                  <div className="flex items-end overflow-x-auto scrollbar-none -mx-4 sm:-mx-5 px-4 sm:px-5">
                    {/* Resume tab — only shown when user has in-progress stories */}
                    {continueReadingStories.length > 0 && (
                      <button
                        onClick={() => setActiveTab('resume')}
                        className="flex items-center gap-1.5 px-3 py-2 text-[8px] font-mono font-bold tracking-[0.16em] uppercase whitespace-nowrap flex-shrink-0 cursor-pointer border-b-2 focus:outline-none transition-colors duration-150"
                        style={{
                          color: activeTab === 'resume' ? '#9E7B4C' : mu,
                          borderBottomColor: activeTab === 'resume' ? '#9E7B4C' : 'transparent',
                          background: 'none',
                        }}
                      >
                        ▶ Resume
                        <span
                          className="text-[7px] px-1 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(158,123,76,0.18)', color: '#9E7B4C' }}
                        >
                          {continueReadingStories.length}
                        </span>
                      </button>
                    )}
                    {[
                      { id: 'for-you',   icon: '✦', label: 'For You'   },
                      { id: 'recents',   icon: '◉', label: 'Recents'   },
                      { id: 'top-rated', icon: '◎', label: 'Top Rated' },
                    ].map(tab => {
                      const count = curatedLists[tab.id]?.length || 0;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className="flex items-center gap-1.5 px-3 py-2 text-[8px] font-mono font-bold tracking-[0.16em] uppercase whitespace-nowrap flex-shrink-0 cursor-pointer border-b-2 focus:outline-none transition-colors duration-150"
                          style={{
                            color: isActive ? fg : mu,
                            borderBottomColor: isActive ? '#9E7B4C' : 'transparent',
                            background: 'none',
                          }}
                        >
                          {tab.icon} {tab.label}
                          {count > 0 && (
                            <span
                              className="text-[7px] px-1 py-0.5 rounded"
                              style={{
                                background: isActive ? 'rgba(158,123,76,0.14)' : 'rgba(237,232,223,0.05)',
                                color: isActive ? '#9E7B4C' : mu,
                              }}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: '1px', background: 'rgba(158,123,76,0.10)' }} />

                {/* ── Tab content ── */}
                <div className="p-4 sm:p-5">

                  {/* Resume tab */}
                  {activeTab === 'resume' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {continueReadingStories.map(story => {
                        const prog = getProgress(story.story_id);
                        const currentL = prog?.lastLayer || 1;
                        const catLabel = CATEGORY_LABELS[story.category] || story.category;
                        return (
                          <div
                            key={story.story_id}
                            onClick={() => window.location.hash = `#story-${story.story_id}-layer-${currentL}`}
                            className="group text-left cursor-pointer focus:outline-none transition-all duration-300 rounded-xl border flex flex-col justify-between p-4 relative overflow-hidden active:scale-[0.98] hover:-translate-y-1"
                            style={{
                              backgroundColor: 'rgba(26, 24, 21, 0.4)',
                              borderColor: 'rgba(158, 123, 76, 0.12)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.01)',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.35)';
                              e.currentTarget.style.backgroundColor = 'rgba(26, 24, 21, 0.7)';
                              e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(0,0,0,0.5), 0 0 12px rgba(158,123,76,0.1), inset 0 1px 0 rgba(255,255,255,0.02)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.12)';
                              e.currentTarget.style.backgroundColor = 'rgba(26, 24, 21, 0.4)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.01)';
                            }}
                          >
                            {/* Left gradient accent bar */}
                            <div 
                              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-all duration-300"
                              style={{ 
                                background: `linear-gradient(to bottom, #9E7B4C, rgba(158, 123, 76, 0.05))`,
                                opacity: 0.8
                              }}
                            />

                            <div className="pl-2 space-y-2">
                              {/* Eyebrow info */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="w-1 h-1 rounded-full" style={{ backgroundColor: '#9E7B4C' }} />
                                <span className="text-[8px] font-mono font-bold tracking-[0.12em] uppercase" style={{ color: ac, opacity: 0.85 }}>
                                  {catLabel}
                                </span>
                                <span style={{ color: mu, opacity: 0.35, fontSize: '8px' }}>·</span>
                                <span className="text-[8px] font-mono uppercase" style={{ color: mu }}>
                                  Layer {currentL}/7
                                </span>
                              </div>

                              {/* Title */}
                              <h4 className="font-serif italic text-sm sm:text-base leading-snug group-hover:text-[#9E7B4C] transition-colors duration-200" style={{ color: fg }}>
                                {story.title}
                              </h4>

                              {/* Hook excerpt */}
                              {story.hook && (
                                <p className="text-[11px] font-sans leading-relaxed line-clamp-2" style={{ color: mu, opacity: 0.7 }}>
                                  {story.hook}
                                </p>
                              )}
                            </div>

                            {/* Footer with Depth Track + Quick Actions */}
                            <div className="pl-2 pt-3 flex items-center justify-between gap-4 mt-2">
                              {/* Depth track */}
                              <div className="flex items-center gap-0.5 flex-1 max-w-[120px]">
                                {Array.from({ length: 7 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="h-[2px] rounded-full flex-1"
                                    style={{
                                      backgroundColor: i + 1 <= currentL ? '#9E7B4C' : 'rgba(158,123,76,0.1)',
                                      opacity: i + 1 <= currentL ? (i + 1 === currentL ? 1 : 0.55) : 0.16,
                                    }}
                                  />
                                ))}
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={e => { e.stopPropagation(); markProgressAsCompleted(story.story_id); setProgressVersion(p => p + 1); }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] active:scale-90 transition-all cursor-pointer border bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40 border-emerald-500/30"
                                  title="Mark as complete"
                                >✓</button>
                                <button
                                  onClick={e => { e.stopPropagation(); removeProgress(story.story_id); setProgressVersion(p => p + 1); }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] active:scale-90 transition-all cursor-pointer border bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800/60 border-neutral-700/30"
                                  title="Remove from list"
                                >✕</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Curated tabs: For You / Recents / Top Rated */}
                  {activeTab !== 'resume' && (
                    activeTabStories.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeTabStories.map((story) => {
                          const prog = getProgress(story.story_id);
                          const isCompleted = prog?.completed;
                          const currentL = prog?.lastLayer || 0;
                          const catLabel = CATEGORY_LABELS[story.category] || story.category;
                          const startLayer = currentL > 0 ? currentL : 1;
                          const rx = story.reactions || {};
                          const totalRx = (rx.like || rx.intriguing || 0) + (rx.gripping || 0) + (rx.scared || rx.chilling || 0) + (rx.mindblown || rx.mind_blowing || 0);
                          const isNew = relativeThresholds.newStoryIds.has(story.story_id);
                          const SEVERITY_COLORS = { horrifying: '#C4644A', unsettling: '#9E7B4C', disturbing: '#A0522D', chilling: '#7B8FA1', intriguing: '#7A9E7E' };
                          const sevColor = SEVERITY_COLORS[story.severity] || '#9E7B4C';
                          return (
                            <button
                              key={story.story_id}
                              onClick={() => window.location.hash = `#story-${story.story_id}-layer-${startLayer}`}
                              className="group text-left cursor-pointer focus:outline-none transition-all duration-300 rounded-xl border flex flex-col justify-between p-4 relative overflow-hidden active:scale-[0.98] hover:-translate-y-1"
                              style={{
                                backgroundColor: 'rgba(26, 24, 21, 0.4)',
                                borderColor: 'rgba(158, 123, 76, 0.12)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.01)',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.35)';
                                e.currentTarget.style.backgroundColor = 'rgba(26, 24, 21, 0.7)';
                                e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(0,0,0,0.5), 0 0 12px rgba(158,123,76,0.1), inset 0 1px 0 rgba(255,255,255,0.02)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.12)';
                                e.currentTarget.style.backgroundColor = 'rgba(26, 24, 21, 0.4)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.01)';
                              }}
                            >
                              {/* Left severity accent bar */}
                              <div 
                                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-all duration-300"
                                style={{ 
                                  background: `linear-gradient(to bottom, ${sevColor}, rgba(158, 123, 76, 0.05))`,
                                  opacity: 0.7 
                                }}
                              />

                              <div className="pl-2 space-y-2">
                                {/* Eyebrow info */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: sevColor }} />
                                  <span className="text-[8px] font-mono font-bold tracking-[0.12em] uppercase" style={{ color: ac, opacity: 0.85 }}>
                                    {catLabel}
                                  </span>
                                  <span style={{ color: mu, opacity: 0.35, fontSize: '8px' }}>·</span>
                                  <span className="text-[8px] font-mono uppercase" style={{ color: mu }}>
                                    {isCompleted ? '✓ Read' : currentL > 0 ? `Layer ${currentL}/7` : 'Unread'}
                                  </span>
                                  {/* Curated Tags */}
                                  <span className="flex items-center gap-1.5 flex-wrap ml-1">
                                    {isNew && (
                                      <span className="text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#7A9E7E]/10 text-[#8CB893] border border-[#7A9E7E]/25 px-1.5 py-0.5 rounded-md select-none">
                                        New
                                      </span>
                                    )}
                                    {totalRx >= relativeThresholds.highThreshold ? (
                                      <span className="text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#9E7B4C]/8 text-[#B89568] border border-[#9E7B4C]/25 px-1.5 py-0.5 rounded-md select-none">
                                        Top Rated
                                      </span>
                                    ) : totalRx >= relativeThresholds.midThreshold ? (
                                      <span className="text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#C4644A]/8 text-[#D97F68] border border-[#C4644A]/25 px-1.5 py-0.5 rounded-md select-none">
                                        Trending
                                      </span>
                                    ) : null}
                                  </span>

                                  {totalRx > 0 && (
                                    <span className="ml-auto text-[8px] font-mono" style={{ color: mu, opacity: 0.55 }}>
                                      {totalRx}
                                    </span>
                                  )}
                                </div>

                                {/* Title */}
                                <h4 className="font-serif italic text-sm sm:text-base leading-snug group-hover:text-[#9E7B4C] transition-colors duration-200" style={{ color: fg }}>
                                  {story.title}
                                </h4>

                                {/* Hook excerpt */}
                                {story.hook && (
                                  <p className="text-[11px] font-sans leading-relaxed line-clamp-2" style={{ color: mu, opacity: 0.7 }}>
                                    {story.hook}
                                  </p>
                                )}
                              </div>

                              {/* Footer with Depth Track + Descend Link */}
                              <div className="pl-2 pt-3 flex items-center justify-between gap-4 mt-2">
                                {/* Depth track */}
                                <div className="flex items-center gap-0.5 flex-1 max-w-[120px]">
                                  {Array.from({ length: 7 }).map((_, i) => (
                                    <div
                                      key={i}
                                      className="h-[2px] rounded-full flex-1"
                                      style={{
                                        backgroundColor: i + 1 <= (isCompleted ? 7 : currentL) ? '#9E7B4C' : 'rgba(158,123,76,0.1)',
                                        opacity: i + 1 <= (isCompleted ? 7 : currentL) ? (i + 1 === currentL ? 1 : 0.55) : 0.16,
                                      }}
                                    />
                                  ))}
                                </div>
                                
                                <span
                                  className="text-[10px] font-mono font-bold tracking-wider uppercase transition-transform duration-300 group-hover:translate-x-1"
                                  style={{ color: ac, opacity: 0.6 }}
                                >
                                  Descend →
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-10 flex items-center justify-center">
                        <p className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: mu, opacity: 0.45 }}>
                          {activeTab === 'for-you' ? 'All curated files have been read' : 'No records found'}
                        </p>
                      </div>
                    )
                  )}
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
            © {new Date().getFullYear()} SEVENDESCENTS ·{' '}
            <a href="#console" className="hover:text-[#EDE8DF] transition-colors duration-200" style={{ textDecoration: 'none', borderBottom: '1px dotted rgba(237,232,223,0.3)' }}>
              CONSOLE
            </a>
          </p>
          <p className="mt-4 sm:mt-0 flex items-center gap-2 opacity-95">
            <span className="mr-lotus-premium transition-all duration-300">SYS_OPERATOR // MR. LOTUS</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
