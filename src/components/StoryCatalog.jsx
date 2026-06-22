/**
 * StoryCatalog — shows available dossiers for a selected category.
 * Dark editorial grid. Each card: title, hook, severity, concept tags.
 */
import { useState, useEffect } from 'react';
import { useStaticContent } from '../hooks/useStaticContent';
import LoreMark from './LoreMark';

const SEVERITY_LABELS = {
  unsettling: { label: 'UNSETTLING', color: '#9E7B4C' },
  disturbing: { label: 'DISTURBING', color: '#C4644A' },
  extreme: { label: 'EXTREME', color: '#8B2F2F' },
};

const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

function StoryCardImage({ story, alt }) {
  const { getImageByQuery } = useStaticContent();
  const [imgUrl, setImgUrl] = useState(null);

  useEffect(() => {
    let active = true;

    // Priority 1: Use locally saved hero_image if available
    if (story.hero_image) {
      if (active) setImgUrl(story.hero_image);
      return;
    }

    // Priority 2: Fetch from Wikipedia using image_query or title
    const query = story.image_query || story.title;
    getImageByQuery(query).then(url => {
      if (active) setImgUrl(url);
    });

    return () => { active = false; };
  }, [story, getImageByQuery]);

  if (!imgUrl) {
    return (
      <div className="w-full h-full bg-neutral-950/80 animate-pulse flex items-center justify-center border border-neutral-900/60 rounded-xl">
        <span className="text-[8px] font-mono tracking-widest text-neutral-700">LOADING DOSSIER IMAGE...</span>
      </div>
    );
  }

  return (
    <img
      src={imgUrl}
      alt={alt}
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
    />
  );
}

