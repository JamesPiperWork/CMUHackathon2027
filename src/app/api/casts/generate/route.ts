import { NextResponse } from "next/server";
import { generateLure } from "@/lib/gemini";
import { getPlayer, getLeague, getScheduledOpponentId, pub } from "@/lib/league";

export const dynamic = "force-dynamic";

// Generate a training-simulation lure from attacker-supplied recon attributes.
// The returned body carries the literal {{TRACKING_LINK}} placeholder; the SERVER
// owns real URL generation at send time. Never trust the model to format a URL.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  const { senderId, attributes } = body as { senderId?: string; attributes?: any };
  if (!senderId) return NextResponse.json({ ok: false, error: "senderId required" }, { status: 400 });

  const sender = getPlayer(senderId);
  if (!sender) return NextResponse.json({ ok: false, error: "sender not found" }, { status: 404 });
  const league = getLeague(sender.leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });

  // Closed-loop check even at preview time: the sender must have a scheduled opponent.
  const opponentId = getScheduledOpponentId(league._id, sender._id, league.currentWeek);
  if (!opponentId) return NextResponse.json({ ok: false, error: "no scheduled opponent this week" }, { status: 409 });

  const lure = await generateLure({
    hobbies: attributes?.hobbies || [],
    sportsTeams: attributes?.sportsTeams || [],
    hometown: attributes?.hometown || "",
    employer: attributes?.employer || "",
    pretext: attributes?.pretext || "",
  });

  return NextResponse.json({
    ok: true,
    subject: lure.subject,
    body: lure.body,
    source: lure.source,
    opponent: pub(getPlayer(opponentId)),
    week: league.currentWeek,
  });
}
