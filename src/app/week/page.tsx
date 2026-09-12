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
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Live · updates every 2s</Eyebrow>
          <Heading className="mt-3">Scoreboard <span className="text-sky/35">· Week {data?.week ?? "…"}</span></Heading>
        </div>
        <Button onClick={closeWeek} disabled={closing} variant="outline">{closing ? "Closing…" : "Close week & advance"}</Button>
      </div>
      {msg && <div className="mt-5"><Notice tone="cyan">{msg}</Notice></div>}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {matchups.map((m: any) => {
          const isMine = m.homeId === mine || m.awayId === mine;
          const final = m.status === "final";
          return (
            <div key={m.id} className={`rounded-brand border p-5 ${isMine ? "border-cyan/50 bg-cyan/[0.06]" : "border-white/10 bg-white/[0.025]"}`}>
              <div className="flex items-center justify-between font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/40">
                <span>{isMine ? "Your matchup" : "Matchup"}</span>
                <span className={final ? "text-sky/60" : "text-cyan"}>{final ? "Final" : "Live"}</span>
              </div>
              <div className="mt-4 space-y-3">
                <Row name={m.homeName} score={m.homeScore} win={final && m.winnerId === m.homeId} you={m.homeId === mine} />
                <div className="border-t border-white/10" />
                <Row name={m.awayName} score={m.awayScore} win={final && m.winnerId === m.awayId} you={m.awayId === mine} />
              </div>
            </div>
          );
        })}
      </div>
      {matchups.length === 0 && <p className="mt-8 text-sky/50">No matchups. Seed the league on the home page.</p>}
    </Page>
  );
}

function Row({ name, score, win, you }: { name: string; score: number; win: boolean; you: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="font-heading text-2xl leading-none text-sky">{name}</span>
        {you && <span className="rounded border border-cyan/40 px-1.5 py-0.5 font-body text-[10px] uppercase tracking-eyebrow text-cyan">you</span>}
        {win && <span className="font-body text-[10px] uppercase tracking-eyebrow text-sky/50">Win</span>}
      </div>
      <span className="font-heading text-4xl leading-none tabular-nums text-sky">{score}</span>
    </div>
  );
}
