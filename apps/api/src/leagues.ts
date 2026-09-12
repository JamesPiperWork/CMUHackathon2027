import { randomBytes, randomUUID } from 'node:crypto';
import { blankGame, buildSchedule, type Database, type LeagueSummary, type LeagueSettings, type LeagueMatchup, type Session } from '@fp/shared';
import { ApiError, type GameService } from './service.js';
import { accountFor } from "./accounts.js";
import { gamePools } from './repository.js';

export function requireLeague(db: Database, userId: string, leagueId: string) {
  const league = db.leagues?.find((l) => l.id === leagueId);
  if (!league || league.archivedAt || !db.members.some((m) => m.userId === userId && m.leagueId === leagueId))
    throw new ApiError(404, 'League not found');
  return league;
}
export function leagueProfile(db: Database, userId: string, leagueId: string) {
  const profile = db.profiles.find((p) => p.id === userId)!;
  const record = db.leagues?.find((l) => l.id === leagueId)?.standings?.[userId];
  return { ...profile, ...record };
}
export function leagueSummaries(db: Database, userId: string): LeagueSummary[] {
  return (db.leagues ?? []).filter((l) => !l.archivedAt && db.members.some((m) => m.leagueId === l.id && m.userId === userId)).map((l) => ({
    ...l, memberCount: db.members.filter((m) => m.leagueId === l.id).length,
    myMatchId: gamePools(db).find((p) => p.match.leagueId === l.id && p.match.week === l.currentWeek && p.match.players.includes(userId))?.match.id ?? null,
  }));
}
export class LeagueService {
  constructor(private service: GameService) {}
  async list(session: Session) {
    const db = await this.service.readDb();
    const leagues = leagueSummaries(db, session.userId);
    const selected = session.selectedLeagueId ?? db.userSelections?.[session.userId]?.leagueId ?? db.match.leagueId;
    return { leagues, selectedLeagueId: leagues.some(league => league.id === selected) ? selected : leagues[0]?.id ?? "" };
  }
  async create(session: Session, name: string) {
    return this.service.transact((db) => {
      if (db.leagues!.filter((l) => !l.archivedAt && l.commissionerId === session.userId).length >= 10) throw new ApiError(409, 'You already manage ten leagues');
      const source = accountFor(db, session.userId);
      if (!source.consent.acceptedAt) throw new ApiError(409, "Finish player setup before joining a league");
      const id = randomUUID();
      db.leagues!.push({ id, name, inviteCode: randomBytes(5).toString('hex').toUpperCase(), commissionerId: session.userId, currentWeek: 1, season: new Date(this.service.now(db)).getFullYear(), settings: { difficulty: 'standard', familyFriendly: true, channels: { email: true, sms: true, voice: true } }, createdAt: this.service.now(db), standings: { [session.userId]: { leaguePoints: 0, wins: 0, losses: 0, draws: 0 } } });
      db.members.push({ userId: source.userId, consent: structuredClone(source.consent), ...(source.auth0Sub ? { auth0Sub: source.auth0Sub } : {}), accepted: true, leagueId: id });
      this.setSelection(db, session, id);
      return leagueSummaries(db, session.userId).find((l) => l.id === id)!;
    });
  }
  async join(session: Session, inviteCode: string) {
    return this.service.transact((db) => {
      const league = db.leagues!.find((l) => !l.archivedAt && l.inviteCode === inviteCode.toUpperCase());
      if (!league) throw new ApiError(404, 'Invite code not found');
      if (!db.members.some((m) => m.leagueId === league.id && m.userId === session.userId)) {
        if (db.members.filter((m) => m.leagueId === league.id).length >= 16) throw new ApiError(409, 'This league has reached 16 players');
        const source = accountFor(db, session.userId);
      if (!source.consent.acceptedAt) throw new ApiError(409, "Finish player setup before joining a league");
        db.members.push({ userId: source.userId, consent: structuredClone(source.consent), ...(source.auth0Sub ? { auth0Sub: source.auth0Sub } : {}), accepted: true, leagueId: league.id });
        if (league.standings) league.standings[session.userId] = { leaguePoints: 0, wins: 0, losses: 0, draws: 0 };
      }
      this.schedule(db, league.id);
      this.setSelection(db, session, league.id);
      return leagueSummaries(db, session.userId).find((l) => l.id === league.id)!;
    });
  }
  private scheduleCycle(db: Database, leagueId: string) {
    const league = db.leagues!.find((l) => l.id === leagueId)!;
    const playerIds = db.members.filter((m) => m.leagueId === leagueId).map((m) => m.userId);
    if (playerIds.length < 2) return undefined;
    const cycle = league.scheduleCycle;
    if (!cycle || playerIds.length !== cycle.playerIds.length || playerIds.some((id, i) => id !== cycle.playerIds[i])) {
      // A roster change starts a fresh cycle anchored to assignments players
      // already received. Joining never changes an opponent or adds a rematch
      // to someone who has already played this week.
      const firstRound: [string, string][] = gamePools(db)
        .filter((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek)
        .map((p) => [p.match.players[0], p.match.players[1]]);
      league.scheduleCycle = { playerIds, firstWeek: league.currentWeek, firstRound };
    }
    return league.scheduleCycle!;
  }
  private schedule(db: Database, leagueId: string) {
    const league = db.leagues!.find((l) => l.id === leagueId)!;
    const cycle = this.scheduleCycle(db, leagueId);
    if (!cycle) return;
    const playing = new Set(gamePools(db).filter((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek).flatMap((p) => p.match.players));
    const cycleLength = cycle.playerIds.length % 2 ? cycle.playerIds.length : cycle.playerIds.length - 1;
    const round = (league.currentWeek - cycle.firstWeek) % cycleLength + 1;
    const { pairings } = buildSchedule(cycle.playerIds.length, round, cycle.firstRound.map(([a, b]) => [cycle.playerIds.indexOf(a), cycle.playerIds.indexOf(b)]));
    for (const pair of pairings.filter((p) => p.week === round)) {
      const players = [cycle.playerIds[pair.homeIndex], cycle.playerIds[pair.awayIndex]];
      if (players.some((id) => playing.has(id))) continue;
      const pool = blankGame(randomUUID(), leagueId, players, league.currentWeek, this.service.now(db));
      pool.match.season = league.season;
      pool.match.ruleSet = this.service.config.ruleSet;
      const ranked = db.profiles.filter((p) => db.members.some((m) => m.leagueId === leagueId && m.userId === p.id)).map((p) => ({ ...p, ...league.standings?.[p.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints || a.name.localeCompare(b.name));
      pool.match.standingsBefore = Object.fromEntries(ranked.map((p, index) => [p.id, index + 1]));
      db.matchPools!.push(pool);
      players.forEach((id) => playing.add(id));
    }
  }
  private setSelection(db: Database, session: Session, leagueId: string, matchId?: string) {
    const chosen = matchId ?? leagueSummaries(db, session.userId).find((l) => l.id === leagueId)?.myMatchId ?? undefined;
    const stored = db.sessions.find((s) => s.tokenHash === session.tokenHash);
    if (stored) { stored.selectedLeagueId = leagueId; stored.selectedMatchId = chosen; }
    db.userSelections ??= {};
    db.userSelections[session.userId] = { leagueId, matchId: chosen };
  }
  async select(session: Session, leagueId: string, matchId?: string) {
    await this.service.transact((db) => {
      requireLeague(db, session.userId, leagueId);
      if (matchId && !gamePools(db).some((p) => p.match.id === matchId && p.match.leagueId === leagueId && p.match.players.includes(session.userId))) throw new ApiError(404, 'Your match was not found');
      this.setSelection(db, session, leagueId, matchId);
    });
    return { ok: true };
  }
  async selectMatch(session: Session, matchId: string) {
    const db = await this.service.readDb();
    const pool = gamePools(db).find((p) => p.match.id === matchId);
    if (!pool) throw new ApiError(404, 'Match not found');
    return this.select(session, pool.match.leagueId, matchId);
  }
  async settings(session: Session, leagueId: string, settings: LeagueSettings) {
    await this.service.transact((db) => {
      const league = requireLeague(db, session.userId, leagueId);
      if (league.commissionerId !== session.userId) throw new ApiError(403, 'Only the commissioner can change league rules');
      if (!Object.values(settings.channels).some(Boolean)) throw new ApiError(400, 'Enable at least one channel');
      const channelChange = Object.keys(settings.channels).some((key) => settings.channels[key as keyof typeof settings.channels] !== league.settings.channels[key as keyof typeof settings.channels]);
      if (channelChange && gamePools(db).some((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek && (p.match.state !== 'drafting' || p.scenarios.some((s) => s.authorId)))) throw new ApiError(409, 'Channel rules are locked after drafting begins. Change them in a new week before anyone drafts.');
      league.settings = settings;
    });
    return { ok: true };
  }
  async nextWeek(session: Session, leagueId: string) {
    await this.service.transact((db) => {
      const league = requireLeague(db, session.userId, leagueId);
      if (league.commissionerId !== session.userId) throw new ApiError(403, 'Only the commissioner can schedule a new week');
      const current = gamePools(db).filter((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek);
      if (!current.length || current.some((p) => !['completed', 'cancelled'].includes(p.match.state))) throw new ApiError(409, 'Finish every matchup before scheduling the next week');
      // Older persisted leagues have no cycle metadata. Anchor their existing
      // week before advancing so those matchups remain the first rotation round.
      this.scheduleCycle(db, leagueId);
      league.currentWeek++;
      this.schedule(db, leagueId);
      this.setSelection(db, session, leagueId);
      for (const stored of db.sessions.filter((s) => s.selectedLeagueId === leagueId)) stored.selectedMatchId = leagueSummaries(db, stored.userId).find((l) => l.id === leagueId)?.myMatchId ?? undefined;
      for (const [userId, selection] of Object.entries(db.userSelections ?? {})) if (selection.leagueId === leagueId) selection.matchId = leagueSummaries(db, userId).find((l) => l.id === leagueId)?.myMatchId ?? undefined;
    });
    return { ok: true };
  }
  async matchups(session: Session, leagueId: string) {
    const db = await this.service.readDb();
    requireLeague(db, session.userId, leagueId);
    const matchups: LeagueMatchup[] = gamePools(db).filter((p) => p.match.leagueId === leagueId).map(({ match }) => ({
      id: match.id, leagueId, week: match.week ?? 4, players: match.players.map((id) => leagueProfile(db, id, leagueId)), state: match.state, deadline: match.deadline, scores: match.scores, winnerId: match.winnerId, result: match.result, synthetic: match.synthetic ?? false, playable: match.players.includes(session.userId) && match.state !== 'cancelled',
    })).sort((a, b) => b.week - a.week || a.id.localeCompare(b.id));
    return { league: leagueSummaries(db, session.userId).find((l) => l.id === leagueId)!, matchups };
  }
  async standings(session: Session, leagueId: string) {
    const db = await this.service.readDb();
    const league = requireLeague(db, session.userId, leagueId);
    const before = gamePools(db).find((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek)?.match.standingsBefore ?? {};
    const members = db.profiles.filter((p) => db.members.some((m) => m.leagueId === leagueId && m.userId === p.id)).map((p) => ({ ...p, ...league.standings?.[p.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints || a.name.localeCompare(b.name));
    return { members: members.map((p, i) => ({ ...p, rank: i + 1, movement: (before[p.id] ?? i + 1) - i - 1 })) };
  }
  async chat(session: Session, leagueId: string) {
    const db = await this.service.readDb();
    requireLeague(db, session.userId, leagueId);
    return { messages: (db.chat ?? []).filter((m) => m.leagueId === leagueId).slice(-100).map((m) => ({ ...m, author: leagueProfile(db, m.userId, leagueId) })) };
  }
  async postChat(session: Session, leagueId: string, body: string) {
    return this.service.transact((db) => {
      const league = requireLeague(db, session.userId, leagueId);
      if (league.settings.familyFriendly && /\b(?:fuck|shit|bitch|cunt|kill yourself)\b/i.test(body)) throw new ApiError(400, 'Keep messages family friendly in this league');
      const now = this.service.now(db);
      if ((db.chat ?? []).filter((m) => m.userId === session.userId && m.createdAt > now - 60000 && !m.synthetic).length >= 15) throw new ApiError(429, 'Give the league a moment before posting again');
      const message = { id: randomUUID(), leagueId, userId: session.userId, body, createdAt: now, synthetic: false };
      db.chat!.push(message);
      return { ...message, author: leagueProfile(db, session.userId, leagueId) };
    });
  }
}
