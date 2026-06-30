/**
 * StoryCatalog — premium editorial dossier browser.
 * No cheap tab bars. Sort is a single ambient dropdown.
 * Cards show depth signal, not badges like "TRENDING".
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Share2, Search } from 'lucide-react';
import { useStaticContent } from '../hooks/useStaticContent';
import { useReadingProgress } from '../hooks/useReadingProgress';
import LoreMark from './LoreMark';

const SEVERITY_CONFIG = {
  curious:    { label: 'CURIOUS',    dot: '#6B9E6E', glow: 'rgba(107,158,110,0.10)' },
  unsettling: { label: 'UNSETTLING', dot: '#9E7B4C', glow: 'rgba(158,123,76,0.12)' },
  disturbing: { label: 'DISTURBING', dot: '#C4644A', glow: 'rgba(196,100,74,0.12)' },
  harrowing:  { label: 'HARROWING', dot: '#8B2F2F', glow: 'rgba(139,47,47,0.14)' },
  forbidden:  { label: 'FORBIDDEN',  dot: '#5B1A8A', glow: 'rgba(91,26,138,0.15)' },
};

const CATEGORY_LABELS = {
  psychology: 'Psychology', true_crime: 'True Crime',
  paranormal: 'Paranormal', mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies', cyber_mysteries: 'Digital Shadows',
};

const SIGNAL_LABELS = {
  psychology: 'PSYCHOLOGY',
  true_crime: 'TRUE CRIME',
  paranormal: 'PARANORMAL',
  mythology: 'MYTHOLOGY',
  gov_experiments: 'GOV SECRETS',
  conspiracy: 'CONSPIRACY',
  cyber_mysteries: 'CYBER MYSTERY',
};

// ── Story card image — accepts inView from parent card ────────────────────
function StoryCardImage({ story, alt, inView }) {
  const { getImageByQuery } = useStaticContent();
  const [fetchedUrl, setFetchedUrl] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    if (!story.hero_image) {
      let active = true;
      const query = story.image_query || story.title;
      getImageByQuery(query).then(url => { if (active) setFetchedUrl(url); });
      return () => { active = false; };
    }
  }, [story.hero_image, story.image_query, story.title, getImageByQuery]);

  const handleImageError = () => {
    if (story.hero_image && !fallbackAttempted) {
      setFallbackAttempted(true);
      const query = story.image_query || story.title;
      getImageByQuery(query).then(url => {
        if (url) setFetchedUrl(url);
        else setImgFailed(true);
      }).catch(() => setImgFailed(true));
    } else {
      setImgFailed(true);
    }
  };

  const isDirectUrl = story.image_query && (story.image_query.startsWith('http') || story.image_query.startsWith('/'));
  const displayUrl = (!fallbackAttempted && story.hero_image) ? story.hero_image : ((isDirectUrl && !fallbackAttempted) ? story.image_query : (fetchedUrl || story.hero_image));

  if (!displayUrl || imgFailed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
        <LoreMark size={20} color="currentColor" />
        <span className="text-[8px] font-mono tracking-[0.2em] uppercase mt-2">CLASSIFIED</span>
      </div>
    );
  }
  return (
    <div
      className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center dossier-image-container"
      style={{
        backgroundColor: '#090807',
        backgroundImage: 'linear-gradient(rgba(158, 123, 76, 0.03) 1px, transparent 1px)',
        backgroundSize: '100% 4px',
      }}
    >
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 30%, rgba(5, 4, 3, 0.85) 100%)' }} />
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 opacity-30 pointer-events-none select-none">
        <LoreMark size={9} color="#EDE8DF" />
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: '7px',
            color: '#EDE8DF',
            letterSpacing: '0.22em',
            fontWeight: 700,
          }}
        >CLASSIFIED</span>
      </div>
      {/* Image — grayscale by default, full color when card is in viewport or hovered */}
      <img
        src={displayUrl}
        alt={alt}
        width="200"
        height="150"
        onError={handleImageError}
        className={`w-full h-full object-cover transition-all duration-[800ms] ease-out group-hover:scale-105 group-hover:grayscale-0 group-hover:opacity-100 group-hover:brightness-100 ${
          inView ? 'grayscale-0 opacity-100 brightness-100' : 'grayscale-[80%] opacity-65 brightness-[85%]'
        }`}
        style={{ objectPosition: 'center 18%' }}
        loading="lazy"
      />
    </div>
  );
}

