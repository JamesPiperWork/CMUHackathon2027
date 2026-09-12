"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setActing } from "@/lib/client";
import { Page, Eyebrow, Heading, Lede, Button, Card, Rule } from "@/components/ui";
import { ArrowDR } from "@/components/Logo";
import { Anchor, Buoy, Lifebuoy, Bathymetry, CompassRose } from "@/components/icons";

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
    <Page width="max-w-6xl">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-brand border border-sky/10 bg-indigo/60 px-6 py-14 sm:px-12 sm:py-20">
        <Bathymetry className="absolute inset-0 h-full w-full text-sky/[0.07] [mask-image:linear-gradient(to_left,black_30%,transparent_75%)]" />
        <CompassRose className="absolute -bottom-16 -right-10 h-72 w-72 text-sky/[0.09] sm:h-96 sm:w-96" />
        <div className="relative">
          <Eyebrow>Consent-based training game</Eyebrow>
          <Heading size="xl" className="mt-6">
            Fantasy<br /><span className="italic text-cyan">Phishing</span>
          </Heading>
          <Lede className="mt-6">
            Eight friends. Ten weeks. One scheduled opponent at a time. Send a training-simulation
            lure; your opponent scores by spotting it first. Every link leads to a lesson.
          </Lede>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={seed} disabled={seeding} variant="primary">
              {seeding ? "Seeding…" : players.length ? "Re-seed demo league" : "Seed demo league"}
              <ArrowDR className="h-4 w-4" />
            </Button>
            {msg && <span className="font-body text-xs text-sky/60">{msg}</span>}
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow tone="sky">Step one</Eyebrow>
            <Heading as="h2" size="md" className="mt-3">Play as…</Heading>
          </div>
          <span className="hidden font-body text-xs text-sky/40 sm:block">Alice is the default for the demo</span>
        </div>
        <Rule className="my-6" />
        {loading ? (
          <p className="text-sky/50">Loading…</p>
        ) : players.length === 0 ? (
          <p className="text-sky/50">No league yet. Seed the demo league above.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className={`group rounded-brand border p-5 text-left transition hover:-translate-y-0.5 ${
                  p.name === "Alice" ? "border-cyan bg-cyan text-prussian" : "border-sky/10 bg-indigo/70 hover:border-cyan/60"
                }`}
              >
                <div className="font-heading text-3xl leading-none">{p.name}</div>
                <div className={`mt-2 truncate font-body text-xs ${p.name === "Alice" ? "text-prussian/70" : "text-sky/40"}`}>{p.email}</div>
                <div className={`mt-4 inline-flex items-center gap-1 font-body text-xs uppercase tracking-eyebrow ${p.name === "Alice" ? "text-prussian" : "text-cyan"}`}>
                  Enter <ArrowDR className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Guardrails */}
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        <Card tone="sky">
          <Anchor className="h-6 w-6 text-prussian" />
          <div className="mt-4 font-body text-[11px] font-medium uppercase tracking-eyebrow text-prussian/60">Closed loop</div>
          <p className="mt-2 font-heading text-2xl leading-tight">Only your scheduled opponent. Ever.</p>
          <p className="mt-2 text-sm text-prussian/70">The server resolves your target from the schedule. There is no address field anywhere.</p>
        </Card>
        <Card tone="mint">
          <Buoy className="h-6 w-6 text-prussian" />
          <div className="mt-4 font-body text-[11px] font-medium uppercase tracking-eyebrow text-prussian/60">Nothing leaves</div>
          <p className="mt-2 font-heading text-2xl leading-tight">Delivered to an in-app inbox.</p>
          <p className="mt-2 text-sm text-prussian/70">No mail service exists in this app. Training emails are read here, not in a real mailbox.</p>
        </Card>
        <Card tone="icterine">
          <Lifebuoy className="h-6 w-6 text-prussian" />
          <div className="mt-4 font-body text-[11px] font-medium uppercase tracking-eyebrow text-prussian/60">Every click teaches</div>
          <p className="mt-2 font-heading text-2xl leading-tight">Landing pages collect nothing.</p>
          <p className="mt-2 text-sm text-prussian/70">A click reveals the simulation and lists the red flags. No forms, no fields, no credentials.</p>
        </Card>
      </section>
    </Page>
  );
}
