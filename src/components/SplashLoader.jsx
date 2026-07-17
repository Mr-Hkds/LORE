import { useState, useEffect } from 'react';

export default function SplashLoader({ loading, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [logLines, setLogLines] = useState([
    'INITIALIZING SECURE PROTOCOL...',
  ]);

  // Log sequence animation
  useEffect(() => {
    const logs = [
      'ESTABLISHING CONNECTION TO SECURE ARCHIVE...',
      'DESERIALIZING INDEX...',
      'DECRYPTING DOSSIERS...',
      'PARSING 7-LAYER SENTENCE ARRAYS...',
      'ACCESS GRANTED. DECLASSIFYING ARCHIVE.',
    ];

    let delay = 220;
    const timers = logs.map((line, idx) => {
      return setTimeout(() => {
        setLogLines(prev => [...prev, line]);
      }, delay * (idx + 1));
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  // Smooth progress bar simulation up to 90%
  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      if (current < 90) {
        current += Math.random() * 15;
        if (current > 90) current = 90;
        setProgress(Math.floor(current));
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  // Sync progress bar with actual loading state
  useEffect(() => {
    if (!loading) {
      setProgress(100);
      // Wait for progress bar to finish filling, then trigger fade out
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
        // Wait for fade out animation to finish, then unmount
        const completeTimer = setTimeout(() => {
          onComplete();
        }, 500); // 500ms fade duration
        return () => clearTimeout(completeTimer);
      }, 300);
      return () => clearTimeout(fadeTimer);
    }
  }, [loading, onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0D0C0A',
        color: '#F5F2EB',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        transition: 'opacity 500ms ease-in-out',
        opacity: isFadingOut ? 0 : 1,
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
    >
      {/* Centered Terminal Box */}
      <div className="w-[90%] max-w-[480px] p-6 border border-[#C5A06E]/30 bg-[#0A0907] rounded-md shadow-2xl relative overflow-hidden">
        {/* Terminal HUD Header */}
        <div className="flex justify-between items-center border-b border-[#C5A06E]/20 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#C5A06E] animate-pulse" />
            <span className="text-[#C5A06E] text-xs font-bold tracking-widest">LORE // SECURE_DECRYPT</span>
          </div>
          <span className="text-[#A5A096] text-[10px]">SYS_VER_2.4</span>
        </div>

        {/* Console Logs */}
        <div className="h-[120px] overflow-hidden text-[11px] text-[#A5A096] space-y-1.5 font-mono mb-6">
          {logLines.map((line, idx) => (
            <div key={idx} className="flex items-start gap-1">
              <span className="text-[#C5A06E] font-bold select-none">&gt;</span>
              <span className="leading-normal">{line}</span>
            </div>
          ))}
          {!isFadingOut && (
            <div className="flex items-center gap-1">
              <span className="text-[#C5A06E] font-bold select-none">&gt;</span>
              <span className="w-1.5 h-3 bg-[#F5F2EB] animate-pulse" />
            </div>
          )}
        </div>

        {/* Progress Bar & Decrypted Count */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-[#C5A06E]">DECRYPTION PROGRESS</span>
            <span className="text-[#F5F2EB]">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#1C1A16] rounded-full overflow-hidden border border-[#C5A06E]/10">
            <div
              className="h-full bg-gradient-to-r from-[#9E7B4C] to-[#C5A06E] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Scanning grid animation lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(197,160,110,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(197,160,110,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />
      </div>
    </div>
  );
}
