"use client";
import { useEffect, useState } from "react";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Card } from "@/components/ui";

// Season "Wrapped" — a lightweight summary derived from standings. Playoffs / arcade
// postseason and time-decay bonus are TODO stubs by design (not implemented).
export default function Wrapped() {
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    const a = getActing(); setActing(a);
    if (!a?.leagueId) return;
    api(`/api/standings?leagueId=${a.leagueId}`).then((r) => r.ok && setRows(r.standings));
    api(`/api/state?playerId=${a.id}`).then((r) => r.ok && setWeek(r.week));
  }, []);

  const me = rows.find((r) => r.id === acting?.id);
  const leader = rows[0];
  const totalPts = rows.reduce((s, r) => s + r.points, 0);

  return (
    <Page width="max-w-3xl">
      <Eyebrow>Season 1 · through week {week ? week - 1 : "—"}</Eyebrow>
      <Heading size="xl" className="mt-3">Wrapped</Heading>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Metric label="League leader" value={leader?.name ?? "—"} sub={leader ? `${leader.wins}-${leader.losses}-${leader.ties} · ${leader.points} pts` : ""} accent />
        <Metric label="Your record" value={me ? `${me.wins}-${me.losses}-${me.ties}` : "—"} sub={me ? `${me.points} season points` : ""} />
        <Metric label="Points league-wide" value={String(totalPts)} sub="offense + defense, all final weeks" />
        <Metric label="Playoffs" value="TODO" sub="Arcade postseason after week 10 · stub by design" />
      </div>
      <p className="mt-6 font-body text-xs text-sky/40">Derived from final matchups only. Time-decay bonus is a TODO stub (not implemented).</p>
    </Page>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card>
      <div className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/45">{label}</div>
      <div className={`mt-2 font-heading text-4xl leading-none ${accent ? "text-cyan" : "text-sky"}`}>{value}</div>
      <div className="mt-1.5 font-body text-sm text-sky/55">{sub}</div>
    </Card>
  );
}
