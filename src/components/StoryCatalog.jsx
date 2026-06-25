/**
 * StoryCatalog — premium editorial dossier browser.
 * No cheap tab bars. Sort is a single ambient dropdown.
 * Cards show depth signal, not badges like "TRENDING".
 */
import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Eye, Skull, HelpCircle } from 'lucide-react';
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
      className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center dossier-image-container pt-8"
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
        loading="lazy"
      />
    </div>
  );
}

// ── Story card wrapper with IntersectionObserver for color reveal ────────
function StoryCard({ story, onSelectStory, idx, visible, ac, fg, mu }) {
  const [inView, setInView] = useState(false);
  const cardRef = useRef(null);
  const sev   = SEVERITY_CONFIG[story.severity] || SEVERITY_CONFIG.unsettling;
  const { getProgress } = useReadingProgress();
  const prog  = getProgress(story.story_id);
  const isNew = story.added_date && (Date.now() - new Date(story.added_date).getTime() < 7 * 24 * 60 * 60 * 1000);

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
      className="group relative w-full grid grid-cols-1 md:grid-cols-[200px_1fr] gap-0 rounded-2xl overflow-hidden border cursor-pointer"
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
      {/* Image panel */}
      <div className="w-full h-48 md:h-full flex-shrink-0 relative overflow-hidden">
        <StoryCardImage story={story} alt={story.title} inView={inView} />
        {/* Gradient overlay */}
        <div className="absolute inset-0 story-card-overlay" />
      </div>

      {/* Content panel */}
      <div className="w-full flex flex-col justify-between p-5 md:p-6 min-h-[140px]">
        <div>
          {/* Top row: Badges & Reacts */}
          <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2 border-b border-neutral-900/60 pb-2.5">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[0.15em] uppercase text-neutral-500 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold" style={{ color: sev.dot }}>
                <span className="w-1 h-1 rounded-full bg-current flex-shrink-0 animate-pulse" />
                {sev.label}
              </span>
              <span>·</span>
              <span style={{ color: fg, opacity: 0.65 }}>{SIGNAL_LABELS[story.category] || 'ARCHIVE'}</span>
              {isNew && (<><span>·</span><span style={{ color: ac }}>NEW</span></>)}
              {getTotalReactions(story) > 3 && (
                <><span>·</span><span style={{ color: '#C4644A' }} className="animate-pulse">❖ TRENDING</span></>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ReadPill progress={prog} accentColor={ac} />
              <EngagementBar reactions={story.reactions} />
            </div>
          </div>

          <h2
            className="font-serif italic leading-snug mb-2 transition-colors duration-200 group-hover:text-[#9E7B4C]"
            style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)', color: fg, letterSpacing: '-0.02em' }}
          >
            {story.title}
          </h2>
          <p className="font-sans leading-relaxed line-clamp-2" style={{ fontSize: '13px', color: mu, opacity: 0.9 }}>
            {story.hook}
          </p>
        </div>

        {/* Concepts + arrow */}
        <div className="flex items-end justify-between mt-4 gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(story.concepts || []).slice(0, 3).map(c => (
              <span key={c} className="text-[9px] font-mono tracking-[0.08em] uppercase flex items-center gap-1" style={{ color: mu }}>
                <span style={{ color: ac, opacity: 0.5 }}>▪</span>{c}
              </span>
            ))}
          </div>
          <span className="text-[#9E7B4C]/50 group-hover:text-[#9E7B4C] transition-colors duration-200 text-sm flex-shrink-0">→</span>
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

// ── Sort dropdown ──────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'default',  label: 'Default order' },
  { value: 'engaged',  label: 'Most engaged' },
  { value: 'newest',   label: 'Newest first' },
];

