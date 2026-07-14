/**
 * StoryCatalog — premium editorial dossier browser.
 * No cheap tab bars. Sort is a single ambient dropdown.
 * Cards show depth signal, not badges like "TRENDING".
 */
/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Share2, Search } from 'lucide-react';
import { useStaticContent } from '../hooks/useStaticContent';
import { useReadingProgress } from '../hooks/useReadingProgress';
import LoreMark from './LoreMark';

// Helper to automatically redact sensitive terms and custom bracketed text
export function redactText(text) {
  if (!text) return '';
  return text.replace(/\[\[(.*?)\]\]/g, '$1');
}

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

const GRADIENTS = [
  'radial-gradient(circle at center, #231C16 0%, #0C0A09 100%)', // sepia
  'radial-gradient(circle at center, #221515 0%, #0C0808 100%)', // crimson
  'radial-gradient(circle at center, #152219 0%, #080C0A 100%)', // emerald
  'radial-gradient(circle at center, #151E22 0%, #080B0C 100%)', // teal
  'radial-gradient(circle at center, #1D1522 0%, #0A080C 100%)', // purple
];

export const getShortTitle = (title) => {
  if (!title) return '';
  return title.split(/[:\-–—(]/)[0].trim();
};

const getGradientIndex = (storyId) => {
  if (!storyId) return 0;
  let hash = 0;
  for (let i = 0; i < storyId.length; i++) {
    hash = storyId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % GRADIENTS.length;
};

// Memory cache for resolved image queries
const IMAGE_QUERY_CACHE = {};

// ── Story card image — accepts inView from parent card ────────────────────
function StoryCardImage({ story, alt, inView }) {
  const { getImageByQuery } = useStaticContent();
  const [fetchedUrl, setFetchedUrl] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!story.hero_image || story.image_missing) {
      const query = story.image_query || story.title;
      if (IMAGE_QUERY_CACHE[query]) {
        setFetchedUrl(IMAGE_QUERY_CACHE[query]);
        return;
      }

      let active = true;
      getImageByQuery(query).then(url => {
        if (url) {
          IMAGE_QUERY_CACHE[query] = url;
          if (active) setFetchedUrl(url);
        }
      });
      return () => { active = false; };
    }
  }, [story.hero_image, story.image_missing, story.image_query, story.title, getImageByQuery]);

  const handleImageError = () => {
    if (story.hero_image && !story.image_missing && !fallbackAttempted) {
      setFallbackAttempted(true);
      const query = story.image_query || story.title;
      if (IMAGE_QUERY_CACHE[query]) {
        setFetchedUrl(IMAGE_QUERY_CACHE[query]);
        return;
      }
      getImageByQuery(query).then(url => {
        if (url) {
          IMAGE_QUERY_CACHE[query] = url;
          setFetchedUrl(url);
        } else {
          setImgFailed(true);
        }
      }).catch(() => setImgFailed(true));
    } else {
      setImgFailed(true);
    }
  };

  const isDirectUrl = story.image_query && (story.image_query.startsWith('http') || story.image_query.startsWith('/'));
  const displayUrl = (story.hero_image && !story.image_missing && !fallbackAttempted) ? story.hero_image : ((isDirectUrl && !fallbackAttempted) ? story.image_query : fetchedUrl);

  const FORCE_TYPOGRAPHIC_COVERS = false; // Set to true to temporarily bypass all cover images and show typographic HUD layout only
  if (FORCE_TYPOGRAPHIC_COVERS || displayUrl === 'typography' || !displayUrl || imgFailed) {
    const shortTitle = getShortTitle(story.title);
    const gradIndex = getGradientIndex(story.story_id);
    const bgGradient = GRADIENTS[gradIndex];
    const freq = (10 + (getGradientIndex(story.story_id + "freq") * 7.7) + (shortTitle.length % 5) * 1.5).toFixed(1);
    
    return (
      <div 
        className="w-full h-full flex flex-col justify-between p-5 relative select-none overflow-hidden border-b border-neutral-900/40"
        style={{ background: bgGradient }}
      >
        {/* Top telemetry detail */}
        <div className="flex justify-between items-center opacity-65 text-[7.5px] font-mono tracking-widest text-[#EDE8DF] font-bold">
          <span>[ SEC-ARCHIVE.0{story.story_id ? story.story_id.slice(-2) : 'XX'} ]</span>
          <span>SIGNAL RES.90</span>
        </div>

        {/* Center Typography */}
        <div className="my-auto text-center py-3 px-2 flex flex-col items-center justify-center gap-1.5">
          <span className="text-[6px] tracking-[0.25em] font-mono text-[#9E7B4C]/80 uppercase font-bold mb-0.5">
            Dossier: {story.category ? story.category.replace('_', ' ') : 'Classified'}
          </span>
          <span 
            className="block font-serif italic text-[#EDE8DF] leading-relaxed uppercase font-medium"
            style={{ 
              fontSize: '12px',
              letterSpacing: '0.15em',
              textShadow: '0 2px 10px rgba(0,0,0,0.95)'
            }}
          >
            {shortTitle}
          </span>
        </div>

        {/* Bottom telemetry detail */}
        <div className="flex justify-between items-center opacity-70 text-[7.5px] font-mono tracking-widest text-[#9E7B4C] font-bold">
          <span>LEVEL-04</span>
          <span>{freq} MHz</span>
        </div>
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
      {/* SEVENDESCENTS brand — top-left, always subtle */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none select-none" style={{ opacity: 0.22 }}>
        <LoreMark size={8} color="#EDE8DF" />
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: '6px',
            color: '#EDE8DF',
            letterSpacing: '0.28em',
            fontWeight: 700,
          }}
        >SEVENDESCENTS</span>
      </div>


      {/* Retro telemetry decryption overlay while loading */}
      {!loaded && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center bg-[#090807] animate-pulse space-y-1.5 z-10"
          style={{
            backgroundImage: 'linear-gradient(rgba(158, 123, 76, 0.05) 1px, transparent 1px)',
            backgroundSize: '100% 4px',
          }}
        >
          <div className="w-4 h-4 rounded-full border border-dashed border-[#9E7B4C]/45 animate-spin" />
          <span className="text-[7.5px] font-mono tracking-[0.25em] text-[#9E7B4C]/80 uppercase animate-pulse">
            [ DECRYPTING MEDIA ]
          </span>
        </div>
      )}

      {/* Image — grayscale by default, full color when card is in viewport or hovered */}
      <img
        src={displayUrl}
        alt={alt}
        width="200"
        height="150"
        onLoad={() => setLoaded(true)}
        onError={handleImageError}
        className={`w-full h-full object-cover transition-all duration-[400ms] ease-out group-hover:scale-[1.03] group-hover:grayscale-0 group-hover:opacity-100 group-hover:brightness-100 ${
          loaded 
            ? (inView ? 'grayscale-0 opacity-100 brightness-100' : 'grayscale-[60%] opacity-75 brightness-[90%]') 
            : 'opacity-0 scale-95 grayscale'
        }`}
        style={{ objectPosition: 'center 18%' }}
        loading="lazy"
      />
    </div>
  );
}

