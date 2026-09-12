"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getActing, type ActingPlayer } from "@/lib/client";

const LINKS = [
  { href: "/play", label: "My Week" },
  { href: "/week", label: "Scoreboard" },
  { href: "/standings", label: "Standings" },
  { href: "/inbox", label: "Inbox" },
  { href: "/wrapped", label: "Wrapped" },
];

export default function Nav() {
  const path = usePathname();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  useEffect(() => setActing(getActing()), [path]);

  return (
    <header className="sticky top-0 z-20 border-b border-chalk/10 bg-pitch/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-xl">🏈</span>
          <span>Fantasy <span className="text-neon">Phishing</span></span>
        </Link>
        <nav className="hidden gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                path === l.href ? "bg-neon/20 text-neon" : "text-chalk/70 hover:text-chalk"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="text-sm">
          {acting ? (
            <Link href="/" className="rounded-full bg-turf px-3 py-1 text-chalk/90">
              Playing as <span className="font-semibold text-neon">{acting.name}</span>
            </Link>
          ) : (
            <Link href="/" className="text-chalk/60">
              Pick player
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
