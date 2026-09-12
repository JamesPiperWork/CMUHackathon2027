"use client";
import { useEffect, useState } from "react";
import { api, getActing } from "@/lib/client";

export default function Standings() {
  const [rows, setRows] = useState<any[]>([]);
  const [mine, setMine] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const a = getActing();
    setMine(a?.id || "");
    if (!a?.leagueId) { setLoaded(true); return; }
    api(`/api/standings?leagueId=${a.leagueId}`).then((res) => {
      if (res.ok) setRows(res.standings);
      setLoaded(true);
    });
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Standings</h1>
      <p className="mt-1 text-sm text-chalk/50">Derived from final matchups · W-L-T, tiebreak = total season points.</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-chalk/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-turf/40 text-chalk/60">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 text-center">W</th>
              <th className="px-4 py-3 text-center">L</th>
              <th className="px-4 py-3 text-center">T</th>
              <th className="px-4 py-3 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-t border-chalk/10 ${r.id === mine ? "bg-neon/10" : ""}`}>
                <td className="px-4 py-3 text-chalk/40">{i + 1}</td>
                <td className="px-4 py-3 font-semibold">{r.name}{r.id === mine && <span className="ml-2 rounded bg-neon/20 px-1.5 text-[10px] text-neon">you</span>}</td>
                <td className="px-4 py-3 text-center">{r.wins}</td>
                <td className="px-4 py-3 text-center">{r.losses}</td>
                <td className="px-4 py-3 text-center">{r.ties}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loaded && rows.length === 0 && <p className="mt-6 text-chalk/50">No standings yet. Seed a league first.</p>}
      {loaded && rows.length > 0 && rows.every((r) => r.wins + r.losses + r.ties === 0) && (
        <p className="mt-4 text-sm text-chalk/50">All zeros until a week is closed. Close Week 1 on the Scoreboard.</p>
      )}
    </main>
  );
}
