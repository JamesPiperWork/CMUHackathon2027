import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Brand primitives. Typography: Argent CF (serif) for headings, Almarena (grotesk) for
// body and CTAs. Shapes: 24px-radius cards, pill labels/buttons, hairline rules.

export function Page({ children, width = "max-w-5xl" }: { children: ReactNode; width?: string }) {
  return <main className={`mx-auto ${width} px-5 pb-20 pt-10 sm:pt-14`}>{children}</main>;
}

const EYEBROW: Record<string, string> = {
  cyan: "border-cyan/50 text-cyan",
  sky: "border-sky/40 text-sky/80",
  icterine: "border-icterine/60 text-icterine",
  fawn: "border-fawn/60 text-fawn",
  mint: "border-mint/60 text-mint",
};
export function Eyebrow({ children, tone = "cyan", className = "" }: { children: ReactNode; tone?: keyof typeof EYEBROW; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-body text-[11px] font-medium uppercase tracking-eyebrow ${EYEBROW[tone]} ${className}`}>
      {children}
    </span>
  );
}

const SIZES = {
  xl: "text-6xl sm:text-8xl",
  lg: "text-5xl sm:text-6xl",
  md: "text-3xl sm:text-4xl",
  sm: "text-2xl sm:text-3xl",
};
export function Heading({ children, as: Tag = "h1", size = "lg", className = "" }: { children: ReactNode; as?: "h1" | "h2" | "h3"; size?: keyof typeof SIZES; className?: string }) {
  return <Tag className={`font-heading font-normal leading-[0.95] tracking-[-0.01em] text-sky ${SIZES[size]} ${className}`}>{children}</Tag>;
}

export function Lede({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-2xl text-base leading-relaxed text-sky/70 sm:text-lg ${className}`}>{children}</p>;
}

const CARD: Record<string, string> = {
  indigo: "border-sky/10 bg-indigo/70 text-sky",
  payne: "border-sky/10 bg-payne/40 text-sky",
  prussian: "border-sky/10 bg-prussian/70 text-sky",
  sky: "border-sky bg-sky text-prussian",
  cyan: "border-cyan bg-cyan text-prussian",
  mint: "border-mint bg-mint text-prussian",
  icterine: "border-icterine bg-icterine text-prussian",
  fawn: "border-fawn bg-fawn text-prussian",
};
export function Card({ children, tone = "indigo", className = "" }: { children: ReactNode; tone?: keyof typeof CARD; className?: string }) {
  return <div className={`rounded-brand border p-6 ${CARD[tone]} ${className}`}>{children}</div>;
}

const BTN: Record<string, string> = {
  primary: "bg-cyan text-prussian hover:bg-mint",
  accent: "bg-icterine text-prussian hover:brightness-95",
  warm: "bg-fawn text-prussian hover:brightness-95",
  sky: "bg-sky text-prussian hover:bg-mint",
  outline: "border border-sky/40 text-sky hover:border-cyan hover:text-cyan",
  ghost: "text-sky/70 hover:text-sky",
};
const BTN_BASE = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-body text-sm font-medium tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100";

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
  const cls = { cyan: "border-cyan/40 bg-cyan/10 text-cyan", fawn: "border-fawn/50 bg-fawn/10 text-fawn", icterine: "border-icterine/50 bg-icterine/10 text-icterine", mint: "border-mint/50 bg-mint/10 text-mint" }[tone];
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone = "sky" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "sky" | "cyan" | "icterine" }) {
  const v = { sky: "text-sky", cyan: "text-cyan", icterine: "text-icterine" }[tone];
  return (
    <div>
      <div className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/50">{label}</div>
      <div className={`mt-1 font-heading text-4xl leading-none ${v}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-sky/60">{sub}</div>}
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/60">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input mt-2" />
      {hint && <span className="mt-1 block text-xs text-sky/40">{hint}</span>}
    </label>
  );
}
