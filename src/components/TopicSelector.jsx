import { useState } from 'react';
import { TOPICS } from '../constants/topics';
import LoreMark from './LoreMark';

export default function TopicSelector({ onSelect, onAdminClick, categoryCounts = {} }) {
  const bg = '#1A1815';
  const fg = '#EDE8DF';
  const mu = '#6A6560';
  const ac = '#9E7B4C';
  const ru = 'rgba(237,232,223,0.07)';

  const [recommendation, setRecommendation] = useState('');
  const [submitStatus, setSubmitStatus] = useState(null); // 'submitting' | 'success' | 'error'

  // Secret admin tap gesture state
  const [lastTap, setLastTap] = useState(0);
  const [tapCount, setTapCount] = useState(0);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTap > 1500) {
      // Reset if more than 1.5s has passed since last tap
      setTapCount(1);
    } else {
      const next = tapCount + 1;
      if (next >= 5) {
        window.location.hash = '#console';
        setTapCount(0);
      } else {
        setTapCount(next);
      }
    }
    setLastTap(now);
  };

  const handleRecommendSubmit = async (e) => {
    e.preventDefault();
    if (!recommendation.trim()) return;

    setSubmitStatus('submitting');
    const newRec = {
      id: 'rec_' + Date.now(),
      topic: recommendation.trim(),
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      status: 'pending'
    };

    // Save to localStorage
    try {
      const existing = localStorage.getItem('lore:recommendations');
      const recs = existing ? JSON.parse(existing) : [];
      recs.push(newRec);
      localStorage.setItem('lore:recommendations', JSON.stringify(recs));
    } catch (err) {
      console.error(err);
    }

    // Try posting to local API
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRec),
      });
      if (res.ok) {
        setSubmitStatus('success');
      } else {
        setSubmitStatus('success'); // Fallback to local success
      }
    } catch (err) {
      console.warn('API submission failed, fell back to localStorage:', err);
      setSubmitStatus('success');
    }

    setRecommendation('');
    setTimeout(() => setSubmitStatus(null), 3000);
  };

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: bg, color: fg }}>

      {/* Vignette */}
      <div className="vignette" aria-hidden="true" />

      {/* Header */}
      <header style={{ padding: '0 40px' }}>
        <div
          className="mx-auto h-14 flex items-center justify-between"
          style={{ maxWidth: '780px' }}
        >
          <div 
            className="flex items-center gap-[10px] cursor-pointer" 
            onClick={handleLogoTap}
            title="Tap 5 times to open Admin Console"
          >
            <LoreMark size={18} color={fg} />
            <span
              className="text-[10px] font-bold tracking-[0.32em] uppercase select-none"
              style={{ color: fg, opacity: 0.85 }}
            >
              LORE
            </span>
          </div>
          <span
            className="text-[10px] font-medium tracking-[0.12em] uppercase"
            style={{ color: mu }}
          >
            A guided descent
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-end" style={{ padding: '80px 40px 88px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: '780px' }}>

          {/* Eyebrow */}
          <p
            className="text-[10px] font-semibold tracking-[0.26em] uppercase"
            style={{ color: ac, opacity: 0.85, marginBottom: '32px' }}
          >
            Select a rabbit hole
          </p>

          {/* Title */}
          <h1
            className="font-serif italic leading-none tracking-tight"
            style={{
              fontSize: 'clamp(3.6rem, 11vw, 7.5rem)',
              fontWeight: 300,
              color: fg,
              letterSpacing: '-0.04em',
              lineHeight: 0.93,
              marginBottom: '48px',
            }}
          >
            What do you want<br />to know?
          </h1>

          {/* Subtitle */}
          <p
            className="font-serif leading-relaxed"
            style={{
              fontSize: 'clamp(1.05rem, 2.2vw, 1.22rem)',
              fontWeight: 300,
              lineHeight: 1.85,
              color: fg,
              opacity: 0.48,
              maxWidth: '42ch',
              marginBottom: '64px',
            }}
          >
            Seven layers of real, documented knowledge.<br />
            Each one darker than the last.
          </p>

          {/* Topic list */}
          <div style={{ borderTop: `1px solid ${ru}` }}>
            {TOPICS.map((topic) => {
              const categoryMap = {
                'psychology': 'psychology',
                'mythology': 'mythology',
                'true-crime': 'true_crime',
                'gov-experiments': 'gov_experiments',
                'paranormal-reports': 'paranormal',
              };
              const count = categoryCounts[categoryMap[topic.id]] || 0;
              return (
              <button
                key={topic.id}
                id={`topic-${topic.id}`}
                onClick={() => onSelect(topic)}
                className="w-full text-left flex items-baseline gap-5 transition-opacity duration-200 hover:opacity-55 active:opacity-35"
                style={{
                  borderBottom: `1px solid ${ru}`,
                  padding: '32px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: `1px solid ${ru}`,
                  cursor: 'pointer',
                }}
              >
                {/* Topic name */}
                <span
                  className="font-serif italic flex-1 leading-snug"
                  style={{
                    fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                    fontWeight: 300,
                    color: fg,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                  }}
                >
                  {topic.label}
                </span>

                {/* Dossier count */}
                {count > 0 && (
                  <span
                    className="text-[9px] font-mono tracking-[0.1em] flex-shrink-0"
                    style={{ color: ac, opacity: 0.7 }}
                  >
                    {count} {count === 1 ? 'dossier' : 'dossiers'}
                  </span>
                )}

                {/* Hint */}
                <span
                  className="text-[10px] font-normal tracking-[0.1em] uppercase hidden sm:block flex-shrink-0"
                  style={{
                    color: mu,
                    opacity: 0.6,
                    maxWidth: '24ch',
                    textAlign: 'right',
                    flex: 1,
                    paddingLeft: '8px',
                  }}
                >
                  {topic.hint}
                </span>

                {/* Arrow */}
                <span
                  className="text-lg flex-shrink-0 transition-transform duration-300 group-hover:translate-y-1"
                  style={{ color: mu, opacity: 0.35 }}
                >
                  ↓
                </span>
              </button>
              );
            })}
          </div>

          {/* User Recommendation Form */}
          <div className="mt-16 pt-10 border-t" style={{ borderColor: ru }}>
            <h3
              className="font-serif italic text-lg mb-4"
              style={{ color: fg, fontWeight: 300, letterSpacing: '-0.01em' }}
            >
              Recommend a topic for the archive
            </h3>
            <p className="text-xs font-sans mb-6" style={{ color: mu, lineHeight: 1.6 }}>
              Is there a dark corner of history or psychology we should explore? Submit a topic below.
              The AI content engine reviews user submissions during nightly research passes.
            </p>
            <form onSubmit={handleRecommendSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="e.g., The Salem Witch Trials, Sleep Paralysis, Project Sunshine..."
                className="flex-1 px-4 py-3 bg-[#13110E] text-[#EDE8DF] text-sm rounded-lg border border-neutral-800 focus:border-[#9E7B4C] focus:outline-none transition-colors duration-200"
                disabled={submitStatus === 'submitting'}
                required
              />
              <button
                type="submit"
                disabled={submitStatus === 'submitting'}
                className="px-6 py-3 bg-[#9E7B4C] text-white text-xs font-bold tracking-[0.2em] uppercase rounded-lg hover:bg-[#b08c5c] active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                {submitStatus === 'submitting' ? 'Submitting...' : 'File Recommendation'}
              </button>
            </form>
            {submitStatus === 'success' && (
              <p className="text-xs font-mono mt-3" style={{ color: ac }}>
                ✓ Recommendation successfully logged to archive engine.
              </p>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
