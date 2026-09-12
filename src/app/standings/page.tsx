"use client";
import { useEffect, useState } from "react";
import { api, getActing } from "@/lib/client";
import { Page, Eyebrow, Heading } from "@/components/ui";

export default function Standings() {
  const [rows, setRows] = useState<any[]>([]);
  const [mine, setMine] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const a = getActing(); setMine(a?.id || "");
    if (!a?.leagueId) { setLoaded(true); return; }
    api(`/api/standings?leagueId=${a.leagueId}`).then((res) => { if (res.ok) setRows(res.standings); setLoaded(true); });
  }, []);

  const noResults = loaded && rows.length > 0 && rows.every((r) => r.wins + r.losses + r.ties === 0);

  return (
    <Page width="max-w-3xl">
      <Eyebrow tone="sky">W-L-T · tiebreak season points</Eyebrow>
      <Heading className="mt-4">Standings</Heading>
      <p className="mt-3 text-sm text-sky/60">Derived from final matchups only.</p>

      <div className="mt-8 overflow-hidden rounded-brand border border-white/10 bg-white/[0.025]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/50">
              <th className="px-5 py-4 font-medium">#</th>
              <th className="px-5 py-4 font-medium">Player</th>
              <th className="px-3 py-4 text-center font-medium">W</th>
              <th className="px-3 py-4 text-center font-medium">L</th>
              <th className="px-3 py-4 text-center font-medium">T</th>
              <th className="px-5 py-4 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const you = r.id === mine;
              return (
                <tr key={r.id} className={`border-b border-white/8 last:border-0 ${you ? "bg-cyan/[0.07]" : ""}`}>
                  <td className="px-5 py-4 font-body text-sm text-sky/40">{i + 1}</td>
                  <td className="px-5 py-4">
                    <span className="font-heading text-2xl leading-none">{r.name}</span>
                    {you && <span className="ml-3 rounded border border-cyan/40 px-2 py-0.5 font-body text-[10px] uppercase tracking-eyebrow text-cyan">you</span>}
                  </td>
                  <td className="px-3 py-4 text-center font-body tabular-nums">{r.wins}</td>
                  <td className="px-3 py-4 text-center font-body tabular-nums">{r.losses}</td>
                  <td className="px-3 py-4 text-center font-body tabular-nums">{r.ties}</td>
                  <td className="px-5 py-4 text-right font-heading text-2xl tabular-nums">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loaded && rows.length === 0 && <p className="mt-6 text-sky/50">No standings yet. Seed a league first.</p>}
      {noResults && <p className="mt-5 text-sm text-sky/50">All zeros until a week is closed. Close Week 1 on the Scoreboard.</p>}
    </Page>
  );
}
