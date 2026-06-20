/**
 * LoadingState — a single slow-pulsing dot.
 * Nothing flashy. Just presence.
 */
export default function LoadingState({ textColor }) {
  return (
    <div className="flex items-center justify-center py-32">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{
          backgroundColor: textColor,
          opacity: 0.4,
          animationDuration: '2.4s',
          animationTimingFunction: 'ease-in-out',
        }}
      />
    </div>
  );
}
