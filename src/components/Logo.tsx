// Mavacy mark (double-peak "M") + wordmark. White or cyan on dark per the guidelines;
// never rotated, stretched, or washed out.
export function Mark({ className = "h-7 w-auto", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className} aria-hidden fill="none" stroke={color} strokeWidth="7" strokeLinejoin="miter" strokeLinecap="butt">
      <path d="M4 42 L21 6 L36 36" />
      <path d="M28 36 L43 6 L60 42" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-body text-sm font-medium uppercase tracking-[0.32em] ${className}`}>Mavacy</span>
  );
}

const LOGO_TONES = { sky: ["#F2FDFF", "text-sky"], cyan: ["#3FE4E4", "text-cyan"], prussian: ["#0A2536", "text-prussian"] } as const;
export function Logo({ tone = "sky" }: { tone?: keyof typeof LOGO_TONES }) {
  const [color, cls] = LOGO_TONES[tone];
  return (
    <span className="inline-flex items-center gap-3">
      <Mark color={color} />
      <Wordmark className={cls} />
    </span>
  );
}

// The chunky down-right arrow from the brand cover — used as a directional motif.
export function ArrowDR({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M5 3 L9.5 3 L9.5 13.6 L17 6.1 L21 10.1 L13.5 17.6 L21 17.6 L21 21 L3 21 L3 4 L5 4 Z" />
    </svg>
  );
}
