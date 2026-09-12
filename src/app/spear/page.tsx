"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Card, Button, ButtonLink, Notice, Rule } from "@/components/ui";
import { ArrowDR } from "@/components/Logo";
import { Harpoon } from "@/components/icons";

export default function Spear() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const [available, setAvailable] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Write your spear here.\n\nInclude your call to action as {{TRACKING_LINK}} and the server will turn it into a tracked link.");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState<any>(null);

  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a);
    api(`/api/state?playerId=${a.id}`).then((res) => { if (!res.ok) return; setOpponent(res.opponent); setAvailable(res.shots.spearAvailable); });
  }, [router]);

  async function draftWithGemini() {
    if (!acting) return;
    setBusy(true); setError("");
    const at = opponent?.attributes || {};
    const res = await api("/api/casts/generate", { method: "POST", body: JSON.stringify({ senderId: acting.id, attributes: { hobbies: at.hobbies || [], sportsTeams: at.sportsTeams || [], hometown: at.hometown || "", employer: at.employer || "", pretext: "high-stakes spear" } }) });
    setBusy(false);
    if (res.ok) { setSubject(res.subject); setBody(res.body); } else setError(res.error || "draft failed");
  }

  async function send() {
    if (!acting) return;
    setBusy(true); setError("");
    const res = await api("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: acting.id, subject, body, type: "spear" }) });
    setBusy(false);
    if (res.ok) setSent(res); else setError(res.error || "send failed");
  }

  if (sent) {
    return (
      <Page width="max-w-3xl">
        <Card tone="icterine" className="p-8 sm:p-10">
          <Eyebrow className="border-prussian/30 text-prussian/70">Spear · third shot</Eyebrow>
          <Heading className="mt-4 text-prussian">Spear thrown.</Heading>
          <p className="mt-4 max-w-xl text-prussian/80">
            Your once-per-season spear is in {sent.to?.name}&apos;s in-app inbox as a third shot this week. It did not
            consume a cast slot. Nothing was sent externally.
          </p>
          <div className="mt-6 break-all rounded-2xl bg-prussian/10 px-4 py-3 font-body text-xs text-prussian/70">Tracking link · {sent.trackingUrl}</div>
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
          <Eyebrow tone="icterine">Spear → {opponent?.name ?? "…"}</Eyebrow>
          <Heading className="mt-4">Hand-draft.</Heading>
        </div>
        <span className="font-body text-xs uppercase tracking-eyebrow text-icterine">{available ? "1 per season" : "used"}</span>
      </div>

      <div className="mt-6 space-y-3">
        {!available && <Notice tone="fawn">You have already used your season spear. The server will reject another.</Notice>}
        {error && <Notice tone="fawn">{error}</Notice>}
      </div>

      <Card className="mt-6 space-y-5">
        <p className="text-sm text-sky/60">
          The spear is yours to write. Optionally seed the editor with a Gemini draft, then edit. Fired as a third shot; +100 on click.
        </p>
        <Button onClick={draftWithGemini} disabled={busy} variant="outline">{busy ? "…" : "Draft with Gemini · optional"}</Button>
        <Rule />
        <label className="block">
          <span className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/60">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-2" />
        </label>
        <label className="block">
          <span className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-sky/60">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="input mt-2 font-mono text-sm leading-relaxed" />
        </label>
        <Button onClick={send} disabled={busy || !available || !subject} variant="accent" className="w-full">
          <Harpoon className="h-4 w-4" /> {busy ? "Throwing…" : `Throw spear at ${opponent?.name ?? "opponent"}`}
        </Button>
      </Card>
    </Page>
  );
}
