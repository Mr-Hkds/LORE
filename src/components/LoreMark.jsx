// Stylized, broken Roman numeral VII (representing "Seven Descents").
// Composed of exactly 7 horizontal rows descending vertically, with a glitched/redacted middle layer.
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

      {/* Sliced Roman Numeral VII (Exactly 7 Horizontal Rows) */}
      
      {/* Row 1 (y=16): Top horizontal serif bars */}
      <rect x="15" y="16" width="40" height="6" fill={color} opacity="1.0" rx="1" />
      <rect x="63" y="16" width="24" height="6" fill={color} opacity="1.0" rx="1" />

      {/* Row 2 (y=27): Upper body */}
      <rect x="18" y="27" width="6" height="6" fill={color} opacity="0.9" rx="1" />
      <rect x="46" y="27" width="6" height="6" fill={color} opacity="0.9" rx="1" />
      <rect x="69" y="27" width="6" height="6" fill={color} opacity="0.9" rx="1" />
      <rect x="81" y="27" width="6" height="6" fill={color} opacity="0.9" rx="1" />

      {/* Row 3 (y=38): Upper-middle body */}
      <rect x="21" y="38" width="6" height="6" fill={color} opacity="0.8" rx="1" />
      <rect x="43" y="38" width="6" height="6" fill={color} opacity="0.8" rx="1" />
      <rect x="69" y="38" width="6" height="6" fill={color} opacity="0.8" rx="1" />
      <rect x="81" y="38" width="6" height="6" fill={color} opacity="0.8" rx="1" />

      {/* Row 4 (y=49): Center body (Redacted/Glitched - I2 skipped, I1 offset) */}
      <rect x="24" y="49" width="6" height="6" fill={color} opacity="0.7" rx="1" />
      <rect x="40" y="49" width="6" height="6" fill={color} opacity="0.7" rx="1" />
      <rect x="72" y="49" width="4" height="6" fill={color} opacity="0.7" rx="1" />

      {/* Row 5 (y=60): Lower-middle body */}
      <rect x="27" y="60" width="6" height="6" fill={color} opacity="0.6" rx="1" />
      <rect x="37" y="60" width="6" height="6" fill={color} opacity="0.6" rx="1" />
      <rect x="69" y="60" width="6" height="6" fill={color} opacity="0.6" rx="1" />
      <rect x="81" y="60" width="6" height="6" fill={color} opacity="0.6" rx="1" />

      {/* Row 6 (y=70): Lower body (V meeting point) */}
      <rect x="32" y="71" width="6" height="6" fill={color} opacity="0.5" rx="1" />
      <rect x="69" y="71" width="6" height="6" fill={color} opacity="0.5" rx="1" />
      <rect x="81" y="71" width="6" height="6" fill={color} opacity="0.5" rx="1" />

      {/* Row 7 (y=82): Bottom horizontal serif bars */}
      <rect x="28" y="82" width="14" height="6" fill={color} opacity="0.4" rx="1" />
      <rect x="63" y="82" width="24" height="6" fill={color} opacity="0.4" rx="1" />
    </svg>
  );
}
