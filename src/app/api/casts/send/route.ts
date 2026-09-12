import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, getPlayer, getLeague, getScheduledOpponentId, countWeeklyCasts, countSeasonSpears, originFrom, pub, RULES } from "@/lib/league";
import { newId, nowIso } from "@/lib/store";
import { deriveRedFlags } from "@/lib/redflags";
import { TRACKING_PLACEHOLDER } from "@/lib/config";
import type { CastDoc, WeekSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

// Substitute the server-owned tracking URL. Handles the placeholder; if a hand-drafted
// spear removed it, append the CTA so every training email has exactly one tracked link.
function injectTrackingLink(body: string, url: string): string {
  if (body.includes(TRACKING_PLACEHOLDER)) return body.split(TRACKING_PLACEHOLDER).join(url);
  return `${body.trim()}\n\nContinue: ${url}`;
}

// Delivery is IN-APP: the cast record itself is the message in the target's Inbox.
// Nothing ever leaves the app — no SMTP, no external mailbox, by construction.
export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });

  const { senderId, subject, body, type = "cast", targetId: clientTargetId } = payload as {
    senderId?: string; subject?: string; body?: string; type?: "cast" | "spear"; targetId?: string;
  };
  if (!senderId) return NextResponse.json({ ok: false, error: "senderId required" }, { status: 400 });
  if (!subject || !body) return NextResponse.json({ ok: false, error: "subject and body required" }, { status: 400 });
  if (type !== "cast" && type !== "spear") return NextResponse.json({ ok: false, error: "type must be 'cast' or 'spear'" }, { status: 400 });

  const sender = getPlayer(senderId);
  if (!sender) return NextResponse.json({ ok: false, error: "sender not found" }, { status: 404 });
  const league = getLeague(sender.leagueId);
  if (!league) return NextResponse.json({ ok: false, error: "league not found" }, { status: 404 });
  const week = league.currentWeek;

  // --- CLOSED LOOP: target MUST be the scheduled opponent. Resolved server-side. ---
  const opponentId = getScheduledOpponentId(league._id, sender._id, week);
  if (!opponentId) return NextResponse.json({ ok: false, error: "no scheduled opponent this week" }, { status: 409 });
  // If the client dared to name a target, it must match the schedule exactly.
  if (clientTargetId && clientTargetId !== opponentId) {
    return NextResponse.json({ ok: false, error: "closed-loop violation: target is not your scheduled opponent", code: "CLOSED_LOOP" }, { status: 403 });
  }
  const opponent = getPlayer(opponentId);
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent not found" }, { status: 404 });

  // --- CAP RE-CHECKS (server-side, before insert) ---
  let weekSlot: WeekSlot;
  if (type === "cast") {
    const used = countWeeklyCasts(league._id, sender._id, week);
    if (used >= RULES.CASTS_PER_WEEK) {
      return NextResponse.json({ ok: false, error: `weekly cast cap reached (${RULES.CASTS_PER_WEEK}/${RULES.CASTS_PER_WEEK})`, code: "CAST_CAP" }, { status: 409 });
    }
    weekSlot = (used + 1) as 1 | 2;
  } else {
    // spear: season cap, guarded by BOTH the counter and the player flag.
    if (sender.spearUsedThisSeason || countSeasonSpears(league._id, sender._id) >= RULES.SPEARS_PER_SEASON) {
      return NextResponse.json({ ok: false, error: "spear already used this season", code: "SPEAR_CAP" }, { status: 409 });
    }
    weekSlot = "spear";
  }

  // Server owns the URL.
  const token = randomBytes(16).toString("hex");
  const trackingUrl = `${originFrom(req)}/c/${token}`;
  const finalBody = injectTrackingLink(body, trackingUrl);

  const cast: CastDoc = {
    _id: newId(),
    leagueId: league._id,
    week,
    senderId: sender._id,
    targetId: opponentId,
    type,
    weekSlot,
    subject,
    body: finalBody,
    trackingToken: token,
    status: "sent",
    points: 0,
    reportedBy: null,
    redFlags: deriveRedFlags(subject, finalBody),
    sentAt: nowIso(),
    resolvedAt: null,
  };
  db().casts.push(cast);
  if (type === "spear") sender.spearUsedThisSeason = true;

  return NextResponse.json({ ok: true, cast: pub(cast), trackingUrl, to: pub(opponent), weekSlot });
}
