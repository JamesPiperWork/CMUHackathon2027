import { NextResponse } from "next/server";
import { db, getLeague, getRoster } from "@/lib/league";

export const dynamic = "force-dynamic";

// Standings derived from FINAL matchups: W-L-T + total season points, sorted by wins
// then by total points.
export async function GET(req: Request) {
  const leagueId = new URL(req.url).searchParams.get("leagueId");
  if (!leagueId) return NextResponse.json({ ok: false, error: "leagueId required" }, { status: 400 });
  const league = getLeague(leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });

  type Row = { id: string; name: string; wins: number; losses: number; ties: number; points: number };
  const rows: Record<string, Row> = {};
  for (const p of getRoster(league._id)) rows[p._id] = { id: p._id, name: p.name, wins: 0, losses: 0, ties: 0, points: 0 };

  for (const m of db().matchups.filter((x) => x.leagueId === league._id && x.status === "final")) {
    rows[m.homeId].points += m.homeScore;
    rows[m.awayId].points += m.awayScore;
    if (m.winnerId === null) { rows[m.homeId].ties++; rows[m.awayId].ties++; }
    else { rows[m.winnerId].wins++; rows[m.winnerId === m.homeId ? m.awayId : m.homeId].losses++; }
  }

  const standings = Object.values(rows).sort((x, y) => y.wins - x.wins || y.points - x.points || x.name.localeCompare(y.name));
  return NextResponse.json({ ok: true, leagueId: league._id, standings });
}
