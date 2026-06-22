import { useState, useMemo, useEffect, useRef } from 'react';
import { TOPICS } from '../constants/topics';
import LoreMark from './LoreMark';
import { useReadingProgress } from '../hooks/useReadingProgress';
import TodayInShadows from './TodayInShadows';

// Mini image helper using local or Wikipedia cover art
function StoryMiniImage({ story }) {
  const [fetchedUrl, setFetchedUrl] = useState(null);

  useEffect(() => {
    if (story.hero_image) return;
    let active = true;
    const query = story.image_query || story.title;
    
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
  }, [story.hero_image, story.image_query, story.title]);

  const displayUrl = story.hero_image || fetchedUrl;

  if (!displayUrl) {
    return <div className="w-full h-full bg-neutral-950/60 animate-pulse" />;
  }

  return (
    <img 
      src={displayUrl} 
      alt="" 
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

  const bg = '#1A1815';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [recommendation, setRecommendation] = useState('');
  const [submitStatus, setSubmitStatus] = useState(null);
  const [lastTap, setLastTap]   = useState(0);
  const [tapCount, setTapCount] = useState(0);

  const { getForYouStories, getProgress } = useReadingProgress();

  // Compute For You list (reading history is synchronous from localStorage)
  const forYouStories = useMemo(() => {
    return allStories.length > 0 ? getForYouStories(allStories, 3) : [];
  }, [allStories, getForYouStories]);

  const [activeTab, setActiveTab] = useState('top-rated');
  const hasAutoSwitched = useRef(false);

  // Auto-switch to 'recents' once when stories load, if user has reading progress
  useEffect(() => {
    if (allStories.length > 0 && !hasAutoSwitched.current) {
      hasAutoSwitched.current = true;
      if (forYouStories.length > 0) {
        setActiveTab('recents');
      }
    }
  }, [allStories, forYouStories]);

  // Selected stories to display based on activeTab
  const activeTabStories = useMemo(() => {
    if (activeTab === 'recents') {
      return forYouStories;
    }
    
    if (activeTab === 'editors-picks') {
      if (!allStories || allStories.length === 0) return [];
      const flagged = allStories.filter(s => s.editors_pick === true);
      if (flagged.length > 0) {
        return flagged.slice(0, 3);
      }
      const fallbacks = ['burari_deaths_001', 'the_dyatlov_pass_incident', 'the_asch_conformity_experiments'];
      return allStories.filter(s => fallbacks.includes(s.story_id)).slice(0, 3);
    }

    // Default to 'top-rated'
    if (!allStories || allStories.length === 0) return [];
    return [...allStories]
      .sort((a, b) => {
        const aReactions = (a.reactions?.gripping || 0) + (a.reactions?.scared || 0) + (a.reactions?.mindblown || 0);
        const bReactions = (b.reactions?.gripping || 0) + (b.reactions?.scared || 0) + (b.reactions?.mindblown || 0);
        if (bReactions !== aReactions) {
          return bReactions - aReactions;
        }
        return (b.added_date || '').localeCompare(a.added_date || '');
      })
      .slice(0, 3);
  }, [activeTab, allStories, forYouStories]);

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

    // Save to localStorage
    try {
      const existing = localStorage.getItem('lore:recommendations');
      const recs = existing ? JSON.parse(existing) : [];
      recs.push(newRec);
      localStorage.setItem('lore:recommendations', JSON.stringify(recs));
    } catch (err) {
      console.error(err);
    }

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
          setSubmitStatus(data.status === 'generated' ? 'duplicate_generated' : 'duplicate_pending');
        } else {
          setSubmitStatus('success');
        }
      } else {
        setSubmitStatus('success'); // Fallback to local success
      }
    } catch (err) {
      console.warn('API submission failed, fell back to localStorage:', err);
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
          <span
            className="text-[10px] font-medium tracking-[0.12em] uppercase"
            style={{ color: mu }}
          >
            A guided descent
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-end px-4 sm:px-8 md:px-10 py-16 md:py-24">
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Eyebrow */}
          <p
            className="text-[10px] font-semibold tracking-[0.26em] uppercase"
            style={{ color: ac, opacity: 0.85, marginBottom: '32px' }}
          >
            Select Category
          </p>

          {/* Title */}
          <h1
            className="font-serif italic leading-none tracking-tight"
            style={{
              fontSize: 'clamp(3.6rem, 11vw, 7.5rem)',
              fontWeight: 300,
              color: fg,
              letterSpacing: '-0.04em',
              lineHeight: 0.93,
              marginBottom: '48px',
            }}
          >
            Archive Index
          </h1>

          {/* Subtitle */}
          <p
            className="font-serif leading-relaxed"
            style={{
              fontSize: 'clamp(1.05rem, 2.2vw, 1.22rem)',
              fontWeight: 300,
              lineHeight: 1.85,
              color: fg,
              opacity: 0.48,
              maxWidth: '42ch',
              marginBottom: '64px',
            }}
          >
            Seven layers of real, documented knowledge.<br />
            Each one darker than the last.
          </p>
          {/* ── Editorial and Recommendations Section ── */}
          {activeTabStories.length > 0 && (
            <div className="mb-16 pt-2">
              <div className="flex items-center gap-6 mb-5 border-b border-neutral-900/60 pb-0">
                <button 
                  onClick={() => setActiveTab('top-rated')} 
                  className="pb-2 text-[9px] font-mono font-bold tracking-[0.24em] uppercase transition-all duration-300 relative cursor-pointer focus:outline-none"
                  style={{ 
                    color: activeTab === 'top-rated' ? ac : mu,
                    borderBottom: activeTab === 'top-rated' ? `2px solid ${ac}` : '2px solid transparent',
                    marginBottom: '-1px'
                  }}
                >
                  ◉ TOP RATED
                </button>
                <button 
                  onClick={() => setActiveTab('editors-picks')} 
                  className="pb-2 text-[9px] font-mono font-bold tracking-[0.24em] uppercase transition-all duration-300 relative cursor-pointer focus:outline-none"
                  style={{ 
                    color: activeTab === 'editors-picks' ? ac : mu,
                    borderBottom: activeTab === 'editors-picks' ? `2px solid ${ac}` : '2px solid transparent',
                    marginBottom: '-1px'
                  }}
                >
                  ◉ EDITOR'S PICKS
                </button>
                {forYouStories.length > 0 && (
                  <button 
                    onClick={() => setActiveTab('recents')} 
                    className="pb-2 text-[9px] font-mono font-bold tracking-[0.24em] uppercase transition-all duration-300 relative cursor-pointer focus:outline-none"
                    style={{ 
                      color: activeTab === 'recents' ? ac : mu,
                      borderBottom: activeTab === 'recents' ? `2px solid ${ac}` : '2px solid transparent',
                      marginBottom: '-1px'
                    }}
                  >
                    ◉ RECENTS
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {activeTabStories.map(story => {
                  const prog = getProgress(story.story_id);
                  const isCompleted = prog?.completed;
                  const currentL = prog?.lastLayer || 0;
                  const catLabel = CATEGORY_LABELS[story.category] || story.category;
                  
                  return (
                    <button
                      key={story.story_id}
                      onClick={() => {
                        const catMap = { 
                          psychology: 'psychology', 
                          mythology: 'mythology', 
                          true_crime: 'true-crime', 
                          gov_experiments: 'gov-experiments', 
                          paranormal: 'paranormal-reports', 
                          conspiracy: 'conspiracy', 
                          cyber_mysteries: 'cyber-mysteries' 
                        };
                        onSelect({ id: catMap[story.category] || story.category, label: story.category }, story.story_id);
                      }}
                      className="group relative w-full flex flex-col sm:flex-row gap-4 rounded-xl border p-4 text-left cursor-pointer transition-all duration-300"
                      style={{
                        backgroundColor: 'rgba(15, 13, 10, 0.55)',
                        borderColor: 'rgba(158, 123, 76, 0.12)',
                        boxShadow: '0 4px 20px -8px rgba(0, 0, 0, 0.4)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = `rgba(158, 123, 76, 0.3)`;
                        e.currentTarget.style.backgroundColor = `rgba(15, 13, 10, 0.75)`;
                        e.currentTarget.style.boxShadow = `0 8px 24px -6px rgba(0, 0, 0, 0.6)`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.12)';
                        e.currentTarget.style.backgroundColor = 'rgba(15, 13, 10, 0.55)';
                        e.currentTarget.style.boxShadow = '0 4px 20px -8px rgba(0, 0, 0, 0.4)';
                      }}
                    >
                      {/* Left Side: Grayscale story thumbnail overlayed with subtle gold border */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-900/80 bg-neutral-950 relative">
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
                          <div className="flex items-center gap-2 mb-1.5 text-[8px] font-mono tracking-[0.12em] uppercase">
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
                          <p className="font-sans text-[11.5px] text-neutral-500 line-clamp-1 mt-1 opacity-80">
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
          )}

          {/* Today in the Shadows */}
          <div className="mb-16">
            <TodayInShadows />
          </div>

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
                    fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                    fontWeight: 300,
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
                    className="text-[9px] font-mono tracking-[0.1em] flex-shrink-0"
                    style={{ color: ac, opacity: 0.7 }}
                  >
                    {count} {count === 1 ? 'dossier' : 'dossiers'}
                  </span>
                )}

                {/* Hint */}
                <span
                  className="text-[10px] font-normal tracking-[0.1em] uppercase hidden sm:block flex-shrink-0"
                  style={{
                    color: mu,
                    opacity: 0.6,
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
              style={{ color: fg, fontWeight: 300, letterSpacing: '-0.01em' }}
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
              {submitStatus === 'success' && (
                <p className="absolute -bottom-6 left-0 text-[10px] text-[#9E7B4C] font-mono tracking-widest uppercase fade-in">
                  Topic logged. The archive is expanding.
                </p>
              )}
              {submitStatus === 'duplicate_pending' && (
                <p className="absolute -bottom-6 left-0 text-[10px] text-[#8B2F2F] font-mono tracking-widest uppercase fade-in">
                  Already in queue. The engine is investigating.
                </p>
              )}
              {submitStatus === 'duplicate_generated' && (
                <p className="absolute -bottom-6 left-0 text-[10px] text-[#6A6560] font-mono tracking-widest uppercase fade-in">
                  Archive already contains this topic.
                </p>
              )}
            </form>
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
            DESIGNED BY <span className="black-lotus-premium ml-1 transition-all duration-300">BLACK_LOTUS</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
