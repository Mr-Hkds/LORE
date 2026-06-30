/**
 * SiteFeedback — floating site-wide feedback button.
 * Clean, always-visible float. No animated width jank.
 */
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, X } from 'lucide-react';

const TAGS = [
  'Love the concept',
  'Too vague',
  'Needs more depth',
  'Hard to navigate',
  'Loved a story',
  'Want more topics',
  'Stories feel rushed',
  'Something is broken',
];

export default function SiteFeedback() {
  const [open, setOpen]         = useState(false);
  const [rating, setRating]     = useState(0);
  const [hoverRating, setHover] = useState(0);
  const [tags, setTags]         = useState([]);
  const [note, setNote]         = useState('');
  const [status, setStatus]     = useState(null);
  const panelRef = useRef(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      const trigger = document.getElementById('site-feedback-trigger');
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        trigger && !trigger.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  const toggleTag = (t) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) return;
    setStatus('sending');
    const payload = {
      id: 'fb_' + Date.now(),
      rating,
      tags,
      note: note.trim(),
      timestamp: new Date().toISOString(),
      page: window.location.hash || '/',
    };
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('API failed');
      setStatus('sent');
    } catch {
      const localFb = JSON.parse(localStorage.getItem('lore:local_feedback') || '[]');
      localFb.push(payload);
      localStorage.setItem('lore:local_feedback', JSON.stringify(localFb));
      setStatus('sent');
    }
    setTimeout(() => {
      setOpen(false);
      setStatus(null);
      setRating(0);
      setTags([]);
      setNote('');
    }, 3500);
  };

  const displayRating = hoverRating || rating;

  return (
    <>
      {/* ── Floating trigger ── */}
      <button
        id="site-feedback-trigger"
        onClick={() => setOpen(o => !o)}
        aria-label="Give feedback about LORE"
        title="Give feedback about LORE"
        className="fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 cursor-pointer select-none active:scale-95 group"
        style={{ transition: 'transform 0.15s ease' }}
      >
        {/* Mobile: icon-only circle */}
        <span
          className="sm:hidden flex items-center justify-center w-12 h-12 rounded-full border border-[#9E7B4C]/30 bg-[#0D0B08]/95 backdrop-blur-md text-[#9E7B4C] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          style={{ transition: 'border-color 0.2s, box-shadow 0.2s' }}
        >
          {open ? <X className="w-4 h-4 text-[#EDE8DF]" /> : <MessageSquare className="w-4 h-4" />}
        </span>

        {/* Desktop: always-visible pill */}
        <span
          className="hidden sm:flex items-center gap-2.5 h-11 px-5 rounded-full border border-[#9E7B4C]/30 hover:border-[#9E7B4C]/60 bg-[#0D0B08]/95 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_18px_rgba(158,123,76,0.08)]"
          style={{ transition: 'border-color 0.25s, box-shadow 0.25s' }}
        >
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9E7B4C] opacity-50"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9E7B4C]/80"></span>
          </span>
          {open
            ? <X className="w-3.5 h-3.5 text-[#EDE8DF]" />
            : <>
                <MessageSquare className="w-3.5 h-3.5 text-[#9E7B4C]" />
                <span className="text-[9.5px] font-mono tracking-[0.18em] uppercase text-[#EDE8DF]/80 font-semibold">
                  Feedback
                </span>
              </>
          }
        </span>
      </button>

      {/* ── Feedback panel ── */}
      {open && (
        <div
          ref={panelRef}
          id="site-feedback-panel"
          className="fixed bottom-[4.75rem] right-4 left-4 sm:left-auto sm:right-6 sm:w-[340px] z-[199] rounded-2xl border overflow-hidden animate-scale-up"
          style={{
            backgroundColor: '#0F0D0A',
            borderColor: 'rgba(158,123,76,0.18)',
            boxShadow: '0 0 0 1px rgba(158,123,76,0.05), 0 24px 60px rgba(0,0,0,0.85)',
          }}
        >
          {/* Gold top accent line */}
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(158,123,76,0.5) 40%, transparent)' }} />

          {status === 'sent' ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-4">✦</div>
              <p className="text-sm font-serif italic" style={{ color: '#EDE8DF' }}>Thank you.</p>
              <p className="text-[10px] font-mono tracking-widest uppercase mt-2" style={{ color: '#6A6560' }}>Your note is filed in the archive.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(158,123,76,0.08)' }}>
                <p className="text-[9px] font-mono tracking-[0.28em] uppercase" style={{ color: '#9E7B4C' }}>LORE Feedback</p>
                <p className="font-serif italic text-base mt-1 leading-snug" style={{ color: '#EDE8DF' }}>How is the experience?</p>
              </div>

              <div className="p-5 space-y-5">
                {/* Rating dots */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-3" style={{ color: '#4A4540' }}>Overall rating</p>
                  <div className="flex items-center gap-3">
                    {[1,2,3,4,5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        className="w-7 h-7 rounded-full border transition-all duration-150 cursor-pointer"
                        style={{
                          borderColor: displayRating >= n ? '#9E7B4C' : 'rgba(237,232,223,0.1)',
                          backgroundColor: displayRating >= n ? 'rgba(158,123,76,0.18)' : 'rgba(255,255,255,0.02)',
                          transform: displayRating >= n ? 'scale(1.2)' : 'scale(1)',
                          boxShadow: displayRating >= n ? '0 0 8px rgba(158,123,76,0.3)' : 'none',
                        }}
                        aria-label={`Rate ${n}`}
                      />
                    ))}
                    {displayRating > 0 && (
                      <span className="text-[10px] font-mono ml-1" style={{ color: '#9E7B4C' }}>
                        {['','Poor','Fair','Good','Great','Perfect'][displayRating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-3" style={{ color: '#4A4540' }}>What resonates?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="px-2.5 py-1 rounded-full text-[9px] font-mono tracking-wide border transition-all duration-150 cursor-pointer"
                        style={{
                          borderColor: tags.includes(tag) ? 'rgba(158,123,76,0.6)' : 'rgba(237,232,223,0.07)',
                          color: tags.includes(tag) ? '#9E7B4C' : '#5A5550',
                          backgroundColor: tags.includes(tag) ? 'rgba(158,123,76,0.1)' : 'transparent',
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-2" style={{ color: '#4A4540' }}>Anything else?</p>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Tell us anything..."
                    rows={3}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border resize-none focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      borderColor: 'rgba(237,232,223,0.07)',
                      color: '#EDE8DF',
                      caretColor: '#9E7B4C',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(158,123,76,0.3)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(237,232,223,0.07)'; }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={rating === 0 || status === 'sending'}
                  className="w-full py-2.5 rounded-lg text-[10px] font-mono tracking-[0.2em] uppercase transition-all duration-200 active:scale-95 disabled:opacity-30 cursor-pointer"
                  style={{
                    backgroundColor: rating > 0 ? 'rgba(158,123,76,0.12)' : 'transparent',
                    border: '1px solid rgba(158,123,76,0.35)',
                    color: '#9E7B4C',
                  }}
                >
                  {status === 'sending' ? 'Filing...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
