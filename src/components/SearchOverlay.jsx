import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, ChevronRight, CornerDownLeft } from 'lucide-react';

const CATEGORY_LABELS = {
  psychology: 'Psychology',
  true_crime: 'True Crime',
  paranormal: 'Paranormal',
  mythology: 'Mythology',
  gov_experiments: 'Gov Experiments',
  conspiracy: 'Conspiracies',
  cyber_mysteries: 'Digital Shadows',
};

const CATEGORY_COLORS = {
  psychology: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
  true_crime: 'text-red-500 border-red-500/20 bg-red-500/5',
  paranormal: 'text-purple-500 border-purple-500/20 bg-purple-500/5',
  mythology: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
  gov_experiments: 'text-blue-500 border-blue-500/20 bg-blue-500/5',
  conspiracy: 'text-orange-500 border-orange-500/20 bg-orange-500/5',
  cyber_mysteries: 'text-cyan-500 border-cyan-500/20 bg-cyan-500/5',
};

export default function SearchOverlay({ isOpen, onClose, stories, onSelectStory }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  // Focus input on mount/open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle outside click
  const handleOutsideClick = (e) => {
    if (overlayRef.current && !overlayRef.current.contains(e.target)) {
      onClose();
    }
  };

  // Filter logic
  const filteredStories = useMemo(() => {
    if (!query && !activeCategory) return [];
    
    return stories.filter((story) => {
      const matchesCategory = !activeCategory || story.category === activeCategory;
      if (!matchesCategory) return false;

      if (!query) return true;

      const q = query.toLowerCase();
      const matchesTitle = story.title?.toLowerCase().includes(q);
      const matchesHook = story.hook?.toLowerCase().includes(q);
      const matchesConcepts = story.concepts?.some(c => c.toLowerCase().includes(q));

      return matchesTitle || matchesHook || matchesConcepts;
    });
  }, [query, activeCategory, stories]);

  if (!isOpen) return null;

  return (
    <div
      onClick={handleOutsideClick}
      className="fixed inset-0 z-[300] bg-[#040302]/78 backdrop-blur-md flex justify-center items-start pt-[12vh] px-4 animate-fade-in"
    >
      <div
        ref={overlayRef}
        className="w-full max-w-lg bg-[#0D0B09]/96 border border-[#9E7B4C]/25 rounded-xl overflow-hidden flex flex-col shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_40px_rgba(158,123,76,0.03)] animate-scale-up"
      >
        {/* Search header bar */}
        <div className="flex items-center justify-between border-b border-neutral-900/60 px-4 py-3.5 bg-black/20">
          <div className="flex items-center gap-3 flex-1">
            <Search className="w-4 h-4 text-[#9E7B4C]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, key terms, or events..."
              className="bg-transparent border-none focus:outline-none focus:ring-0 text-xs w-full text-[#EDE8DF] placeholder-neutral-600 font-sans"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[8px] font-mono tracking-widest px-2 py-0.5 rounded border border-neutral-850 bg-[#090807] text-[#8F8A82]/50 uppercase">
              ESC
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-neutral-900 rounded-md transition-colors text-neutral-500 hover:text-[#EDE8DF]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category tags block */}
        <div className="px-4 py-3 border-b border-neutral-900/40 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[8.5px] font-mono tracking-wider uppercase px-2.5 py-1 rounded-full border transition-all duration-300 ${
              !activeCategory
                ? 'bg-[#9E7B4C]/15 border-[#9E7B4C]/50 text-[#9E7B4C]'
                : 'bg-transparent border-neutral-900 text-neutral-500 hover:border-neutral-850 hover:text-neutral-450'
            }`}
          >
            All
          </button>
          {Object.entries(CATEGORY_LABELS).map(([catId, label]) => (
            <button
              key={catId}
              onClick={() => setActiveCategory(activeCategory === catId ? null : catId)}
              className={`text-[8.5px] font-mono tracking-wider uppercase px-2.5 py-1 rounded-full border transition-all duration-300 ${
                activeCategory === catId
                  ? 'bg-[#9E7B4C]/15 border-[#9E7B4C]/50 text-[#9E7B4C]'
                  : 'bg-transparent border-neutral-900 text-neutral-500 hover:border-neutral-850 hover:text-neutral-450'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results layout */}
        <div className="max-h-[340px] overflow-y-auto overflow-x-hidden p-2 space-y-1">
          {filteredStories.length > 0 ? (
            filteredStories.map((story) => (
              <div
                key={story.story_id}
                onClick={() => {
                  onSelectStory(story);
                  onClose();
                }}
                className="group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-between border border-transparent hover:border-[#9E7B4C]/15 hover:bg-[#9E7B4C]/4 active:bg-[#9E7B4C]/8"
              >
                <div className="flex-1 min-w-0 pr-4">
                  {/* Category + Title */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[7.5px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[story.category] || 'text-neutral-400 border-neutral-800'}`}>
                      {CATEGORY_LABELS[story.category] || story.category}
                    </span>
                    {story.severity && (
                      <span className="text-[7.5px] font-mono text-[#9E7B4C]/70 uppercase tracking-widest">
                        {story.severity}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-serif text-[#EDE8DF] group-hover:text-[#9E7B4C] transition-colors truncate">
                    {story.title}
                  </h4>
                  <p className="text-[10px] text-neutral-500 font-sans line-clamp-1 mt-0.5">
                    {story.hook}
                  </p>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[7.5px] font-mono text-neutral-600 flex items-center gap-1">
                    Read <CornerDownLeft className="w-2 h-2" />
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#9E7B4C]" />
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center">
              {query || activeCategory ? (
                <>
                  <p className="text-xs font-serif text-[#EDE8DF]/50">No dossiers found</p>
                  <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest mt-1">
                    Try adjusting your search terms
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-serif text-[#EDE8DF]/40">Search the Archive Registry</p>
                  <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest mt-1">
                    Type a query or select a category above
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