// ── Story card wrapper with IntersectionObserver for color reveal ────────
function StoryCard({ story, onSelectStory, onShareStory, idx, visible, ac, fg, mu, relativeThresholds }) {
  const [inView, setInView] = useState(false);
  const cardRef = useRef(null);
  const sev   = SEVERITY_CONFIG[story.severity] || SEVERITY_CONFIG.unsettling;
  const { getProgress } = useReadingProgress();
  const prog  = getProgress(story.story_id);
  const isNew = relativeThresholds?.newStoryIds?.has(story.story_id) || false;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const getTotalReactions = (s) => {
    const rx = s.reactions || {};
    return (rx.intriguing || rx.like || 0) + (rx.gripping || rx.heart || 0) + (rx.chilling || rx.scared || 0) + (rx.mind_blowing || rx.mindblown || 0);
  };

  return (
    <article
      ref={cardRef}
      onClick={() => onSelectStory(story)}
      className="group relative w-full grid grid-cols-1 sm:grid-cols-[180px_1fr] md:grid-cols-[200px_1fr] gap-0 rounded-2xl overflow-hidden border cursor-pointer"
      style={{
        backgroundColor: 'rgba(15, 13, 10, 0.7)',
        borderColor: 'rgba(237,232,223,0.055)',
        boxShadow: '0 8px 32px -12px rgba(0,0,0,0.8)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 0.55s ${idx * 0.07}s cubic-bezier(0.16,1,0.3,1), transform 0.55s ${idx * 0.07}s cubic-bezier(0.16,1,0.3,1)`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(158,123,76,0.2)';
        e.currentTarget.style.boxShadow = '0 16px 48px -12px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(158,123,76,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(237,232,223,0.055)';
        e.currentTarget.style.boxShadow = '0 8px 32px -12px rgba(0,0,0,0.8)';
      }}
    >
      {/* Floating Premium Share Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onShareStory?.(story);
        }}
        className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-30 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-neutral-800/80 bg-[#0F0D0A]/85 backdrop-blur-md text-[#EDE8DF]/75 hover:text-[#9E7B4C] hover:border-[#9E7B4C]/45 hover:bg-[#151311] transition-all duration-300 active:scale-90 focus:outline-none cursor-pointer group/share"
        title="Share Dossier"
      >
        <Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform duration-300 group-hover/share:scale-110" />
      </button>

      {/* Image panel */}
      <div className="w-full h-44 sm:h-full flex-shrink-0 relative overflow-hidden bg-[#090807]">
        <StoryCardImage story={story} alt={story.title} inView={inView} />
        {/* Gradient overlay to soften top and bottom boundaries */}
        <div 
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(9, 8, 7, 0.95) 0%, rgba(9, 8, 7, 0.4) 18%, transparent 40%, transparent 70%, #090807 98%)'
          }}
        />
      </div>

      {/* Content panel */}
      <div className="w-full flex flex-col justify-between p-4 sm:p-5 md:p-6 min-h-[140px]">
        <div>
          {/* Top row: Badges & Reacts */}
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-x-2 gap-y-1 border-b border-neutral-900/60 pb-2 pr-8 sm:pr-10">
            <div className="flex items-center gap-1.5 text-[7.5px] sm:text-[8px] font-mono tracking-[0.12em] sm:tracking-[0.15em] uppercase text-neutral-500 flex-wrap">
              <span className="flex items-center gap-1 font-bold" style={{ color: sev.dot }}>
                <span className="w-1 h-1 rounded-full bg-current flex-shrink-0 animate-pulse" />
                {sev.label}
              </span>
              <span>·</span>
              <span style={{ color: fg, opacity: 0.65 }}>{SIGNAL_LABELS[story.category] || 'ARCHIVE'}</span>

              {isNew && (
                <>
                  <span>·</span>
                  <span className="text-[7.5px] sm:text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#7A9E7E]/10 text-[#8CB893] border border-[#7A9E7E]/25 px-1.5 py-0.5 rounded select-none">
                    New
                  </span>
                </>
              )}
              {getTotalReactions(story) >= (relativeThresholds?.highThreshold || 8) && (
                <>
                  <span>·</span>
                  <span className="text-[7.5px] sm:text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#9E7B4C]/8 text-[#B89568] border border-[#9E7B4C]/25 px-1.5 py-0.5 rounded select-none">
                    Top Rated
                  </span>
                </>
              )}
              {getTotalReactions(story) >= (relativeThresholds?.midThreshold || 3) && getTotalReactions(story) < (relativeThresholds?.highThreshold || 8) && (
                <>
                  <span>·</span>
                  <span className="text-[7.5px] sm:text-[8px] font-mono font-medium tracking-[0.14em] uppercase bg-[#C4644A]/8 text-[#D97F68] border border-[#C4644A]/25 px-1.5 py-0.5 rounded select-none">
                    Trending
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ReadPill progress={prog} accentColor={ac} />
            </div>
          </div>

          <h2
            className="font-serif italic leading-snug mb-1.5 transition-colors duration-200 group-hover:text-[#9E7B4C]"
            style={{ fontSize: 'clamp(0.95rem, 2.2vw, 1.35rem)', color: fg, letterSpacing: '-0.02em' }}
          >
            {story.title}
          </h2>
          <p className="font-sans leading-relaxed text-[11px] sm:text-[13px] line-clamp-2 sm:line-clamp-3" style={{ color: mu, opacity: 0.9 }}>
            {story.hook}
          </p>
        </div>

        {/* Concepts + arrow */}
        <div className="flex items-end justify-between mt-3 gap-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            {(story.concepts || []).slice(0, 2).map(c => (
              <span key={c} className="text-[8px] sm:text-[9px] font-mono tracking-[0.08em] uppercase flex items-center gap-1" style={{ color: mu }}>
                <span style={{ color: ac, opacity: 0.5 }}>▪</span>{c}
              </span>
            ))}
            {getTotalReactions(story) > 0 && (
              <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.08em] uppercase flex items-center gap-1">
                <span style={{ color: ac, opacity: 0.5 }}>▪</span>
                <EngagementBar reactions={story.reactions} />
              </span>
            )}
          </div>
          
          <div className="flex items-center flex-shrink-0">
            <span className="text-[#9E7B4C]/50 group-hover:text-[#9E7B4C] group-hover:translate-x-0.5 transition-all duration-300 text-xs sm:text-sm">→</span>
          </div>
        </div>
      </div>
      {/* Resume bar — appears if partially read */}
      {prog && !prog.completed && prog.lastLayer > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] z-20"
          style={{ background: `linear-gradient(to right, ${ac} ${(prog.lastLayer / 7) * 100}%, rgba(158,123,76,0.12) ${(prog.lastLayer / 7) * 100}%)` }} />
      )}
    </article>
  );
}

