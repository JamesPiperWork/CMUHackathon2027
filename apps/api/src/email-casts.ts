import { randomUUID } from "node:crypto";
import type { Database, GenerateRequest, Scenario } from "@fp/shared";
import { gamePools } from "./repository.js";
import { ApiError } from "./service.js";

// Adapted from main 9901d38's casts/send quota checks, persisted in our atomic repository.
export const emailGame = (db: Database) => db.match.ruleSet === "email-casts-v2";
export const castSeason = (db: Database) => db.match.season ?? db.leagues?.find(l => l.id === db.match.leagueId)?.season ?? new Date(db.match.startedAt ?? db.match.deadline).getUTCFullYear();
export const spearUses = (db: Database, userId: string) => (db.spearUses ?? []).filter(use => use.userId === userId && use.leagueId === db.match.leagueId && use.season === castSeason(db));

/** Upgrade only unplayed drafts. Played match history keeps its original rules and scores. */
export function initializeEmailRules(db: Database, now: number) {
  db.spearUses ??= [];
  db.archivedDrafts ??= [];
  for (const pool of gamePools(db)) {
    if (pool.match.ruleSet || pool.match.state !== "drafting" || pool.decisions.length || pool.attempts.length) continue;
    pool.match.ruleSet = "email-casts-v2";
    pool.match.season = db.leagues?.find(l => l.id === pool.match.leagueId)?.season ?? new Date(now).getUTCFullYear();
    const kept = new Set<string>();
    const slots = new Map<string, number>();
    for (const scenario of pool.scenarios) {
      const slot = (slots.get(scenario.authorId ?? "") ?? 0) + 1;
      if (scenario.channel === "email" && scenario.authorId && scenario.isPhishing && slot <= 2) {
        scenario.kind = "regular";
        scenario.slot = slot as 1 | 2;
        // Existing approved text remains valid; future generations use the narrative policy.
        slots.set(scenario.authorId, slot);
        kept.add(scenario.id);
      } else db.archivedDrafts.push(structuredClone(scenario));
    }
    for (const job of pool.jobs) if (!kept.has(job.scenarioId)) job.status = "cancelled";
    pool.scenarios.splice(0, pool.scenarios.length, ...pool.scenarios.filter(s => kept.has(s.id)));
  }
}

export function castDraft(db: Database, authorId: string, input: GenerateRequest) {
  const kind = input.kind ?? "regular";
  if (kind === "spear" && input.slot !== undefined) throw new ApiError(400, "A Spear does not use a regular cast slot.");
  const slot = kind === "regular" ? input.slot ?? 1 : undefined;
  const draft = db.scenarios.find(s => s.authorId === authorId && s.kind === kind && s.slot === slot);
  if (kind === "spear" && spearUses(db, authorId).some(use => use.scenarioId !== draft?.id)) throw new ApiError(409, "Your Spear has already been used this league season.");
  if (!draft && kind === "regular" && db.scenarios.filter(s => s.authorId === authorId && s.kind === "regular").length >= 2) throw new ApiError(409, "You have used both cast slots this week across all media.");
  return { draft, kind, slot };
}

export function reserveSpear(db: Database, draft: Scenario, now: number) {
  if (draft.kind !== "spear" || !draft.authorId) return;
  const used = spearUses(db, draft.authorId);
  if (used.some(use => use.scenarioId !== draft.id)) throw new ApiError(409, "Your Spear has already been used this league season.");
  if (!used.length) (db.spearUses ??= []).push({ leagueId: db.match.leagueId, season: castSeason(db), userId: draft.authorId, scenarioId: draft.id, usedAt: now });
}

/** One end-of-week point per delivered, unclicked cast; retries and restarts are neutral. */
export function awardAvoidance(db: Database) {
  for (const scenario of db.scenarios) {
    const confirmedFlag = db.decisions.some(d => d.scenarioId === scenario.id && d.recipientId === scenario.recipientId && d.choice === "flag");
    // Ringing, voicemail, no answer, or a completed call never prove that the
    // player heard and identified a voice challenge. Only an explicit flag does.
    if (scenario.channel === "voice" && !confirmedFlag) continue;
    if (!scenario.authorId || !scenario.locked || !scenario.isPhishing || scenario.releasedAt === null || (!confirmedFlag && !["simulated", "delivered", "unanswered"].includes(scenario.deliveryStatus))) continue;
    if (!confirmedFlag && db.attempts.some(a => a.scenarioId === scenario.id && a.provider === "smtp" && a.receiptStatus === "delivered" && a.receiptOccurredAt !== undefined && a.receiptOccurredAt >= db.match.deadline)) continue;
    if (db.decisions.some(d => d.scenarioId === scenario.id && d.choice === "trust")) continue;
    if (db.scoreEvents.some(e => e.type === "avoidance" && e.sourceId === scenario.id && e.userId === scenario.recipientId)) continue;
    db.scoreEvents.push({ id: randomUUID(), sourceId: scenario.id, userId: scenario.recipientId, type: "avoidance", points: 1 });
    db.match.scores[scenario.recipientId] += 1;
  }
}
