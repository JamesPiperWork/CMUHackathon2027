"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setActing } from "@/lib/client";
import { Page, Eyebrow, Heading, Lede, Button, Rule } from "@/components/ui";
import { Anchor, Buoy, Lifebuoy } from "@/components/icons";

interface Player { id: string; name: string; email: string; leagueId: string; }

export default function Home() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const res = await api("/api/league");
    if (res.ok) { setPlayers(res.players); setLeagueId(res.league.id); } else setPlayers([]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    setSeeding(true); setMsg("");
    const res = await api("/api/seed", { method: "POST" });
    setSeeding(false);
    if (res.ok) { setMsg(`${res.assertion}. Week 1: Alice v Bob.`); await load(); }
    else setMsg(res.error || "seed failed");
  }

  function pick(p: Player) {
    setActing({ id: p.id, name: p.name, leagueId: p.leagueId || leagueId });
    router.push("/play");
  }

  return (
    <Page width="max-w-5xl">
      {/* Hero */}
      <section className="max-w-2xl">
        <Eyebrow tone="cyan">Consent-based training game</Eyebrow>
        <Heading size="xl" className="mt-4">Fantasy Phishing</Heading>
        <Lede className="mt-5">
          Eight friends, ten weeks, one scheduled opponent at a time. Send a training-simulation
          lure; your opponent scores by spotting it first. Every link leads to a lesson.
        </Lede>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Button onClick={seed} disabled={seeding}>
            {seeding ? "Seeding…" : players.length ? "Re-seed demo league" : "Seed demo league"}
          </Button>
          {msg && <span className="font-body text-xs text-sky/50">{msg}</span>}
        </div>
      </section>

      {/* Roster */}
      <section className="mt-16">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow>Play as</Eyebrow>
          <span className="font-body text-xs text-sky/40">Alice is the demo default</span>
        </div>
        <Rule className="mt-4" />
        {loading ? (
          <p className="mt-6 text-sky/50">Loading…</p>
        ) : players.length === 0 ? (
          <p className="mt-6 text-sky/50">No league yet. Seed the demo league above.</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className={`surface p-4 text-left transition hover:border-white/25 ${p.name === "Alice" ? "ring-1 ring-cyan/50" : ""}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-heading text-2xl leading-none text-sky">{p.name}</span>
                  {p.name === "Alice" && <span className="font-body text-[10px] uppercase tracking-eyebrow text-cyan">default</span>}
                </div>
                <div className="mt-2 truncate font-body text-xs text-sky/40">{p.email}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Guardrails */}
      <section className="mt-16">
        <Eyebrow>How it stays safe</Eyebrow>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Guardrail icon={<Anchor className="h-5 w-5" />} title="Closed loop">
            Your target is always the scheduled opponent, resolved server-side. There is no address field anywhere.
          </Guardrail>
          <Guardrail icon={<Buoy className="h-5 w-5" />} title="Nothing leaves">
            No mail service exists in this app. Training emails are read in-app, never in a real mailbox.
          </Guardrail>
          <Guardrail icon={<Lifebuoy className="h-5 w-5" />} title="Every click teaches">
            A click reveals the simulation and its red flags. No forms, no fields, nothing collected.
          </Guardrail>
        </div>
      </section>
    </Page>
  );
}

function Guardrail({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-5">
      <span className="text-cyan">{icon}</span>
      <div className="mt-3 font-heading text-lg text-sky">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-sky/55">{children}</p>
    </div>
  );
}
