import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Eye, Skull, HelpCircle, Share2, ChevronDown, ChevronUp, BookOpen, X } from 'lucide-react';
import LoreMark from './LoreMark';
import { LOCAL_DICTIONARY } from '../constants/dictionary';

// ── localStorage helpers ───────────────────────────────────────────────────
const SEEN_KEY = 'lore:seen_words';
const DICT_CACHE_KEY_PREFIX = 'lore:dict:';

function getSeenWords() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function markWordSeen(word) {
  try {
    const seen = getSeenWords();
    seen.add(word.toLowerCase());
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch { /* ignore */ }
}
function getCachedDef(word) {
  try {
    const v = localStorage.getItem(DICT_CACHE_KEY_PREFIX + word);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
function cacheDef(word, value) {
  try { localStorage.setItem(DICT_CACHE_KEY_PREFIX + word, JSON.stringify(value)); }
  catch { /* ignore */ }
}

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
  story,
  onBack,
}) {
  const containerRef = useRef(null);
  const isLastLayer = layerNum === 7;
  const accentColor = '#9E7B4C';

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkSize = () => setIsMobile(window.innerWidth < 640);
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

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

  // Slide-up drawer lookup state (no x/y needed)
  const [lookup, setLookup] = useState({
    isOpen: false,
    word: '',
    generic: '',      // plain dictionary meaning
    caseNote: '',     // story-specific context
    loading: false,
    isLive: false,    // came from external API
    x: 0,
    y: 0,
  });

  // Seen-words set in state so underline re-renders reactively
  const [seenWords, setSeenWords] = useState(() => getSeenWords());
  
  // Dynamic Global Dictionary state loaded from public JSON file (synced with admin panel)
  const [globalDict, setGlobalDict] = useState(() => LOCAL_DICTIONARY);
  useEffect(() => {
    fetch(`/content/dictionary.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data === 'object') {
          setGlobalDict(data);
        }
      })
      .catch(err => console.warn('Failed to load dynamic dictionary:', err));
  }, []);

  // Glossary strip open state
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const closeLookup = () => setLookup(prev => ({ ...prev, isOpen: false }));

  // Auto-close lookup popup on clicking outside
  useEffect(() => {
    if (!lookup.isOpen) return;
    const handleOutsideClick = (e) => {
      if (e.target.closest('[data-lookup-drawer]')) return;
      closeLookup();
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [lookup.isOpen]);

  const handleWordLookup = async (originalWord, lowerWord, x = 0, y = 0) => {
    const cleanWord = lowerWord.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '').trim();
    const cleanOriginal = originalWord.trim();
    if (!cleanWord || cleanWord.length <= 1) return;

    // Mark word as seen immediately
    markWordSeen(cleanWord);
    setSeenWords(getSeenWords());

    // 1. Story-specific vocabulary (supports {generic, case} or plain string)
    const storyVocabulary = story?.vocabulary || {};
    const storyEntry = storyVocabulary[cleanWord];
    if (storyEntry) {
      const isObj = typeof storyEntry === 'object';
      setLookup({
        isOpen: true,
        word: cleanOriginal,
        generic: isObj ? (storyEntry.generic || '') : storyEntry,
        caseNote: isObj ? (storyEntry.case || '') : '',
        loading: false,
        isLive: false,
        x,
        y,
      });
      return;
    }

    // 2. Global globalDict
    if (globalDict[cleanWord]) {
      setLookup({
        isOpen: true,
        word: cleanOriginal,
        generic: globalDict[cleanWord],
        caseNote: '',
        loading: false,
        isLive: false,
        x,
        y,
      });
      return;
    }

    // 3. localStorage API cache
    const cached = getCachedDef(cleanWord);
    if (cached) {
      setLookup({
        isOpen: true,
        word: cleanOriginal,
        generic: cached,
        caseNote: '',
        loading: false,
        isLive: true,
        x,
        y,
      });
      return;
    }

    // 4. Live dictionary API (external — no Vercel cost)
    setLookup({ isOpen: true, word: cleanOriginal, generic: '', caseNote: '', loading: true, isLive: true, x, y });
    
    // Construct lookup candidates (e.g. plurals, conjugations)
    const candidates = [cleanWord];
    if (cleanWord.endsWith('s') && cleanWord.length > 2) {
      if (cleanWord.endsWith('ies')) {
        candidates.push(cleanWord.slice(0, -3) + 'y');
      } else if (cleanWord.endsWith('es')) {
        candidates.push(cleanWord.slice(0, -2));
        candidates.push(cleanWord.slice(0, -1));
      } else {
        candidates.push(cleanWord.slice(0, -1));
      }
    } else if (cleanWord.endsWith('ed') && cleanWord.length > 3) {
      candidates.push(cleanWord.slice(0, -2));
      candidates.push(cleanWord.slice(0, -1));
    } else if (cleanWord.endsWith('ing') && cleanWord.length > 4) {
      candidates.push(cleanWord.slice(0, -3));
      candidates.push(cleanWord.slice(0, -3) + 'e');
    }

    let success = false;
    for (const candidate of candidates) {
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`);
        if (!res.ok) continue;
        const json = await res.json();
        const meaning = json?.[0]?.meanings?.[0];
        const def = meaning?.definitions?.[0]?.definition;
        const pos = meaning?.partOfSpeech || '';
        if (def) {
          const result = pos ? `(${pos}) ${def}` : def;
          cacheDef(cleanWord, result); // Cache original lookup with candidate result
          setLookup(prev => ({ ...prev, generic: result, loading: false }));
          success = true;
          break;
        }
      } catch (err) {
        // try next candidate
      }
    }

    if (!success) {
      setLookup(prev => ({ ...prev, generic: `No definition found for "${cleanOriginal}".`, loading: false }));
    }
  };

  // Clean selection text and compute bounding coordinates for lookup positioning
  const handleSelectionLookup = (clientX, clientY) => {
    const selection = window.getSelection();
    if (!selection) return;
    let selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Strip leading/trailing punctuation and non-word characters
    selectedText = selectedText.replace(/^[^a-zA-ZÀ-ÿ\s'-]+|[^a-zA-ZÀ-ÿ\s'-]+$/g, '').trim();

    if (selectedText.length > 1 && selectedText.length < 40 && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(selectedText)) {
      let x = clientX;
      let y = clientY;

      // If coordinates aren't provided (like touchend), find the screen bounds of selection
      if (!x || !y) {
        try {
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect && rect.top > 0) {
              x = rect.left + rect.width / 2;
              y = rect.top + rect.height;
            }
          }
        } catch (err) {
          console.warn('Failed to calculate selection bounding box:', err);
        }
      }

      handleWordLookup(selectedText, selectedText.toLowerCase(), x, y);
    }
  };

  const handleContainerClick = (e) => {
    if (e.target.closest('[data-lookup-drawer]')) return;
    if (e.target.closest('button') || e.target.closest('a')) return;

    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }

    if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.data;
      const offset = range.startOffset;

      let start = offset;
      while (start > 0 && /[a-zA-ZÀ-ÿ'-]/.test(text[start - 1])) {
        start--;
      }

      let end = offset;
      while (end < text.length && /[a-zA-ZÀ-ÿ'-]/.test(text[end])) {
        end++;
      }

      const tappedWord = text.slice(start, end).trim();
      const cleanWord = tappedWord.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '').trim();

      if (cleanWord.length > 1 && cleanWord.length < 40 && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(cleanWord)) {
        try {
          window.getSelection()?.removeAllRanges();
        } catch (_) {}
        handleWordLookup(tappedWord, cleanWord.toLowerCase(), e.clientX, e.clientY);
        return;
      }
    }
  };

  const handleContainerMouseUp = (e) => {
    if (e.target.closest('[data-lookup-drawer]')) return;
    // Fallback for highlighted text selection
    handleSelectionLookup(e.clientX, e.clientY);
  };

  // Highlight pre-defined vocabulary words in text with dashed/solid underline
  const formatTextWithLookup = (text) => {
    if (!text) return text;

    // Strip raw markdown bold double asterisks to keep it clean and simple
    const cleanText = text.replace(/\*\*/g, '');

    const storyVocab = story?.vocabulary || {};
    const mergedKeys = [...new Set([...Object.keys(globalDict), ...Object.keys(storyVocab)])];
    if (mergedKeys.length === 0) return cleanText;

    const keys = mergedKeys.sort((a, b) => b.length - a.length);
    const escapedKeys = keys.map(k => k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(cleanText)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];
      if (matchIndex > lastIndex) parts.push(cleanText.substring(lastIndex, matchIndex));

      const lowerWord = matchText.toLowerCase();
      const alreadySeen = seenWords.has(lowerWord);

      parts.push(
        <span
          key={matchIndex}
          onClick={(e) => { e.stopPropagation(); handleWordLookup(matchText, lowerWord, e.clientX, e.clientY); }}
          className="cursor-pointer font-medium transition-all duration-200"
          style={{
            borderBottom: alreadySeen
              ? '1px solid rgba(158,123,76,0.35)'
              : '1px dashed rgba(158,123,76,0.75)',
            color: alreadySeen ? 'rgba(158,123,76,0.55)' : '#9E7B4C',
            paddingBottom: '1px',
          }}
          title={`Tap to look up "${matchText}"`}
        >
          {matchText}
        </span>
      );

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < cleanText.length) parts.push(cleanText.substring(lastIndex));
    return parts.length > 0 ? parts : cleanText;
  };

  // Parse [[CALLOUT]] ... [[/CALLOUT]] blocks from a block of text
  const parseCallouts = (text) => {
    if (!text || !text.includes('[[CALLOUT]]')) return null; // fast path
    const parts = text.split(/\[\[CALLOUT\]\](.*?)\[\[\/CALLOUT\]\]/gs);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // This is callout content
        const lines = part.trim().split('\n').filter(Boolean);
        const quoteText = lines[0] || '';
        const attribution = lines[1] || '';
        return (
          <div
            key={i}
            className="my-6 px-5 py-4 border-l-2 text-left"
            style={{
              borderColor: '#9E7B4C',
              backgroundColor: 'rgba(158,123,76,0.05)',
            }}
          >
            <p
              className="font-serif italic leading-relaxed"
              style={{ fontSize: 'clamp(1rem,2vw,1.2rem)', color: cardTextPrimary }}
            >
              {quoteText}
            </p>
            {attribution && (
              <span
                className="block mt-2 font-mono text-[10px] tracking-widest uppercase"
                style={{ color: '#9E7B4C', opacity: 0.65 }}
              >
                {attribution}
              </span>
            )}
          </div>
        );
      }
      // Regular text — run through normal pipeline
      return part ? <span key={i}>{parseConfidenceTags(part)}</span> : null;
    });
  };

  // Parse [VERIFIED] / [CLAIMED] / [DISPUTED] / [UNVERIFIED] inline tags
  const parseConfidenceTags = (text) => {
    if (!text) return '';
    const tagRegex = /(\[VERIFIED\]|\[CLAIMED\]|\[DISPUTED\]|\[UNVERIFIED\])/gi;
    const tokens = text.split(tagRegex);
    return tokens.map((token, idx) => {
      const u = token.toUpperCase();
      if (u === '[VERIFIED]')
        return <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-[7.5px] font-mono font-bold border border-emerald-500/35 text-emerald-400 rounded-sm bg-emerald-950/20 select-none align-middle tracking-widest">● VERIFIED</span>;
      if (u === '[CLAIMED]')
        return <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-[7.5px] font-mono font-bold border border-amber-500/35 text-amber-400 rounded-sm bg-amber-950/20 select-none align-middle tracking-widest">◐ CLAIMED</span>;
      if (u === '[DISPUTED]')
        return <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-[7.5px] font-mono font-bold border border-red-500/35 text-red-400 rounded-sm bg-red-950/20 select-none align-middle tracking-widest">⚠ DISPUTED</span>;
      if (u === '[UNVERIFIED]')
        return <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-[7.5px] font-mono font-bold border border-neutral-500/30 text-neutral-400 rounded-sm bg-neutral-950/20 select-none align-middle tracking-widest">○ UNVERIFIED</span>;
      return <span key={idx}>{formatTextWithLookup(token)}</span>;
    });
  };

  // Full paragraph renderer — handles [[CALLOUT]] blocks then confidence tags
  const renderParagraph = (text) => {
    if (!text) return null;
    if (text.includes('[[CALLOUT]]')) {
      return parseCallouts(text);
    }
    return parseConfidenceTags(text);
  };



  // Sync reactions counts when data updates (normalize on the way in)
  useEffect(() => {
    if (data?.reactions) {
      setReactions(normalizeReactions(data.reactions));
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

  const wordCount = (() => {
    if (!story?.layers || !Array.isArray(story.layers)) return 0;
    return story.layers.reduce((sum, l) => {
      const words = (l.content || '').trim().split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);
  })();

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
      id={`layer-section-${layerNum}`}
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
            <div className="max-w-2xl mx-auto w-full select-text" onClick={handleContainerClick} onMouseUp={handleContainerMouseUp}>
              {/* Tactical Dictionary Onboarding Tip (Only on Layer 1) */}
              {layerNum === 1 && (
                <div 
                  className="mb-6 p-3.5 rounded-xl border flex items-center gap-3 text-left select-none"
                  style={{
                    backgroundColor: isLight ? 'rgba(158, 123, 76, 0.08)' : 'rgba(158, 123, 76, 0.04)',
                    borderColor: isLight ? 'rgba(158, 123, 76, 0.3)' : 'rgba(158, 123, 76, 0.18)'
                  }}
                >
                  <HelpCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#9E7B4C' }} />
                  <p 
                    className="text-[10px] sm:text-xs font-mono leading-relaxed animate-pulse"
                    style={{ color: cardTextSecondary }}
                  >
                    <span style={{ color: '#9E7B4C' }} className="font-bold">SYSTEM HINT:</span> Tap any underlined word or select any text to see its meaning.
                  </p>
                </div>
              )}

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
                          <LoreMark size={8} color="#C5A06E" />
                          <span
                            style={{
                              fontFamily: "'Space Mono', monospace",
                              fontSize: '7px',
                              color: '#F5F2EB',
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
                  {renderParagraph(hookText)}
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
                        {renderParagraph(note.text)}
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
                    {renderParagraph(cliffhangerText)}
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
                    @keyframes slideUp {
                      from { transform: translateY(100%); }
                      to { transform: translateY(0); }
                    }
                    .animate-slide-up {
                      animation: slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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

                  {/* Action buttons (Transmit & Descend) */}
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
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

                    {layerNum < 7 && (
                      <button
                        onClick={() => {
                          const nextElem = document.getElementById(`layer-section-${layerNum + 1}`);
                          if (nextElem) {
                            nextElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[9px] font-mono tracking-widest uppercase transition-all duration-300 active:scale-95 cursor-pointer select-none"
                        style={{
                          color: layer.text,
                          borderColor: 'rgba(237, 232, 223, 0.18)',
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'rgba(158, 123, 76, 0.5)';
                          e.currentTarget.style.backgroundColor = 'rgba(158, 123, 76, 0.04)';
                          e.currentTarget.style.color = '#9E7B4C';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'rgba(237, 232, 223, 0.18)';
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.color = layer.text;
                        }}
                      >
                        <span>Descend to Layer {layerNum + 1}</span>
                        <span>↓</span>
                      </button>
                    )}
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

            {/* Collapsible Glossary Strip at Layer 7 */}
            {isLastLayer && (() => {
              const storyVocab = story?.vocabulary || {};
              const vocabEntries = Object.entries(storyVocab);
              if (vocabEntries.length === 0) return null;
              return (
                <div className="mt-10 pt-6 border-t" style={{ borderColor: 'rgba(158,123,76,0.15)' }}>
                  <button
                    onClick={() => setGlossaryOpen(v => !v)}
                    className="w-full flex items-center justify-between py-2 px-0 cursor-pointer select-none group"
                    style={{ background: 'none', border: 'none' }}
                  >
                    <span className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.2em] uppercase" style={{ color: '#9E7B4C' }}>
                      <BookOpen className="w-3.5 h-3.5" />
                      Dossier Vocabulary · {vocabEntries.length} terms
                    </span>
                    {glossaryOpen
                      ? <ChevronUp className="w-4 h-4" style={{ color: '#9E7B4C', opacity: 0.6 }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: '#9E7B4C', opacity: 0.6 }} />
                    }
                  </button>
                  {glossaryOpen && (
                    <div className="mt-4 space-y-4">
                      {vocabEntries.map(([word, entry]) => {
                        const isObj = typeof entry === 'object';
                        const generic = isObj ? entry.generic : entry;
                        const caseNote = isObj ? entry.case : '';
                        return (
                          <div key={word} className="border-l pl-4" style={{ borderColor: 'rgba(158,123,76,0.2)' }}>
                            <span className="block text-[10px] font-mono font-bold tracking-widest uppercase mb-1" style={{ color: '#9E7B4C' }}>{word}</span>
                            {generic && <p className="text-[13px] font-sans leading-relaxed" style={{ color: cardTextSecondary }}>{generic}</p>}
                            {caseNote && (
                              <p className="mt-1 text-[12px] font-sans italic leading-relaxed" style={{ color: cardTextPrimary, opacity: 0.75 }}>
                                ▸ In this case: {caseNote}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* End stamp for Layer 7 */}
            {isLastLayer && (
              <div className="mt-14 pt-8 border-t text-center flex flex-col items-center gap-4" style={{ borderColor: 'rgba(158, 123, 76, 0.15)' }}>
                <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-[#8F8A82]/50">
                  Dossier Closed. You have reached the bottom.
                </p>
                <button
                  onClick={onBack}
                  className="px-8 py-3.5 border transition-all duration-300 active:scale-95 cursor-pointer text-[10px] font-mono tracking-[0.22em] uppercase rounded-lg"
                  style={{ borderColor: 'rgba(158,123,76,0.35)', backgroundColor: 'rgba(158,123,76,0.04)', color: '#9E7B4C' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(158,123,76,0.8)'; e.currentTarget.style.backgroundColor = 'rgba(158,123,76,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(158,123,76,0.35)'; e.currentTarget.style.backgroundColor = 'rgba(158,123,76,0.04)'; }}
                >
                  ← Return to Dossier Index
                </button>
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

      {/* ── Sleek Floating Popup (Near Selected Word on both Mobile & Desktop) ── */}
      {lookup.isOpen && (
        <div
          data-lookup-drawer="1"
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[999] w-[260px] sm:w-80 p-4 rounded-xl border bg-[#0D0B09]/96 backdrop-blur-md text-left transition-all duration-300 animate-scale-up"
          style={{
            left: `${Math.min((typeof window !== 'undefined' ? window.innerWidth : 1000) - (isMobile ? 272 : 336), Math.max(12, lookup.x - (isMobile ? 130 : 160)))}px`,
            top: `${Math.min((typeof window !== 'undefined' ? window.innerHeight : 1000) - 240, Math.max(12, lookup.y > 220 ? lookup.y - 190 : lookup.y + 20))}px`,
            borderColor: '#C5A06E',
            boxShadow: '0 12px 36px rgba(0,0,0,0.85), inset 0 0 12px rgba(197,160,110,0.12)',
            color: '#F5F2EB',
          }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between border-b pb-2 mb-2" style={{ borderColor: 'rgba(197,160,110,0.2)' }}>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-[#C5A06E] uppercase font-bold">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Dossier Look-Up</span>
            </div>
            <button
              onClick={closeLookup}
              className="text-[9px] font-mono tracking-widest text-neutral-500 hover:text-white uppercase bg-transparent border-none cursor-pointer focus:outline-none"
            >
              ✕ Close
            </button>
          </div>

          {/* Word title */}
          <h4 className="font-mono text-sm font-bold text-white uppercase tracking-wide mb-2">
            {lookup.word}
          </h4>

          {lookup.loading ? (
            <div className="py-4 flex flex-col items-center justify-center gap-2">
              <div className="w-4 h-4 rounded-full border border-[#C5A06E]/25 border-t-[#C5A06E] animate-spin" />
              <span className="text-[8px] font-mono text-neutral-400 uppercase tracking-widest">Searching dictionary...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Generic definition */}
              {lookup.generic && (
                <p className="text-xs font-sans leading-relaxed text-[#F5F2EB]/90 font-light">
                  {lookup.generic}
                </p>
              )}
              {/* Case-specific context */}
              {lookup.caseNote && (
                <div className="pt-2.5 border-t" style={{ borderColor: 'rgba(197,160,110,0.15)' }}>
                  <span className="block text-[8px] font-mono tracking-wider uppercase mb-1 text-[#C5A06E]">
                    ▸ In this case
                  </span>
                  <p className="text-xs font-sans italic leading-relaxed text-[#F5F2EB]/80">
                    {lookup.caseNote}
                  </p>
                </div>
              )}
              {/* Live indicator */}
              {lookup.isLive && !lookup.caseNote && (
                <div className="pt-1.5 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[7px] font-mono text-neutral-500 uppercase tracking-wider">via dictionary api</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
