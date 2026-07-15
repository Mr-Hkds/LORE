// Stylized, broken digital "7" mark.
// Composed of exactly 7 horizontal rows descending diagonally, with a broken slice in the middle.
// Framed by subtle corner HUD telemetry brackets for an immersive forensic terminal look.
export default function LoreMark({ size = 24, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Corner HUD Brackets */}
      <path
        d="M 5,18 L 5,5 L 18,5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path
        d="M 82,5 L 95,5 L 95,18"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path
        d="M 5,82 L 5,95 L 18,95"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path
        d="M 82,95 L 95,95 L 95,82"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />

      {/* Segmented Digit 7 (Exactly 7 Horizontal Rows) */}
      {/* Row 1: Top horizontal bar */}
      <rect x="15" y="12" width="70" height="8" fill={color} opacity="1.0" rx="1" />

      {/* Row 2: Stem slice 1 */}
      <rect x="68" y="25" width="17" height="8" fill={color} opacity="0.9" rx="1" />

      {/* Row 3: Stem slice 2 */}
      <rect x="59" y="38" width="17" height="8" fill={color} opacity="0.8" rx="1" />

      {/* Row 4: Stem slice 3 (Broken / Glitched Split) */}
      <rect x="50" y="51" width="6" height="8" fill={color} opacity="0.7" rx="1" />
      <rect x="61" y="51" width="6" height="8" fill={color} opacity="0.7" rx="1" />

      {/* Row 5: Stem slice 4 */}
      <rect x="41" y="64" width="17" height="8" fill={color} opacity="0.6" rx="1" />

      {/* Row 6: Stem slice 5 */}
      <rect x="32" y="77" width="17" height="8" fill={color} opacity="0.5" rx="1" />

      {/* Row 7: Stem slice 6 */}
      <rect x="23" y="90" width="17" height="8" fill={color} opacity="0.4" rx="1" />
    </svg>
  );
}
