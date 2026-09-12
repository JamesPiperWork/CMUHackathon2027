"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Notice } from "@/components/ui";
import { FAUX_EMAILS, deriveTrainingSender } from "@/lib/fauxInbox";

// The defender's Inbox, rendered as a familiar email client so the training lure has to be
// spotted among ordinary mail — the real spot-the-phish exercise. Training lures come from
// /api/inbox and are interleaved with the faux "noise" emails. Reporting a lure scores you
// +50; reporting a legitimate message is a false alarm (no points), which is its own lesson.

interface Row {
  key: string;
  kind: "training" | "legit";
  sender: string;
  initials: string;
  color: string;
  subject: string;
  body: string;
  ts: number;
  folder: "focused" | "other";
  unread: boolean;
  // training-only
  castId?: string;
  trackingToken?: string;
  status?: "sent" | "clicked" | "reported";
  reportable?: boolean;
}

const SEGOE = { fontFamily: "'Segoe UI', -apple-system, system-ui, Roboto, sans-serif" };
const TRAINING_COLOR = "#5b6b7b"; // blends with the faux avatars — no visual tell

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const diff = (now.getTime() - ts) / 86400000;
  if (diff < 7) return `${days[d.getDay()]} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Inbox() {
  const router = useRouter();
  const [acting, setActing] = useState<ActingPlayer | null>(null);
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"focused" | "other">("focused");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; tone: "cyan" | "fawn" | "mint" } | null>(null);

  async function load(a: ActingPlayer) {
    const res = await api(`/api/inbox?playerId=${a.id}`);
    if (res.ok) setData(res);
  }
  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActing(a); load(a);
    const t = setInterval(() => load(a), 2000);
    return () => clearInterval(t);
  }, [router]);

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const training: Row[] = (data?.messages || []).map((m: any) => {
      const { sender, initials } = deriveTrainingSender(m.subject);
      return {
        key: `t-${m.id}`,
        kind: "training" as const,
        sender, initials, color: TRAINING_COLOR,
        subject: m.subject, body: m.body,
        ts: new Date(m.sentAt).getTime(),
        folder: "focused" as const,
        unread: m.status === "sent",
        castId: m.id, trackingToken: m.trackingToken, status: m.status, reportable: m.reportable,
      };
    });
    const faux: Row[] = FAUX_EMAILS.map((f) => ({
      key: `f-${f.key}`, kind: "legit" as const,
      sender: f.sender, initials: f.initials, color: f.color,
      subject: f.subject, body: f.body,
      ts: now - f.minutesAgo * 60000, folder: f.folder, unread: f.unread,
    }));
    return [...training, ...faux].sort((a, b) => b.ts - a.ts);
  }, [data]);

  const shown = rows.filter((r) => r.folder === tab);
  const open = rows.find((r) => r.key === openKey) || null;
  const inboxUnread = rows.filter((r) => r.unread && !read.has(r.key)).length;

  function selectRow(r: Row) {
    setOpenKey(r.key);
    setRead((prev) => new Set(prev).add(r.key));
    setMsg(null);
  }

  async function report(r: Row) {
    if (r.kind === "legit") {
      setMsg({ text: `False alarm — “${r.sender}” is a legitimate message. No points, and in real life over-reporting has a cost too.`, tone: "fawn" });
      return;
    }
    if (!acting || !r.castId) return;
    if (r.status !== "sent") {
      setMsg({ text: r.status === "reported" ? "You already reported this one." : "Too late — you already clicked this one.", tone: "fawn" });
      return;
    }
    const res = await api(`/api/casts/${r.castId}/report`, { method: "POST", body: JSON.stringify({ playerId: acting.id }) });
    if (res.ok) {
      setMsg({ text: res.alreadyReported ? "Already reported." : `Good catch — that was a training lure. +${res.reporterPoints} defense points. The sender scores 0.`, tone: "mint" });
      load(acting);
    } else setMsg({ text: res.error || "report failed", tone: "fawn" });
  }

  const FOLDERS = [
    ["Inbox", inboxUnread || ""],
    ["Junk Email", 3],
    ["Drafts", 2],
    ["Sent Items", ""],
    ["Deleted Items", ""],
    ["Archive", ""],
    ["Notes", ""],
  ] as const;

  return (
    <Page width="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow tone="fawn">Defense · Week {data?.week ?? "…"}</Eyebrow>
          <Heading className="mt-4">Inbox</Heading>
        </div>
        <span className="font-body text-xs text-sky/40">{data?.to}</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-sky/60">
        A training lure is hiding among your real mail. Find it and <span className="text-cyan">report it before you click</span>.
        Report a legitimate message by mistake and it counts as a false alarm.
      </p>
      {msg && <div className="mt-5"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {/* Simulated email client */}
      <div className="mt-6 overflow-hidden rounded-brand border border-sky/15 bg-white text-[#242424] shadow-xl" style={SEGOE}>
        {/* App bar */}
        <div className="flex items-center gap-3 bg-[#0f6cbd] px-4 py-2 text-white">
          <span className="font-semibold">Outlook</span>
          <div className="mx-auto hidden w-full max-w-md items-center gap-2 rounded bg-white/95 px-3 py-1.5 text-[#616161] sm:flex">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <span className="text-sm">Search</span>
          </div>
          <div className="ml-auto flex items-center gap-3 opacity-90 sm:ml-0">
            <Dot /><Dot /><Dot />
          </div>
        </div>

        {/* Ribbon */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#edebe9] bg-[#faf9f8] px-3 py-1.5 text-[13px] text-[#242424]">
          <Ribbon icon="mail" label="New mail" strong />
          <Sep />
          <Ribbon icon="trash" label="Delete" muted={!open} />
          <Ribbon icon="archive" label="Archive" muted={!open} />
          <button
            onClick={() => open && report(open)}
            disabled={!open}
            className={`flex items-center gap-1.5 rounded px-2 py-1 ${open ? "text-[#a4262c] hover:bg-[#f3f2f1]" : "cursor-not-allowed text-[#c8c6c4]"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
            Report
          </button>
          <Sep />
          <Ribbon icon="reply" label="Reply" muted={!open} />
          <Ribbon icon="forward" label="Forward" muted={!open} />
        </div>

        {/* Three panes */}
        <div className="grid min-h-[30rem] grid-cols-1 lg:grid-cols-[176px_minmax(0,340px)_1fr]">
          {/* Folder rail */}
          <aside className="hidden border-r border-[#edebe9] bg-[#f3f2f1] py-3 lg:block">
            <div className="px-4 pb-2 text-[13px] font-semibold text-[#242424]">{data?.to || "you"}</div>
            <ul className="text-[13px] text-[#242424]">
              {FOLDERS.map(([name, count], i) => (
                <li key={name} className={`flex items-center justify-between px-4 py-1.5 ${i === 0 ? "border-l-2 border-[#0f6cbd] bg-[#eaeef7] font-semibold" : "border-l-2 border-transparent"}`}>
                  <span>{name}</span>
                  {count !== "" && <span className="text-[#616161]">{count}</span>}
                </li>
              ))}
            </ul>
          </aside>

          {/* Message list */}
          <section className="border-r border-[#edebe9]">
            <div className="flex items-center gap-4 border-b border-[#edebe9] px-4 pt-3 text-[14px]">
              {(["focused", "other"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`pb-2 capitalize ${tab === t ? "border-b-2 border-[#0f6cbd] font-semibold text-[#0f6cbd]" : "text-[#616161]"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <ul className="max-h-[30rem] overflow-y-auto">
              {shown.map((r) => {
                const unread = r.unread && !read.has(r.key);
                const selected = r.key === openKey;
                return (
                  <li key={r.key}>
                    <button
                      onClick={() => selectRow(r)}
                      className={`flex w-full gap-3 border-b border-[#f3f2f1] px-3 py-2.5 text-left ${selected ? "bg-[#eaeef7]" : "hover:bg-[#f8f8f8]"}`}
                    >
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white`} style={{ background: r.color }}>
                        {r.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-[14px] ${unread ? "font-bold text-[#242424]" : "text-[#242424]"}`}>{r.sender}</span>
                          <span className="shrink-0 text-[12px] text-[#616161]">{fmtTime(r.ts)}</span>
                        </span>
                        <span className={`block truncate text-[13px] ${unread ? "font-semibold text-[#242424]" : "text-[#242424]"}`}>{r.subject}</span>
                        <span className="block truncate text-[12px] text-[#616161]">{r.body.split("\n")[0]}</span>
                      </span>
                      {unread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0f6cbd]" />}
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-[#616161]">No messages here.</li>}
            </ul>
          </section>

          {/* Reading pane */}
          <section className="min-h-[20rem] bg-white p-6">
            {!open ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <svg viewBox="0 0 24 24" className="h-14 w-14 text-[#c8c6c4]" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                <div className="mt-4 text-[15px] text-[#242424]">Select an item to read</div>
                <div className="text-[13px] text-[#616161]">Nothing is selected</div>
              </div>
            ) : (
              <>
                <h2 className="text-[20px] font-semibold text-[#242424]">{open.subject}</h2>
                <div className="mt-3 flex items-center gap-3 border-b border-[#edebe9] pb-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: open.color }}>{open.initials}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#242424]">{open.sender}</div>
                    <div className="text-[12px] text-[#616161]">To: {data?.to} · {fmtTime(open.ts)}</div>
                  </div>
                  <button
                    onClick={() => report(open)}
                    className="ml-auto flex items-center gap-1.5 rounded border border-[#d1d1d1] px-3 py-1.5 text-[13px] text-[#a4262c] hover:bg-[#f3f2f1]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
                    Report phishing
                  </button>
                </div>
                <div className="mt-4 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#242424]">
                  {open.kind === "training" ? linkify(open.body) : plainLinks(open.body)}
                </div>
                {open.kind === "training" && open.status !== "sent" && (
                  <div className="mt-6 rounded-lg bg-[#f3f2f1] px-4 py-3 text-[13px] text-[#616161]">
                    {open.status === "reported" ? "You reported this message as phishing." : "You opened the link in this message. See the teaching page."}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}

function Dot() { return <span className="h-3.5 w-3.5 rounded-full bg-white/25" />; }
function Sep() { return <span className="mx-1 h-5 w-px bg-[#edebe9]" />; }

function Ribbon({ label, strong, muted }: { icon: string; label: string; strong?: boolean; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 rounded px-2 py-1 ${muted ? "text-[#c8c6c4]" : strong ? "font-semibold text-[#0f6cbd]" : "text-[#242424]"}`}>
      <span className={`inline-block h-4 w-4 rounded-sm ${strong ? "bg-[#0f6cbd]/15" : "bg-[#edebe9]"}`} />
      {label}
    </span>
  );
}

// Training lure links are LIVE: clicking one is "the click" → teaching page, sender scores.
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} className="text-[#0f6cbd] underline">{p}</a> : <span key={i}>{p}</span>
  );
}
// Faux-email links are inert (this is legitimate noise mail, not part of the game).
function plainLinks(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href="#" onClick={(e) => e.preventDefault()} className="text-[#0f6cbd] underline">{p}</a> : <span key={i}>{p}</span>
  );
}
