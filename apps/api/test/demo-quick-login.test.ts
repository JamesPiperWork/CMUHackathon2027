import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFreshSeed } from '@fp/shared';
import { FileRepository } from '../src/repository.js';
import { GameService } from '../src/service.js';
import { createServer } from '../src/server.js';
import { LeagueService } from '../src/leagues.js';

test('local quick sign-in seeds one league, selects both opponents, and rejects foreign origins and real-email mode', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'fp-quick-'));
 const file = join(dir, 'state.json');
 const repo = await FileRepository.open(file, () => createFreshSeed());
 const service = new GameService(repo, {mode:'demo',ruleSet:'email-casts-v2',emailDemo:true,emailCapture:true,emailDemoLocalOnly:true,port:3001,apiOrigin:'http://localhost:3001',appOrigin:'http://localhost:3001',dataFile:file,mongodbUri:'',matchDurationMinutes:10080,jobIntervalMs:500});
 const {app} = await createServer(service, {startJobs:false});
 t.after(async () => {await app.close(); await repo.close(); await rm(dir,{recursive:true,force:true});});
 const sessions = [];
 for (const player of ['alex','jordan','alex']) {
  const response = await app.inject({method:'POST',url:'/api/auth/demo-quick',headers:{origin:service.config.apiOrigin},payload:{player}});
  assert.equal(response.statusCode,200,response.body);
  const session = (await service.sessionForToken(response.json().token))!;
  sessions.push(session);
  const state = await (await service.forSession(session)).state(session);
  assert.equal(state.league.name,'The Fishing Crew');
  assert.ok(state.opponent.id);
  assert.ok(state.consent.acceptedAt);
 }
 const db = await repo.read();
 assert.equal(db.accounts!.length,2); assert.equal(db.leagues!.length,1); assert.equal(db.matchPools!.length,1);
 assert.equal(db.profiles.length,8);
 assert.equal(db.members.length,8);
 assert.equal(Object.keys(db.leagues![0].standings!).length,8);
 assert.deepEqual(db.matchPools![0].match.players,[sessions[0].userId,sessions[1].userId]);
 const roster = db.members.filter(member => member.userId.startsWith('demo-roster-'));
 assert.equal(roster.length,6);
 for (const member of roster) {
  assert.equal(member.accepted,false);
  assert.deepEqual(member.consent.contacts,{});
  assert.equal(db.accounts!.some(account => account.userId === member.userId),false);
 }
 assert.equal(sessions[0].selectedLeagueId,sessions[1].selectedLeagueId);
 assert.notEqual(sessions[0].userId,sessions[1].userId);
 const oldToken = await service.createSession(sessions[0].userId);
 const oldSession = (await service.sessionForToken(oldToken.token))!;
 const leagues = new LeagueService(service);
 const other = await leagues.create(oldSession, 'Another league');
 await leagues.join(sessions[1], other.inviteCode);
 // Reproduce an older tab with a league but no selected match, then quick-login elsewhere.
 await repo.transact(db => { delete db.sessions.find(s => s.tokenHash === oldSession.tokenHash)!.selectedMatchId; });
 await app.inject({method:'POST',url:'/api/auth/demo-quick',headers:{origin:service.config.apiOrigin},payload:{player:'alex'}});
 const olderState = (await app.inject({url:'/api/state',headers:{authorization:`Bearer ${oldToken.token}`}})).json();
 assert.equal(olderState.selectedLeagueId,other.id);
 assert.equal(olderState.match.leagueId,other.id);
 const bait = await app.inject({method:'POST',url:'/api/drafts/reset-unsent-email',headers:{authorization:`Bearer ${oldToken.token}`},payload:{}});
 assert.equal(bait.statusCode,200,bait.body);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/demo-quick',headers:{origin:'https://external.test'},payload:{player:'alex'}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/demo-quick',headers:{origin:service.config.apiOrigin},payload:{player:'admin'}})).statusCode,400);
 service.config.emailCapture = false;
 assert.equal((await app.inject({method:'POST',url:'/api/auth/demo-quick',headers:{origin:service.config.apiOrigin},payload:{player:'alex'}})).statusCode,404);
});
