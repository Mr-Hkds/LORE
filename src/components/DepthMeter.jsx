/**
 * DepthMeter — sticky top bar with SVG logo, segmented progress track,
 * and layer name. Uses a 3-column grid for desktop and stacked rows on mobile
 * to prevent overlap and truncation on small screens.
 */
import LoreMark from './LoreMark';
import { Share2 } from 'lucide-react';

export default function DepthMeter({ currentLayer, totalLayers, layerName, bg, text, muted, border, onBack, onShare }) {
  const accentColor = '#9E7B4C';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-[1600ms]"
      style={{ backgroundColor: bg, borderBottom: `1px solid ${border}` }}
    >
      {/* ── DESKTOP GRID (sm and up) ── */}
      <div
        className="hidden sm:grid mx-auto h-14 items-center gap-6 px-8 md:px-10"
        style={{
          maxWidth: '780px',
          gridTemplateColumns: '1fr auto 1fr',
        }}
      >
        {/* Logo + wordmark */}
        <button
          onClick={onBack}
          className="flex items-center gap-[10px] justify-self-start transition-opacity hover:opacity-60 active:opacity-35"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <LoreMark size={17} color={text} />
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: text,
              opacity: 0.82,
              textTransform: 'uppercase',
            }}
          >
            SevenDescents
          </span>
        </button>

        {/* Segmented depth track */}
        <div
          className="flex items-center gap-1"
          role="progressbar"
          aria-label={`Layer ${currentLayer} of ${totalLayers}`}
          aria-valuenow={currentLayer}
          aria-valuemin={1}
          aria-valuemax={totalLayers}
        >
          {Array.from({ length: totalLayers }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-700"
              style={{
                height: '2px',
                width: i + 1 === currentLayer ? '28px' : '20px',
                backgroundColor:
                  i + 1 < currentLayer
                    ? accentColor
                    : i + 1 === currentLayer
                    ? text
                    : muted,
                opacity:
                  i + 1 < currentLayer
                    ? 0.45
                    : i + 1 === currentLayer
                    ? 0.8
                    : 0.2,
              }}
            />
          ))}
        </div>

        {/* Layer label & Share button */}
        <div className="justify-self-end flex items-center gap-3">
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#9E7B4C]/20 hover:border-[#9E7B4C]/45 text-[#9E7B4C] hover:text-[#b08c5c] transition-all duration-200 cursor-pointer text-[8px] font-mono tracking-widest focus:outline-none active:scale-95 uppercase select-none"
          >
            <Share2 className="w-3 h-3" />
            Share
          </button>
          <div className="overflow-hidden h-[18px] flex items-center max-w-[100px] md:max-w-[155px] select-none">
            <span
              key={layerName}
              className="text-[10px] font-bold tracking-[0.15em] uppercase whitespace-nowrap block animate-roll-up truncate"
              style={{ color: text }}
              title={layerName}
            >
              {layerName}
            </span>
          </div>
        </div>
      </div>

      {/* ── MOBILE CONTAINER (xs / mobile screens) ── */}
      <div
        className="flex sm:hidden flex-col px-4 py-2.5 gap-1.5"
        style={{ maxWidth: '100%' }}
      >
        {/* Row 1: Logo (left) and Layer Name (right) */}
        <div className="flex justify-between items-center h-8">
          <button
            onClick={onBack}
            className="flex items-center gap-[8px] transition-opacity hover:opacity-60 active:opacity-35"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <LoreMark size={14} color={text} />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: text,
                opacity: 0.82,
                textTransform: 'uppercase',
              }}
            >
              SevenDescents
            </span>
          </button>

          {/* Layer label & Share button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onShare}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#9E7B4C]/25 text-[#9E7B4C] text-[8px] font-mono tracking-wider focus:outline-none active:scale-95 uppercase select-none cursor-pointer"
            >
              <Share2 className="w-2.5 h-2.5" />
              Share
            </button>
            <div className="overflow-hidden h-[16px] flex items-center max-w-[85px] select-none">
              <span
                key={layerName}
                className="text-[9px] font-bold tracking-[0.12em] uppercase whitespace-nowrap block animate-roll-up truncate"
                style={{ color: text }}
                title={layerName}
              >
                {layerName}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Centered Segmented depth track */}
        <div
          className="flex items-center justify-center gap-1.5 h-4"
          role="progressbar"
          aria-label={`Layer ${currentLayer} of ${totalLayers}`}
          aria-valuenow={currentLayer}
          aria-valuemin={1}
          aria-valuemax={totalLayers}
        >
          {Array.from({ length: totalLayers }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-700"
              style={{
                height: '2px',
                width: i + 1 === currentLayer ? '20px' : '14px',
                backgroundColor:
                  i + 1 < currentLayer
                    ? accentColor
                    : i + 1 === currentLayer
                    ? text
                    : muted,
                opacity:
                  i + 1 < currentLayer
                    ? 0.45
                    : i + 1 === currentLayer
                    ? 0.8
                    : 0.2,
              }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
