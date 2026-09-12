import { randomUUID } from "node:crypto";
import { z } from "zod";
import { blankConsent, containsStrongLanguage, createFreshSeed, type Database, type PlayerAccount, type PlayerState, type Session } from "@fp/shared";
import { ApiError, type GameService } from "./service.js";
import { leagueSummaries } from "./leagues.js";
import { gamePools } from "./repository.js";

export const accountSetupSchema = z.object({
  displayName: z.string().trim().min(2).max(24),
  email: z.string().trim().email().max(254),
  adult: z.literal(true),
  channels: z.object({ email: z.boolean(), sms: z.boolean(), voice: z.boolean() }).strict(),
  timezone: z.string().min(1).max(100),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  familyFriendly: z.boolean(),
  excludedThemes: z.array(z.string().trim().max(80)).max(5),
}).strict();

export function accountFor(db: Database, userId: string): PlayerAccount {
  const account = db.accounts?.find(a => a.userId === userId) ?? db.members.find(m => m.userId === userId);
  if (!account || !db.profiles.some(p => p.id === userId)) throw new ApiError(403, "Sign in to your player account");
  return account;
}

export function setupState(db: Database, session: Session, mode: "demo" | "live", now: number): PlayerState {
  const account = accountFor(db, session.userId);
  const me = db.profiles.find(p => p.id === session.userId)!;
  const leagues = leagueSummaries(db, session.userId);
  const selected = leagues.find(l => l.id === (session.selectedLeagueId ?? db.userSelections?.[session.userId]?.leagueId)) ?? leagues[0];
  const { seed: _seed, ...match } = createFreshSeed(now).match;
  return {
    setupStage: account.consent.acceptedAt ? "league" : "player", mode, revision: db.revision, now, me,
    opponent: { ...me, id: "", name: "Your next opponent", initials: "?" },
    consent: account.consent, match,
    selectedLeagueId: selected?.id ?? "", leagues,
    league: { id: selected?.id ?? "", name: selected?.name ?? "Your first league", members: [] },
    castRules: { version: "email-casts-v2", regularLimit: 2, spearLimit: 1, spearUsed: 0, spearRemaining: 1 },
    drafts: [], incoming: [], remaining: 0, draftProgress: { mine: 0, opponent: 0 }, recap: null, readiness: [],
    activityCard: { order: "", event: "", voice: "" }, role: session.role,
  };
}

export async function saveAccount(service: GameService, userId: string, input: z.infer<typeof accountSetupSchema>) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(); }
  catch { throw new ApiError(400, "Choose a valid time zone"); }
  if (input.startHour >= input.endHour) throw new ApiError(400, "Choose an end hour later than the start");
  return service.transact(db => {
    const current = accountFor(db, userId);
    const email = current.consent.contacts.email;
    const sameEmail = email?.destination.toLowerCase() === input.email.toLowerCase();
    if (current.localAuth && db.accounts?.some(account => account.userId !== userId &&
      (account.localAuth?.email === input.email.toLowerCase() || account.consent.contacts.email?.destination.toLowerCase() === input.email.toLowerCase())))
      throw new ApiError(409, "That email is already attached to another account.");
    if (!service.simulated && (!sameEmail || !email?.verified || !["auth0", "verify"].includes(email.method)))
      throw new ApiError(409, "Use the verified email from your sign-in account. Verify it with your identity provider and sign in again.");
    if (!current.consent.acceptedAt && !Object.values(input.channels).some(Boolean)) throw new ApiError(400, "Choose at least one challenge type to finish setup");
    const consent = {
      ...current.consent, version: "2026-09-email-v2", acceptedAt: service.now(db), adult: true,
      channels: input.channels, timezone: input.timezone, startHour: input.startHour, endHour: input.endHour,
      familyFriendly: input.familyFriendly, excludedThemes: input.excludedThemes,
      contacts: { ...current.consent.contacts, email: sameEmail ? email! : { destination: input.email, verified: false, method: "demo" as const } },
    };
    db.accounts ??= [];
    const index = db.accounts.findIndex(a => a.userId === userId);
    const next = { userId, consent, ...(current.auth0Sub ? { auth0Sub: current.auth0Sub } : {}),
      ...(current.localAuth ? { localAuth: { ...current.localAuth, email: input.email.toLowerCase() } } : {}) };
    if (index < 0) db.accounts.push(next); else db.accounts[index] = next;
    const profile = db.profiles.find(p => p.id === userId)!;
    profile.name = input.displayName;
    profile.initials = input.displayName.split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
    for (const member of db.members.filter(m => m.userId === userId)) {
      member.accepted = true;
      member.consent = structuredClone(consent);
    }
    // A queued cast never silently follows an address change or a withdrawn preference.
    for (const pool of gamePools(db)) for (const job of pool.jobs.filter(j => j.type === "delivery" && ["queued", "leased"].includes(j.status))) {
      const scenario = pool.scenarios.find(s => s.id === job.scenarioId);
      if (!scenario || scenario.recipientId !== userId) continue;
      const text = [scenario.templateId, ...Object.values(scenario.content).flat()].join(" ").toLowerCase();
      if (!sameEmail || !input.channels[scenario.channel] || (input.familyFriendly && containsStrongLanguage(text)) || input.excludedThemes.some(t => text.includes(t.toLowerCase()))) {
        if (job.status === "queued") job.status = "cancelled";
        scenario.deliveryStatus = "cancelled";
      }
    }
    return { ok: true };
  });
}

