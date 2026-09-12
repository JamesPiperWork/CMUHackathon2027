import { NextResponse } from "next/server";
import { getDemoLeague, getRoster, pub } from "@/lib/league";

export const dynamic = "force-dynamic";

// The demo app runs a single league (auto-seeded on first touch). Return it + roster.
export async function GET() {
  const league = getDemoLeague();
  if (!league) return NextResponse.json({ ok: false, error: "no league" }, { status: 404 });
  return NextResponse.json({ ok: true, league: pub(league), players: getRoster(league._id).map(pub) });
}