function SortDropdown({ value, onChange, color }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = SORT_OPTIONS.find(o => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[9px] font-mono tracking-[0.18em] uppercase cursor-pointer transition-opacity hover:opacity-70 active:opacity-40"
        style={{ color }}
      >
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1"/>
          <line x1="0" y1="4" x2="7"  y2="4" stroke="currentColor" strokeWidth="1"/>
          <line x1="0" y1="7" x2="4"  y2="7" stroke="currentColor" strokeWidth="1"/>
        </svg>
        {current?.label}
        <span style={{ opacity: 0.4 }}>↕</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 z-50 rounded-lg border overflow-hidden min-w-[152px]"
          style={{ backgroundColor: '#110F0D', borderColor: 'rgba(237,232,223,0.08)', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.8)' }}
        >
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-[10px] font-mono tracking-[0.14em] uppercase transition-colors cursor-pointer hover:bg-white/5"
              style={{
                color: opt.value === value ? '#9E7B4C' : '#8F8A82',
                borderBottom: '1px solid rgba(237,232,223,0.04)',
              }}
            >
              {opt.value === value && <span className="mr-2 text-[8px]">◉</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  // Support both old keys (backward compat) and new unified keys
  const intriguing  = rx.intriguing  || rx.like  || 0;
  const gripping    = rx.gripping    || rx.heart || 0;
  const chilling    = rx.chilling    || rx.scared || 0;
  const mind_blowing = rx.mind_blowing || rx.mindblown || 0;

  const REACTIONS = [
    { count: intriguing,   label: 'INTRIGUING',   Icon: Fingerprint, color: '#F59E0B' },
    { count: gripping,     label: 'GRIPPING',     Icon: Eye,         color: '#8B5CF6' },
    { count: chilling,     label: 'CHILLING',     Icon: Skull,       color: '#EF4444' },
    { count: mind_blowing, label: 'MIND BLOWING', Icon: HelpCircle,  color: '#06B6D4' },
  ];

  const dominant = REACTIONS.reduce((best, r) => (!best || r.count > best.count) ? r : best, null);
  if (!dominant || dominant.count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-[8px] font-mono tracking-wider text-neutral-400 bg-neutral-950/40 border border-neutral-800/35 px-2.5 py-0.5 rounded-full backdrop-blur-sm select-none">
      <dominant.Icon className="w-2.5 h-2.5" style={{ color: dominant.color }} />
      <span className="uppercase">{dominant.label} ({dominant.count})</span>
    </div>
  );
}

const MODULE_LOAD_TIME = Date.now();

// ── Main catalog component ────────────────────────────────────────────────
export default function StoryCatalog({ category, stories, onSelectStory, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#8F8A82';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [visible, setVisible]   = useState(false);
  const [sortBy, setSortBy]     = useState('default');
  const [lastTap, setLastTap]   = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const { getProgress }         = useReadingProgress();

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

  const isNewArrival = (addedDate) => {
    if (!addedDate) return false;
    return (MODULE_LOAD_TIME - new Date(addedDate)) < 1000 * 60 * 60 * 24 * 3; // 3 days
  };

  const sortedStories = [...stories].sort((a, b) => {
    if (sortBy === 'engaged') return getTotalReactions(b) - getTotalReactions(a);
    if (sortBy === 'newest') {
      if (!a.added_date && !b.added_date) return 0;
      if (!a.added_date) return 1;
      if (!b.added_date) return -1;
      return new Date(b.added_date) - new Date(a.added_date);
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

          {/* Right: dossier count + back */}
          <div className="flex items-center gap-3">
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

          {/* Title row */}
          <div className="flex items-end justify-between mb-3 gap-4">
            <h1 className="font-serif italic leading-none tracking-tight"
              style={{ fontSize: 'clamp(2.2rem, 7vw, 4rem)', fontWeight: 600, color: fg, letterSpacing: '-0.04em', lineHeight: 0.95 }}>
              {categoryLabel}
            </h1>
            {stories.length > 1 && (
              <div className="flex-shrink-0 pb-1">
                <SortDropdown value={sortBy} onChange={setSortBy} color={mu} />
              </div>
            )}
          </div>

          <p className="font-serif leading-relaxed mb-12"
            style={{ fontSize: 'clamp(0.9rem, 2vw, 1rem)', fontWeight: 400, color: fg, opacity: 0.35, maxWidth: '48ch' }}>
            Each file descends seven layers. The deeper you go, the harder it becomes to unsee.
          </p>

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
                  idx={idx}
                  visible={visible}
                  ac={ac}
                  fg={fg}
                  mu={mu}
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