export default function StoryCatalog({ category, stories, onSelectStory, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [visible, setVisible] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [sortBy, setSortBy] = useState('default');

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTap > 1500) {
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

  const getTotalReactions = (story) => {
    const rx = story.reactions || { gripping: 0, scared: 0, mindblown: 0 };
    // Support legacy 'heart' field
    return (rx.gripping || rx.heart || 0) + (rx.scared || 0) + (rx.mindblown || 0);
  };

  const getBeliefIndex = (story) => {
    const total = getTotalReactions(story);
    if (total === 0) {
      const hash = story.story_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return 90 + (hash % 10);
    }
    const rx = story.reactions || { gripping: 0, scared: 0, mindblown: 0 };
    const positive = (rx.gripping || rx.heart || 0) * 0.9 + (rx.scared || 0) * 1.0 + (rx.mindblown || 0) * 0.95;
    const ratio = Math.min(100, Math.round((positive / total) * 100));
    return Math.max(75, ratio);
  };

  const getStoryScore = (story, type = 'total') => {
    const rx = story.reactions || { gripping: 0, scared: 0, mindblown: 0 };
    if (type === 'scared') return rx.scared || 0;
    return (rx.gripping || rx.heart || 0) + (rx.scared || 0) + (rx.mindblown || 0);
  };

  const isRecent = (addedDate) => {
    if (!addedDate) return false;
    const added = new Date(addedDate);
    const now = new Date();
    const diffTime = Math.abs(now - added);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  };

  const isTrending = (story) => {
    return getTotalReactions(story) >= 3;
  };

  const sortedStories = [...stories].sort((a, b) => {
    if (sortBy === 'trending') {
      return getTotalReactions(b) - getTotalReactions(a);
    }
    if (sortBy === 'rating') {
      return getBeliefIndex(b) - getBeliefIndex(a);
    }
    if (sortBy === 'scared') {
      return getStoryScore(b, 'scared') - getStoryScore(a, 'scared');
    }
    return 0; // Chronological (default order)
  });

  const categoryLabel = CATEGORY_LABELS[category] || category;

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ backgroundColor: bg, color: fg }}
    >
      {/* Vignette */}
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header style={{ padding: '0 40px' }}>
        <div
          className="mx-auto h-14 flex items-center justify-between"
          style={{ maxWidth: '780px' }}
        >
          <div className="flex items-center gap-[10px]">
            <div
              onClick={handleLogoTap}
              className="flex items-center gap-[10px] cursor-pointer select-none"
              title="Tap 5 times to open Admin Console"
            >
              <LoreMark size={18} color={fg} />
              <span
                className="text-[10px] font-bold tracking-[0.32em] uppercase"
                style={{ color: fg, opacity: 0.85 }}
              >
                LORE
              </span>
            </div>
            <button
              onClick={onBack}
              className="text-[9px] font-bold tracking-[0.15em] uppercase hover:opacity-55 active:opacity-30 cursor-pointer ml-3 px-2.5 py-1 border rounded"
              style={{ borderColor: ru, color: ac }}
            >
              ← Back
            </button>
          </div>
          <span
            className="text-[10px] font-medium tracking-[0.12em] uppercase"
            style={{ color: mu }}
          >
            {stories.length} {stories.length === 1 ? 'dossier' : 'dossiers'} available
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col" style={{ padding: '48px 40px 88px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>
          {/* Back link */}
          <button
            onClick={onBack}
            className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-8 transition-opacity hover:opacity-50 active:opacity-30"
            style={{
              color: ac,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ← Back to topics
          </button>

          {/* Category Title */}
          <h1
            className="font-serif italic leading-none tracking-tight mb-4"
            style={{
              fontSize: 'clamp(2.4rem, 8vw, 4.5rem)',
              fontWeight: 300,
              color: fg,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
            }}
          >
            {categoryLabel}
          </h1>
          <p
            className="font-serif leading-relaxed mb-12"
            style={{
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              fontWeight: 300,
              color: fg,
              opacity: 0.4,
              maxWidth: '50ch',
            }}
          >
            Select a dossier to begin your descent. Each file goes seven layers deep.
          </p>

          {/* Sorting / Filter tabs */}
          {stories.length > 0 && (
            <div className="flex gap-6 border-b pb-3 mb-8 flex-wrap" style={{ borderColor: ru }}>
              <button
                onClick={() => setSortBy('default')}
                className={`text-[9px] font-mono tracking-[0.2em] uppercase pb-1 border-b-2 transition-all duration-200 cursor-pointer ${
                  sortBy === 'default' ? 'border-[#9E7B4C] text-[#EDE8DF]' : 'border-transparent text-[#6A6560]'
                }`}
              >
                CHRONOLOGY
              </button>
              <button
                onClick={() => setSortBy('trending')}
                className={`text-[9px] font-mono tracking-[0.2em] uppercase pb-1 border-b-2 transition-all duration-200 cursor-pointer ${
                  sortBy === 'trending' ? 'border-[#9E7B4C] text-[#EDE8DF]' : 'border-transparent text-[#6A6560]'
                }`}
              >
                POPULAR
              </button>
              <button
                onClick={() => setSortBy('rating')}
                className={`text-[9px] font-mono tracking-[0.2em] uppercase pb-1 border-b-2 transition-all duration-200 cursor-pointer ${
                  sortBy === 'rating' ? 'border-[#9E7B4C] text-[#EDE8DF]' : 'border-transparent text-[#6A6560]'
                }`}
              >
                CREDIBILITY
              </button>
              <button
                onClick={() => setSortBy('scared')}
                className={`text-[9px] font-mono tracking-[0.2em] uppercase pb-1 border-b-2 transition-all duration-200 cursor-pointer ${
                  sortBy === 'scared' ? 'border-[#9E7B4C] text-[#EDE8DF]' : 'border-transparent text-[#6A6560]'
                }`}
              >
                TERROR INDEX
              </button>
            </div>
          )}

          {/* Story Cards */}
          {stories.length === 0 ? (
            <div className="text-center py-24" style={{ color: mu }}>
              <p className="font-serif italic text-xl mb-3" style={{ opacity: 0.5 }}>
                No dossiers filed yet.
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em]" style={{ opacity: 0.3 }}>
                The archive is being prepared.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedStories.map((story, idx) => {
                const sev = SEVERITY_LABELS[story.severity] || SEVERITY_LABELS.unsettling;
                return (
                  <div
                    key={story.story_id}
                    onClick={() => onSelectStory(story)}
                    className="w-full text-left flex flex-col md:flex-row gap-6 p-6 rounded-2xl border transition-all duration-300 group cursor-pointer"
                    style={{
                      backgroundColor: 'rgba(19, 17, 14, 0.6)',
                      borderColor: 'rgba(237, 232, 223, 0.06)',
                      boxShadow: '0 10px 30px -15px rgba(0,0,0,0.7)',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(12px)',
                      transition: `opacity 0.6s ${idx * 0.08}s cubic-bezier(0.16,1,0.3,1), transform 0.6s ${idx * 0.08}s cubic-bezier(0.16,1,0.3,1), border-color 0.2s, background-color 0.2s`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.25)';
                      e.currentTarget.style.backgroundColor = 'rgba(28, 26, 23, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(237, 232, 223, 0.06)';
                      e.currentTarget.style.backgroundColor = 'rgba(19, 17, 14, 0.6)';
                    }}
                  >
                    {/* Left/Top: Image Container */}
                    <div className="w-full md:w-[190px] h-[130px] md:h-[135px] rounded-xl overflow-hidden flex-shrink-0 border border-neutral-900/60 relative">
                      <StoryCardImage story={story} alt={story.title} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>

                    {/* Right/Bottom: Story details */}
                    <div className="flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        {/* Meta row: Category / Date / Crowd Rating */}
                        <div className="flex items-center gap-3 w-full flex-wrap">
                          <span
                            className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase px-2.5 py-0.5 rounded"
                            style={{
                              color: sev.color,
                              backgroundColor: `${sev.color}15`,
                            }}
                          >
                            {sev.label}
                          </span>

                          {isRecent(story.added_date) && (
                            <span className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase px-2.5 py-0.5 rounded text-cyan-400 bg-cyan-950/20 border border-cyan-800/30">
                              RECENT
                            </span>
                          )}

                          {isTrending(story) && (
                            <span className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase px-2.5 py-0.5 rounded text-amber-500 bg-amber-950/20 border border-amber-800/30">
                              TRENDING
                            </span>
                          )}
                          
                          <div className="flex items-center gap-1.5 ml-auto text-[9px] font-mono text-neutral-400 bg-neutral-900/40 px-2.5 py-0.5 rounded-full border border-neutral-800/50">
                            <span>{getTotalReactions(story)} feedback{getTotalReactions(story) !== 1 ? 's' : ''}</span>
                          </div>
                        </div>

                        {/* Title */}
                        <h2 className="font-serif italic text-xl md:text-2xl group-hover:text-[#9E7B4C] transition-colors duration-200" style={{ color: fg, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                          {story.title}
                        </h2>

                        {/* Hook */}
                        <p className="font-sans text-xs md:text-sm leading-relaxed" style={{ color: mu, opacity: 0.85 }}>
                          {story.hook}
                        </p>
                      </div>

                      {/* Concept tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(story.concepts || []).map((concept) => (
                          <span
                            key={concept}
                            className="text-[9px] font-mono tracking-[0.08em] uppercase px-2.5 py-0.5 rounded transition-colors text-neutral-300 bg-neutral-900"
                          >
                            {concept.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <footer className="mt-32 pt-10 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase" style={{ borderColor: ru, color: mu }}>
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
