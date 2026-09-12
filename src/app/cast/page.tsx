"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";

function toList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export default function Cast() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const [shots, setShots] = useState<any>(null);

  const [hobbies, setHobbies] = useState("");
  const [teams, setTeams] = useState("");
  const [hometown, setHometown] = useState("");
  const [employer, setEmployer] = useState("");
  const [pretext, setPretext] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState<"form" | "preview">("form");
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
      setShots(res.shots);
      const at = res.opponent?.attributes;
      if (at) {
        setHobbies((at.hobbies || []).join(", "));
        setTeams((at.sportsTeams || []).join(", "));
        setHometown(at.hometown || "");
        setEmployer(at.employer || "");
      }
    });
  }, [router]);

  async function generate() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/generate", {
      method: "POST",
      body: JSON.stringify({
        senderId: acting.id,
        attributes: { hobbies: toList(hobbies), sportsTeams: toList(teams), hometown, employer, pretext },
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSubject(res.subject);
      setBody(res.body);
      setSource(res.source);
      setPhase("preview");
    } else {
      setError(res.error || "generation failed");
    }
  }

  async function send() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/send", {
      method: "POST",
      body: JSON.stringify({ senderId: acting.id, subject, body, type: "cast" }),
    });
    setBusy(false);
    if (res.ok) {
      setSent(res);
    } else {
      setError(res.error || "send failed");
    }
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-neon/40 bg-turf/40 p-6">
          <h1 className="text-2xl font-bold text-neon">Cast sent 🎣</h1>
          <p className="mt-2 text-chalk/80">
            Delivered to {sent.to?.name}&apos;s in-app Inbox as slot {sent.weekSlot}. Switch to{" "}
            {sent.to?.name} on the home page and open Inbox to see it. Nothing was sent externally.
          </p>
          <div className="mt-3 rounded-lg bg-pitch/60 p-3 text-xs text-chalk/60 break-all">
            Tracking link (server-owned): {sent.trackingUrl}
          </div>
          <div className="mt-5 flex gap-3">
            <Link href="/week" className="rounded-lg bg-neon px-4 py-2 font-semibold text-pitch">Live Scoreboard →</Link>
            <Link href="/play" className="rounded-lg border border-chalk/20 px-4 py-2">Back to My Week</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">New Cast → {opponent?.name ?? "…"}</h1>
        {shots && <span className="text-sm text-flag">{shots.castsLeft} left</span>}
      </div>

      {error && <div className="mb-4 rounded-lg border border-blood/50 bg-blood/10 px-3 py-2 text-sm text-blood">{error}</div>}

      {phase === "form" ? (
        <div className="space-y-4 rounded-2xl border border-chalk/10 bg-pitch/50 p-5">
          <p className="text-xs text-chalk/50">
            The recon you know as a friend. Prefilled with your stored guesses about {opponent?.name},
            editable per cast. These attributes are sent to Gemini to tailor the training email.
          </p>
          <Field label="Hobbies (comma-separated)" value={hobbies} onChange={setHobbies} />
          <Field label="Sports team(s)" value={teams} onChange={setTeams} />
          <Field label="Hometown" value={hometown} onChange={setHometown} />
          <Field label="Employer" value={employer} onChange={setEmployer} />
          <Field label="Pretext / angle (optional)" value={pretext} onChange={setPretext} placeholder="e.g. season-ticket renewal" />
          <button onClick={generate} disabled={busy} className="w-full rounded-lg bg-neon px-4 py-2 font-semibold text-pitch disabled:opacity-50">
            {busy ? "Generating…" : "Generate lure with Gemini"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-chalk/10 bg-pitch/50 p-5">
          <div className="text-xs text-chalk/50">
            Generated by {source === "gemini" ? "Gemini" : "template fallback"}. Edit freely. The
            {" "}<code className="text-flag">{"{{TRACKING_LINK}}"}</code> placeholder is replaced by the
            server at send time.
          </div>
          <label className="block text-sm">
            <span className="text-chalk/60">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-chalk/15 bg-pitch px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-chalk/60">Body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-1 w-full rounded-lg border border-chalk/15 bg-pitch px-3 py-2 font-mono text-sm" />
          </label>
          <div className="flex gap-3">
            <button onClick={send} disabled={busy} className="flex-1 rounded-lg bg-flag px-4 py-2 font-semibold text-pitch disabled:opacity-50">
              {busy ? "Sending…" : `Send to ${opponent?.name}`}
            </button>
            <button onClick={() => setPhase("form")} className="rounded-lg border border-chalk/20 px-4 py-2">← Edit attributes</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-chalk/60">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-chalk/15 bg-pitch px-3 py-2" />
    </label>
  );
}
