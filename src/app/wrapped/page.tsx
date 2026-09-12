"use client";
import { useEffect, useState } from "react";
import { api, getActing, type ActingPlayer } from "@/lib/client";

// Season "Wrapped" — a lightweight summary derived from standings. Playoffs / arcade
// postseason and time-decay bonus are TODO stubs by design (not implemented).
export default function Wrapped() {
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    const a = getActing();
    setActing(a);
    if (!a?.leagueId) return;
    api(`/api/standings?leagueId=${a.leagueId}`).then((r) => r.ok && setRows(r.standings));
    api(`/api/state?playerId=${a.id}`).then((r) => r.ok && setWeek(r.week));
  }, []);

  const me = rows.find((r) => r.id === acting?.id);
  const leader = rows[0];
  const totalPts = rows.reduce((s, r) => s + r.points, 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold">Season Wrapped 🎁</h1>
      <p className="mt-1 text-sm text-chalk/50">Season 1 · through week {week ? week - 1 : "—"}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card title="League leader" big={leader?.name ?? "—"} sub={leader ? `${leader.wins}-${leader.losses}-${leader.ties} · ${leader.points} pts` : ""} />
        <Card title="Your record" big={me ? `${me.wins}-${me.losses}-${me.ties}` : "—"} sub={me ? `${me.points} season points` : ""} />
        <Card title="Points scored league-wide" big={String(totalPts)} sub="offense + defense, all final weeks" />
        <Card title="Playoffs" big="TODO" sub="Arcade postseason after week 10 — stub only, by design." />
      </div>

      <p className="mt-8 text-xs text-chalk/40">
        Wrapped is derived from final matchups only. Time-decay bonus is a TODO stub (not implemented).
      </p>
    </main>
  );
}

function Card({ title, big, sub }: { title: string; big: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-chalk/10 bg-turf/30 p-5">
      <div className="text-xs uppercase tracking-wide text-chalk/50">{title}</div>
      <div className="mt-2 text-2xl font-black text-neon">{big}</div>
      <div className="mt-1 text-sm text-chalk/60">{sub}</div>
    </div>
  );
}