// ── Reading progress pill ─────────────────────────────────────────────────
function ReadPill({ progress, accentColor }) {
  if (!progress) return null;
  if (progress.completed) {
    return (
      <span className="text-[8px] font-mono tracking-[0.1em] uppercase flex items-center gap-1"
        style={{ color: accentColor, opacity: 0.7 }}>
        <span>✓</span> Read
      </span>
    );
  }
  if (progress.lastLayer > 0) {
    return (
      <span className="text-[8px] font-mono tracking-[0.1em] uppercase flex items-center gap-1.5"
        style={{ color: accentColor, opacity: 0.8 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
        Layer {progress.lastLayer}/7
      </span>
    );
  }
  return null;
}

// ── Engagement reacts display — unified reaction keys ────────────────────
function EngagementBar({ reactions }) {
  const rx = reactions || {};
  const intriguing   = rx.intriguing  || rx.like  || 0;
  const gripping     = rx.gripping    || rx.heart || 0;
  const chilling     = rx.chilling    || rx.scared || 0;
  const mind_blowing = rx.mind_blowing || rx.mindblown || 0;

  const total = intriguing + gripping + chilling + mind_blowing;
  if (total === 0) return null;

  const ITEMS = [
    { key: 'intriguing', label: 'INTRIGUING', count: intriguing, color: '#F59E0B' },
    { key: 'gripping', label: 'GRIPPING', count: gripping, color: '#A78BFA' },
    { key: 'chilling', label: 'CHILLING', count: chilling, color: '#F87171' },
    { key: 'mind_blowing', label: 'MIND BLOWING', count: mind_blowing, color: '#22D3EE' },
  ];

  // Find dominant reaction
  let dominant = ITEMS[0];
  for (let i = 1; i < ITEMS.length; i++) {
    if (ITEMS[i].count > dominant.count) {
      dominant = ITEMS[i];
    }
  }

  if (dominant.count === 0) return null;

  return (
    <span 
      className="font-mono uppercase text-[8px] sm:text-[9px] tracking-wider font-semibold"
      style={{ color: dominant.color }}
      title={`${dominant.label}: ${dominant.count} reactions`}
    >
      {dominant.label} ({dominant.count})
    </span>
  );
}


// ── Main catalog component ────────────────────────────────────────────────
export default function StoryCatalog({ category, stories, allStories, onSelectStory, onBack, onShareStory, onOpenSearch }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#8F8A82';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [visible, setVisible]   = useState(false);
  const [sortBy, setSortBy]     = useState('popular');
  const [lastTap, setLastTap]   = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const { getProgress }         = useReadingProgress();

  // Calculate relative thresholds for engagement and new status from all stories
  const relativeThresholds = useMemo(() => {
    const pool = allStories || stories || [];
    if (pool.length === 0) {
      return { highThreshold: 8, midThreshold: 3, newStoryIds: new Set() };
    }

    const counts = pool.map(s => {
      const rx = s.reactions || {};
      return (rx.like || rx.intriguing || 0) + (rx.gripping || rx.heart || 0) + (rx.chilling || rx.scared || 0) + (rx.mind_blowing || rx.mindblown || 0);
    });
    counts.sort((a, b) => a - b);
    
    const highIdx = Math.floor(counts.length * 0.80);
    const midIdx = Math.floor(counts.length * 0.50);
    
    const highThreshold = Math.max(1, counts[highIdx] || 8);
    const midThreshold = Math.max(1, counts[midIdx] || 3);

    const sortedByDate = [...pool]
      .filter(s => s.added_date)
      .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime());
    
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentStories = sortedByDate.filter(s => new Date(s.added_date).getTime() > recentCutoff);
    const newStoryIds = new Set(recentStories.slice(0, 6).map(s => s.story_id));

    return { highThreshold, midThreshold, newStoryIds };
  }, [allStories, stories]);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTap > 1500) { setTapCount(1); }
    else {
      const next = tapCount + 1;
      if (next >= 5) { window.location.hash = '#console'; setTapCount(0); }
      else setTapCount(next);
    }
    setLastTap(now);
  };

  const getTotalReactions = (s) => {
    const rx = s.reactions || {};
    // Support both old and new unified reaction keys
    return (rx.intriguing || rx.like || 0) + (rx.gripping || rx.heart || 0) + (rx.chilling || rx.scared || 0) + (rx.mind_blowing || rx.mindblown || 0);
  };


  const getTrendingScore = (s) => {
    const rxCount = getTotalReactions(s);
    if (!s.added_date) return rxCount;
    const ageDays = (Date.now() - new Date(s.added_date).getTime()) / (1000 * 60 * 60 * 24);
    // Exponentially decay the value of reactions over time (halflife around 7 days)
    return rxCount / Math.sqrt(Math.max(1, ageDays) + 1);
  };

  const sortedStories = [...stories].sort((a, b) => {
    if (sortBy === 'popular') {
      const scoreA = getTrendingScore(a);
      const scoreB = getTrendingScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.added_date && b.added_date) {
        return new Date(b.added_date) - new Date(a.added_date);
      }
      return 0;
    }
    if (sortBy === 'engaged') {
      const rxA = getTotalReactions(a);
      const rxB = getTotalReactions(b);
      if (rxA !== rxB) return rxB - rxA;
      if (a.added_date && b.added_date) {
        return new Date(b.added_date) - new Date(a.added_date);
      }
      return 0;
    }
    if (sortBy === 'newest') {
      if (a.added_date && b.added_date) {
        const dateDiff = new Date(b.added_date) - new Date(a.added_date);
        if (dateDiff !== 0) return dateDiff;
      }
      return getTotalReactions(b) - getTotalReactions(a);
    }
    if (sortBy === 'progress') {
      const progA = getProgress(a.story_id);
      const progB = getProgress(b.story_id);
      
      const statusA = progA?.completed ? 2 : (progA?.lastLayer > 0 ? 0 : 1); // 0 = in progress, 1 = unread, 2 = completed
      const statusB = progB?.completed ? 2 : (progB?.lastLayer > 0 ? 0 : 1);
      
      if (statusA !== statusB) return statusA - statusB;
      if (statusA === 0) {
        return (progB.lastLayer || 0) - (progA.lastLayer || 0);
      }
      if (a.added_date && b.added_date) {
        return new Date(b.added_date) - new Date(a.added_date);
      }
      return 0;
    }
    return 0;
  });

  const categoryLabel = CATEGORY_LABELS[category] || category;

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: bg, color: fg }}>
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header className="px-4 sm:px-8 md:px-10">
        <div className="mx-auto h-14 flex items-center justify-between" style={{ maxWidth: '780px' }}>
          {/* Logo + wordmark */}
          <div onClick={handleLogoTap} className="flex items-center gap-2.5 cursor-pointer select-none" title="Tap 5× for Admin">
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

          {/* Right: Search, dossier count + back */}
          <div className="flex items-center gap-4">
            <button
              onClick={onOpenSearch}
              aria-label="Search archives"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#9E7B4C]/20 hover:border-[#9E7B4C]/50 bg-black/35 hover:bg-[#9E7B4C]/10 transition-all duration-300 cursor-pointer active:scale-95 select-none"
            >
              <Search className="w-3 h-3 text-[#9E7B4C] group-hover:text-[#EDE8DF] transition-colors duration-300" />
              <span className="hidden sm:inline text-[9px] font-mono tracking-widest text-[#8F8A82]/80 group-hover:text-[#EDE8DF]/90 transition-colors uppercase">
                Search
              </span>
            </button>
            <span className="text-[9px] font-mono tracking-[0.12em] uppercase hidden sm:block" style={{ color: mu, opacity: 0.6 }}>
              {stories.length} {stories.length === 1 ? 'dossier' : 'dossiers'}
            </span>
            <button onClick={onBack}
              className="text-[9px] font-bold tracking-[0.15em] uppercase opacity-50 hover:opacity-80 active:opacity-30 cursor-pointer"
              style={{ background: 'none', border: 'none', color: ac, fontFamily: "'Space Mono', monospace" }}>
              ← Back
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col px-4 sm:px-8 md:px-10 py-12 md:py-16 pb-24">
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Title */}
          <div className="mb-3">
            <h1 className="font-serif italic leading-none tracking-tight"
              style={{ fontSize: 'clamp(2.2rem, 7vw, 4rem)', fontWeight: 600, color: fg, letterSpacing: '-0.04em', lineHeight: 0.95 }}>
              {categoryLabel}
            </h1>
          </div>

          {/* Sort tab pills: Trending · Recent · Top Rated · Reading */}
          <div className="flex items-center gap-0.5 mb-8 overflow-x-auto scrollbar-none -mx-4 sm:-mx-8 md:-mx-10 px-4 sm:px-8 md:px-10 border-b"
            style={{ borderBottomColor: 'rgba(158,123,76,0.12)' }}>
            {[
              { value: 'popular', label: '❖ Trending' },
              { value: 'newest',  label: '◉ Recent'   },
              { value: 'engaged', label: '◎ Top Rated' },
              { value: 'progress', label: '⊙ Reading' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono font-bold tracking-[0.16em] uppercase whitespace-nowrap flex-shrink-0 cursor-pointer border-b-2 focus:outline-none transition-all duration-150"
                style={{
                  color: sortBy === opt.value ? fg : mu,
                  borderBottomColor: sortBy === opt.value ? ac : 'transparent',
                  background: 'none',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* ── Story Cards ── */}
          {stories.length === 0 ? (
            <div className="text-center py-24" style={{ color: mu }}>
              <p className="font-serif italic text-xl mb-3" style={{ opacity: 0.5 }}>No dossiers filed yet.</p>
              <p className="text-[10px] uppercase tracking-[0.2em]" style={{ opacity: 0.3 }}>The archive is being compiled.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedStories.map((story, idx) => (
                <StoryCard
                  key={story.story_id}
                  story={story}
                  onSelectStory={onSelectStory}
                  onShareStory={onShareStory}
                  idx={idx}
                  visible={visible}
                  ac={ac}
                  fg={fg}
                  mu={mu}
                  relativeThresholds={relativeThresholds}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <footer className="mt-32 pt-10 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase"
            style={{ borderColor: ru, color: mu }}>
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
        </div>
      </main>
    </div>
  );
}
