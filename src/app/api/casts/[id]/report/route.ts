import { NextResponse } from "next/server";
import { db, pub, RULES } from "@/lib/league";
import { nowIso } from "@/lib/store";

export const dynamic = "force-dynamic";

// Defender reports an incoming lure before clicking: reporter +50, that cast scores the
// sender 0. Only the actual recipient can report, and only before it is clicked.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const payload = await req.json().catch(() => null);
  const playerId: string | undefined = payload?.playerId;
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });

  const cast = db().casts.find((c) => c._id === params.id);
  if (!cast) return NextResponse.json({ ok: false, error: "cast not found" }, { status: 404 });
  if (cast.targetId !== playerId) return NextResponse.json({ ok: false, error: "you are not the recipient of this cast" }, { status: 403 });
  if (cast.status === "clicked") return NextResponse.json({ ok: false, error: "too late — this lure was already clicked", code: "ALREADY_CLICKED" }, { status: 409 });
  if (cast.status === "reported") return NextResponse.json({ ok: true, alreadyReported: true, message: "already reported" });

  cast.status = "reported";
  cast.points = 0; // sender scores nothing
  cast.reportedBy = playerId; // reporter +50, derived at scoring time
  cast.resolvedAt = nowIso();

  return NextResponse.json({ ok: true, reporterPoints: RULES.POINTS_REPORT, cast: pub(cast) });
}
