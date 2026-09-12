"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";

export default function Spear() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const [available, setAvailable] = useState(true);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Write your spear here.\n\nInclude your call to action as {{TRACKING_LINK}} and the server will turn it into a tracked link.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<any>(null);

  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a);
    api(`/api/state?playerId=${a.id}`).then((res) => {
      if (!res.ok) return;
      setOpponent(res.opponent);
      setAvailable(res.shots.spearAvailable);
    });
  }, [router]);

  async function draftWithGemini() {
    if (!acting) return;
    setBusy(true); setError("");
    const at = opponent?.attributes || {};
    const res = await api("/api/casts/generate", {
      method: "POST",
      body: JSON.stringify({
        senderId: acting.id,
        attributes: { hobbies: at.hobbies || [], sportsTeams: at.sportsTeams || [], hometown: at.hometown || "", employer: at.employer || "", pretext: "high-stakes spear" },
      }),
    });
    setBusy(false);
    if (res.ok) { setSubject(res.subject); setBody(res.body); }
    else setError(res.error || "draft failed");
  }

  async function send() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/send", {
      method: "POST",
      body: JSON.stringify({ senderId: acting.id, subject, body, type: "spear" }),
    });
    setBusy(false);
    if (res.ok) setSent(res);
    else setError(res.error || "send failed");
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-flag/50 bg-turf/40 p-6">
          <h1 className="text-2xl font-bold text-flag">Spear thrown 🪝</h1>
          <p className="mt-2 text-chalk/80">
            Your once-per-season spear is in {sent.to?.name}&apos;s in-app Inbox as a third shot this
            week (it did not consume a cast slot). Nothing was sent externally.
          </p>
          <div className="mt-3 rounded-lg bg-pitch/60 p-3 text-xs text-chalk/60 break-all">Tracking link: {sent.trackingUrl}</div>
          <div className="mt-5 flex gap-3">
            <Link href="/week" className="rounded-lg bg-flag px-4 py-2 font-semibold text-pitch">Live Scoreboard →</Link>
            <Link href="/play" className="rounded-lg border border-chalk/20 px-4 py-2">Back to My Week</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Spear → {opponent?.name ?? "…"}</h1>
        <span className="text-sm text-flag">{available ? "1 spear / season" : "already used"}</span>
      </div>

      {!available && (
        <div className="mb-4 rounded-lg border border-blood/50 bg-blood/10 px-3 py-2 text-sm text-blood">
          You have already used your season spear. The server will reject another.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-blood/50 bg-blood/10 px-3 py-2 text-sm text-blood">{error}</div>}

      <div className="space-y-4 rounded-2xl border border-chalk/10 bg-pitch/50 p-5">
        <p className="text-xs text-chalk/50">
          The spear is hand-drafted — you write it yourself. Optionally seed the editor with a Gemini
          draft, then edit. Fired as a third shot; scores +100 on click.
        </p>
        <button onClick={draftWithGemini} disabled={busy} className="rounded-lg border border-neon/50 px-4 py-2 text-sm text-neon disabled:opacity-50">
          {busy ? "…" : "✨ Draft with Gemini (optional)"}
        </button>
        <label className="block text-sm">
          <span className="text-chalk/60">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-chalk/15 bg-pitch px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-chalk/60">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-1 w-full rounded-lg border border-chalk/15 bg-pitch px-3 py-2 font-mono text-sm" />
        </label>
        <button onClick={send} disabled={busy || !available || !subject} className="w-full rounded-lg bg-flag px-4 py-2 font-semibold text-pitch disabled:opacity-50">
          {busy ? "Throwing…" : `Throw spear at ${opponent?.name ?? "opponent"}`}
        </button>
      </div>
    </main>
  );
}
