"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setActing } from "@/lib/client";

interface Player { id: string; name: string; email: string; leagueId: string; }

export default function Home() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueId, setLeagueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setLoading(true);
    const res = await api("/api/league");
    if (res.ok) {
      setPlayers(res.players);
      setLeagueId(res.league.id);
    } else {
      setPlayers([]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    setSeeding(true);
    setMsg("");
    const res = await api("/api/seed", { method: "POST" });
    setSeeding(false);
    if (res.ok) {
      setMsg(`Seeded. ${res.assertion} · Week-1 Alice v Bob: ${res.week1AliceVsBob}`);
      await load();
    } else {
      setMsg(res.error || "seed failed");
    }
  }

  function pick(p: Player) {
    setActing({ id: p.id, name: p.name, leagueId: p.leagueId || leagueId });
    router.push("/play");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-chalk/10 bg-turf/30 p-6">
        <h1 className="text-3xl font-bold">Fantasy Phishing</h1>
        <p className="mt-2 text-chalk/70">
          A closed-league, consent-based phishing-<span className="text-neon">awareness</span> training
          game. 8 friends, 10 weeks, head-to-head. You send training-simulation lures to your
          scheduled opponent; they score points by spotting them. Every link leads to a teaching page.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={seed}
            disabled={seeding}
            className="rounded-lg bg-flag px-4 py-2 font-semibold text-pitch disabled:opacity-50"
          >
            {seeding ? "Seeding…" : players.length ? "Re-seed demo league" : "Seed demo league"}
          </button>
          {msg && <span className="text-sm text-chalk/70">{msg}</span>}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Play as…</h2>
        {loading ? (
          <p className="text-chalk/50">Loading…</p>
        ) : players.length === 0 ? (
          <p className="text-chalk/50">No league yet. Seed the demo league above.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className={`rounded-xl border p-4 text-left transition hover:border-neon ${
                  p.name === "Alice" ? "border-neon/50 bg-neon/10" : "border-chalk/10 bg-pitch/50"
                }`}
              >
                <div className="text-lg font-semibold">{p.name}</div>
                <div className="truncate text-xs text-chalk/50">{p.email}</div>
                {p.name === "Alice" && <div className="mt-1 text-xs text-neon">default</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-10 text-xs text-chalk/40">
        Defensive / educational tool. Training emails are delivered to an in-app Inbox only — nothing
        is ever sent to a real mailbox. Targets are always your own scheduled leaguemate; there is no
        free-text recipient anywhere. Landing pages collect nothing.
      </p>
    </main>
  );
}
