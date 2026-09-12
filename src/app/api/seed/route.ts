import { NextResponse } from "next/server";
import { seedLeague } from "@/lib/seed";
import { pub } from "@/lib/league";

export const dynamic = "force-dynamic";

// Idempotent reset: rebuilds the Demo League, 8 players, and the 10-week schedule.
export async function POST() {
  const r = seedLeague();
  return NextResponse.json({
    ok: true,
    league: pub(r.league),
    players: r.players.map(pub),
    schedule: { weeks: r.league.regularSeasonWeeks, matchups: r.matchupCount },
    assertion: r.assertion,
    week1AliceVsBob: r.week1AliceVsBob,
  });
}
