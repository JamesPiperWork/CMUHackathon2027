"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Card, Button, Notice, Rule } from "@/components/ui";
import { Float, Pennant, Waves } from "@/components/icons";

// The defender's in-app Inbox. Training emails land here (nothing is sent externally).
// Open one, then either click its link (→ teaching page, sender scores) or REPORT it
// first (→ you score +50, sender gets 0).
export default function Inbox() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [data, setData] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load(a: ActingPlayer) {
    const res = await api(`/api/inbox?playerId=${a.id}`);
    if (res.ok) { setData(res); setOpenId((cur) => cur ?? res.messages?.[0]?.id ?? null); }
  }
  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a); load(a);
    const t = setInterval(() => load(a), 2000);
    return () => clearInterval(t);
  }, [router]);

  async function report(id: string) {
    if (!acting) return;
    setMsg("");
    const res = await api(`/api/casts/${id}/report`, { method: "POST", body: JSON.stringify({ playerId: acting.id }) });
    if (res.ok) { setMsg(res.alreadyReported ? "Already reported." : `Reported. +${res.reporterPoints} defense points. The sender scores 0.`); load(acting); }
    else setMsg(res.error || "report failed");
  }

  const messages: any[] = data?.messages || [];
  const open = messages.find((m) => m.id === openId);

  return (
    <Page width="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow tone="fawn">Defense · Week {data?.week ?? "…"}</Eyebrow>
          <Heading className="mt-4">Inbox</Heading>
        </div>
        <span className="font-body text-xs text-sky/40">{data?.to}</span>
      </div>
      <p className="mt-3 max-w-xl text-sm text-sky/60">Spot the training lure and <span className="text-cyan">report it before you click</span>.</p>
      {msg && <div className="mt-5"><Notice tone="mint">{msg}</Notice></div>}

      <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="space-y-2">
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${openId === m.id ? "border-cyan bg-cyan/10" : "border-sky/10 bg-indigo/60 hover:border-sky/30"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {m.status === "sent" && <Float className="h-3.5 w-3.5 shrink-0 text-cyan" />}
                  <div className="truncate font-body text-sm font-medium">{m.subject}</div>
                </div>
                <Status s={m.status} />
              </div>
              <div className="mt-1 font-body text-xs text-sky/40">Unknown sender · {new Date(m.sentAt).toLocaleTimeString()}</div>
            </button>
          ))}
          {messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-sky/15 p-5 text-sm text-sky/50">
              <Waves className="mb-3 h-6 w-6 text-sky/30" />
              Inbox empty. Switch to your opponent on the home page and send a cast to see it here.
            </div>
          )}
        </div>

        <Card tone="sky" className="min-h-[18rem]">
          {!open ? (
            <p className="text-sm text-prussian/50">Select a message to read it.</p>
          ) : (
            <>
              <div className="font-body text-[11px] font-medium uppercase tracking-eyebrow text-prussian/50">From · unknown sender</div>
              <div className="mt-2 font-heading text-3xl leading-tight text-prussian">{open.subject}</div>
              <Rule className="my-5 !border-prussian/15" />
              <div className="whitespace-pre-wrap break-words font-body text-[15px] leading-relaxed text-prussian/85">{linkify(open.body)}</div>
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-prussian/15 pt-5">
                {open.reportable ? (
                  <Button onClick={() => report(open.id)} variant="warm"><Pennant className="h-4 w-4" /> Report as phish</Button>
                ) : (
                  <span className="font-body text-sm text-prussian/60">{open.status === "reported" ? "You reported this one." : "You clicked this. See the teaching page."}</span>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}

function Status({ s }: { s: string }) {
  const cls = s === "reported" ? "text-mint" : s === "clicked" ? "text-fawn" : "text-sky/50";
  return <span className={`shrink-0 font-body text-[11px] uppercase tracking-eyebrow ${cls}`}>{s === "sent" ? "unread" : s}</span>;
}

// Render URLs as real anchors — clicking one is "the click" and opens the teaching page.
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} className="break-all text-indigo underline decoration-cyan decoration-2 underline-offset-2">{p}</a> : <span key={i}>{p}</span>
  );
}
