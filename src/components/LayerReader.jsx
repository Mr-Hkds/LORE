import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Eye, Skull, HelpCircle, Share2 } from 'lucide-react';
import LoreMark from './LoreMark';
import { LOCAL_DICTIONARY } from '../constants/dictionary';

export default function LayerReader({
  topic,
  layerNum,
  data,
  layer,
  onLayerActive,
  connections = [],
  onSelectConnectedStory,
  onReactionUpdate,
  onShare,
}) {
  const containerRef = useRef(null);
  const isLastLayer = layerNum === 7;
  const accentColor = '#9E7B4C';

  // Normalize DB keys (like/scared/mindblown) → UI keys (intriguing/chilling/mind_blowing)
  const normalizeReactions = (rx) => {
    if (!rx) return { intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 };
    return {
      intriguing:  rx.intriguing  ?? rx.like      ?? 0,
      gripping:    rx.gripping    ?? 0,
      chilling:    rx.chilling    ?? rx.scared    ?? 0,
      mind_blowing: rx.mind_blowing ?? rx.mindblown ?? 0,
    };
  };

  // ── Reaction state: reactions counts come from server data ──────────────
  const [reactions, setReactions] = useState(() => normalizeReactions(data?.reactions));

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
  const [isZoomed, setIsZoomed] = useState(false);

  // Look-up dictionary state
  const [lookup, setLookup] = useState({
    isOpen: false,
    word: '',
    definition: '',
    loading: false,
    x: 0,
    y: 0,
    isCustom: false
  });

  // Auto-close lookup popup on clicking outside
  useEffect(() => {
    if (!lookup.isOpen) return;
    const handleOutsideClick = () => {
      setLookup(prev => ({ ...prev, isOpen: false }));
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [lookup.isOpen]);

  const handleWordLookup = async (originalWord, lowerWord, clientX, clientY) => {
    // Clean punctuation
    const cleanWord = lowerWord.replace(/[^a-zA-Z]/g, '');
    const cleanOriginal = originalWord.replace(/[^a-zA-Z]/g, '');
    if (!cleanWord || cleanWord.length <= 1) return;

    if (LOCAL_DICTIONARY[cleanWord]) {
      setLookup({
        isOpen: true,
        word: cleanOriginal,
        definition: LOCAL_DICTIONARY[cleanWord],
        loading: false,
        x: clientX,
        y: clientY,
        isCustom: false
      });
      return;
    }

    // Fallback to Live Dictionary API
    setLookup({
      isOpen: true,
      word: cleanOriginal,
      definition: '',
      loading: true,
      x: clientX,
      y: clientY,
      isCustom: true
    });

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
      if (!res.ok) throw new Error("Word not found");
      const data = await res.json();
      const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const partOfSpeech = data?.[0]?.meanings?.[0]?.partOfSpeech || 'noun';
      
      if (def) {
        setLookup(prev => ({
          ...prev,
          definition: `(${partOfSpeech}) ${def}`,
          loading: false
        }));
      } else {
        throw new Error("No definition");
      }
    } catch (err) {
      setLookup(prev => ({
        ...prev,
        definition: `Could not find a simple definition for "${cleanOriginal}". Double-click to search or verify spelling.`,
        loading: false
      }));
    }
  };

  const handleContainerDoubleClick = (e) => {
    const selection = window.getSelection();
    if (!selection) return;
    const selectedText = selection.toString().trim();
    if (selectedText.length > 1 && selectedText.length < 30 && /^[a-zA-Z\s'-]+$/.test(selectedText)) {
      handleWordLookup(selectedText, selectedText.toLowerCase(), e.clientX, e.clientY);
    }
  };

  // Function to highlight difficult words in paragraph text
  const formatTextWithLookup = (text) => {
    if (!text) return "";
    
    // Sort keys descending by length
    const keys = Object.keys(LOCAL_DICTIONARY).sort((a, b) => b.length - a.length);
    const escapedKeys = keys.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');
    
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];
      
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }
      
      const lowerWord = matchText.toLowerCase();
      parts.push(
        <span
          key={matchIndex}
          onClick={(e) => {
            e.stopPropagation();
            handleWordLookup(matchText, lowerWord, e.clientX, e.clientY);
          }}
          className="cursor-help font-medium border-b border-dashed transition-all hover:opacity-85 select-none"
          style={{
            borderColor: 'rgba(158, 123, 76, 0.75)',
            color: '#9E7B4C',
          }}
          title={`Click to view simple definition of "${matchText}"`}
        >
          {matchText}
        </span>
      );
      
      lastIndex = pattern.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
  };



  // Sync reactions counts when data updates (normalize on the way in)
  useEffect(() => {
    if (data?.reactions) {
      setReactions(normalizeReactions(data.reactions));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const updatedLocalReactions = {
      ...reactions,
      [type]: isUndo ? Math.max(0, (reactions[type] || 1) - 1) : (reactions[type] || 0) + 1,
    };
    setReactions(updatedLocalReactions);
    onReactionUpdate?.(updatedLocalReactions);

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
        if (result.reactions) {
          const normRx = normalizeReactions(result.reactions);
          setReactions(normRx);
          onReactionUpdate?.(normRx);
        }
      }
    } catch (e) {
      console.warn('Failed to record reaction:', e);
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
            <div className="max-w-2xl mx-auto w-full" onDoubleClick={handleContainerDoubleClick}>
              {/* SOTA Wikipedia Hero Image */}
              {data.imageUrl && (
                <div className="mb-8 w-full h-[240px] sm:h-[320px] md:h-[380px] rounded-xl overflow-hidden border flex flex-col relative bg-[#090807] dossier-image-container" style={{ borderColor: cardBorder }}>
                  {imgFailed ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
                      <LoreMark size={24} color="currentColor" />
                      <span className="text-[9px] font-mono tracking-[0.2em] uppercase mt-2">CLASSIFIED</span>
                    </div>
                  ) : (
                    <>
                      {/* Top Dossier Bar with backdrop-blur */}
                      <div className="w-full h-9 z-20 flex-shrink-0 flex items-center justify-between px-3.5 bg-black/45 backdrop-blur-md border-b border-white/5 select-none">
                        <div className="flex items-center gap-1.5">
                          <LoreMark size={8} color="#9E7B4C" />
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
                        <span className="font-mono text-[6.5px] text-neutral-500 tracking-wider">
                          SEC-DOSS.00{topic.id ? topic.id.slice(-2) : 'XX'}
                        </span>
                      </div>

                      {/* Foreground image viewport area — renders below the header bar */}
                      <div 
                        onClick={() => setIsZoomed(true)}
                        className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-[#110F0D] cursor-zoom-in group/img"
                      >
                        <img
                          src={data.imageUrl}
                          alt={topic.label}
                          width="800"
                          height="450"
                          onError={() => setImgFailed(true)}
                          className="relative z-10 max-h-full max-w-full object-contain transition-transform duration-700 hover:scale-[1.02]"
                          loading="lazy"
                        />
                        {/* Zoom text overlay on hover */}
                        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/60 backdrop-blur-sm border border-white/10 rounded px-2 py-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none">
                          <span className="text-[7px] font-mono text-white/70 uppercase tracking-widest font-bold">Tap to expand</span>
                        </div>
                      </div>
                    </>
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
                  {formatTextWithLookup(hookText)}
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
                        {formatTextWithLookup(note.text)}
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
                    {formatTextWithLookup(cliffhangerText)}
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
                  <style>{`
                    @keyframes floatUp {
                      0%   { transform: translate(-50%, 0); opacity: 0; }
                      20%  { opacity: 1; }
                      100% { transform: translate(-50%, -32px); opacity: 0; }
                    }
                    @keyframes floatEmoji {
                      0%   { transform: translate(-50%, 0) scale(0.5) rotate(0deg); opacity: 0; }
                      20%  { opacity: 1; transform: translate(-50%, -10px) scale(1.3) rotate(15deg); }
                      100% { transform: translate(calc(-50% + 12px), -44px) scale(0.8) rotate(-15deg); opacity: 0; }
                    }
                  `}</style>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {[
                      { key: 'intriguing', label: 'INTRIGUING', Icon: Fingerprint, color: '#F59E0B', activeBg: 'rgba(245,158,11,0.10)', activeBorder: 'rgba(245,158,11,0.45)', glowColor: 'rgba(245,158,11,0.25)', emoji: '🔍' },
                      { key: 'gripping',   label: 'GRIPPING',   Icon: Eye,         color: '#A78BFA', activeBg: 'rgba(167,139,250,0.10)', activeBorder: 'rgba(167,139,250,0.45)', glowColor: 'rgba(167,139,250,0.25)', emoji: '👁' },
                      { key: 'chilling',   label: 'CHILLING',   Icon: Skull,       color: '#F87171', activeBg: 'rgba(248,113,113,0.10)', activeBorder: 'rgba(248,113,113,0.45)', glowColor: 'rgba(248,113,113,0.25)', emoji: '💀' },
                      { key: 'mind_blowing', label: 'MIND BLOWING', Icon: HelpCircle, color: '#22D3EE', activeBg: 'rgba(34,211,238,0.10)', activeBorder: 'rgba(34,211,238,0.45)', glowColor: 'rgba(34,211,238,0.25)', emoji: '🌀' },
                    ].map(({ key, label, Icon, color, activeBg, activeBorder, glowColor, emoji }) => (
                      <div key={key} className="relative min-w-[125px]">
                        {animatingReaction === key && (
                          <div className="absolute top-[-22px] left-1/2 -translate-x-1/2 pointer-events-none select-none z-30 flex flex-col items-center">
                            <span
                              className="text-base"
                              style={{ animation: 'floatEmoji 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards' }}
                            >
                              {emoji}
                            </span>
                            <span
                              className="text-[9px] font-bold font-mono"
                              style={{
                                color: color,
                                textShadow: `0 0 4px ${glowColor}`,
                                animation: 'floatUp 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards',
                                marginTop: '-4px'
                              }}
                            >
                              +1
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => handleReact(key)}
                          title={reacted[key] ? 'Click again to undo your vote' : `Mark as ${label}`}
                          className="relative w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border overflow-hidden transition-all duration-300 cursor-pointer group select-none focus:outline-none hover:-translate-y-0.5 active:scale-95 text-[11px] font-mono tracking-wider"
                          style={{
                            backgroundColor: reacted[key] ? activeBg : 'rgba(15,13,11,0.4)',
                            borderColor: reacted[key] ? activeBorder : 'rgba(237,232,223,0.06)',
                            boxShadow: reacted[key] 
                              ? `0 8px 24px -6px rgba(0,0,0,0.6), 0 0 16px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)` 
                              : '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.02)',
                            color: reacted[key] ? color : '#8F8A82',
                          }}
                        >
                          {/* Shimmer effect on select */}
                          {reacted[key] && (
                            <div
                              className="absolute inset-0 pointer-events-none opacity-20"
                              style={{
                                backgroundImage: `radial-gradient(circle at center, ${color} 0%, transparent 80%)`,
                              }}
                            />
                          )}
                          
                          {/* Bottom light bar */}
                          <div 
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] transition-all duration-500 rounded-full"
                            style={{
                              width: reacted[key] ? '40%' : '0%',
                              backgroundColor: color,
                              boxShadow: `0 0 8px ${color}`,
                            }}
                          />

                          <Icon className="w-3.5 h-3.5 transition-all duration-500 group-hover:scale-110" style={{ color: reacted[key] ? color : undefined }} />
                          <span>{label}</span>
                          <span className="opacity-60 font-bold" style={{ color: reacted[key] ? color : '#5A5650' }}>({reactions[key] || 0})</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Transmit/Share Dossier Link */}
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={onShare}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[9px] font-mono tracking-widest uppercase transition-all duration-300 active:scale-95 hover:border-neutral-500/60 cursor-pointer select-none"
                      style={{
                        color: '#9E7B4C',
                        borderColor: 'rgba(158, 123, 76, 0.25)',
                        backgroundColor: 'rgba(158, 123, 76, 0.04)',
                      }}
                    >
                      <Share2 className="w-3 h-3" />
                      Transmit Dossier Link
                    </button>
                  </div>
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
      {/* Fullscreen Mobile-Optimized Lightbox Overlay */}
      {isZoomed && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[200] bg-[#090807]/98 flex items-center justify-center cursor-zoom-out p-4 backdrop-blur-md animate-fade-in"
        >
          {/* Close button */}
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 z-[201] w-8 h-8 rounded-full border border-white/10 bg-black/50 text-white/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs"
          >
            ✕
          </button>
          <img
            src={data.imageUrl}
            alt={topic.label}
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-all duration-500 animate-scale-up lightbox-img"
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-[9px] font-mono tracking-widest uppercase pointer-events-none">
            Tap anywhere to return
          </div>
        </div>
      )}

      {/* Floating Look-Up Popover Dialog */}
      {lookup.isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[999] w-72 p-4 rounded-xl border bg-[#0F0D0A]/95 backdrop-blur-md text-left transition-all duration-300 animate-scale-up"
          style={{
            left: `${Math.min(window.innerWidth - 300, Math.max(16, lookup.x - 144))}px`,
            top: `${Math.min(window.innerHeight - 200, Math.max(16, lookup.y - 120))}px`,
            borderColor: '#9E7B4C',
            boxShadow: '0 12px 36px rgba(0,0,0,0.85), inset 0 0 12px rgba(158,123,76,0.12)',
            color: '#EDE8DF',
          }}
        >
          <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(158,123,76,0.2)' }}>
            <div className="flex items-center gap-1.5 text-xs font-serif italic text-[#9E7B4C]">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Dossier Look-Up</span>
            </div>
            <button
              onClick={() => setLookup(prev => ({ ...prev, isOpen: false }))}
              className="text-[9px] font-mono tracking-widest text-neutral-500 hover:text-white uppercase bg-transparent border-none cursor-pointer focus:outline-none"
            >
              Close [X]
            </button>
          </div>
          
          <h4 className="font-serif text-base font-bold text-white leading-tight capitalize mb-1">
            {lookup.word}
          </h4>
          
          {lookup.loading ? (
            <div className="py-4 flex flex-col items-center justify-center gap-2">
              <div className="w-4 h-4 rounded-full border border-[#9E7B4C]/20 border-t-[#9E7B4C] animate-spin" />
              <span className="text-[8px] font-mono text-neutral-400 uppercase tracking-widest">Searching dictionary...</span>
            </div>
          ) : (
            <div>
              <p className="text-xs font-sans leading-relaxed text-[#EDE8DF]/90 font-light">
                {lookup.definition}
              </p>
              {lookup.isCustom && (
                <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[7px] font-mono text-[#9E7B4C] uppercase tracking-wider">Live Web Definition</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
