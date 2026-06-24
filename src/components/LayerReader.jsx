import { useState, useEffect, useRef } from 'react';
import LoreMark from './LoreMark';

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
    return data?.reactions || { gripping: 0, scared: 0, mindblown: 0, like: 0 };
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
  const [imgFailed, setImgFailed] = useState(false);

  // Comments state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [codename, setCodename] = useState(() => localStorage.getItem('lore:codename') || '');
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(null);

  // Sync reactions counts when data updates
  useEffect(() => {
    if (data?.reactions) {
      setReactions(data.reactions);
    }
  }, [data]);

  // Re-load persisted votes when storyId changes (user navigates to different story)
  useEffect(() => {
    setReacted(getStoredReacted());
    setImgFailed(false);
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

  // Fetch comments when Layer 7 is loaded
  useEffect(() => {
    if (isLastLayer && data?.storyId) {
      let active = true;
      setCommentsLoading(true);
      setCommentError(null);

      const fetchComments = async () => {
        try {
          const res = await fetch(`/api/comments?target_id=${data.storyId}&title=${encodeURIComponent(topic.label)}&category=${encodeURIComponent(topic.id)}`);
          if (res.ok && active) {
            const result = await res.json();
            setComments(result);
          }
        } catch (err) {
          console.warn('[Story Comments] Failed to fetch comments:', err.message);
        } finally {
          if (active) setCommentsLoading(false);
        }
      };

      fetchComments();
      return () => { active = false; };
    }
  }, [isLastLayer, data?.storyId, topic.label, topic.id]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !data?.storyId) return;

    setSubmittingComment(true);
    setCommentError(null);
    const activeCodename = codename.trim() || 'Anonymous Agent';

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: data.storyId,
          username: activeCodename,
          comment: newComment.trim()
        })
      });
      if (res.ok) {
        const result = await res.json();
        setComments(result);
        setNewComment('');
        if (codename.trim()) {
          localStorage.setItem('lore:codename', codename.trim());
        }
      } else {
        const errData = await res.json();
        setCommentError(errData.error || 'Failed to submit report');
      }
    } catch (err) {
      setCommentError('Network error. Unable to dispatch intel.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const cards = data?.cards || [];
  const layerName = data?.layerName || null;

  const isLight = layerNum <= 3;
  const cardBg = isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)';
  const cardBorder = layer.border;
  const cardTextPrimary = layer.text;
  const cardTextSecondary = layer.muted;

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

  return (
    <section
      ref={containerRef}
      className="snap-child w-full fade-in relative"
    >
      <div className="w-full max-w-[1000px] mx-auto flex flex-col gap-6 px-0 sm:px-4 md:px-8 my-auto pb-12">
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
            className="w-full p-4 sm:p-6 md:p-10 rounded-2xl relative transition-all duration-300"
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
                <div className="mb-8 w-full rounded-xl overflow-hidden border flex items-center justify-center min-h-[150px] md:min-h-[200px]" style={{ borderColor: cardBorder }}>
                  {imgFailed ? (
                    <div className="w-full py-12 md:py-16 flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
                      <LoreMark size={24} color="currentColor" />
                      <span className="text-[9px] font-mono tracking-[0.2em] uppercase mt-2">CLASSIFIED</span>
                    </div>
                  ) : (
                    <img
                      src={data.imageUrl}
                      alt={topic.label}
                      onError={() => setImgFailed(true)}
                      className="w-full h-auto object-contain max-h-[240px] md:max-h-[400px]"
                      loading="lazy"
                    />
                  )}
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

                    {/* LIKE */}
                    <div className="relative">
                      {animatingReaction === 'like' && (
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none text-xl animate-float-up-fade select-none">
                          ❤️
                        </span>
                      )}
                      <button
                        onClick={() => handleReact('like')}
                        title={reacted['like'] ? 'Click again to undo your vote' : 'Mark as Like'}
                        className={`px-4 py-2.5 border rounded-lg text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer active:scale-95 select-none flex items-center gap-2 ${
                          reacted['like']
                            ? 'bg-rose-950/30 border-rose-700/70 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                            : 'hover:bg-white/5 border-neutral-800 text-neutral-400 hover:border-rose-900/50 hover:text-rose-400'
                        } ${animatingReaction === 'like' ? 'scale-110' : ''}`}
                      >
                        ❤️ LIKE <span className="opacity-60">({reactions.like || 0})</span>
                      </button>
                    </div>

                    {/* GRIPPING */}
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
                </div>
              )}

              {/* Decrypted Forum Comments Widget at Layer 7 */}
              {isLastLayer && (
                <div className="mt-10 pt-8 border-t" style={{ borderColor: layer.border }}>
                  <h5 className="text-[11px] font-mono tracking-widest uppercase text-[#9E7B4C] border-l border-[#9E7B4C] pl-2 flex items-center justify-between mb-4">
                    <span>Classified Intel Logs (Decrypted Feed)</span>
                    {commentsLoading && <span className="text-[9px] text-[#9E7B4C] animate-pulse">DECRYPTING...</span>}
                  </h5>

                  {/* Comments List */}
                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar text-left mb-6">
                    {comments.length === 0 && !commentsLoading ? (
                      <div className="text-center py-6 border border-dashed border-neutral-800 rounded-lg text-neutral-500 text-xs font-mono">
                        NO DECRYPTED INTEL LOGS FOUND.
                      </div>
                    ) : (
                      comments.map((c) => (
                        <div
                          key={c.id || c.timestamp}
                          className="p-3.5 rounded-lg border bg-black/40 border-neutral-900/60"
                        >
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-[10px] font-mono text-[#9E7B4C] uppercase tracking-wider font-bold">
                              {c.username}
                            </span>
                            <span className="text-[8px] font-mono text-neutral-500">
                              {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(c.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <p className="font-serif italic text-xs leading-relaxed text-[#EDE8DF]/90">
                            {c.comment}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Submit Comment Form */}
                  <form onSubmit={handleSubmitComment} className="space-y-4 pt-2 text-left">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="w-full sm:w-[180px] flex-shrink-0">
                        <label htmlFor="story-codename" className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest block mb-1">Codename</label>
                        <input
                          id="story-codename"
                          type="text"
                          placeholder="Agent_Anonymous"
                          value={codename}
                          onChange={(e) => setCodename(e.target.value)}
                          className="w-full bg-black/50 text-[#EDE8DF] text-[11px] font-mono px-3 py-2.5 rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor="story-comment" className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest block mb-1">Intel Report</label>
                        <textarea
                          id="story-comment"
                          placeholder="Log your findings or notes here..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={2}
                          className="w-full bg-black/50 text-[#EDE8DF] text-[11px] font-serif px-3 py-2.5 rounded border border-neutral-800 focus:outline-none focus:border-[#9E7B4C] transition-colors resize-none"
                        />
                      </div>
                    </div>
                    {commentError && (
                      <p className="text-[10px] font-mono text-red-500">{commentError}</p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingComment || !newComment.trim()}
                        className="px-5 py-2.5 bg-neutral-900 border border-neutral-800 text-[#EDE8DF] hover:border-[#9E7B4C]/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-[10.5px] font-mono tracking-widest uppercase rounded active:scale-95 transition-all duration-200 cursor-pointer"
                      >
                        {submittingComment ? 'Sending...' : 'Dispatch Intel'}
                      </button>
                    </div>
                  </form>
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
