import { NextResponse } from "next/server";
import { getLeague, getWeekMatchups, liveWeekScores } from "@/lib/league";

export const dynamic = "force-dynamic";

// Finalize the current week: snapshot derived scores onto each matchup, decide W/L/T,
// then advance currentWeek.
export async function POST(req: Request) {
  const leagueId = new URL(req.url).searchParams.get("leagueId");
  if (!leagueId) return NextResponse.json({ ok: false, error: "leagueId required" }, { status: 400 });
  const league = getLeague(leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });

  const week = league.currentWeek;
  const scores = liveWeekScores(league._id, week);
  const results = [];
  for (const m of getWeekMatchups(league._id, week)) {
    const homeScore = scores[m.homeId] || 0;
    const awayScore = scores[m.awayId] || 0;
    m.homeScore = homeScore;
    m.awayScore = awayScore;
    m.winnerId = homeScore > awayScore ? m.homeId : awayScore > homeScore ? m.awayId : null; // null => tie
    m.status = "final";
    results.push({ id: m._id, homeScore, awayScore, winnerId: m.winnerId });
  }
  league.currentWeek = week + 1;
  return NextResponse.json({ ok: true, closedWeek: week, currentWeek: league.currentWeek, results });
}
