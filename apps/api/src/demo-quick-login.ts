import { randomUUID } from "node:crypto";
import { blankConsent, blankGame } from "@fp/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, type GameService } from "./service.js";
import { LeagueService } from "./leagues.js";

const leagueId = "local-demo-alex-justin"; // Stable ID preserves the existing demo matchup.
export function quickLoginEnabled(service: GameService) {
  const url = new URL(service.config.apiOrigin);
  return service.config.mode === "demo" && service.config.emailCapture === true && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && service.config.appOrigin === service.config.apiOrigin;
}

export async function seedQuickLeague(service: GameService) {
  if (!quickLoginEnabled(service)) throw new ApiError(404, "Local quick sign-in is unavailable.");
  return service.transact(db => {
    // Rename the synthetic demo opponent in place so existing drafts and sessions survive.
    const former = db.accounts?.find(a => a.consent.contacts.email?.destination === "justin@demo.test" && a.consent.contacts.email.method === "captured");
    if (former && !db.accounts?.some(a => a.consent.contacts.email?.destination === "jordan@demo.test")) {
      former.consent.contacts.email!.destination = "jordan@demo.test";
      const profile = db.profiles.find(p => p.id === former.userId);
      if (profile) { profile.name = "Jordan"; profile.initials = "J"; }
      for (const member of db.members.filter(m => m.userId === former.userId)) member.consent.contacts.email = structuredClone(former.consent.contacts.email);
    }

    const players = ["alex", "jordan"].map(player => {
      const email = `${player}@demo.test`;
      let account = db.accounts?.find(a => a.consent.contacts.email?.destination === email && a.consent.contacts.email.method === "captured");
      if (!account) {
        const now = service.now(db);
        account = { userId: randomUUID(), consent: { ...blankConsent(), adult: true, acceptedAt: now, channels: { email: true, sms: false, voice: false }, startHour: 0, endHour: 24, contacts: { email: { destination: email, verified: true, method: "captured", verifiedAt: now } } } };
        (db.accounts ??= []).push(account);
        db.profiles.push({ id: account.userId, name: player === "alex" ? "Alex" : "Jordan", initials: player[0].toUpperCase(), color: player === "alex" ? "#96DEC5" : "#F2C14B", interests: ["Board games"], historical: false, leaguePoints: 0, wins: 0, losses: 0, draws: 0 });
      }
      if (!account.consent.acceptedAt) Object.assign(account.consent, { adult: true, acceptedAt: service.now(db), channels: { email: true, sms: false, voice: false }, startHour: 0, endHour: 24 });
      return account;
    });
    let league = db.leagues?.find(l => l.id === leagueId && !l.archivedAt);
    if (!league) {
      league = { id: leagueId, name: "The Fishing Crew", inviteCode: "ALEXJORDAN", commissionerId: players[0].userId, currentWeek: 1, season: new Date().getFullYear(), settings: { difficulty: "standard", familyFriendly: true, channels: { email: true, sms: true, voice: true } }, createdAt: service.now(db), standings: Object.fromEntries(players.map(a => [a.userId, { leaguePoints: 0, wins: 0, losses: 0, draws: 0 }])) };
      (db.leagues ??= []).push(league);
      for (const account of players) db.members.push({ userId: account.userId, leagueId, accepted: true, consent: structuredClone(account.consent) });
      const pool = blankGame(randomUUID(), leagueId, players.map(a => a.userId), 1, service.now(db));
      pool.match.ruleSet = "email-casts-v2"; pool.match.season = league.season;
      (db.matchPools ??= []).push(pool);
    }
    // Roster-only demo players: no accounts, contact details, or delivery consent.
    const roster = [
      { id: "demo-roster-maya", name: "Maya Chen", initials: "MC", color: "#C4B5FD" },
      { id: "demo-roster-casey", name: "Casey Reed", initials: "CR", color: "#93C5FD" },
      { id: "demo-roster-sam", name: "Sam Rivera", initials: "SR", color: "#FDBA74" },
      { id: "demo-roster-priya", name: "Priya Shah", initials: "PS", color: "#F9A8D4" },
      { id: "demo-roster-eli", name: "Eli Park", initials: "EP", color: "#A3E635" },
      { id: "demo-roster-zoe", name: "Zoe Brooks", initials: "ZB", color: "#67E8F9" },
    ];
    for (const player of roster) {
      const record = { leaguePoints: 0, wins: 0, losses: 0, draws: 0 };
      if (!db.profiles.some(p => p.id === player.id)) db.profiles.push({ ...player, interests: [], historical: true, ...record });
      if (!db.members.some(m => m.leagueId === leagueId && m.userId === player.id)) db.members.push({ userId: player.id, leagueId, accepted: false, consent: blankConsent() });
      (league.standings ??= {})[player.id] ??= record;
    }
    return { alex: players[0].userId, jordan: players[1].userId };
  });
}

export async function registerDemoQuickLogin(app: FastifyInstance, service: GameService) {
  if (quickLoginEnabled(service)) await seedQuickLeague(service);
  app.post("/api/auth/demo-quick", async (request, reply) => {
    if (!quickLoginEnabled(service)) throw new ApiError(404, "Local quick sign-in is unavailable.");
    if (request.headers.origin !== service.config.apiOrigin || request.headers["sec-fetch-site"] === "cross-site") throw new ApiError(403, "Open the local app to sign in.");
    const { player } = z.object({ player: z.enum(["alex", "jordan"]) }).strict().parse(request.body);
    const players = await seedQuickLeague(service);
    const session = await service.createSession(players[player]);
    await new LeagueService(service).select((await service.sessionForToken(session.token))!, leagueId);
    reply.setCookie("fp_session", session.token, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 7 * 86400 });
    return session;
  });
}
