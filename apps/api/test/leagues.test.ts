import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSeed } from '@fp/shared';
import { FileRepository } from '../src/repository.js';
import { GameService } from '../src/service.js';
import { createServer } from '../src/server.js';

async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'fp-leagues-'));
  const file = join(dir, 'state.json');
  const repo = await FileRepository.open(file, () => createSeed());
  const service = new GameService(repo, { mode: 'demo', port: 0, apiOrigin: 'http://localhost:3001', appOrigin: 'http://localhost:8081', dataFile: file, mongodbUri: '', matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const tokens = { alex: (await service.createSession('alex')).token, jordan: (await service.createSession('jordan')).token, sam: (await service.createSession('sam')).token };
  const headers = (user: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[user]}` });
  for (const user of ['alex', 'jordan']) await service.consent(user, { adult: true, channels: { email: true, sms: true, voice: true }, timezone: 'America/New_York', startHour: 10, endHour: 20, familyFriendly: true });
  const create = async () => (await app.inject({ method: 'POST', url: '/api/leagues', headers: headers('alex'), payload: { name: 'Saturday Strategists' } })).json();
  const joinLeague = async (inviteCode: string) => app.inject({ method: 'POST', url: '/api/leagues/join', headers: headers('jordan'), payload: { inviteCode } });
  return { app, service, repo, tokens, headers, create, joinLeague, file };
}

test('league create/join scopes membership, chat, settings and independent player selections durably', async (t) => {
  const { app, service, headers, create, joinLeague, file } = await setup(t);
  const league = await create();
  const waiting = (await app.inject({ url: '/api/state', headers: headers('alex') })).json();
  assert.equal(waiting.selectedLeagueId, league.id);
  assert.equal(waiting.leagues.find((l: { id: string }) => l.id === league.id).myMatchId, null);
  assert.equal((await app.inject({ method: 'POST', url: '/api/match/activate', headers: headers('alex'), payload: {} })).statusCode, 409);
  assert.equal((await app.inject({ url: `/api/leagues/${league.id}/chat`, headers: headers('sam') })).statusCode, 404);
  assert.equal((await joinLeague(league.inviteCode.toLowerCase())).statusCode, 200);
  assert.equal((await joinLeague(league.inviteCode)).statusCode, 200);
  const rooms = (await app.inject({ url: '/api/leagues', headers: headers('jordan') })).json();
  assert.equal(rooms.leagues.find((l: { id: string }) => l.id === league.id).memberCount, 2);
  const settings = { difficulty: 'expert', familyFriendly: true, channels: { email: true, sms: false, voice: false } };
  assert.equal((await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/settings`, headers: headers('jordan'), payload: settings })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/settings`, headers: headers('alex'), payload: settings })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/chat`, headers: headers('alex'), payload: { body: 'Friday rematch is on. Bring your best parcel play.' } })).statusCode, 200);
  const messages = (await app.inject({ url: `/api/leagues/${league.id}/chat`, headers: headers('jordan') })).json().messages;
  assert.equal(messages.length, 1); assert.equal(messages[0].author.id, 'alex'); assert.equal(messages[0].synthetic, false);
  const reopened = await FileRepository.open(file, () => createSeed());
  assert.equal((await reopened.read()).chat!.find((m) => m.id === messages[0].id)!.body, messages[0].body);
  await reopened.close();
  const primary = await service.readDb();
  assert.equal(primary.match.id, 'match-week-04');
  assert.equal(primary.match.state, 'drafting');
});

