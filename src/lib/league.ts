import { getStore } from "./store";
import { ensureSeeded } from "./seed";
import { RULES, APP_URL, DEMO_LEAGUE_NAME } from "./config";
import { computeWeekScores } from "./scoring";
import type { LeagueDoc, PlayerDoc, CastDoc, MatchupDoc } from "./types";

export { RULES };

export function db() {
  ensureSeeded();
  return getStore();
}

export function getDemoLeague(): LeagueDoc | undefined {
  return db().leagues.find((l) => l.name === DEMO_LEAGUE_NAME) || db().leagues[0];
}

export function getLeague(id: string): LeagueDoc | undefined {
  return db().leagues.find((l) => l._id === id);
}

export function getPlayer(id: string): PlayerDoc | undefined {
  return db().players.find((p) => p._id === id);
}

export function getRoster(leagueId: string): PlayerDoc[] {
  return db().players.filter((p) => p.leagueId === leagueId);
}

// Resolve the sender's SCHEDULED opponent for a given week from the matchups
// collection. This is the closed-loop enforcement point: a cast may only target this id.
export function getScheduledOpponentId(leagueId: string, playerId: string, week: number): string | null {
  const m = db().matchups.find(
    (x) => x.leagueId === leagueId && x.week === week && (x.homeId === playerId || x.awayId === playerId)
  );
  if (!m) return null;
  return m.homeId === playerId ? m.awayId : m.homeId;
}

// Count this sender's regular casts (type='cast') this week — the weekly-cap check.
export function countWeeklyCasts(leagueId: string, senderId: string, week: number): number {
  return db().casts.filter((c) => c.leagueId === leagueId && c.senderId === senderId && c.week === week && c.type === "cast").length;
}

export function countSeasonSpears(leagueId: string, senderId: string): number {
  return db().casts.filter((c) => c.leagueId === leagueId && c.senderId === senderId && c.type === "spear").length;
}

export function getWeekCasts(leagueId: string, week: number): CastDoc[] {
  return db().casts.filter((c) => c.leagueId === leagueId && c.week === week);
}

export function getWeekMatchups(leagueId: string, week: number): MatchupDoc[] {
  return db().matchups.filter((m) => m.leagueId === leagueId && m.week === week);
}

// Live derived scores for every player in a week.
export function liveWeekScores(leagueId: string, week: number): Record<string, number> {
  const roster = getRoster(leagueId).map((p) => p._id);
  return computeWeekScores(getWeekCasts(leagueId, week), roster);
}

// Public base URL for tracking links: env override, else the request's own origin
// (works on Vercel previews/prod and localhost with no config).
export function originFrom(req: Request): string {
  if (APP_URL) return APP_URL;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

// JSON-safe view: expose `_id` as `id` for the client.
export function pub<T extends { _id: string }>(doc: T | undefined | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}
