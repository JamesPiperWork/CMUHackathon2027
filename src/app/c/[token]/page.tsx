import Link from "next/link";
import { db, getPlayer, RULES } from "@/lib/league";
import { nowIso } from "@/lib/store";
import { Logo, ArrowDR } from "@/components/Logo";
import { Hook } from "@/components/icons";

export const dynamic = "force-dynamic";

// Public teaching landing. Visiting it = "the click". Records the click, scores the
// sender, then TEACHES. Collects nothing: no form, no fields, no credentials.
function recordClick(token: string) {
  const cast = db().casts.find((c) => c.trackingToken === token);
  if (!cast) return { found: false as const };
  let outcome: "scored" | "already" | "reported" = "already";
  if (cast.status === "sent") { cast.status = "clicked"; cast.points = RULES.POINTS_CLICK; cast.resolvedAt = nowIso(); outcome = "scored"; }
  else if (cast.status === "reported") outcome = "reported";
  return { found: true as const, outcome, subject: cast.subject, body: cast.body, redFlags: cast.redFlags, senderName: getPlayer(cast.senderId)?.name || "a leaguemate", type: cast.type };
}

export default function TeachingPage({ params }: { params: { token: string } }) {
  const res = recordClick(params.token);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:pt-14">
      <div className="overflow-hidden rounded-brand border border-sky bg-sky text-prussian">
        <div className="border-b border-prussian/10 px-6 py-8 sm:px-10 sm:py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-prussian/40 px-3 py-1 font-body text-[11px] font-medium uppercase tracking-eyebrow text-prussian">
            <Hook className="h-3.5 w-3.5" /> Gotcha · training simulation
          </span>
          <h1 className="mt-6 font-heading text-4xl leading-[0.95] sm:text-6xl">
            This was a Fantasy Phishing <span className="italic">training simulation.</span>
          </h1>
        </div>

        <div className="px-6 py-8 sm:px-10">
          {!res.found ? (
            <p className="text-prussian/80">
              We could not find this specific link, but the lesson stands: a link in a message is never proof of who sent
              it. When something asks you to click, slow down and verify through a channel you already trust.
            </p>
          ) : (
            <>
              <p className="text-lg text-prussian/80">
                {res.type === "spear" ? "A spear" : "A lure"} from <span className="font-medium text-prussian">{res.senderName}</span> in your
                league. In the real world, a click like this is exactly where an attacker wins. Here it only costs you a
                point, and teaches you the tells.
              </p>

              {res.outcome === "reported" && (
                <div className="mt-5 rounded-2xl bg-mint px-4 py-3 text-sm">You already reported this one before clicking. Nice defense. No points to the sender.</div>
              )}
              {res.outcome === "scored" && (
                <div className="mt-5 rounded-2xl bg-fawn px-4 py-3 text-sm">{res.senderName} just scored +{RULES.POINTS_CLICK}. Next time, report it first.</div>
              )}

              <h2 className="mt-10 font-heading text-3xl leading-tight">Here&apos;s what should have tipped you off:</h2>
              <ol className="mt-5 space-y-3">
                {res.redFlags.map((f, i) => (
                  <li key={i} className="flex gap-4 rounded-2xl bg-prussian/5 px-4 py-3">
                    <span className="font-heading text-2xl leading-none text-payne">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[15px] leading-relaxed text-prussian/85">{f}</span>
                  </li>
                ))}
              </ol>

              <details className="mt-8 rounded-2xl border border-prussian/15 p-4">
                <summary className="cursor-pointer font-body text-sm text-prussian/70">Show the message you received</summary>
                <div className="mt-4">
                  <div className="font-body text-sm font-medium">Subject: {res.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-body text-sm text-prussian/80">{res.body}</pre>
                </div>
              </details>
            </>
          )}

          <p className="mt-8 font-body text-xs text-prussian/50">
            This page collected nothing about you. No form, no fields, no credentials. It exists only to teach.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-prussian/10 pt-6">
            <div className="flex gap-3">
              <Link href="/week" className="inline-flex items-center gap-2 rounded-lg bg-prussian px-5 py-2.5 font-body text-sm font-medium text-sky hover:bg-indigo">Live scoreboard <ArrowDR className="h-4 w-4" /></Link>
              <Link href="/inbox" className="inline-flex items-center rounded-lg border border-prussian/40 px-5 py-2.5 font-body text-sm font-medium text-prussian">Back to inbox</Link>
            </div>
            <Logo tone="prussian" />
          </div>
        </div>
      </div>
    </main>
  );
}
