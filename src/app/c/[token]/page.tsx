import Link from "next/link";
import { db, getPlayer, RULES } from "@/lib/league";
import { nowIso } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public teaching landing. Visiting it = "the click". Records the click, scores the
// sender, then TEACHES. Collects nothing: no form, no fields, no credentials.
function recordClick(token: string) {
  const cast = db().casts.find((c) => c.trackingToken === token);
  if (!cast) return { found: false as const };

  let outcome: "scored" | "already" | "reported" = "already";
  if (cast.status === "sent") {
    cast.status = "clicked";
    cast.points = RULES.POINTS_CLICK;
    cast.resolvedAt = nowIso();
    outcome = "scored";
  } else if (cast.status === "reported") {
    outcome = "reported";
  }

  return {
    found: true as const,
    outcome,
    subject: cast.subject,
    body: cast.body,
    redFlags: cast.redFlags,
    senderName: getPlayer(cast.senderId)?.name || "a leaguemate",
    type: cast.type,
  };
}

export default function TeachingPage({ params }: { params: { token: string } }) {
  const res = recordClick(params.token);

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-flag/40 bg-turf/40 p-6 shadow-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-flag/20 px-3 py-1 text-sm font-semibold text-flag">
            🎣 Gotcha — this was a training simulation
          </div>

          <h1 className="text-2xl font-bold">This was a Fantasy Phishing training simulation.</h1>

          {!res.found ? (
            <p className="mt-3 text-chalk/80">
              We could not find this specific link, but the lesson stands: a link in a message is never
              proof of who sent it. When something asks you to click, slow down and verify through a
              channel you already trust.
            </p>
          ) : (
            <>
              <p className="mt-2 text-chalk/80">
                {res.type === "spear" ? "A spear" : "A lure"} from{" "}
                <span className="font-semibold text-chalk">{res.senderName}</span> in your league. In the
                real world, a click like this is exactly where an attacker wins. Here, it only costs you a
                point — and teaches you the tells.
              </p>

              {res.outcome === "reported" && (
                <p className="mt-3 rounded-lg bg-neon/10 px-3 py-2 text-neon">
                  You already reported this one before clicking — nice defense. No points to the sender.
                </p>
              )}
              {res.outcome === "scored" && (
                <p className="mt-3 rounded-lg bg-blood/10 px-3 py-2 text-blood">
                  {res.senderName} just scored +{RULES.POINTS_CLICK}. Next time, report it first.
                </p>
              )}

              <h2 className="mt-6 text-lg font-semibold text-flag">Here&apos;s what should have tipped you off:</h2>
              <ul className="mt-3 space-y-2">
                {res.redFlags.map((f, i) => (
                  <li key={i} className="flex gap-3 rounded-lg bg-pitch/60 px-3 py-2">
                    <span aria-hidden>🚩</span>
                    <span className="text-sm text-chalk/90">{f}</span>
                  </li>
                ))}
              </ul>

              <details className="mt-6 rounded-lg border border-chalk/15 bg-pitch/40 p-3">
                <summary className="cursor-pointer text-sm text-chalk/70">Show the message you received</summary>
                <div className="mt-3">
                  <div className="text-sm font-semibold">Subject: {res.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-chalk/80">{res.body}</pre>
                </div>
              </details>
            </>
          )}

          <p className="mt-6 text-xs text-chalk/50">
            This page collected nothing about you — no form, no fields, no credentials. It exists only to teach.
          </p>
          <div className="mt-6 flex gap-4 text-sm">
            <Link href="/week" className="text-neon underline">Live scoreboard</Link>
            <Link href="/inbox" className="text-chalk/70 underline">Back to inbox</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
