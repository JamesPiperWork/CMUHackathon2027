"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Card, Button, ButtonLink, Field, Notice, Rule } from "@/components/ui";
import { ArrowDR } from "@/components/Logo";
import { Hook } from "@/components/icons";

function toList(s: string): string[] { return s.split(",").map((x) => x.trim()).filter(Boolean); }

export default function Cast() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const [shots, setShots] = useState<any>(null);
  const [hobbies, setHobbies] = useState(""); const [teams, setTeams] = useState("");
  const [hometown, setHometown] = useState(""); const [employer, setEmployer] = useState("");
  const [pretext, setPretext] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [source, setSource] = useState("");
  const [phase, setPhase] = useState<"form" | "preview">("form");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState<any>(null);

  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a);
    api(`/api/state?playerId=${a.id}`).then((res) => {
      if (!res.ok) return;
      setOpponent(res.opponent); setShots(res.shots);
      const at = res.opponent?.attributes;
      if (at) { setHobbies((at.hobbies || []).join(", ")); setTeams((at.sportsTeams || []).join(", ")); setHometown(at.hometown || ""); setEmployer(at.employer || ""); }
    });
  }, [router]);

  async function generate() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/generate", { method: "POST", body: JSON.stringify({ senderId: acting.id, attributes: { hobbies: toList(hobbies), sportsTeams: toList(teams), hometown, employer, pretext } }) });
    setBusy(false);
    if (res.ok) { setSubject(res.subject); setBody(res.body); setSource(res.source); setPhase("preview"); }
    else setError(res.error || "generation failed");
  }

  async function send() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: acting.id, subject, body, type: "cast" }) });
    setBusy(false);
    if (res.ok) setSent(res); else setError(res.error || "send failed");
  }

  if (sent) {
    return (
      <Page width="max-w-3xl">
        <Card tone="cyan" className="p-8 sm:p-10">
          <Eyebrow tone="sky" className="border-prussian/30 text-prussian/70">Cast · slot {sent.weekSlot}</Eyebrow>
          <Heading className="mt-4 text-prussian">Cast sent.</Heading>
          <p className="mt-4 max-w-xl text-prussian/80">
            It is now in {sent.to?.name}&apos;s in-app inbox. Switch to {sent.to?.name} on the home page and open
            Inbox to see it. Nothing was sent externally.
          </p>
          <div className="mt-6 break-all rounded-2xl bg-prussian/10 px-4 py-3 font-body text-xs text-prussian/70">
            Tracking link (server-owned) · {sent.trackingUrl}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/week" variant="sky" className="!bg-prussian !text-sky hover:!bg-indigo">Live scoreboard <ArrowDR className="h-4 w-4" /></ButtonLink>
            <ButtonLink href="/play" variant="outline" className="!border-prussian/40 !text-prussian">Back to my week</ButtonLink>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page width="max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>New cast → {opponent?.name ?? "…"}</Eyebrow>
          <Heading className="mt-4">{phase === "form" ? "Recon." : "Preview."}</Heading>
        </div>
        {shots && <span className="font-body text-xs uppercase tracking-eyebrow text-icterine">{shots.castsLeft} left</span>}
      </div>

      {error && <div className="mt-6"><Notice tone="fawn">{error}</Notice></div>}

      {phase === "form" ? (
        <Card className="mt-8 space-y-5">
          <p className="text-sm text-sky/60">
            What you know as a friend. Prefilled with your stored guesses about {opponent?.name}, editable per cast.
            These attributes go to Gemini to tailor the training email.
          </p>
          <Rule />
          <Field label="Hobbies" value={hobbies} onChange={setHobbies} hint="comma-separated" />
          <Field label="Sports team(s)" value={teams} onChange={setTeams} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Hometown" value={hometown} onChange={setHometown} />
            <Field label="Employer" value={employer} onChange={setEmployer} />
          </div>
          <Field label="Pretext / angle" value={pretext} onChange={setPretext} placeholder="e.g. season-ticket renewal" hint="optional" />
          <Button onClick={generate} disabled={busy} className="w-full">
            <Hook className="h-4 w-4" /> {busy ? "Generating…" : "Generate lure with Gemini"}
          </Button>
        </Card>
      ) : (
        <Card className="mt-8 space-y-5">
          <p className="text-sm text-sky/60">
            Generated by {source === "gemini" ? "Gemini" : "the template fallback"}. Edit freely. The{" "}
            <code className="rounded bg-prussian/60 px-1.5 py-0.5 font-body text-xs text-icterine">{"{{TRACKING_LINK}}"}</code>{" "}
            placeholder is replaced by the server at send time.
          </p>
          <Rule />
          <label className="block">
            <span className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/60">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-2" />
          </label>
          <label className="block">
            <span className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/60">Body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="input mt-2 font-mono text-sm leading-relaxed" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button onClick={send} disabled={busy} className="flex-1"><Hook className="h-4 w-4" /> {busy ? "Sending…" : `Cast to ${opponent?.name}`}</Button>
            <Button onClick={() => setPhase("form")} variant="outline">Edit recon</Button>
          </div>
        </Card>
      )}
    </Page>
  );
}
