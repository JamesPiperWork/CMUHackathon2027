import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Restrained primitives: serif headings, one cyan accent, neutral surfaces, hairline
// borders, generous whitespace. Color is used sparingly and deliberately.

export function Page({ children, width = "max-w-5xl" }: { children: ReactNode; width?: string }) {
  return <main className={`mx-auto ${width} px-5 pb-24 pt-12 sm:pt-16`}>{children}</main>;
}

const EYEBROW: Record<string, string> = {
  cyan: "text-cyan",
  sky: "text-sky/50",
  icterine: "text-icterine/90",
  fawn: "text-fawn/90",
  mint: "text-mint/90",
};
export function Eyebrow({ children, tone = "sky", className = "" }: { children: ReactNode; tone?: keyof typeof EYEBROW; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-eyebrow ${EYEBROW[tone]} ${className}`}>
      {children}
    </span>
  );
}

const SIZES = {
  xl: "text-4xl sm:text-5xl",
  lg: "text-3xl sm:text-4xl",
  md: "text-2xl sm:text-3xl",
  sm: "text-xl sm:text-2xl",
};
export function Heading({ children, as: Tag = "h1", size = "lg", className = "" }: { children: ReactNode; as?: "h1" | "h2" | "h3"; size?: keyof typeof SIZES; className?: string }) {
  return <Tag className={`font-heading font-normal leading-[1.08] tracking-[-0.01em] text-sky ${SIZES[size]} ${className}`}>{children}</Tag>;
}

export function Lede({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-2xl text-[15px] leading-relaxed text-sky/60 ${className}`}>{children}</p>;
}

// Surfaces default to a neutral panel. Filled tones exist for the rare deliberate accent.
const CARD: Record<string, string> = {
  neutral: "border-white/10 bg-white/[0.025] text-sky",
  indigo: "border-white/10 bg-white/[0.025] text-sky",
  payne: "border-white/10 bg-white/[0.04] text-sky",
  prussian: "border-white/10 bg-black/20 text-sky",
  sky: "border-transparent bg-sky text-prussian",
  cyan: "border-transparent bg-cyan text-prussian",
  mint: "border-transparent bg-mint text-prussian",
  icterine: "border-transparent bg-icterine text-prussian",
  fawn: "border-transparent bg-fawn text-prussian",
};
export function Card({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: keyof typeof CARD; className?: string }) {
  return <div className={`rounded-brand border p-6 ${CARD[tone]} ${className}`}>{children}</div>;
}

const BTN: Record<string, string> = {
  primary: "bg-cyan text-prussian hover:bg-cyan/90",
  accent: "bg-cyan text-prussian hover:bg-cyan/90",
  warm: "border border-fawn/50 text-fawn hover:bg-fawn/10",
  sky: "bg-white/10 text-sky hover:bg-white/15",
  outline: "border border-white/20 text-sky hover:border-white/40",
  ghost: "text-sky/60 hover:text-sky",
};
const BTN_BASE = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-body text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return <button className={`${BTN_BASE} ${BTN[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({ href, variant = "primary", className = "", disabled, children }: { href: string; variant?: keyof typeof BTN; className?: string; disabled?: boolean; children: ReactNode }) {
  if (disabled) return <span aria-disabled className={`${BTN_BASE} ${BTN[variant]} cursor-not-allowed opacity-40 ${className}`}>{children}</span>;
  return <Link href={href} className={`${BTN_BASE} ${BTN[variant]} ${className}`}>{children}</Link>;
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`hairline border-t ${className}`} />;
}

export function Notice({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "fawn" | "icterine" | "mint" }) {
  const cls = { cyan: "border-cyan/30 bg-cyan/[0.07] text-cyan", fawn: "border-fawn/40 bg-fawn/[0.07] text-fawn", icterine: "border-icterine/40 bg-icterine/[0.07] text-icterine", mint: "border-mint/40 bg-mint/[0.07] text-mint" }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone = "sky" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "sky" | "cyan" | "icterine" }) {
  const v = { sky: "text-sky", cyan: "text-cyan", icterine: "text-icterine" }[tone];
  return (
    <div>
      <div className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/45">{label}</div>
      <div className={`mt-1.5 font-heading text-3xl leading-none ${v}`}>{value}</div>
      {sub && <div className="mt-1.5 text-sm text-sky/55">{sub}</div>}
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/55">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input mt-2" />
      {hint && <span className="mt-1.5 block text-xs text-sky/40">{hint}</span>}
    </label>
  );
}
