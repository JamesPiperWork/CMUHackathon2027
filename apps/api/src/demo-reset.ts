import type { Database } from "@fp/shared";
import { accountFor } from "./accounts.js";
import { ApiError, type GameService } from "./service.js";
import { gamePools } from "./repository.js";

export function demoResetCapability(service: GameService, db: Database, userId: string): "all" | "active-leagues" | null {
  const account = accountFor(db, userId);
  if (service.simulated) return "all";
  const email = account.consent.contacts.email;
  return service.config.emailDemo && email?.verified && email.method === "verify" &&
    email.destination.toLowerCase() === process.env.SMTP_USER?.trim().toLowerCase() ? "active-leagues" : null;
}

export async function resetDemo(service: GameService, userId: string) {
  if (service.simulated) {
    accountFor(await service.readDb(), userId);
    await service.reset(true);
    return { ok: true, preserveSession: false };
  }
  await service.transact(db => {
    if (demoResetCapability(service, db, userId) !== "active-leagues") throw new ApiError(403, "Only the verified email-demo organizer can reset active leagues.");
    const now = service.now(db);
    const archived = new Set((db.leagues ?? []).filter(league => !league.archivedAt).map(league => {
      league.archivedAt = now;
      return league.id;
    }));
    for (const pool of gamePools(db).filter(pool => archived.has(pool.match.leagueId))) {
      if (pool.match.state !== "completed") pool.match.state = "cancelled";
      for (const job of pool.jobs.filter(job => ["queued", "leased"].includes(job.status))) {
        const scenario = pool.scenarios.find(item => item.id === job.scenarioId);
        if (job.type === "delivery" && job.status === "leased") {
          // An in-flight SMTP request cannot be recalled. Retain its attempt
          // and consume quota until the original request or receipt resolves it.
          job.status = "unknown";
          for (const attempt of pool.attempts.filter(attempt => attempt.scenarioId === job.scenarioId && attempt.status === "queued")) {
            attempt.status = "unknown";
            attempt.updatedAt = now;
            attempt.reason = "League reset during submission; awaiting original transport evidence. Do not retry.";
          }
        } else job.status = "cancelled";
        job.leaseExpiresAt = null;
        if (scenario && job.type === "delivery" && scenario.releasedAt === null) scenario.deliveryStatus = "cancelled";
        if (scenario && job.type === "generation") { scenario.generationStatus = "failed"; scenario.generationReason = "This league was reset before the draft finished."; }
      }
    }
    for (const session of db.sessions) if (session.selectedLeagueId && archived.has(session.selectedLeagueId)) {
      delete session.selectedLeagueId; delete session.selectedMatchId;
    }
    for (const [id, selection] of Object.entries(db.userSelections ?? {})) if (archived.has(selection.leagueId)) delete db.userSelections![id];
  });
  return { ok: true, preserveSession: true };
}
