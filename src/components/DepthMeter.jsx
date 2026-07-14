/**
 * DepthMeter — sticky top bar with SVG logo, segmented progress track,
 * and layer name. Uses a 3-column grid for desktop and stacked rows on mobile
 * to prevent overlap and truncation on small screens.
 */
import LoreMark from './LoreMark';
import { ArrowLeft } from 'lucide-react';

export default function DepthMeter({ currentLayer, totalLayers, layerName, bg, text, muted, border, onBack }) {
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
        {/* Logo + Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 active:scale-95 cursor-pointer bg-[#1A1815]/30 hover:bg-[#1A1815]/80 hover:border-neutral-500/40"
          style={{ 
            borderColor: border || 'rgba(158, 123, 76, 0.25)', 
            color: text,
            fontFamily: "'Space Mono', monospace",
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <ArrowLeft size={10} style={{ color: text }} />
          <span>Catalog</span>
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
            <button
              key={i}
              onClick={() => {
                const targetElem = document.getElementById(`layer-section-${i + 1}`);
                if (targetElem) {
                  targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              title={`Jump to Layer ${i + 1}`}
              className="rounded-full transition-all duration-700 focus:outline-none cursor-pointer"
              style={{
                height: '4px',
                padding: 0,
                border: 'none',
                background: 'none',
                width: i + 1 === currentLayer ? '28px' : '20px',
                backgroundColor:
                  i + 1 < currentLayer
                    ? accentColor
                    : i + 1 === currentLayer
                    ? text
                    : muted,
                opacity:
                  i + 1 < currentLayer
                    ? 0.55
                    : i + 1 === currentLayer
                    ? 0.95
                    : 0.25,
              }}
            />
          ))}
        </div>

        {/* Layer label */}
        <div className="justify-self-end flex items-center">
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
            className="flex items-center gap-1.5 transition-all duration-200 active:scale-95 cursor-pointer border px-2 py-1 rounded-md bg-[#1A1815]/30 hover:bg-[#1A1815]/60"
            style={{ 
              borderColor: border || 'rgba(158, 123, 76, 0.25)', 
              color: text,
              fontFamily: "'Space Mono', monospace",
              fontSize: '7.5px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <ArrowLeft size={9.5} style={{ color: text }} />
            <span>Catalog</span>
          </button>

          {/* Layer label */}
          <div className="flex items-center">
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
            <button
              key={i}
              onClick={() => {
                const targetElem = document.getElementById(`layer-section-${i + 1}`);
                if (targetElem) {
                  targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              title={`Jump to Layer ${i + 1}`}
              className="rounded-full transition-all duration-700 focus:outline-none cursor-pointer"
              style={{
                height: '4px',
                padding: 0,
                border: 'none',
                background: 'none',
                width: i + 1 === currentLayer ? '20px' : '14px',
                backgroundColor:
                  i + 1 < currentLayer
                    ? accentColor
                    : i + 1 === currentLayer
                    ? text
                    : muted,
                opacity:
                  i + 1 < currentLayer
                    ? 0.55
                    : i + 1 === currentLayer
                    ? 0.95
                    : 0.25,
              }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
