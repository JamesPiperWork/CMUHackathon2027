import { randomUUID } from "crypto";
import type { LeagueDoc, PlayerDoc, CastDoc, MatchupDoc } from "./types";

// Zero-dependency in-process store. Lives on globalThis so it survives Next.js dev
// hot-reloads and stays warm across requests on a single Vercel function instance.
// The collection shapes mirror the original MongoDB data model one-for-one, so a
// persistent adapter (e.g. Vercel KV) can be dropped in behind this same interface.
export interface Store {
  leagues: LeagueDoc[];
  players: PlayerDoc[];
  casts: CastDoc[];
  matchups: MatchupDoc[];
}

declare global {
  // eslint-disable-next-line no-var
  var __fpStore: Store | undefined;
}

function empty(): Store {
  return { leagues: [], players: [], casts: [], matchups: [] };
}

export function getStore(): Store {
  if (!globalThis.__fpStore) globalThis.__fpStore = empty();
  return globalThis.__fpStore;
}

export function resetStore(): Store {
  globalThis.__fpStore = empty();
  return globalThis.__fpStore;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
