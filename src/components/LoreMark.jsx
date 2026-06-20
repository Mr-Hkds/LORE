// Pure SVG logo mark — 7 descending horizontal rules, each narrower
// Represents the 7 layers of descent. Clean, scalable, conceptually tight.
export default function LoreMark({ size = 24, color = 'currentColor' }) {
  const bars = [1, 0.82, 0.65, 0.50, 0.36, 0.24, 0.14];
  const barH = 1.5;
  const gap = 2.8;
  const totalH = bars.length * barH + (bars.length - 1) * gap;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {bars.map((ratio, i) => {
        const barW = ratio * size;
        const y = ((i * (barH + gap)) / totalH) * size;
        const barHeight = (barH / totalH) * size;
        return (
          <rect
            key={i}
            x={0}
            y={y}
            width={barW}
            height={barHeight}
            fill={color}
            opacity={0.9 - i * 0.09}
          />
        );
      })}
    </svg>
  );
}
