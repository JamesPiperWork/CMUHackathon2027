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
    <Page width="max-w-4xl">
      <Eyebrow tone="icterine">Season 1 · through week {week ? week - 1 : "—"}</Eyebrow>
      <Heading size="xl" className="mt-4">Wrapped</Heading>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card tone="cyan">
          <Label dark>League leader</Label>
          <div className="mt-3 font-heading text-6xl leading-none">{leader?.name ?? "—"}</div>
          <div className="mt-2 font-body text-sm text-prussian/70">{leader ? `${leader.wins}-${leader.losses}-${leader.ties} · ${leader.points} pts` : ""}</div>
        </Card>
        <Card>
          <Label>Your record</Label>
          <div className="mt-3 font-heading text-6xl leading-none">{me ? `${me.wins}-${me.losses}-${me.ties}` : "—"}</div>
          <div className="mt-2 font-body text-sm text-sky/60">{me ? `${me.points} season points` : ""}</div>
        </Card>
        <Card tone="payne">
          <Label>Points scored league-wide</Label>
          <div className="mt-3 font-heading text-6xl leading-none">{totalPts}</div>
          <div className="mt-2 font-body text-sm text-sky/60">offense + defense, all final weeks</div>
        </Card>
        <Card tone="fawn">
          <Label dark>Playoffs</Label>
          <div className="mt-3 font-heading text-6xl leading-none">TODO</div>
          <div className="mt-2 font-body text-sm text-prussian/70">Arcade postseason after week 10 · stub by design</div>
        </Card>
      </div>
      <p className="mt-8 font-body text-xs text-sky/40">Derived from final matchups only. Time-decay bonus is a TODO stub (not implemented).</p>
    </Page>
  );
}

function Label({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={`font-body text-[11px] font-medium uppercase tracking-eyebrow ${dark ? "text-prussian/60" : "text-sky/50"}`}>{children}</div>;
}
