import { NextResponse } from "next/server";
import { getLeague, getRoster, getWeekMatchups, liveWeekScores, pub } from "@/lib/league";

export const dynamic = "force-dynamic";

// The 4 pairings for a week, each with LIVE derived scores (or the snapshot if final).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const leagueId = sp.get("leagueId");
  if (!leagueId) return NextResponse.json({ ok: false, error: "leagueId required" }, { status: 400 });
  const league = getLeague(leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });

  const week = sp.get("week") ? Number(sp.get("week")) : league.currentWeek;
  const nameById: Record<string, string> = {};
  for (const p of getRoster(league._id)) nameById[p._id] = p.name;
  const live = liveWeekScores(league._id, week);

  const matchups = getWeekMatchups(league._id, week).map((m) => {
    const isFinal = m.status === "final";
    return {
      id: m._id,
      week: m.week,
      status: m.status,
      homeId: m.homeId,
      awayId: m.awayId,
      homeName: nameById[m.homeId],
      awayName: nameById[m.awayId],
      homeScore: isFinal ? m.homeScore : live[m.homeId] || 0,
      awayScore: isFinal ? m.awayScore : live[m.awayId] || 0,
      winnerId: m.winnerId,
    };
  });

  return NextResponse.json({ ok: true, league: pub(league), week, currentWeek: league.currentWeek, matchups });
}
