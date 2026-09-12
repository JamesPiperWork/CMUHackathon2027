"use client";
import { useEffect, useRef, useState } from "react";
import { api, getActing, type ActingPlayer } from "@/lib/client";

export default function Week() {
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [data, setData] = useState<any>(null);
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<any>(null);

  useEffect(() => {
    const a = getActing();
    setActing(a);
    const leagueId = a?.leagueId;
    async function tick() {
      if (!leagueId) return;
      const res = await api(`/api/matchups?leagueId=${leagueId}`);
      if (res.ok) setData(res);
    }
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
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Scoreboard <span className="text-chalk/50">· Week {data?.week ?? "…"}</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-neon">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neon" /> live · 2s
          </span>
          <button onClick={closeWeek} disabled={closing} className="rounded-lg border border-chalk/20 px-3 py-1.5 text-sm text-chalk/80 disabled:opacity-50">
            {closing ? "Closing…" : "Close week & advance"}
          </button>
        </div>
      </div>
      {msg && <div className="mt-2 text-sm text-flag">{msg}</div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {matchups.map((m: any) => {
          const isMine = m.homeId === mine || m.awayId === mine;
          const homeWin = m.status === "final" && m.winnerId === m.homeId;
          const awayWin = m.status === "final" && m.winnerId === m.awayId;
          return (
            <div key={m.id} className={`rounded-2xl border p-5 ${isMine ? "border-neon bg-neon/10 shadow-lg shadow-neon/10" : "border-chalk/10 bg-pitch/50"}`}>
              <div className="mb-3 flex justify-between text-xs uppercase tracking-wide text-chalk/40">
                <span>{isMine ? "Your matchup" : "Matchup"}</span>
                <span className={m.status === "final" ? "text-flag" : "text-neon"}>{m.status}</span>
              </div>
              <Row name={m.homeName} score={m.homeScore} win={homeWin} you={m.homeId === mine} />
              <div className="my-1 border-t border-chalk/10" />
              <Row name={m.awayName} score={m.awayScore} win={awayWin} you={m.awayId === mine} />
            </div>
          );
        })}
      </div>

      {matchups.length === 0 && <p className="mt-8 text-chalk/50">No matchups. Seed the league on the home page.</p>}
    </main>
  );
}

function Row({ name, score, win, you }: { name: string; score: number; win: boolean; you: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${you ? "text-neon" : ""}`}>{name}</span>
        {win && <span className="text-xs text-flag">W</span>}
        {you && <span className="rounded bg-neon/20 px-1.5 text-[10px] text-neon">you</span>}
      </div>
      <span className="text-2xl font-black tabular-nums">{score}</span>
    </div>
  );
}