// ── Story card wrapper with IntersectionObserver for color reveal ────────
function StoryCard({ story, onSelectStory, onShareStory, idx, visible, ac, fg, mu, relativeThresholds, focused, onMouseEnter }) {
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

  const previewSnippet = useMemo(() => {
    const content = story.layers?.[0]?.content || story.hook || '';
    if (!content) return '';
    const sentenceMatch = content.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch) {
      const sentence = sentenceMatch[0].trim();
      if (sentence.length < 50) {
        const twoSentencesMatch = content.match(/^([^.!?]+[.!?]\s*[^.!?]+[.!?])/);
        if (twoSentencesMatch) return twoSentencesMatch[0].trim();
      }
      return sentence;
    }
    return content.length > 120 ? content.slice(0, 120).trim() + '...' : content;
  }, [story.layers, story.hook]);

  const storyYear = useMemo(() => {
    const y = story.year;
    // Only return a year if it's a real numeric-looking value (not 'N/A', not blank)
    if (y && y !== 'N/A' && y !== 'n/a' && String(y).trim() !== '' && /\d{4}/.test(String(y))) {
      return String(y).match(/\d{4}/)?.[0] || null;
    }
    return null;
  }, [story.year]);

  const fileNum = useMemo(() => {
    if (!story.story_id) return null;
    let hash = 0;
    for (let i = 0; i < story.story_id.length; i++) {
      hash = story.story_id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return String((Math.abs(hash) % 900) + 100);
  }, [story.story_id]);

  const codedRef = useMemo(() => {
    const catCode = (story.category || 'arc').toUpperCase().slice(0, 3).replace('-', '');
    return `REF-${catCode}.${fileNum || '000'}`;
  }, [story.category, fileNum]);

  return (
    <article
      id={`story-card-${idx}`}
      ref={cardRef}
      onClick={() => onSelectStory(story)}
      onMouseEnter={onMouseEnter}
      className={`group relative w-full grid grid-cols-1 sm:grid-cols-[160px_1fr] md:grid-cols-[190px_1fr] gap-0 rounded-xl overflow-hidden border cursor-pointer transition-all duration-[300ms]`}
      style={{
        backgroundColor: focused ? 'rgba(15, 13, 10, 0.98)' : 'rgba(13, 11, 8, 0.72)',
        borderColor: focused ? 'rgba(158,123,76,0.45)' : 'rgba(237,232,223,0.06)',
        boxShadow: focused
          ? '0 12px 40px -10px rgba(0,0,0,0.9), 0 0 10px rgba(158,123,76,0.07)'
          : '0 4px 20px -8px rgba(0,0,0,0.7)',
        opacity: visible ? 1 : 0,
        transform: visible ? (focused ? 'translateY(-1px)' : 'translateY(0)') : 'translateY(10px)',
      }}
    >
      {/* Share button */}
      <button
        onClick={(e) => { e.stopPropagation(); onShareStory?.(story); }}
        className="absolute top-2 right-2 z-30 flex items-center justify-center w-10 h-10 rounded-full text-[#EDE8DF]/30 hover:text-[#9E7B4C] transition-colors duration-200 active:scale-90 focus:outline-none cursor-pointer"
        title="Share Dossier"
        aria-label="Share dossier"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>

      {/* Image panel — clean, no overlays */}
      <div className="w-full h-40 sm:h-full flex-shrink-0 relative overflow-hidden bg-[#090807]">
        <StoryCardImage story={story} alt={story.title} inView={inView} />
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to right, transparent 50%, rgba(13,11,8,0.9) 100%), linear-gradient(to bottom, transparent 55%, rgba(9,8,7,0.98) 100%)' }}
        />
        {/* File No. watermark — bottom-left, matching top-left brand watermark */}
        {fileNum && (
          <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center pointer-events-none select-none" style={{ opacity: 0.22 }}>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '6px',
                color: '#EDE8DF',
                letterSpacing: '0.28em',
                fontWeight: 700,
              }}
            >FILE NO. {fileNum}</span>
          </div>
        )}
      </div>

      {/* Content panel */}
      <div className="w-full flex flex-col justify-between p-3.5 sm:p-5 min-h-[150px]">
        <div>
          {/* KPI strip — horizontal chips row at top */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3 pr-8">
            {/* Severity pill — color-matched, refined */}
            <span
              className="inline-flex items-center gap-[5px] px-2.5 py-1 text-[6px] font-mono font-bold tracking-[0.22em] uppercase flex-shrink-0"
              style={{
                color: sev.dot,
                backgroundColor: `${sev.dot}18`,
                border: `1px solid ${sev.dot}40`,
                borderRadius: '3px',
              }}
            >
              <span className="w-[4.5px] h-[4.5px] rounded-full flex-shrink-0" style={{ backgroundColor: sev.dot }} />
              {sev.label}
            </span>

            {/* Mid-dot separator */}
            <span className="text-[8px] flex-shrink-0" style={{ color: 'rgba(237,232,223,0.15)' }}>·</span>

            {/* Category tag */}
            <span
              className="inline-flex items-center px-2 py-0.5 text-[6.5px] font-mono tracking-[0.16em] uppercase flex-shrink-0"
              style={{
                color: ac,
                opacity: 0.8,
                border: '1px solid rgba(158,123,76,0.2)',
                borderRadius: '2px',
                backgroundColor: 'rgba(158,123,76,0.06)',
              }}
            >
              {SIGNAL_LABELS[story.category] || 'Archive'}
            </span>

            {/* Year — only if real */}
            {storyYear && (
              <>
                <span className="text-[8px] flex-shrink-0" style={{ color: 'rgba(237,232,223,0.15)' }}>·</span>
                <span
                  className="text-[6.5px] font-mono tracking-[0.12em] flex-shrink-0"
                  style={{ color: mu, opacity: 0.55 }}
                >
                  {storyYear}
                </span>
              </>
            )}

            {/* File Number tag */}
            {fileNum && (
              <>
                <span className="text-[8px] flex-shrink-0" style={{ color: 'rgba(237,232,223,0.15)' }}>·</span>
                <span
                  className="text-[6.5px] font-mono tracking-[0.1em] flex-shrink-0"
                  style={{ color: mu, opacity: 0.5 }}
                >
                  FILE NO. {fileNum}
                </span>
              </>
            )}

            {/* Coded reference tag */}
            {codedRef && (
              <>
                <span className="text-[8px] flex-shrink-0" style={{ color: 'rgba(237,232,223,0.15)' }}>·</span>
                <span
                  className="text-[6.5px] font-mono tracking-[0.1em] flex-shrink-0"
                  style={{ color: mu, opacity: 0.5 }}
                >
                  {codedRef}
                </span>
              </>
            )}

            {/* Reading progress — right-aligned amber pill */}
            {prog && (prog.completed || prog.lastLayer > 0) && (
              <span
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[6px] font-mono font-bold tracking-[0.18em] uppercase flex-shrink-0"
                style={{
                  color: ac,
                  border: '1px solid rgba(158,123,76,0.3)',
                  borderRadius: '2px',
                  backgroundColor: 'rgba(158,123,76,0.08)',
                }}
              >
                {prog.completed
                  ? <><span>&#10003;</span> Read</>
                  : <><span className="w-[3.5px] h-[3.5px] rounded-full bg-current inline-block" /> L{prog.lastLayer}/7</>
                }
              </span>
            )}
          </div>

          {/* Title — written in Zilla Slab typography font */}
          <h2
            className="font-slab font-semibold leading-snug mb-2 transition-colors duration-200 group-hover:text-[#9E7B4C] tracking-tight"
            style={{ fontSize: 'clamp(1.05rem, 2.3vw, 1.34rem)', color: fg }}
          >
            {story.title}
          </h2>

          {/* Hook */}
          <p className="font-sans leading-relaxed text-[11px] sm:text-[12px] line-clamp-2" style={{ color: mu, opacity: 0.75 }}>
            {redactText(story.hook)}
          </p>
        </div>

        {/* Footer: concepts + reactions + arrow */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {(story.concepts || []).slice(0, 2).map(c => (
              <span
                key={c}
                className="px-2 py-[2.5px] text-[6.5px] font-mono tracking-[0.16em] uppercase rounded-sm border select-none"
                style={{
                  borderColor: 'rgba(237,232,223,0.06)',
                  color: 'rgba(237,232,223,0.4)',
                  backgroundColor: 'rgba(237,232,223,0.02)'
                }}
              >
                // {c}
              </span>
            ))}
            {getTotalReactions(story) > 0 && (
              <span
                className="px-2 py-[2.5px] text-[6.5px] font-mono tracking-[0.16em] uppercase rounded-sm border select-none"
                style={{
                  borderColor: 'rgba(158,123,76,0.25)',
                  color: '#9E7B4C',
                  backgroundColor: 'rgba(158,123,76,0.04)'
                }}
              >
                &#8593; {getTotalReactions(story)}
              </span>
            )}
          </div>
          <span className="text-[#9E7B4C]/30 group-hover:text-[#9E7B4C] group-hover:translate-x-0.5 transition-all duration-300 text-sm flex-shrink-0">&#8594;</span>
        </div>
      </div>


      {/* Layer progress bar */}
      {prog && !prog.completed && prog.lastLayer > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ background: `linear-gradient(to right, ${ac} ${(prog.lastLayer / 7) * 100}%, rgba(158,123,76,0.08) ${(prog.lastLayer / 7) * 100}%)` }} />
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


function getStoryWordCount(story) {
  if (!story?.layers || !Array.isArray(story.layers)) return 0;
  return story.layers.reduce((sum, layer) => {
    const words = (layer.content || '').trim().split(/\s+/).filter(Boolean).length;
    return sum + words;
  }, 0);
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
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [filterReadStatus, setFilterReadStatus] = useState('all'); // 'all' | 'active' | 'archived'
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

  const sortedStories = useMemo(() => {
    return [...stories].sort((a, b) => {
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
  }, [stories, sortBy, getProgress]);

  // Dynamic Level & Read Status filtering: Surface, Deep, Abyss + Active, Archived, All
  const filteredStories = useMemo(() => {
    const byLevel = sortedStories.filter(story => {
      if (selectedLevel === 'all') return true;
      if (selectedLevel === 'surface') {
        return ['curious', 'unsettling'].includes(story.severity || 'unsettling');
      }
      if (selectedLevel === 'deep') {
        return ['disturbing', 'harrowing'].includes(story.severity);
      }
      if (selectedLevel === 'forbidden') {
        return story.severity === 'forbidden';
      }
      return true;
    });

    const withReadStatus = byLevel.filter(story => {
      const prog = getProgress(story.story_id);
      const isCompleted = prog?.completed === true;
      if (filterReadStatus === 'active') return !isCompleted;
      if (filterReadStatus === 'archived') return isCompleted;
      return true;
    });

    // In 'all' tab, move completed/read stories to the end of the list
    if (filterReadStatus === 'all') {
      const unread = [];
      const read = [];
      for (const story of withReadStatus) {
        const prog = getProgress(story.story_id);
        if (prog?.completed) {
          read.push(story);
        } else {
          unread.push(story);
        }
      }
      return [...unread, ...read];
    }

    return withReadStatus;
  }, [sortedStories, selectedLevel, filterReadStatus, getProgress]);

  // J/K/Enter keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement?.tagName?.toLowerCase();
      if (activeEl === 'input' || activeEl === 'textarea' || document.getElementById('search-overlay')) {
        return;
      }

      if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setFocusedIdx(prev => {
          const next = prev < filteredStories.length - 1 ? prev + 1 : prev;
          const el = document.getElementById(`story-card-${next}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFocusedIdx(prev => {
          const next = prev > 0 ? prev - 1 : 0;
          const el = document.getElementById(`story-card-${next}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < filteredStories.length) {
        e.preventDefault();
        onSelectStory(filteredStories[focusedIdx]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredStories, focusedIdx, onSelectStory]);

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
              aria-label="Search the archive"
              className="group flex items-center gap-2.5 cursor-pointer active:scale-95 select-none"
              style={{ transition: 'transform 0.15s ease' }}
            >
              {/* Mobile: icon only */}
              <span className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full border border-[#9E7B4C]/20 bg-black/40 text-[#9E7B4C] group-hover:border-[#9E7B4C]/50 transition-all duration-200">
                <Search className="w-3.5 h-3.5" />
              </span>
              {/* Desktop: search bar with ⌘K hint */}
              <span
                className="hidden sm:flex items-center gap-2.5 h-8 pl-3 pr-2 rounded-lg border border-[#9E7B4C]/18 group-hover:border-[#9E7B4C]/45 bg-black/30 group-hover:bg-[#0D0B08]/70 transition-all duration-200"
                style={{ minWidth: '180px' }}
              >
                <Search className="w-3 h-3 flex-shrink-0 text-[#9E7B4C]/70 group-hover:text-[#9E7B4C] transition-colors" />
                <span className="flex-1 text-[10px] font-mono tracking-[0.12em] uppercase text-[#5A5550] group-hover:text-[#8F8A82] transition-colors whitespace-nowrap">
                  Search archive
                </span>
                <kbd
                  className="flex-shrink-0 flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(237,232,223,0.1)',
                    color: 'rgba(143,138,130,0.45)',
                  }}
                >
                  ⌘K
                </kbd>
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
      <main className="flex-1 flex flex-col px-4 sm:px-8 md:px-10 py-12 md:py-16 pb-24 mobile-bottom-nav-pad">
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Title */}
          <div className="mb-3">
            <h1 className="font-slab font-semibold leading-none tracking-tight"
              style={{ fontSize: 'clamp(2.2rem, 7vw, 4rem)', color: fg, letterSpacing: '-0.04em', lineHeight: 0.95 }}>
              {categoryLabel}
            </h1>
          </div>

          {/* ── Single unified control bar (mobile-first) ── */}
          <div className="flex items-center gap-2 sm:gap-3 mb-7 pb-4 border-b" style={{ borderBottomColor: 'rgba(237,232,223,0.07)' }}>
            {/* Read state selector — 3 understated pill buttons */}
            <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
              {[
                { id: 'all',      label: 'All'      },
                { id: 'active',   label: 'Active'   },
                { id: 'archived', label: 'Archived' },
              ].map(status => (
                <button
                  key={status.id}
                  onClick={() => { setFilterReadStatus(status.id); setFocusedIdx(-1); }}
                  className="min-h-[36px] px-3.5 text-[8.5px] font-mono tracking-[0.14em] uppercase whitespace-nowrap flex-shrink-0 rounded-lg border transition-all duration-200 cursor-pointer active:scale-95"
                  style={{
                    borderColor: filterReadStatus === status.id ? 'rgba(158,123,76,0.5)' : 'rgba(237,232,223,0.07)',
                    color: filterReadStatus === status.id ? '#EDE8DF' : '#5A5550',
                    backgroundColor: filterReadStatus === status.id ? 'rgba(158,123,76,0.12)' : 'transparent',
                  }}
                >
                  {status.label}
                </button>
              ))}
            </div>

            {/* Sort dropdown — right-aligned */}
            <div className="flex-shrink-0 relative">
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value); setFocusedIdx(-1); }}
                className="appearance-none min-h-[36px] pl-3 pr-6 text-[8.5px] font-mono tracking-[0.13em] uppercase rounded-lg border cursor-pointer focus:outline-none transition-all duration-200 bg-transparent"
                style={{
                  borderColor: 'rgba(237,232,223,0.07)',
                  color: '#8F8A82',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%235A5550' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                }}
                aria-label="Sort stories by"
              >
                <option value="popular" style={{ background: '#0D0B08' }}>Trending</option>
                <option value="newest"  style={{ background: '#0D0B08' }}>Recent</option>
                <option value="engaged" style={{ background: '#0D0B08' }}>Top Rated</option>
                <option value="progress" style={{ background: '#0D0B08' }}>Reading</option>
              </select>
            </div>
          </div>

          {/* ── Story Cards ── */}
          {filteredStories.length === 0 ? (
            <div className="text-center py-24" style={{ color: mu }}>
              <p className="font-serif italic text-xl mb-3" style={{ opacity: 0.5 }}>No dossiers filed yet.</p>
              <p className="text-[10px] uppercase tracking-[0.2em]" style={{ opacity: 0.3 }}>The archive is being compiled for this depth.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredStories.map((story, idx) => (
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
                  focused={focusedIdx === idx}
                  onMouseEnter={() => setFocusedIdx(idx)}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <footer className="mt-32 pt-12 pb-8 border-t flex flex-col gap-6" style={{ borderColor: ru, color: mu }}>
            {/* Disclaimer row */}
            <div className="w-full max-w-2xl mx-auto text-center border-t border-b border-dashed py-5 my-2" style={{ borderColor: 'rgba(158, 123, 76, 0.12)', backgroundColor: 'rgba(158, 123, 76, 0.01)' }}>
              <span className="block text-[8px] font-mono tracking-[0.25em] text-[#9E7B4C] mb-2 uppercase font-bold">
                Archival Disclosure // Research Registry
              </span>
              <p className="text-[8px] font-mono tracking-[0.15em] uppercase opacity-45 leading-relaxed max-w-xl mx-auto px-4">
                SevenDescents functions as a curated digital registry documenting historical conspiracies, unresolved disappearances, and cognitive anomalies. All records are compiled from verifiable public domains, investigative logs, and historical research dispatches. This database is compiled strictly for educational and archival purposes.
              </p>
            </div>
            
            {/* Bottom meta row */}
            <div className="flex flex-col sm:flex-row items-center justify-between text-[9px] font-mono tracking-[0.2em] uppercase gap-4">
              <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
                <span className="opacity-60">© {new Date().getFullYear()} SEVENDESCENTS</span>
                <span className="opacity-30">|</span>
                <a href="#console" className="hover:text-[#EDE8DF] transition-colors duration-200" style={{ textDecoration: 'none', borderBottom: '1px dotted rgba(237,232,223,0.3)' }}>
                  CONSOLE
                </a>
                <span className="opacity-30">|</span>
                <span className="text-[#9E7B4C]/80">VERSION 2.4.1</span>
                <span className="opacity-30">|</span>
                <span className="text-neutral-500">TEST ACCESS: ACTIVE</span>
              </div>
              <div className="flex items-center gap-2 opacity-95">
                <span className="mr-lotus-premium transition-all duration-300">SYS_OPERATOR // MR. LOTUS</span>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
