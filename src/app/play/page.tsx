"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getActing, type ActingPlayer } from "@/lib/client";
import { Page, Eyebrow, Heading, Card, ButtonLink, Stat, Rule } from "@/components/ui";
import { Hook, Harpoon } from "@/components/icons";

export default function Play() {
  const router = useRouter();
  const [acting, setActingState] = useState<ActingPlayer | null>(null);
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = getActing();
    if (!a) { router.push("/"); return; }
    setActingState(a);
    api(`/api/state?playerId=${a.id}`).then((res) => { setState(res.ok ? res : null); setLoading(false); });
  }, [router]);

  if (loading) return <Page><p className="text-sky/50">Loading…</p></Page>;
  if (!state) return <Page><p className="text-fawn">Could not load your week. Re-seed on the home page.</p></Page>;

  const { week, opponent, shots } = state;
  const noCasts = shots.castsLeft <= 0;

  return (
    <Page>
      <Eyebrow>Week {week} · Regular season</Eyebrow>
      <Heading className="mt-3">My Week</Heading>

      {/* Matchup */}
      <Card className="mt-7">
        <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-cyan">You · offense</div>
            <div className="mt-2 font-heading text-4xl leading-none text-sky">{acting?.name}</div>
          </div>
          <Hook className="mx-auto h-6 w-6 text-sky/25" />
          <div className="sm:text-right">
            <div className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/45">Target · defense</div>
            <div className="mt-2 font-heading text-4xl leading-none text-sky">{opponent?.name ?? "—"}</div>
          </div>
        </div>
      </Card>

      {/* Shots */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="grid grid-cols-2 gap-6">
            <Stat label="Casts left" value={shots.castsLeft} sub={`${shots.castsUsed} of ${shots.capPerWeek} used`} tone="cyan" />
            <Stat label="Spear" value={shots.spearAvailable ? "1" : "0"} sub={shots.spearAvailable ? "available this season" : "already used"} />
          </div>
          <Rule className="my-5" />
          <p className="text-xs text-sky/45">Caps are enforced by the server at send time, not just by these buttons.</p>
        </Card>
        <Card className="flex flex-col justify-between gap-5">
          <div>
            <div className="font-body text-[11px] font-semibold uppercase tracking-eyebrow text-sky/45">Take a shot</div>
            <p className="mt-2 text-[15px] leading-relaxed text-sky/70">
              You can only ever target {opponent?.name ?? "your scheduled opponent"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/cast" disabled={noCasts}><Hook className="h-4 w-4" /> New Cast</ButtonLink>
            <ButtonLink href="/spear" variant="outline" disabled={!shots.spearAvailable}><Harpoon className="h-4 w-4" /> Use Spear</ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href="/week" variant="ghost">Live scoreboard</ButtonLink>
        <ButtonLink href="/inbox" variant="ghost">My inbox · defense</ButtonLink>
      </div>
    </Page>
  );
}
