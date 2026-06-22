import { useState, useEffect, useRef } from 'react';

export default function LayerReader({
  topic,
  layerNum,
  data,
  layer,
  onLayerActive,
  connections = [],
  onSelectConnectedStory,
}) {
  const containerRef = useRef(null);
  const isLastLayer = layerNum === 7;
  const accentColor = '#9E7B4C';

  // ── Reaction state: reactions counts come from server data ──────────────
  const [reactions, setReactions] = useState(() => {
    return data?.reactions || { gripping: 0, scared: 0, mindblown: 0 };
  });

  // ── Per-user vote state: persisted to localStorage so one-vote-per-user ──
  const getStoredReacted = () => {
    if (!data?.storyId) return {};
    try {
      const raw = localStorage.getItem(`lore:voted:${data.storyId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const [reacted, setReacted] = useState(getStoredReacted);
  const [animatingReaction, setAnimatingReaction] = useState(null);

  // Sync reactions counts when data updates
  useEffect(() => {
    if (data?.reactions) {
      setReactions(data.reactions);
    }
  }, [data]);

  // Re-load persisted votes when storyId changes (user navigates to different story)
  useEffect(() => {
    setReacted(getStoredReacted());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.storyId]);

  const handleReact = async (type) => {
    if (!data?.storyId) return;

    const isUndo = !!reacted[type];

    // Update local state optimistically
    const newReacted = { ...reacted, [type]: !isUndo };
    setReacted(newReacted);

    // Persist to localStorage so the vote survives refresh
    try {
      localStorage.setItem(`lore:voted:${data.storyId}`, JSON.stringify(newReacted));
    } catch { /* ignore quota errors */ }

    setReactions(prev => ({
      ...prev,
      [type]: isUndo ? Math.max(0, (prev[type] || 1) - 1) : (prev[type] || 0) + 1,
    }));

    if (!isUndo) {
      setAnimatingReaction(type);
      setTimeout(() => setAnimatingReaction(null), 900);
    }

    try {
      const res = await fetch('/api/stories/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: data.storyId, reaction_type: type, undo: isUndo }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.reactions) setReactions(result.reactions);
      }
    } catch (e) {
      console.warn('Failed to record reaction:', e);
    }
  };

  const cards = data?.cards || [];
  const layerName = data?.layerName || null;
  const wikipediaSearchQuery = data?.wikipediaSearchQuery || '';

  const isLight = layerNum <= 3;
  const cardBg = isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)';
  const cardBorder = layer.border;
  const cardTextPrimary = layer.text;
  const cardTextSecondary = layer.muted;
  const cardTextMuted = layer.muted;
  const photoCardBg = isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)';
  const photoCardBorder = layer.border;

  // Extract structured narrative
  const hookText = cards[0]?.text || '';
  const caseNotes = cards.length > 2 ? cards.slice(1, cards.length - 1) : [];
  const cliffhangerText = cards.length > 1 ? cards[cards.length - 1]?.text : '';

  const onLayerActiveRef = useRef(onLayerActive);
  useEffect(() => {
    onLayerActiveRef.current = onLayerActive;
  });

  // Observe the layer to trigger active state
  useEffect(() => {
    if (!containerRef.current || !data || cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onLayerActiveRef.current();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [layerNum, data, cards.length]);

  if (!data) return null;

  const CATEGORY_LABELS = {
    psychology: 'Psychology',
    true_crime: 'True Crime',
    paranormal: 'Paranormal',
    mythology: 'Mythology',
    gov_experiments: 'Gov Experiments',
    conspiracy: 'Unresolved Conspiracies',
    cyber_mysteries: 'Digital Shadows',
  };

  const evidenceLinks = data?.evidenceLinks || [];

  return (
    <section
      ref={containerRef}
      className="snap-child w-full fade-in relative"
    >
      <div className="w-full max-w-[1000px] mx-auto flex flex-col gap-8 px-4 md:px-8 my-auto pb-12">
        {/* Premium Hero Header */}
        {layerName && (
          <div
            className="w-full animate-roll-up flex flex-col items-start border-b pb-6 mt-4"
            style={{ borderColor: layer.border }}
          >
            <span
              className="text-[10px] md:text-xs tracking-[0.2em] uppercase font-bold mb-2"
              style={{ color: accentColor }}
            >
              Layer {layerNum}
            </span>
            <h2
              className="text-3xl md:text-5xl font-serif font-bold leading-tight"
              style={{ color: layer.text }}
            >
              {layerName}
            </h2>
          </div>
        )}

        <div className="w-full">
          {/* Narrative Dossier Card (Main Container) */}
          <div
            className="w-full p-6 md:p-10 rounded-2xl relative transition-all duration-300"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${cardBorder}`,
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Single column layout for maximum reading focus */}
            <div className="max-w-2xl mx-auto w-full">
              {/* SOTA Wikipedia Hero Image */}
              {data.imageUrl && (
                <div className="mb-8 w-full rounded-xl overflow-hidden border" style={{ borderColor: cardBorder }}>
                  <img src={data.imageUrl} alt={topic.label} className="w-full h-auto object-cover max-h-[400px]" loading="lazy" />
                </div>
              )}

              {/* Hook text */}
              {hookText && (
                <p
                  className="font-serif italic text-left mb-6"
                  style={{
                    fontSize: 'clamp(1.2rem, 2.2vw, 1.45rem)',
                    lineHeight: '1.5',
                    color: cardTextPrimary,
                    fontWeight: '400',
                  }}
                >
                  {hookText}
                </p>
              )}

              {/* Case notes */}
              {caseNotes.length > 0 && (
                <div className="space-y-6 mb-8">
                  {caseNotes.map((note, idx) => (
                    <div key={idx} className="flex gap-4 items-start text-left">
                      <span
                        className="font-mono text-[13px] mt-[4px] select-none"
                        style={{ color: '#9E7B4C' }}
                      >
                        »
                      </span>
                      <p
                        className="font-sans"
                        style={{
                          fontSize: '16px',
                          lineHeight: '1.625',
                          color: cardTextSecondary,
                          fontWeight: '400',
                        }}
                      >
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}



              {/* Cliffhanger */}
              {cliffhangerText && (
                <div
                  className="p-5 rounded-r-lg border-l-2 text-left mt-6"
                  style={{
                    borderColor: '#9E7B4C',
                    backgroundColor: isLight
                      ? 'rgba(158, 123, 76, 0.08)'
                      : 'rgba(158, 123, 76, 0.05)',
                  }}
                >
                  <p
                    className="font-sans italic"
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.65',
                      color: cardTextPrimary,
                    }}
                  >
                    {cliffhangerText}
                  </p>
                </div>
              )}

              {/* Evidence Links (OpenAlex PDFs) */}
              {evidenceLinks && evidenceLinks.length > 0 && (
                <div className="mt-8 pt-6 border-t" style={{ borderColor: layer.border }}>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase block mb-4" style={{ color: accentColor }}>
                    Attached Evidence / Research Papers
                  </span>
                  <div className="space-y-3">
                    {evidenceLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg border transition-all hover:bg-black/20"
                        style={{ borderColor: layer.border, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}
                      >
                        <span className="text-xs font-mono block mb-1" style={{ color: accentColor }}>[PDF Evidence {idx + 1}]</span>
                        <span className="text-sm font-sans" style={{ color: cardTextPrimary }}>{link.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback Widget at Layer 7 */}
              {isLastLayer && (
                <div className="mt-10 pt-8 border-t text-center" style={{ borderColor: layer.border }}>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase block mb-4" style={{ color: accentColor }}>
                    DO YOU BELIEVE IT? RATE THIS DOSSIER
                  </span>
                  <p className="text-xs font-sans mb-6" style={{ color: cardTextSecondary }}>
                    Share your reaction to update the global archive's ratings.
                  </p>
                  <div className="flex justify-center gap-3 flex-wrap">

                    {/* GRIPPING — replaces heart */}
                    <div className="relative">
                      {animatingReaction === 'gripping' && (
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none text-xl animate-float-up-fade select-none">
                          🔥
                        </span>
                      )}
                      <button
                        onClick={() => handleReact('gripping')}
                        title={reacted['gripping'] ? 'Click again to undo your vote' : 'Mark as Gripping'}
                        className={`px-4 py-2.5 border rounded-lg text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer active:scale-95 select-none flex items-center gap-2 ${
                          reacted['gripping']
                            ? 'bg-orange-950/30 border-orange-700/70 text-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.2)]'
                            : 'hover:bg-white/5 border-neutral-800 text-neutral-400 hover:border-orange-800/50 hover:text-orange-400'
                        } ${animatingReaction === 'gripping' ? 'scale-110' : ''}`}
                      >
                        🔥 GRIPPING <span className="opacity-60">({reactions.gripping || 0})</span>
                      </button>
                    </div>

                    {/* TERRIFYING */}
                    <div className="relative">
                      {animatingReaction === 'scared' && (
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none text-xl animate-float-up-fade select-none">
                          💀
                        </span>
                      )}
                      <button
                        onClick={() => handleReact('scared')}
                        title={reacted['scared'] ? 'Click again to undo your vote' : 'Mark as Terrifying'}
                        className={`px-4 py-2.5 border rounded-lg text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer active:scale-95 select-none flex items-center gap-2 ${
                          reacted['scared']
                            ? 'bg-red-950/30 border-red-700/70 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                            : 'hover:bg-white/5 border-neutral-800 text-neutral-400 hover:border-red-900/50 hover:text-red-400'
                        } ${animatingReaction === 'scared' ? 'scale-110' : ''}`}
                      >
                        💀 TERRIFYING <span className="opacity-60">({reactions.scared || 0})</span>
                      </button>
                    </div>

                    {/* MIND-BLOWN */}
                    <div className="relative">
                      {animatingReaction === 'mindblown' && (
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none text-xl animate-float-up-fade select-none">
                          🤯
                        </span>
                      )}
                      <button
                        onClick={() => handleReact('mindblown')}
                        title={reacted['mindblown'] ? 'Click again to undo your vote' : 'Mark as Mind-Blown'}
                        className={`px-4 py-2.5 border rounded-lg text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer active:scale-95 select-none flex items-center gap-2 ${
                          reacted['mindblown']
                            ? 'bg-violet-950/30 border-violet-600/70 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                            : 'hover:bg-white/5 border-neutral-800 text-neutral-400 hover:border-violet-900/50 hover:text-violet-400'
                        } ${animatingReaction === 'mindblown' ? 'scale-110' : ''}`}
                      >
                        🤯 MIND-BLOWN <span className="opacity-60">({reactions.mindblown || 0})</span>
                      </button>
                    </div>

                  </div>
                  <p className="text-[9px] font-mono tracking-[0.15em] mt-4 opacity-30" style={{ color: cardTextSecondary }}>
                    ONE VOTE PER USER · CLICK AGAIN TO UNDO
                  </p>
                </div>
              )}
            </div>

            {/* Connected Stories at Layer 7 */}
            {isLastLayer && connections.length > 0 && (
              <div className="mt-10 pt-8 border-t" style={{ borderColor: layer.border }}>
                <span
                  className="text-[10px] font-bold tracking-[0.2em] uppercase block mb-6"
                  style={{ color: accentColor }}
                >
                  THE THREAD CONTINUES
                </span>
                <div className="space-y-4">
                  {connections.map((conn) => (
                    <button
                      key={conn.story_id}
                      onClick={() => onSelectConnectedStory?.(conn.story_id)}
                      className="w-full text-left p-5 rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] group"
                      style={{
                        backgroundColor: isLight
                          ? 'rgba(158, 123, 76, 0.06)'
                          : 'rgba(158, 123, 76, 0.08)',
                        border: `1px solid ${accentColor}22`,
                        cursor: 'pointer',
                      }}
                    >
                      {/* Transition line */}
                      <p
                        className="font-serif italic leading-relaxed mb-4"
                        style={{
                          fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
                          color: cardTextPrimary,
                          opacity: 0.85,
                        }}
                      >
                        "{conn.transition_line}"
                      </p>

                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span
                            className="text-[8px] font-mono tracking-[0.12em] uppercase block mb-1"
                            style={{ color: accentColor, opacity: 0.7 }}
                          >
                            {CATEGORY_LABELS[conn.category] || conn.category} — {conn.shared_concept?.replace(/_/g, ' ')}
                          </span>
                          <span
                            className="font-serif italic text-base leading-snug group-hover:underline"
                            style={{ color: cardTextPrimary }}
                          >
                            {conn.title}
                          </span>
                        </div>
                        <span
                          className="text-lg transition-transform duration-300 group-hover:translate-x-1"
                          style={{ color: accentColor, opacity: 0.5 }}
                        >
                          →
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* End stamp for Layer 7 */}
            {isLastLayer && (
              <div className="mt-10 opacity-30 text-center">
                <div
                  className="w-12 h-[1px] mx-auto mb-4"
                  style={{ backgroundColor: layer.muted }}
                />
                <p
                  className="text-[10px] uppercase tracking-[0.2em] font-sans"
                  style={{ color: layer.text }}
                >
                  Dossier Closed. You have reached the bottom.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      {!isLastLayer && (
        <div
          className="mt-4 mb-8 flex flex-col items-center select-none pointer-events-none"
          style={{ opacity: 0.5, color: layer.text }}
        >
          <span className="text-[10px] tracking-[0.22em] uppercase font-bold">
            Scroll down to descend
          </span>
          <div className="mt-2 text-base text-center animate-bounce">↓</div>
        </div>
      )}
    </section>
  );
}
