"use client";
import { useEffect, useRef, useState } from "react";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Button, Notice } from "@/components/ui";

export default function Week() {
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [data, setData] = useState<any>(null);
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<any>(null);

  useEffect(() => {
    const a = getActing(); setActing(a);
    const leagueId = a?.leagueId;
    async function tick() { if (!leagueId) return; const res = await api(`/api/matchups?leagueId=${leagueId}`); if (res.ok) setData(res); }
    tick();
    timer.current = setInterval(tick, 2000); // live poll every 2s, no websockets
    return () => clearInterval(timer.current);
  }, []);

  async function closeWeek() {
    if (!acting?.leagueId) return;
    setClosing(true); setMsg("");
    const res = await api(`/api/week/close?leagueId=${acting.leagueId}`, { method: "POST" });
    setClosing(false);
    setMsg(res.ok ? `Closed week ${res.closedWeek}. Now on week ${res.currentWeek}.` : res.error);
  }

  const mine = acting?.id;
  const matchups = data?.matchups || [];

  return (
    <Page width="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" /> Live · polling every 2s
          </Eyebrow>
          <Heading className="mt-4">Scoreboard <span className="italic text-sky/40">Week {data?.week ?? "…"}</span></Heading>
        </div>
        <Button onClick={closeWeek} disabled={closing} variant="outline">{closing ? "Closing…" : "Close week & advance"}</Button>
      </div>
      {msg && <div className="mt-5"><Notice tone="icterine">{msg}</Notice></div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {matchups.map((m: any) => {
          const isMine = m.homeId === mine || m.awayId === mine;
          const final = m.status === "final";
          return (
            <div key={m.id} className={`rounded-brand border p-6 ${isMine ? "border-cyan bg-cyan text-prussian" : "border-sky/10 bg-indigo/70 text-sky"}`}>
              <div className={`flex items-center justify-between font-body text-[11px] font-medium uppercase tracking-eyebrow ${isMine ? "text-prussian/60" : "text-sky/40"}`}>
                <span>{isMine ? "Your matchup" : "Matchup"}</span>
                <span className={final ? (isMine ? "text-prussian" : "text-icterine") : ""}>{final ? "Final" : "Live"}</span>
              </div>
              <div className="mt-5 space-y-3">
                <Row name={m.homeName} score={m.homeScore} win={final && m.winnerId === m.homeId} you={m.homeId === mine} mine={isMine} />
                <div className={`border-t ${isMine ? "border-prussian/15" : "border-sky/10"}`} />
                <Row name={m.awayName} score={m.awayScore} win={final && m.winnerId === m.awayId} you={m.awayId === mine} mine={isMine} />
              </div>
            </div>
          );
        })}
      </div>
      {matchups.length === 0 && <p className="mt-8 text-sky/50">No matchups. Seed the league on the home page.</p>}
    </Page>
  );
}

function Row({ name, score, win, you, mine }: { name: string; score: number; win: boolean; you: boolean; mine: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-heading text-3xl leading-none">{name}</span>
        {you && <span className={`rounded-full border px-2 py-0.5 font-body text-[10px] uppercase tracking-eyebrow ${mine ? "border-prussian/30" : "border-cyan text-cyan"}`}>you</span>}
        {win && <span className={`font-body text-[10px] uppercase tracking-eyebrow ${mine ? "text-prussian/70" : "text-icterine"}`}>Win</span>}
      </div>
      <span className="font-heading text-5xl leading-none tabular-nums">{score}</span>
    </div>
  );
}
