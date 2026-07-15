/**
 * DepthMeter — sticky top bar with SVG logo, segmented progress track,
 * and layer name. Uses a 3-column grid for desktop and stacked rows on mobile
 * to prevent overlap and truncation on small screens.
 */
import LoreMark from './LoreMark';
import { ArrowLeft } from 'lucide-react';

export default function DepthMeter({ currentLayer, totalLayers, layerName, bg, text, muted, border, onBackToHome, onBackToCatalog, categoryLabel }) {
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
          maxWidth: '860px', // slightly wider to allow more room for full titles
          gridTemplateColumns: '1.2fr auto 1.2fr',
        }}
      >
        {/* Breadcrumb Navigation segments */}
        <div className="flex items-center gap-2.5 justify-self-start font-mono text-[9.5px] font-bold tracking-[0.18em] uppercase select-none">
          <button
            onClick={onBackToHome}
            className="flex items-center gap-1.5 hover:text-[#9E7B4C] transition-colors duration-200 cursor-pointer focus:outline-none"
            style={{ background: 'none', border: 'none', padding: 0, color: text }}
          >
            <LoreMark size={11} color="#9E7B4C" />
            <span style={{ color: '#9E7B4C', fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: '0.22em', fontSize: '9px' }}>VII DESCENTS</span>
          </button>
          
          <span style={{ opacity: 0.3, color: text }}>/</span>
          
          {categoryLabel ? (
            <button
              onClick={onBackToCatalog}
              className="hover:text-[#9E7B4C] transition-colors duration-200 cursor-pointer focus:outline-none max-w-[180px] truncate"
              style={{ background: 'none', border: 'none', padding: 0, color: text }}
            >
              {categoryLabel}
            </button>
          ) : (
            <span style={{ opacity: 0.5, color: text }}>Catalog</span>
          )}
        </div>

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
          <div className="overflow-hidden h-[18px] flex items-center max-w-[280px] md:max-w-[340px] select-none">
            <span
              key={layerName}
              className="text-[10px] font-bold tracking-[0.15em] uppercase whitespace-nowrap block animate-roll-up"
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
          {/* Breadcrumb Navigation segments */}
          <div className="flex items-center gap-1.5 font-mono text-[8px] font-bold tracking-[0.1em] uppercase select-none">
            <button
              onClick={onBackToHome}
              className="flex items-center gap-1.5 hover:text-[#9E7B4C] transition-colors duration-200 cursor-pointer focus:outline-none"
              style={{ background: 'none', border: 'none', padding: 0, color: text }}
            >
              <LoreMark size={9} color="#9E7B4C" />
              <span style={{ color: '#9E7B4C', letterSpacing: '0.2em' }}>VII DESCENTS</span>
            </button>
            <span style={{ opacity: 0.3, color: text }}>/</span>
            {categoryLabel ? (
              <button
                onClick={onBackToCatalog}
                className="hover:text-[#9E7B4C] transition-colors duration-200 cursor-pointer focus:outline-none truncate max-w-[90px]"
                style={{ background: 'none', border: 'none', padding: 0, color: text }}
              >
                {categoryLabel}
              </button>
            ) : (
              <span style={{ opacity: 0.5, color: text }}>Catalog</span>
            )}
          </div>

          {/* Layer label */}
          <div className="flex items-center ml-auto">
            <div className="overflow-hidden h-[16px] flex items-center select-none max-w-[150px] xs:max-w-[190px] sm:max-w-none">
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
