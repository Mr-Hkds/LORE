// 1. Imports
import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, CornerDownLeft } from 'lucide-react';
import LoreMark from './LoreMark';

// 3. Constants
const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Hidden Gov Experiments',
  conspiracy: 'Unresolved Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

const CATEGORY_COLORS = {
  psychology: '#F59E0B',
  true_crime: '#EF4444',
  paranormal: '#A78BFA',
  mythology: '#3B82F6',
  gov_experiments: '#10B981',
  conspiracy: '#EC4899',
  cyber_mysteries: '#22D3EE',
};

export default function SearchOverlay({ isOpen, onClose, stories = [], onSelectStory }) {
  // 5. State declarations
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  // 6. Effects
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory('all');
      
      // Auto-focus input on mount
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);

      // Disable body scrolling when open
      document.body.style.overflow = 'hidden';

      // ESC key listener to close search
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  // 7. Callbacks
  const handleBackdropClick = (e) => {
    if (overlayRef.current && e.target === overlayRef.current) {
      onClose();
    }
  };

  // 8. Derived state
  const filteredStories = useMemo(() => {
    const searchTerms = query.toLowerCase().trim();
    return stories.filter(story => {
      // Category filter
      if (activeCategory !== 'all' && story.category !== activeCategory) {
        return false;
      }

      if (!searchTerms) return true;

      // Text search match
      const title = (story.title || '').toLowerCase();
      const hook = (story.hook || '').toLowerCase();
      const concepts = (story.concepts || []).join(' ').toLowerCase();

      return title.includes(searchTerms) || 
             hook.includes(searchTerms) || 
             concepts.includes(searchTerms);
    });
  }, [stories, query, activeCategory]);

  // 9. Early returns
  if (!isOpen) return null;

  // 10. Main render
  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] bg-[#090807]/90 backdrop-blur-md flex items-start justify-center pt-[12vh] px-4 animate-fade-in cursor-default"
      style={{
        animation: 'fadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-12px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .search-results-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .search-results-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .search-results-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(158, 123, 76, 0.15);
          border-radius: 99px;
        }
        .search-results-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(158, 123, 76, 0.3);
        }
      ` }} />

      <div
        className="w-full max-w-[620px] bg-[#0D0B09] border rounded-2xl p-6 shadow-2xl space-y-4 flex flex-col max-h-[70vh] border-[#9E7B4C]/15"
        style={{
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), 0 0 50px rgba(158, 123, 76, 0.04), inset 0 1px 0 rgba(255,255,255,0.01)',
          animation: 'slideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 bg-black/40 border border-neutral-800 focus-within:border-[#9E7B4C]/45 focus-within:ring-4 focus-within:ring-[#9E7B4C]/8 rounded-xl px-4 py-3.5 transition-all">
          <Search className="w-4 h-4 text-[#8F8A82]/60 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stories, concepts, or details..."
            className="flex-1 bg-transparent text-[#EDE8DF] text-sm focus:outline-none placeholder-[#8F8A82]/50 font-sans leading-relaxed"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[#8F8A82]/50 hover:text-[#EDE8DF] cursor-pointer focus:outline-none transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none -mx-2 px-2 flex-shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold tracking-widest uppercase transition-all duration-200 active:scale-95 cursor-pointer border ${
              activeCategory === 'all'
                ? 'bg-[#9E7B4C] text-white border-[#9E7B4C]'
                : 'bg-black/20 border-neutral-900 text-[#8F8A82] hover:text-[#EDE8DF] hover:border-neutral-800'
            }`}
          >
            All Archive
          </button>
          {Object.entries(CATEGORY_LABELS).map(([catId, label]) => {
            const isActive = activeCategory === catId;
            return (
              <button
                key={catId}
                onClick={() => setActiveCategory(catId)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold tracking-widest uppercase whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer border ${
                  isActive
                    ? 'bg-[#9E7B4C]/15 border-[#9E7B4C]/50 text-[#EDE8DF]'
                    : 'bg-black/20 border-neutral-900 text-[#8F8A82] hover:text-[#EDE8DF] hover:border-neutral-800'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-[1px] bg-neutral-900/60 flex-shrink-0" />

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto search-results-scrollbar pr-1 space-y-2">
          {filteredStories.length === 0 ? (
            <div className="py-12 text-center text-[#8F8A82] space-y-2">
              <p className="font-serif italic text-base opacity-60">No matching records found.</p>
              <p className="text-[9px] uppercase tracking-wider opacity-30 font-mono">Check spelling or try other search keywords.</p>
            </div>
          ) : (
            filteredStories.map((story) => {
              const catColor = CATEGORY_COLORS[story.category] || '#9E7B4C';
              return (
                <div
                  key={story.story_id}
                  onClick={() => {
                    onSelectStory(story);
                    onClose();
                  }}
                  className="group w-full p-4 rounded-xl border border-neutral-900 bg-neutral-950/20 hover:bg-neutral-950/60 hover:border-[#9E7B4C]/25 transition-all duration-200 flex items-start gap-4 cursor-pointer text-left active:scale-[0.99] relative overflow-hidden"
                >
                  {/* Left accent bar on hover */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#9E7B4C] transition-all duration-300 scale-y-0 group-hover:scale-y-100"
                    style={{ backgroundColor: catColor }}
                  />

                  <div className="flex-1 min-w-0 pl-1 space-y-1.5">
                    {/* Header info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: catColor }} />
                      <span
                        className="text-[8px] font-mono font-bold tracking-widest uppercase"
                        style={{ color: catColor }}
                      >
                        {CATEGORY_LABELS[story.category] || story.category}
                      </span>
                      {story.added_date && (
                        <>
                          <span className="text-[#8F8A82]/30 text-[8px] font-mono">·</span>
                          <span className="text-[8px] font-mono text-[#8F8A82]/50 tracking-wider">
                            {story.added_date}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="font-serif italic text-base leading-snug text-[#EDE8DF] group-hover:text-[#9E7B4C] transition-colors">
                      {story.title}
                    </h4>

                    {/* Hook */}
                    {story.hook && (
                      <p className="text-xs text-[#8F8A82]/85 font-sans leading-relaxed line-clamp-2">
                        {story.hook}
                      </p>
                    )}

                    {/* Concepts */}
                    {story.concepts && story.concepts.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {story.concepts.map(concept => (
                          <span key={concept} className="text-[7.5px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-[#8F8A82]/70 uppercase tracking-widest border border-neutral-900">
                            #{concept}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  <div className="flex items-center self-center text-neutral-700 group-hover:text-[#9E7B4C] group-hover:translate-x-0.5 transition-all flex-shrink-0">
                    <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-sm font-light ml-1">→</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="flex items-center justify-between text-[9px] font-mono tracking-wider text-[#8F8A82]/40 pt-2 border-t border-neutral-900/60 flex-shrink-0">
          <span className="flex items-center gap-1">
            <LoreMark size={8} color="currentColor" />
            SevenDescents Global Registry
          </span>
          <kbd className="px-1.5 py-0.5 bg-neutral-950 border border-neutral-900 rounded text-[8px] uppercase">
            esc
          </kbd>
        </div>
      </div>
    </div>
  );
}
