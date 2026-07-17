/**
 * SiteFeedback — right-side vertical tab.
 * Always visible at mid-screen regardless of scroll.
 * Opens a panel anchored to the right edge.
 */
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

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

  useEffect(() => {
    window.openFeedback = () => setOpen(true);
    return () => {
      delete window.openFeedback;
    };
  }, []);

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
    }, 3200);
  };

  const displayRating = hoverRating || rating;

  return (
    <>


      {/* ── Center Dialog Overlay Modal ── */}
      {open && (
        <>
          {/* Backdrop with a slightly heavier blur for focus */}
          <div
            className="fixed inset-0 z-[198] animate-fade-in"
            style={{ background: 'rgba(4,3,2,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(false)}
          />

          {/* Panel — Centered Modal */}
          <div
            ref={panelRef}
            id="site-feedback-panel"
            className="fixed z-[199] flex flex-col overflow-hidden animate-fade-in-scale-centered"
            style={{
              left: '50%',
              top: '50%',
              height: 'auto',
              maxHeight: '85vh',
              width: 'min(390px, 92vw)',
              backgroundColor: '#0D0C0A',
              borderRadius: '16px',
              border: '1px solid rgba(197, 160, 110, 0.25)',
              boxShadow: '0 30px 60px rgba(0,0,0,0.9)',
            }}
          >
            {/* Gold top accent */}
            <div
              className="h-px w-full flex-shrink-0"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(158,123,76,0.5) 50%, transparent)' }}
            />

            {status === 'sent' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="text-3xl mb-5">✦</div>
                <p className="text-sm font-serif italic" style={{ color: '#EDE8DF' }}>Thank you.</p>
                <p className="text-[10px] font-mono tracking-widest uppercase mt-2" style={{ color: '#4A4540' }}>
                  Your note is filed in the archive.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
                {/* Header */}
                <div className="px-6 pt-6 pb-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(158,123,76,0.08)' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[9px] font-mono tracking-[0.28em] uppercase mb-1" style={{ color: '#9E7B4C' }}>
                        VII DESCENTS Feedback
                      </p>
                      <p className="font-serif italic text-lg leading-snug" style={{ color: '#EDE8DF' }}>
                        How is the experience?
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="mt-1 flex-shrink-0"
                      style={{ color: 'rgba(143,138,130,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                    >
                      <X style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6 flex-1">
                  {/* Rating */}
                  <div>
                    <p className="text-[9px] font-mono tracking-[0.2em] uppercase mb-3" style={{ color: '#4A4540' }}>
                      Overall rating
                    </p>
                    <div className="flex items-center gap-3">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHover(n)}
                          onMouseLeave={() => setHover(0)}
                          className="cursor-pointer transition-all duration-150"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            border: `1px solid ${displayRating >= n ? 'rgba(158,123,76,0.8)' : 'rgba(237,232,223,0.1)'}`,
                            background: displayRating >= n ? 'rgba(158,123,76,0.18)' : 'rgba(255,255,255,0.02)',
                            transform: displayRating >= n ? 'scale(1.2)' : 'scale(1)',
                            boxShadow: displayRating >= n ? '0 0 10px rgba(158,123,76,0.25)' : 'none',
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
                    <p className="text-[9px] font-mono tracking-[0.2em] uppercase mb-3" style={{ color: '#4A4540' }}>
                      What resonates?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TAGS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className="cursor-pointer transition-all duration-150"
                          style={{
                            padding: '5px 11px',
                            borderRadius: '20px',
                            fontSize: '9px',
                            fontFamily: 'monospace',
                            letterSpacing: '0.08em',
                            border: `1px solid ${tags.includes(tag) ? 'rgba(158,123,76,0.55)' : 'rgba(237,232,223,0.07)'}`,
                            color: tags.includes(tag) ? '#9E7B4C' : '#4A4540',
                            background: tags.includes(tag) ? 'rgba(158,123,76,0.1)' : 'transparent',
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <p className="text-[9px] font-mono tracking-[0.2em] uppercase mb-2" style={{ color: '#4A4540' }}>
                      Anything else?
                    </p>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Tell us anything..."
                      rows={4}
                      className="w-full resize-none focus:outline-none"
                      style={{
                        padding: '10px 12px',
                        fontSize: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(237,232,223,0.07)',
                        background: 'rgba(255,255,255,0.02)',
                        color: '#EDE8DF',
                        caretColor: '#9E7B4C',
                        fontFamily: 'sans-serif',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(158,123,76,0.3)'; }}
                      onBlur={e  => { e.target.style.borderColor = 'rgba(237,232,223,0.07)'; }}
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="px-6 pb-6 flex-shrink-0">
                  <button
                    type="submit"
                    disabled={rating === 0 || status === 'sending'}
                    className="w-full transition-all duration-200 active:scale-95 cursor-pointer"
                    style={{
                      padding: '11px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      background: rating > 0 ? 'rgba(158,123,76,0.12)' : 'transparent',
                      border: '1px solid rgba(158,123,76,0.35)',
                      color: '#9E7B4C',
                      opacity: rating === 0 || status === 'sending' ? 0.35 : 1,
                    }}
                  >
                    {status === 'sending' ? 'Filing...' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