test('browser preflight allows scouting PUT and draft PATCH from the application origin', async (t) => {
  const { app } = await setup(t);
  for (const [method, url] of [['PUT', '/api/scouting/jordan'], ['PATCH', '/api/drafts/test-draft']] as const) {
    const response = await app.inject({ method: 'OPTIONS', url, headers: { origin: 'http://localhost:8081', 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' } });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:8081');
    assert.ok(String(response.headers['access-control-allow-methods']).split(',').map((value) => value.trim()).includes(method));
    assert.ok(String(response.headers['access-control-allow-headers']).includes('authorization'));
  }
});

test('selected league match plays all channels under rules without changing another match; next week retains history', async (t) => {
  const { app, service, repo, headers, create, joinLeague } = await setup(t);
  const league = await create(); await joinLeague(league.inviteCode);
  await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/select`, headers: headers('alex'), payload: {} });
  const initialState = (await app.inject({ url: '/api/state', headers: headers('alex') })).json();
  const matchId = initialState.match.id;
  assert.notEqual(matchId, 'match-week-04');
  for (const player of [initialState.me, initialState.opponent]) {
    assert.equal(player.leaguePoints, 0); assert.equal(player.wins, 0); assert.equal(player.losses, 0); assert.equal(player.draws, 0);
  }
  const initialSlate = (await app.inject({ url: `/api/leagues/${league.id}/matchups`, headers: headers('alex') })).json().matchups;
  assert.ok(initialSlate[0].players.every((p: { leaguePoints: number; wins: number; losses: number; draws: number }) => p.leaguePoints === 0 && p.wins === 0 && p.losses === 0 && p.draws === 0));
  const settings = { difficulty: 'expert', familyFriendly: true, channels: { email: true, sms: false, voice: false } };
  await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/settings`, headers: headers('alex'), payload: settings });
  await app.inject({ method: 'PUT', url: '/api/scouting/jordan', headers: headers('alex'), payload: { interests: ['Board games'], markdown: '# Jordan\n- Hosts our Saturday board-game night.' } });
  const payload = { recipientMemberId: 'jordan', channel: 'email', interest: 'Board games', templateId: 'parcel-update' };
  const generated = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers: headers('alex'), payload });
  assert.equal(generated.statusCode, 202);
  await service.tickAll();
  assert.equal((await app.inject({ method: 'POST', url: '/api/drafts/generate', headers: headers('alex'), payload })).statusCode, 429);
  await app.inject({ method: 'POST', url: `/api/drafts/${generated.json().scenarioId}/lock`, headers: headers('alex'), payload: {} });
  const activated = await app.inject({ method: 'POST', url: '/api/match/activate', headers: headers('alex'), payload: {} });
  assert.equal(activated.statusCode, 200);
  const scoped = service.forMatch(matchId); await scoped.release(undefined, true);
  const game = await scoped.readDb();
  assert.equal(game.scenarios.length, 12); assert.ok(game.scenarios.every((s) => s.channel === 'email'));
  assert.equal(game.match.deadline - game.match.startedAt!, 7 * 86400000);
  assert.equal((await repo.read()).scenarios.length, 0);
  const privateTarget = await app.inject({ url: '/api/scouting/jordan', headers: headers('jordan') }); assert.equal(privateTarget.statusCode, 403);
  for (const scenario of game.scenarios) await scoped.decisionFor(scenario.recipientId, scenario.id, scenario.isPhishing ? 'flag' : 'trust');
  const recap = await app.inject({ url: `/api/leagues/${league.id}/matchups/${matchId}/recap`, headers: headers('jordan') });
  assert.equal(recap.statusCode, 200); assert.equal(recap.json().synthetic, false);
  assert.ok(recap.json().highlights.some((h: { kind: string }) => h.kind === 'defense'));
  const primaryAfter = await repo.read(); assert.equal(primaryAfter.match.state, 'drafting'); assert.equal(primaryAfter.profiles.find((p) => p.id === 'alex')!.leaguePoints, 12);
  const standings = (await app.inject({ url: `/api/leagues/${league.id}/standings`, headers: headers('alex') })).json(); assert.equal(standings.members[0].leaguePoints, 1);
  const finishedState = (await app.inject({ url: '/api/state', headers: headers('alex') })).json();
  for (const player of [finishedState.me, finishedState.opponent]) { assert.equal(player.leaguePoints, 1); assert.equal(player.draws, 1); assert.equal(player.wins, 0); assert.equal(player.losses, 0); }
  assert.equal((await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/next-week`, headers: headers('jordan'), payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/leagues/${league.id}/next-week`, headers: headers('alex'), payload: {} })).statusCode, 200);
  const following = (await app.inject({ url: '/api/state', headers: headers('jordan') })).json(); assert.equal(following.match.week, 2); assert.notEqual(following.match.id, matchId);
  const slate = (await app.inject({ url: `/api/leagues/${league.id}/matchups`, headers: headers('alex') })).json().matchups; assert.equal(slate.length, 2); assert.equal(slate.find((m: { id: string }) => m.id === matchId).state, 'completed');
  for (const matchup of slate) assert.ok(matchup.players.every((p: { leaguePoints: number; draws: number; wins: number; losses: number }) => p.leaguePoints === 1 && p.draws === 1 && p.wins === 0 && p.losses === 0));
});

test('season Wrapped includes only completed saved decisions and relevant player chat', async (t) => {
  const { app, headers } = await setup(t);
  const unfinished = await app.inject({ url: '/api/leagues/usual-suspects/matchups/match-week-04/recap', headers: headers('alex') }); assert.equal(unfinished.statusCode, 404);
  const recap = await app.inject({ url: '/api/leagues/usual-suspects/matchups/week-03-alex-riley/recap', headers: headers('alex') });
  assert.equal(recap.statusCode, 200); assert.equal(recap.json().synthetic, true);
  assert.ok(recap.json().highlights.some((h: { kind: string; text: string }) => h.kind === 'attack' && h.text.includes('MC-204')));
  assert.ok(recap.json().highlights.some((h: { kind: string; text: string }) => h.kind === 'chat' && h.text.includes('Mooncrate')));
});
