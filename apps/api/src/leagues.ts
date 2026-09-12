import { randomBytes, randomUUID } from 'node:crypto';
import { blankGame, type Database, type LeagueSummary, type LeagueSettings, type LeagueMatchup, type MatchStory, type Session } from '@fp/shared';
import { ApiError, type GameService } from './service.js';
import { gamePools } from './repository.js';

export function requireLeague(db: Database, userId: string, leagueId: string) {
  const league = db.leagues?.find((l) => l.id === leagueId);
  if (!league || !db.members.some((m) => m.userId === userId && m.leagueId === leagueId))
    throw new ApiError(404, 'League not found');
  return league;
}
export function leagueProfile(db: Database, userId: string, leagueId: string) {
  const profile = db.profiles.find((p) => p.id === userId)!;
  const record = db.leagues?.find((l) => l.id === leagueId)?.standings?.[userId];
  return { ...profile, ...record };
}
export function leagueSummaries(db: Database, userId: string): LeagueSummary[] {
  return (db.leagues ?? []).filter((l) => db.members.some((m) => m.leagueId === l.id && m.userId === userId)).map((l) => ({
    ...l, memberCount: db.members.filter((m) => m.leagueId === l.id).length,
    myMatchId: gamePools(db).find((p) => p.match.leagueId === l.id && p.match.week === l.currentWeek && p.match.players.includes(userId))?.match.id ?? null,
  }));
}
export class LeagueService {
  constructor(private service: GameService) {}
  async list(session: Session) {
    const db = await this.service.readDb();
    return { leagues: leagueSummaries(db, session.userId), selectedLeagueId: session.selectedLeagueId ?? db.userSelections?.[session.userId]?.leagueId ?? db.match.leagueId };
  }
  async create(session: Session, name: string) {
    return this.service.transact((db) => {
      if (db.leagues!.filter((l) => l.commissionerId === session.userId).length >= 10) throw new ApiError(409, 'You already manage ten leagues');
      const source = db.members.find((m) => m.userId === session.userId)!;
      const id = randomUUID();
      db.leagues!.push({ id, name, inviteCode: randomBytes(5).toString('hex').toUpperCase(), commissionerId: session.userId, currentWeek: 1, season: new Date(this.service.now(db)).getFullYear(), settings: { difficulty: 'standard', familyFriendly: true, channels: { email: true, sms: true, voice: true } }, createdAt: this.service.now(db), standings: { [session.userId]: { leaguePoints: 0, wins: 0, losses: 0, draws: 0 } } });
      db.members.push({ ...structuredClone(source), leagueId: id });
      this.setSelection(db, session, id);
      return leagueSummaries(db, session.userId).find((l) => l.id === id)!;
    });
  }
  async join(session: Session, inviteCode: string) {
    return this.service.transact((db) => {
      const league = db.leagues!.find((l) => l.inviteCode === inviteCode.toUpperCase());
      if (!league) throw new ApiError(404, 'Invite code not found');
      if (!db.members.some((m) => m.leagueId === league.id && m.userId === session.userId)) {
        if (db.members.filter((m) => m.leagueId === league.id).length >= 16) throw new ApiError(409, 'This league has reached 16 players');
        const source = db.members.find((m) => m.userId === session.userId)!;
        db.members.push({ ...structuredClone(source), leagueId: league.id });
        if (league.standings) league.standings[session.userId] = { leaguePoints: 0, wins: 0, losses: 0, draws: 0 };
      }
      this.schedule(db, league.id);
      this.setSelection(db, session, league.id);
      return leagueSummaries(db, session.userId).find((l) => l.id === league.id)!;
    });
  }
  private schedule(db: Database, leagueId: string) {
    const league = db.leagues!.find((l) => l.id === leagueId)!;
    const playing = gamePools(db).filter((p) => p.match.leagueId === leagueId && p.match.week === league.currentWeek).flatMap((p) => p.match.players);
    let waiting = db.members.filter((m) => m.leagueId === leagueId && !playing.includes(m.userId)).map((m) => m.userId);
    // Circle scheduling changes opponents each week; existing assignments never move.
    if (waiting.length > 2 && !playing.length) {
      const circle: (string | null)[] = [...waiting];
      if (circle.length % 2) circle.push(null);
      for (let turn = 0; turn < (league.currentWeek - 1) % (circle.length - 1); turn++) circle.splice(1, 0, circle.pop()!);
      waiting = [];
      for (let i = 0; i < circle.length / 2; i++) {
        const pair = [circle[i], circle[circle.length - 1 - i]];
        if (pair.every((id) => id !== null)) waiting.push(...pair as string[]);
      }
    }
    for (let i = 0; i + 1 < waiting.length; i += 2) {
      const pool = blankGame(randomUUID(), leagueId, waiting.slice(i, i + 2), league.currentWeek, this.service.now(db));
      const ranked = db.profiles.filter((p) => db.members.some((m) => m.leagueId === leagueId && m.userId === p.id)).map((p) => ({ ...p, ...league.standings?.[p.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints || a.name.localeCompare(b.name));
      pool.match.standingsBefore = Object.fromEntries(ranked.map((p, index) => [p.id, index + 1]));
      db.matchPools!.push(pool);
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
  async recap(session: Session, leagueId: string, matchId: string): Promise<MatchStory> {
    const db = await this.service.readDb();
    const league = requireLeague(db, session.userId, leagueId);
    const pool = gamePools(db).find((p) => p.match.id === matchId && p.match.leagueId === leagueId);
    if (!pool || pool.match.state !== 'completed') throw new ApiError(404, 'Wrapped is available after this match finishes');
    const name = (id: string) => db.profiles.find((p) => p.id === id)?.name ?? 'Player';
    const highlights: MatchStory['highlights'] = pool.decisions.flatMap((decision) => {
      const scenario = pool.scenarios.find((s) => s.id === decision.scenarioId);
      if (!scenario || !scenario.isPhishing || !scenario.authorId) return [];
      return [{ id: decision.id, kind: decision.correct ? 'defense' as const : 'attack' as const, actorName: name(decision.correct ? decision.recipientId : scenario.authorId), targetName: name(decision.correct ? scenario.authorId : decision.recipientId), text: scenario.channel === 'email' ? scenario.content.bodyText : scenario.channel === 'sms' ? scenario.content.smsText : scenario.content.voiceScript, detail: decision.correct ? `${name(decision.recipientId)} spotted the unexpected change and flagged it.` : `${name(decision.recipientId)} trusted “${scenario.content.subject}”. ${scenario.content.explanation}`, channel: scenario.channel, points: decision.correct ? decision.defenderPoints : decision.authorPoints, createdAt: decision.createdAt }];
    }).sort((a, b) => (a.kind === 'attack' ? 0 : 1) - (b.kind === 'attack' ? 0 : 1) || a.createdAt - b.createdAt).slice(0, 5);
    const chat = (db.chat ?? []).filter((m) => m.leagueId === leagueId && pool.match.players.includes(m.userId) && m.createdAt >= (pool.match.startedAt ?? 0) && m.createdAt <= pool.match.completedAt! + 86400000).slice(-3);
    highlights.push(...chat.map((m) => ({ id: m.id, kind: 'chat' as const, actorName: name(m.userId), text: m.body, createdAt: m.createdAt })));
    return { id: matchId, leagueName: league.name, week: pool.match.week ?? 4, players: pool.match.players.map((id) => leagueProfile(db, id, leagueId)), scores: pool.match.scores, winnerId: pool.match.winnerId, completedAt: pool.match.completedAt!, synthetic: pool.match.synthetic ?? false, highlights };
  }
}
