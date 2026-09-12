import { NextResponse } from "next/server";
import { db, getPlayer, getLeague } from "@/lib/league";

export const dynamic = "force-dynamic";

// The defender's in-app Inbox: training emails delivered to them this week. Sender
// identity is masked — the defender must judge from the message itself, like real life.
export async function GET(req: Request) {
  const playerId = new URL(req.url).searchParams.get("playerId");
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });
  const player = getPlayer(playerId);
  if (!player) return NextResponse.json({ ok: false, error: "player not found" }, { status: 404 });
  const league = getLeague(player.leagueId);
  const week = league?.currentWeek ?? 1;

  const messages = db().casts
    .filter((c) => c.leagueId === player.leagueId && c.targetId === player._id && c.week === week)
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
    .map((c) => ({
      id: c._id,
      subject: c.subject,
      body: c.body,
      trackingToken: c.trackingToken,
      status: c.status,
      sentAt: c.sentAt,
      reportable: c.status === "sent",
    }));

  return NextResponse.json({ ok: true, week, to: player.email, messages });
}
