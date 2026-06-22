/**
 * SiteFeedback — floating site-wide feedback button.
 * NOT per-story. This is "How is LORE as a product?"
 * Lives in the bottom-right corner of every screen.
 * Submits to POST /api/feedback.
 */
import { useState } from 'react';

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
  const [open, setOpen]           = useState(false);
  const [rating, setRating]       = useState(0);
  const [hoverRating, setHover]   = useState(0);
  const [tags, setTags]           = useState([]);
  const [note, setNote]           = useState('');
  const [status, setStatus]       = useState(null); // null | 'sending' | 'sent' | 'error'

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

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
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
    setTimeout(() => {
      setOpen(false);
      setStatus(null);
      setRating(0);
      setTags([]);
      setNote('');
    }, 2200);
  };

  const displayRating = hoverRating || rating;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Give feedback"
        title="Give feedback about LORE"
        className="fixed bottom-6 right-6 z-[200] w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
        style={{
          backgroundColor: 'rgba(13,11,8,0.92)',
          borderColor: 'rgba(158,123,76,0.35)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{ fontSize: '14px' }}>{open ? '✕' : '✦'}</span>
      </button>

      {/* Feedback panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-[199] w-80 rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: '#110F0C',
            borderColor: 'rgba(237,232,223,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          }}
        >
          {status === 'sent' ? (
            <div className="p-6 text-center">
              <div className="text-2xl mb-3">✦</div>
              <p className="text-sm font-serif italic" style={{ color: '#EDE8DF' }}>Thank you.</p>
              <p className="text-[10px] font-mono tracking-widest uppercase mt-1" style={{ color: '#6A6560' }}>Your note is in the archive.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(237,232,223,0.06)' }}>
                <p className="text-[9px] font-mono tracking-[0.22em] uppercase" style={{ color: '#9E7B4C' }}>LORE Feedback</p>
                <p className="font-serif italic text-base mt-1" style={{ color: '#EDE8DF' }}>How is the experience?</p>
              </div>

              <div className="p-5 space-y-5">
                {/* Star rating — using dots not stars */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-3" style={{ color: '#6A6560' }}>Overall</p>
                  <div className="flex gap-3">
                    {[1,2,3,4,5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        className="w-7 h-7 rounded-full border transition-all duration-150 cursor-pointer"
                        style={{
                          borderColor: displayRating >= n ? '#9E7B4C' : 'rgba(237,232,223,0.12)',
                          backgroundColor: displayRating >= n ? 'rgba(158,123,76,0.2)' : 'transparent',
                          transform: displayRating >= n ? 'scale(1.15)' : 'scale(1)',
                        }}
                        aria-label={`Rate ${n}`}
                      />
                    ))}
                    {displayRating > 0 && (
                      <span className="text-[10px] font-mono self-center" style={{ color: '#9E7B4C', opacity: 0.8 }}>
                        {['','Poor','Fair','Good','Great','Perfect'][displayRating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-3" style={{ color: '#6A6560' }}>What resonates?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="px-2.5 py-1 rounded-full text-[9px] font-mono tracking-wide border transition-all duration-150 cursor-pointer"
                        style={{
                          borderColor: tags.includes(tag) ? '#9E7B4C' : 'rgba(237,232,223,0.1)',
                          color: tags.includes(tag) ? '#9E7B4C' : '#6A6560',
                          backgroundColor: tags.includes(tag) ? 'rgba(158,123,76,0.12)' : 'transparent',
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <p className="text-[9px] font-mono tracking-[0.14em] uppercase mb-2" style={{ color: '#6A6560' }}>Anything else? (optional)</p>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Tell us anything..."
                    rows={3}
                    className="w-full px-3 py-2.5 text-xs rounded-lg border resize-none focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderColor: 'rgba(237,232,223,0.08)',
                      color: '#EDE8DF',
                      caretColor: '#9E7B4C',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(158,123,76,0.3)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(237,232,223,0.08)'; }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={rating === 0 || status === 'sending'}
                  className="w-full py-2.5 rounded-lg text-[10px] font-mono tracking-[0.2em] uppercase transition-all duration-200 active:scale-95 disabled:opacity-30 cursor-pointer"
                  style={{
                    backgroundColor: rating > 0 ? 'rgba(158,123,76,0.15)' : 'transparent',
                    border: '1px solid rgba(158,123,76,0.4)',
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
