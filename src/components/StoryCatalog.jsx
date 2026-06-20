/**
 * StoryCatalog — shows available dossiers for a selected category.
 * Dark editorial grid. Each card: title, hook, severity, concept tags.
 */
import { useState, useEffect } from 'react';
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

export default function StoryCatalog({ category, stories, onSelectStory, onBack }) {
  const bg = '#0D0B08';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

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
          <button
            onClick={onBack}
            className="flex items-center gap-[10px] transition-opacity duration-200 hover:opacity-60 active:opacity-35"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <LoreMark size={18} color={fg} />
            <span
              className="text-[10px] font-bold tracking-[0.32em] uppercase"
              style={{ color: fg, opacity: 0.85 }}
            >
              LORE
            </span>
          </button>
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
            <div style={{ borderTop: `1px solid ${ru}` }}>
              {stories.map((story, idx) => {
                const sev = SEVERITY_LABELS[story.severity] || SEVERITY_LABELS.unsettling;
                return (
                  <button
                    key={story.story_id}
                    onClick={() => onSelectStory(story)}
                    className="w-full text-left flex flex-col gap-3 transition-all duration-200 hover:opacity-60 active:opacity-35 group"
                    style={{
                      borderBottom: `1px solid ${ru}`,
                      padding: '32px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${ru}`,
                      cursor: 'pointer',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(12px)',
                      transition: `opacity 0.6s ${idx * 0.08}s cubic-bezier(0.16,1,0.3,1), transform 0.6s ${idx * 0.08}s cubic-bezier(0.16,1,0.3,1)`,
                    }}
                  >
                    {/* Top row: severity + date */}
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[8px] font-bold tracking-[0.18em] uppercase px-2 py-[2px] rounded"
                        style={{
                          color: sev.color,
                          border: `1px solid ${sev.color}33`,
                          backgroundColor: `${sev.color}0D`,
                        }}
                      >
                        {sev.label}
                      </span>
                      {story.added_date && (
                        <span
                          className="text-[9px] font-mono tracking-[0.08em]"
                          style={{ color: mu, opacity: 0.5 }}
                        >
                          {story.added_date}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <span
                      className="font-serif italic leading-snug"
                      style={{
                        fontSize: 'clamp(1.3rem, 3.5vw, 1.8rem)',
                        fontWeight: 300,
                        color: fg,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2,
                      }}
                    >
                      {story.title}
                    </span>

                    {/* Hook */}
                    <span
                      className="font-sans leading-relaxed"
                      style={{
                        fontSize: '0.88rem',
                        color: mu,
                        opacity: 0.7,
                        maxWidth: '56ch',
                      }}
                    >
                      {story.hook}
                    </span>

                    {/* Concept tags */}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(story.concepts || []).map((concept) => (
                        <span
                          key={concept}
                          className="text-[8px] font-mono tracking-[0.1em] uppercase px-2 py-[2px] rounded"
                          style={{
                            color: ac,
                            opacity: 0.6,
                            border: `1px solid ${ac}22`,
                          }}
                        >
                          {concept.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
