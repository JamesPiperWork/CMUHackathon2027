// Fantasy Phishing mark: a fish hook whose upper form reads as an "F" — the vertical
// shank is the F's stem, two arms make the F, and the shank curves into a barbed hook.
// Monoline, same stroke language as the rest of the iconography. Cyan on dark, Prussian
// on light. Never rotated or stretched.
export function Mark({ className = "h-7 w-auto", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 30 34" className={className} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* F stem = hook shank */}
      <path d="M10 4.5 V22" />
      {/* F top arm */}
      <path d="M10 5 H21.5" />
      {/* F middle arm */}
      <path d="M10 14 H17.5" />
      {/* hook bend + upward point */}
      <path d="M10 22 C10 29.5 19.5 29.5 19.5 21.5 V19" />
      {/* barb */}
      <path d="M19.5 19 L16.8 21.6" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-heading text-lg leading-none ${className}`}>
      Fantasy <span className="italic">Phishing</span>
    </span>
  );
}

const LOGO_TONES = { sky: ["#F2FDFF", "text-sky"], cyan: ["#3FE4E4", "text-cyan"], prussian: ["#0A2536", "text-prussian"] } as const;
export function Logo({ tone = "sky" }: { tone?: keyof typeof LOGO_TONES }) {
  const [color, cls] = LOGO_TONES[tone];
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark color={color} />
      <Wordmark className={cls} />
    </span>
  );
}

// The chunky down-right arrow motif.
export function ArrowDR({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M5 3 L9.5 3 L9.5 13.6 L17 6.1 L21 10.1 L13.5 17.6 L21 17.6 L21 21 L3 21 L3 4 L5 4 Z" />
    </svg>
  );
}
