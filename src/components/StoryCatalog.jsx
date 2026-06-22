/**
 * StoryCatalog — premium editorial dossier browser.
 * No cheap tab bars. Sort is a single ambient dropdown.
 * Cards show depth signal, not badges like "TRENDING".
 */
import { useState, useEffect, useRef } from 'react';
import { useStaticContent } from '../hooks/useStaticContent';
import { useReadingProgress } from '../hooks/useReadingProgress';
import LoreMark from './LoreMark';

const SEVERITY_CONFIG = {
  unsettling: { label: 'CLASSIFIED', dot: '#9E7B4C', glow: 'rgba(158,123,76,0.12)' },
  disturbing:  { label: 'RESTRICTED', dot: '#C4644A', glow: 'rgba(196,100,74,0.12)' },
  extreme:     { label: 'EYES ONLY',  dot: '#8B2F2F', glow: 'rgba(139,47,47,0.14)' },
};

const CATEGORY_LABELS = {
  psychology: 'Psychology', true_crime: 'True Crime',
  paranormal: 'Paranormal', mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies', cyber_mysteries: 'Digital Shadows',
};

// ── Story card image with priority: local hero_image > Wikipedia ──────────
function StoryCardImage({ story, alt }) {
  const { getImageByQuery } = useStaticContent();
  const [fetchedUrl, setFetchedUrl] = useState(null);

  useEffect(() => {
    if (story.hero_image) return;
    let active = true;
    const query = story.image_query || story.title;
    getImageByQuery(query).then(url => { if (active) setFetchedUrl(url); });
    return () => { active = false; };
  }, [story.hero_image, story.image_query, story.title, getImageByQuery]);

  const displayUrl = story.hero_image || fetchedUrl;

  if (!displayUrl) {
    return (
      <div className="w-full h-full bg-neutral-950/80 animate-pulse flex items-center justify-center">
        <div className="w-6 h-6 border border-neutral-800 rounded-full opacity-30" />
      </div>
    );
  }
  return (
    <img src={displayUrl} alt={alt}
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy" />
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
                color: opt.value === value ? '#9E7B4C' : '#6A6560',
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

// ── Engagement micro-bar (replaces clunky "X feedbacks" pill) ────────────
function EngagementBar({ reactions }) {
  const rx = reactions || {};
  const gripping = rx.gripping || rx.heart || 0;
  const scared   = rx.scared   || 0;
  const mindblown = rx.mindblown || 0;
  const total = gripping + scared + mindblown;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[...Array(Math.min(total, 8))].map((_, i) => (
          <div key={i} className="w-1 h-2.5 rounded-full opacity-40"
            style={{ backgroundColor: '#9E7B4C' }} />
        ))}
      </div>
      <span className="text-[8px] font-mono opacity-35" style={{ color: '#EDE8DF' }}>
        {total} react{total !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

const MODULE_LOAD_TIME = Date.now();

// ── Main catalog component ────────────────────────────────────────────────
export default function StoryCatalog({ category, stories, onSelectStory, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
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
    return (rx.gripping || rx.heart || 0) + (rx.scared || 0) + (rx.mindblown || 0);
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
      <header style={{ padding: '0 40px' }}>
        <div className="mx-auto h-14 flex items-center justify-between" style={{ maxWidth: '780px' }}>
          <div className="flex items-center gap-3">
            <div onClick={handleLogoTap} className="flex items-center gap-[10px] cursor-pointer select-none" title="Tap 5× for Admin">
              <LoreMark size={18} color={fg} />
              <span className="text-[10px] font-bold tracking-[0.32em] uppercase" style={{ color: fg, opacity: 0.85 }}>LORE</span>
            </div>
            <span className="text-neutral-800">·</span>
            <button onClick={onBack}
              className="text-[9px] font-bold tracking-[0.15em] uppercase opacity-50 hover:opacity-80 active:opacity-30 cursor-pointer"
              style={{ background: 'none', border: 'none', color: ac }}>
              ← Back
            </button>
          </div>
          <span className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: mu }}>
            {stories.length} {stories.length === 1 ? 'dossier' : 'dossiers'}
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col" style={{ padding: '48px 40px 88px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Title row */}
          <div className="flex items-end justify-between mb-3 gap-4">
            <h1 className="font-serif italic leading-none tracking-tight"
              style={{ fontSize: 'clamp(2.2rem, 7vw, 4rem)', fontWeight: 300, color: fg, letterSpacing: '-0.04em', lineHeight: 0.95 }}>
              {categoryLabel}
            </h1>
            {stories.length > 1 && (
              <div className="flex-shrink-0 pb-1">
                <SortDropdown value={sortBy} onChange={setSortBy} color={mu} />
              </div>
            )}
          </div>

          <p className="font-serif leading-relaxed mb-12"
            style={{ fontSize: 'clamp(0.9rem, 2vw, 1rem)', fontWeight: 300, color: fg, opacity: 0.35, maxWidth: '48ch' }}>
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
              {sortedStories.map((story, idx) => {
                const sev     = SEVERITY_CONFIG[story.severity] || SEVERITY_CONFIG.unsettling;
                const prog    = getProgress(story.story_id);
                const isNew   = isNewArrival(story.added_date);

                return (
                  <article
                    key={story.story_id}
                    onClick={() => onSelectStory(story)}
                    className="group relative w-full flex flex-col md:flex-row gap-0 rounded-2xl overflow-hidden border cursor-pointer"
                    style={{
                      backgroundColor: 'rgba(15, 13, 10, 0.7)',
                      borderColor: 'rgba(237,232,223,0.055)',
                      boxShadow: '0 8px 32px -12px rgba(0,0,0,0.8)',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(14px)',
                      transition: `opacity 0.55s ${idx * 0.07}s cubic-bezier(0.16,1,0.3,1), transform 0.55s ${idx * 0.07}s cubic-bezier(0.16,1,0.3,1)`,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = `rgba(158,123,76,0.2)`;
                      e.currentTarget.style.boxShadow = `0 16px 48px -12px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(158,123,76,0.08)`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(237,232,223,0.055)';
                      e.currentTarget.style.boxShadow = '0 8px 32px -12px rgba(0,0,0,0.8)';
                    }}
                  >
                    {/* Image panel */}
                    <div className="w-full md:w-[200px] h-[160px] md:h-auto flex-shrink-0 relative overflow-hidden">
                      <StoryCardImage story={story} alt={story.title} />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0"
                        style={{ background: 'linear-gradient(to right, transparent 60%, rgba(15,13,10,0.9) 100%), linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
                      {/* Severity dot — top left of image */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sev.dot }} />
                        <span className="text-[8px] font-mono tracking-[0.16em] uppercase"
                          style={{ color: sev.dot, textShadow: '0 0 8px rgba(0,0,0,0.8)' }}>
                          {sev.label}
                        </span>
                      </div>
                      {/* NEW dot — only if < 3 days old */}
                      {isNew && (
                        <div className="absolute bottom-3 left-3">
                          <span className="text-[7px] font-mono tracking-[0.2em] uppercase px-1.5 py-0.5 rounded-sm"
                            style={{ color: '#9E7B4C', backgroundColor: 'rgba(158,123,76,0.15)', border: '1px solid rgba(158,123,76,0.3)' }}>
                            ◉ NEW
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content panel */}
                    <div className="flex-1 flex flex-col justify-between p-5 md:p-6 min-h-[140px]">
                      <div>
                        {/* Reading progress */}
                        <div className="flex items-center justify-between mb-2.5">
                          <ReadPill progress={prog} accentColor={ac} />
                          <EngagementBar reactions={story.reactions} />
                        </div>

                        {/* Title */}
                        <h2 className="font-serif italic leading-snug mb-2 transition-colors duration-200 group-hover:text-[#9E7B4C]"
                          style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)', color: fg, letterSpacing: '-0.02em' }}>
                          {story.title}
                        </h2>

                        {/* Hook */}
                        <p className="font-sans leading-relaxed line-clamp-2"
                          style={{ fontSize: '13px', color: mu, opacity: 0.9 }}>
                          {story.hook}
                        </p>
                      </div>

                      {/* Bottom row: concepts + CTA arrow */}
                      <div className="flex items-end justify-between mt-4 gap-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(story.concepts || []).slice(0, 3).map(c => (
                            <span key={c}
                              className="text-[8px] font-mono tracking-[0.08em] uppercase px-2 py-0.5 rounded-sm"
                              style={{ color: mu, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(237,232,223,0.06)' }}>
                              {c.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                        <span className="text-base flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:opacity-80"
                          style={{ color: ac, opacity: 0.4 }}>→</span>
                      </div>
                    </div>

                    {/* Resume bar — appears if partially read */}
                    {prog && !prog.completed && prog.lastLayer > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                        style={{ background: `linear-gradient(to right, ${ac} ${(prog.lastLayer / 7) * 100}%, rgba(158,123,76,0.12) ${(prog.lastLayer / 7) * 100}%)` }} />
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <footer className="mt-32 pt-10 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase"
            style={{ borderColor: ru, color: mu }}>
            <p className="opacity-60">© {new Date().getFullYear()} LORE ARCHIVE</p>
            <p className="mt-4 sm:mt-0 flex items-center gap-2 opacity-95">
              MADE BY <span className="black-lotus-premium ml-1 transition-all duration-300">BLACK_LOTUS</span>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
