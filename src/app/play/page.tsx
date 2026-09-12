"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";

export default function Play() {
  const router = useRouter();
  const [acting, setActingState] = useState<ActingPlayer | null>(null);
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActingState(a);
    api(`/api/state?playerId=${a.id}`).then((res) => {
      setState(res.ok ? res : null);
      setLoading(false);
    });
  }, [router]);

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-10 text-chalk/50">Loading…</main>;
  if (!state) return <main className="mx-auto max-w-3xl px-4 py-10 text-blood">Could not load your week. Re-seed on the home page.</main>;

  const { week, opponent, shots } = state;
  const noCasts = shots.castsLeft <= 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Week {week}</h1>
        <span className="text-sm text-chalk/60">Playing as {acting?.name}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-chalk/10 bg-turf/30 p-6">
        <div className="text-sm uppercase tracking-wide text-chalk/50">Your matchup this week</div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-center">
            <div className="text-xl font-bold text-neon">{acting?.name}</div>
            <div className="text-xs text-chalk/50">you (offense)</div>
          </div>
          <div className="text-2xl font-black text-chalk/40">VS</div>
          <div className="text-center">
            <div className="text-xl font-bold">{opponent?.name ?? "—"}</div>
            <div className="text-xs text-chalk/50">target</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-chalk/10 bg-pitch/50 p-6">
        <div className="text-sm font-semibold text-flag">
          🎯 {shots.castsLeft} cast{shots.castsLeft === 1 ? "" : "s"} left ·{" "}
          {shots.spearAvailable ? "spear available" : "spear used"}
        </div>
        <div className="mt-1 text-xs text-chalk/50">
          {shots.castsUsed}/{shots.capPerWeek} casts used this week. The server enforces these caps.
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={noCasts ? "#" : "/cast"}
            aria-disabled={noCasts}
            className={`rounded-lg px-4 py-2 font-semibold ${
              noCasts ? "cursor-not-allowed bg-chalk/10 text-chalk/40" : "bg-neon text-pitch hover:brightness-110"
            }`}
          >
            New Cast
          </Link>
          <Link
            href={shots.spearAvailable ? "/spear" : "#"}
            aria-disabled={!shots.spearAvailable}
            className={`rounded-lg px-4 py-2 font-semibold ${
              shots.spearAvailable ? "bg-flag text-pitch hover:brightness-110" : "cursor-not-allowed bg-chalk/10 text-chalk/40"
            }`}
          >
            Use Spear
          </Link>
          <Link href="/week" className="rounded-lg border border-chalk/20 px-4 py-2 text-chalk/80">
            Live Scoreboard →
          </Link>
          <Link href="/inbox" className="rounded-lg border border-chalk/20 px-4 py-2 text-chalk/80">
            My Inbox (defense)
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-chalk/40">
        You can only ever target {opponent?.name ?? "your scheduled opponent"} — the server resolves
        your target from the schedule. There is no way to type an address.
      </p>
    </main>
  );
}
