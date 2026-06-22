/**
 * DepthMeter — sticky top bar with SVG logo, segmented progress track,
 * and layer name. Uses a 3-column grid for desktop and stacked rows on mobile
 * to prevent overlap and truncation on small screens.
 */
import LoreMark from './LoreMark';

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
        {/* Logo + wordmark */}
        <button
          onClick={onBack}
          className="flex items-center gap-[10px] justify-self-start transition-opacity hover:opacity-60 active:opacity-35"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <LoreMark size={18} color={text} />
          <span
            className="text-[10px] font-bold tracking-[0.32em] uppercase"
            style={{ color: text, opacity: 0.85 }}
          >
            LORE
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

        {/* Layer label with premium slide-up roller effect */}
        <div className="justify-self-end overflow-hidden h-[18px] flex items-center max-w-[120px] sm:max-w-[200px] select-none">
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
            <LoreMark size={16} color={text} />
            <span
              className="text-[10px] font-bold tracking-[0.3em] uppercase"
              style={{ color: text, opacity: 0.85 }}
            >
              LORE
            </span>
          </button>

          {/* Layer label */}
          <div className="overflow-hidden h-[16px] flex items-center max-w-[160px] select-none">
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