export async function ensureIdentityAccount(service: GameService, identity: { sub: string; email?: string; emailVerified?: boolean }) {
  const snapshot = await service.readDb();
  const saved = snapshot.accounts?.find(a => a.auth0Sub === identity.sub) ?? snapshot.members.find(m => m.auth0Sub === identity.sub);
  // An already bound identity may inspect its account when userinfo is unavailable.
  // This never establishes contact ownership or permits creating a new account.
  if (saved && (!identity.email || !identity.emailVerified)) return saved.userId;
  if (!identity.email || !identity.emailVerified || !z.string().email().safeParse(identity.email).success)
    throw new ApiError(403, "Verify your email address with the sign-in provider, then sign in again.");
  if (saved?.consent.contacts.email?.method === "auth0" && saved.consent.contacts.email.verified && saved.consent.contacts.email.destination.toLowerCase() === identity.email.toLowerCase()) return saved.userId;
  return service.transact(db => {
    db.accounts ??= [];
    const existing = db.accounts.find(a => a.auth0Sub === identity.sub) ?? db.members.find(m => m.auth0Sub === identity.sub);
    const userId = existing?.userId ?? randomUUID();
    const consent = existing ? structuredClone(existing.consent) : blankConsent();
    const changed = consent.contacts.email?.destination.toLowerCase() !== identity.email!.toLowerCase();
    consent.contacts.email = { destination: identity.email!, verified: true, method: "auth0", verifiedAt: Date.now() };
    if (changed) { consent.acceptedAt = null; consent.channels.email = false; }
    const account = { userId, auth0Sub: identity.sub, consent };
    const index = db.accounts.findIndex(a => a.userId === userId);
    if (index < 0) db.accounts.push(account); else db.accounts[index] = account;
    if (!existing) db.profiles.push({ id: userId, name: identity.email!.split("@")[0].slice(0, 24), initials: identity.email![0].toUpperCase(), color: "#44E2C3", interests: ["Board games", "Live music", "Outdoor adventures"], historical: false, leaguePoints: 0, wins: 0, losses: 0, draws: 0 });
    for (const member of db.members.filter(m => m.userId === userId)) {
      member.auth0Sub = identity.sub;
      member.consent.contacts.email = structuredClone(consent.contacts.email);
      if (changed) { member.consent.acceptedAt = null; member.consent.channels.email = false; member.accepted = false; }
    }
    return userId;
  });
}
