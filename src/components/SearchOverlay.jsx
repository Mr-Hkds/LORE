import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';

const CATEGORY_LABELS = {
  psychology:      'Psychology',
  true_crime:      'True Crime',
  paranormal:      'Paranormal',
  mythology:       'Mythology',
  gov_experiments: 'Gov Experiments',
  conspiracy:      'Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

const CATEGORY_ACCENT = {
  psychology:      { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  true_crime:      { color: '#EF4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.2)'  },
  paranormal:      { color: '#A78BFA', bg: 'rgba(167,139,250,0.06)',border: 'rgba(167,139,250,0.2)' },
  mythology:       { color: '#10B981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)'  },
  gov_experiments: { color: '#60A5FA', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.2)'  },
  conspiracy:      { color: '#F97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.2)'  },
  cyber_mysteries: { color: '#22D3EE', bg: 'rgba(34,211,238,0.06)', border: 'rgba(34,211,238,0.2)'  },
};

export default function SearchOverlay({ isOpen, onClose, stories, onSelectStory }) {
  const [query, setQuery]               = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const inputRef  = useRef(null);
  const panelRef  = useRef(null);

  // Reset + focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Outside click to close
  const handleBackdropClick = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
  };

  // Filter — show everything by default, narrow as user types
  const filteredStories = useMemo(() => {
    if (!query && !activeCategory) return stories;
    return stories.filter(story => {
      if (activeCategory && story.category !== activeCategory) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        story.title?.toLowerCase().includes(q) ||
        story.hook?.toLowerCase().includes(q) ||
        story.concepts?.some(c => c.toLowerCase().includes(q))
      );
    });
  }, [query, activeCategory, stories]);

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[300] flex justify-center items-start pt-[10vh] px-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(4,3,2,0.88)', backdropFilter: 'blur(12px)' }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[600px] rounded-2xl overflow-hidden flex flex-col animate-scale-up"
        style={{
          backgroundColor: '#0C0A08',
          border: '1px solid rgba(158,123,76,0.22)',
          boxShadow: '0 0 0 1px rgba(158,123,76,0.04), 0 32px 80px rgba(0,0,0,0.95)',
        }}
      >
        {/* Gold top accent line */}
        <div
          className="h-px w-full flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(158,123,76,0.65) 45%, transparent)' }}
        />

        {/* ── Search input row ── */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid rgba(237,232,223,0.05)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#9E7B4C' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title, event, or concept..."
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 font-sans"
            style={{ fontSize: '13px', color: '#EDE8DF', caretColor: '#9E7B4C' }}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <kbd
              className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(237,232,223,0.1)',
                color: 'rgba(143,138,130,0.6)',
              }}
            >
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
              style={{ color: 'rgba(143,138,130,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#EDE8DF'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(143,138,130,0.5)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Category filter strip ── */}
        <div
          className="flex items-center gap-2 px-5 py-3 overflow-x-auto"
          style={{ borderBottom: '1px solid rgba(237,232,223,0.04)', scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setActiveCategory(null)}
            className="flex-shrink-0 text-[8.5px] font-mono tracking-[0.18em] uppercase px-3 py-1 rounded-full border transition-all duration-200"
            style={{
              borderColor: !activeCategory ? 'rgba(158,123,76,0.5)' : 'rgba(237,232,223,0.07)',
              color:       !activeCategory ? '#9E7B4C' : '#5A5550',
              background:  !activeCategory ? 'rgba(158,123,76,0.1)' : 'transparent',
            }}
          >
            All
          </button>
          {Object.entries(CATEGORY_LABELS).map(([catId, label]) => {
            const accent = CATEGORY_ACCENT[catId] || { color: '#9E7B4C', bg: 'rgba(158,123,76,0.08)', border: 'rgba(158,123,76,0.3)' };
            const isActive = activeCategory === catId;
            return (
              <button
                key={catId}
                onClick={() => setActiveCategory(isActive ? null : catId)}
                className="flex-shrink-0 text-[8.5px] font-mono tracking-[0.16em] uppercase px-3 py-1 rounded-full border transition-all duration-200"
                style={{
                  borderColor: isActive ? accent.border : 'rgba(237,232,223,0.07)',
                  color:       isActive ? accent.color : '#5A5550',
                  background:  isActive ? accent.bg    : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Results list ── */}
        <div className="overflow-y-auto" style={{ maxHeight: '380px', scrollbarWidth: 'thin' }}>
          {filteredStories.length > 0 ? (
            <div className="p-2">
              {filteredStories.map(story => {
                const accent = CATEGORY_ACCENT[story.category] || { color: '#9E7B4C', bg: 'rgba(158,123,76,0.06)', border: 'rgba(158,123,76,0.25)' };
                return (
                  <div
                    key={story.story_id}
                    onClick={() => { onSelectStory(story); onClose(); }}
                    className="group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-150"
                    style={{ '--hover-border': accent.color }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderLeft = `2px solid ${accent.color}`;
                      e.currentTarget.style.paddingLeft = '14px';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '';
                      e.currentTarget.style.borderLeft = '';
                      e.currentTarget.style.paddingLeft = '16px';
                    }}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      {/* Category tag + severity */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[7.5px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                          style={{
                            color: accent.color,
                            background: accent.bg,
                            border: `1px solid ${accent.border}`,
                          }}
                        >
                          {CATEGORY_LABELS[story.category] || story.category}
                        </span>
                        {story.severity && (
                          <span className="text-[7.5px] font-mono uppercase tracking-widest" style={{ color: 'rgba(143,138,130,0.5)' }}>
                            {story.severity}
                          </span>
                        )}
                      </div>
                      <h4
                        className="font-serif truncate transition-colors duration-150"
                        style={{ fontSize: '13px', color: '#D8D3CA', lineHeight: 1.3 }}
                        onMouseEnter={e => { e.currentTarget.style.color = accent.color; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#D8D3CA'; }}
                      >
                        {story.title}
                      </h4>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: '#4A4540', fontFamily: 'sans-serif' }}>
                        {story.hook}
                      </p>
                    </div>
                    <ArrowRight
                      className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150 -translate-x-1 group-hover:translate-x-0"
                      style={{ color: accent.color }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center px-6">
              <p className="text-[11px] font-mono tracking-widest uppercase mb-2" style={{ color: 'rgba(143,138,130,0.3)' }}>— Classified —</p>
              <p className="font-serif italic text-sm" style={{ color: 'rgba(237,232,223,0.25)' }}>No records match this query</p>
              <p className="text-[10px] font-mono mt-2 tracking-widest uppercase" style={{ color: 'rgba(143,138,130,0.25)' }}>Try different terms or remove filters</p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-5 py-2.5 flex items-center gap-4"
          style={{ borderTop: '1px solid rgba(237,232,223,0.04)' }}
        >
          <span className="text-[8px] font-mono tracking-widest uppercase" style={{ color: 'rgba(143,138,130,0.3)' }}>
            {filteredStories.length > 0 ? `${filteredStories.length} record${filteredStories.length !== 1 ? 's' : ''} found` : 'LORE Archive'}
          </span>
          <span className="ml-auto text-[8px] font-mono tracking-widest uppercase" style={{ color: 'rgba(143,138,130,0.2)' }}>
            Enter to open
          </span>
        </div>
      </div>
    </div>
  );
}
