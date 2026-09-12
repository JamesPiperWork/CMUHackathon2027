"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";

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
    if (res.ok) setData(res);
  }
  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a);
    load(a);
    const t = setInterval(() => load(a), 2000);
    return () => clearInterval(t);
  }, [router]);

  async function report(id: string) {
    if (!acting) return;
    setMsg("");
    const res = await api(`/api/casts/${id}/report`, { method: "POST", body: JSON.stringify({ playerId: acting.id }) });
    if (res.ok) { setMsg(res.alreadyReported ? "Already reported." : `🚩 Reported! +${res.reporterPoints} defense points. The sender scores 0.`); load(acting); }
    else setMsg(res.error || "report failed");
  }

  const messages: any[] = data?.messages || [];
  const open = messages.find((m) => m.id === openId);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Inbox {data?.week ? <span className="text-chalk/50">· Week {data.week}</span> : null}</h1>
        <span className="text-sm text-chalk/50">{data?.to}</span>
      </div>
      <p className="mt-1 text-sm text-chalk/50">
        Your defense. Spot the training lure and <span className="text-neon">report it before you click</span>.
      </p>
      {msg && <div className="mt-3 rounded-lg bg-neon/10 px-3 py-2 text-sm text-neon">{msg}</div>}

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className={`w-full rounded-xl border p-3 text-left ${openId === m.id ? "border-neon bg-neon/10" : "border-chalk/10 bg-pitch/50 hover:border-chalk/30"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-semibold">{m.subject}</div>
                <Status s={m.status} />
              </div>
              <div className="mt-0.5 text-xs text-chalk/40">unknown sender · {new Date(m.sentAt).toLocaleTimeString()}</div>
            </button>
          ))}
          {messages.length === 0 && (
            <p className="rounded-xl border border-dashed border-chalk/15 p-4 text-sm text-chalk/50">
              Inbox empty. Switch to your opponent on the home page and send a cast to see it here.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-chalk/10 bg-pitch/50 p-5">
          {!open ? (
            <p className="text-sm text-chalk/40">Select a message to read it.</p>
          ) : (
            <>
              <div className="text-xs text-chalk/40">From: unknown sender</div>
              <div className="mt-1 text-lg font-semibold">{open.subject}</div>
              <div className="mt-4 whitespace-pre-wrap break-words text-sm text-chalk/85">{linkify(open.body)}</div>
              <div className="mt-6 flex flex-wrap gap-3 border-t border-chalk/10 pt-4">
                {open.reportable ? (
                  <button onClick={() => report(open.id)} className="rounded-lg bg-blood/80 px-4 py-2 text-sm font-semibold text-white">
                    🚩 Report as phish
                  </button>
                ) : (
                  <span className="text-sm text-chalk/50">{open.status === "reported" ? "You reported this. ✓" : "You clicked this. See the teaching page."}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Status({ s }: { s: string }) {
  const cls = s === "reported" ? "text-neon" : s === "clicked" ? "text-blood" : "text-chalk/50";
  return <span className={`shrink-0 text-xs ${cls}`}>{s === "sent" ? "unread" : s}</span>;
}

// Render URLs as real anchors — clicking one is "the click" and opens the teaching page.
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} className="text-blue-400 underline break-all">{p}</a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}
