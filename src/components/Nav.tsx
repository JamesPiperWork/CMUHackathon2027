"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getActing, type ActingPlayer } from "@/lib/client";
import { Mark } from "./Logo";

const LINKS = [
  { href: "/play", label: "My Week" },
  { href: "/inbox", label: "Inbox" },
  { href: "/week", label: "Scoreboard" },
  { href: "/standings", label: "Standings" },
  { href: "/wrapped", label: "Wrapped" },
];

export default function Nav() {
  const path = usePathname();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  useEffect(() => setActing(getActing()), [path]);

  return (
    <header className="sticky top-0 z-20 border-b border-sky/10 bg-prussian/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Mark className="h-6 w-auto" color="#3FE4E4" />
          <span className="font-heading text-xl leading-none text-sky">
            Fantasy <span className="italic text-cyan">Phishing</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 font-body text-sm transition ${
                path === l.href ? "bg-sky/10 text-cyan" : "text-sky/60 hover:text-sky"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-sky/20 px-3 py-1.5 font-body text-xs text-sky/80 transition hover:border-cyan"
        >
          {acting ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
              <span className="uppercase tracking-eyebrow">{acting.name}</span>
            </>
          ) : (
            <span className="uppercase tracking-eyebrow">Pick player</span>
          )}
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`whitespace-nowrap rounded-full px-3 py-1 font-body text-xs ${path === l.href ? "bg-sky/10 text-cyan" : "text-sky/60"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
