import { NextResponse } from "next/server";
import { getPlayer, getLeague, getScheduledOpponentId, countWeeklyCasts, pub, RULES } from "@/lib/league";

export const dynamic = "force-dynamic";

// Everything a player's dashboard needs: league, self, this week's opponent, and the
// live shots-remaining picture. Caps are computed from the store, not from the client.
export async function GET(req: Request) {
  const playerId = new URL(req.url).searchParams.get("playerId");
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });

  const player = getPlayer(playerId);
  if (!player) return NextResponse.json({ ok: false, error: "player not found" }, { status: 404 });
  const league = getLeague(player.leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });

  const week = league.currentWeek;
  const opponentId = getScheduledOpponentId(league._id, player._id, week);
  const opponent = opponentId ? getPlayer(opponentId) : null;

  const castsUsed = countWeeklyCasts(league._id, player._id, week);
  return NextResponse.json({
    ok: true,
    league: pub(league),
    player: pub(player),
    week,
    opponent: pub(opponent),
    shots: {
      castsUsed,
      castsLeft: Math.max(0, RULES.CASTS_PER_WEEK - castsUsed),
      capPerWeek: RULES.CASTS_PER_WEEK,
      spearAvailable: !player.spearUsedThisSeason,
    },
  });
}
