import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFreshSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { ensureIdentityAccount } from "../src/accounts.js";
import type { Config } from "../src/config.js";

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "fp-setup-"));
  const repo = await FileRepository.open(join(dir, "db.json"), () => createFreshSeed(Date.now(), true));
  const config: Config = { mode: "demo", ruleSet: "email-casts-v2", port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: join(dir, "db.json"), mongodbUri: "", jobIntervalMs: 500, matchDurationMinutes: 10080 };
  const service = new GameService(repo, config);
  const { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const call = async (token: string, url: string, body?: object) => app.inject({ method: body ? "POST" : "GET", url, headers: { authorization: `Bearer ${token}` }, ...(body ? { payload: body } : {}) });
  return { repo, service, app, config, alex, jordan, call };
}
const details = (name: string) => ({ displayName: `${name} Fisher`, email: `${name.toLowerCase()}@example.com`, adult: true, channels: { email: true, sms: false, voice: false }, timezone: "America/Chicago", startHour: 9, endHour: 17, familyFriendly: false, excludedThemes: ["Deliveries"] });

test("fresh accounts can finish setup, create/join their first league and receive an empty matchup", async t => {
  const f = await fixture(t);
  let state = (await f.call(f.alex.token, "/api/state")).json();
  assert.equal(state.setupStage, "player"); assert.equal(state.leagues.length, 0); assert.equal(state.drafts.length, 0);
  assert.equal((await f.call(f.alex.token, "/api/leagues", { name: "Fishing crew" })).statusCode, 409);
  for (const [session, name] of [[f.alex, "Alex"], [f.jordan, "Jordan"]] as const) {
    assert.equal((await f.call(session.token, "/api/account/setup", details(name))).statusCode, 200);
  }
  state = (await f.call(f.alex.token, "/api/state")).json();
  assert.equal(state.setupStage, "league"); assert.equal(state.consent.timezone, "America/Chicago"); assert.equal(state.me.name, "Alex Fisher");
  const created = await f.call(f.alex.token, "/api/leagues", { name: "Fishing crew" });
  assert.equal(created.statusCode, 200, created.body);
  const league = created.json();
  state = (await f.call(f.alex.token, "/api/state")).json();
  assert.equal(state.leagues[0].memberCount, 1); assert.equal(state.leagues[0].myMatchId, null);
  assert.equal((await f.call(f.jordan.token, "/api/leagues/join", { inviteCode: league.inviteCode })).statusCode, 200);
  state = (await f.call(f.alex.token, "/api/state")).json();
  assert.equal(state.setupStage, "ready"); assert.equal(state.match.week, 1); assert.equal(state.match.state, "drafting");
  assert.deepEqual(state.match.scores, { alex: 0, jordan: 0 }); assert.equal(state.drafts.length, 0); assert.equal(state.incoming.length, 0);
  assert.equal(JSON.stringify(state.opponent).includes("jordan@example.com"), false, "Opponent contact remains private");
  assert.equal((await f.app.inject({ method: "PUT", url: "/api/scouting/jordan", headers: { authorization: `Bearer ${f.alex.token}` }, payload: { interests: ["Live music"], markdown: "Enjoys weekend concerts." } })).statusCode, 200);
  const draft = await f.call(f.alex.token, "/api/drafts/prepare", { recipientMemberId: "jordan", channel: "email", kind: "regular", slot: 1, templateId: "ticket-drop", interest: "Live music" });
  assert.equal(draft.statusCode, 200, draft.body);
  const persisted = await f.repo.read();
  assert.equal(persisted.members[0].consent.startHour, 9); assert.equal(persisted.members[0].consent.familyFriendly, false);
});

test("setup validates toggles/contact hours and reset removes memberships, private notes, sessions and history", async t => {
  const f = await fixture(t);
  for (const patch of [{ email: "invalid" }, { adult: false }, { channels: { email: false, sms: false, voice: false } }, { timezone: "No/Zone" }, { startHour: 20, endHour: 9 }]) {
    assert.equal((await f.call(f.alex.token, "/api/account/setup", { ...details("Alex"), ...patch })).statusCode, 400);
  }
  await f.call(f.alex.token, "/api/account/setup", details("Alex"));
  await f.call(f.alex.token, "/api/leagues", { name: "Temporary crew" });
  await f.service.reset(true);
  const db = await f.repo.read();
  assert.equal(db.leagues!.length, 0); assert.equal(db.members.length, 0); assert.equal(db.sessions.length, 0); assert.equal(db.matchPools!.length, 0); assert.equal(db.scouting!.length, 0);
  assert.ok(db.accounts!.every(a => !a.consent.acceptedAt && !a.consent.contacts.email));
  assert.ok(db.profiles.every(p => p.leaguePoints === 0 && !p.historical));
  assert.equal((await f.call(f.alex.token, "/api/state")).statusCode, 401);
});

test("verified identity signup creates an account without granting league membership or trusting supplied IDs", async t => {
  const f = await fixture(t);
  await assert.rejects(ensureIdentityAccount(f.service, { sub: "auth0|person", email: "real@example.com", emailVerified: false }), /Verify/);
  const id = await ensureIdentityAccount(f.service, { sub: "auth0|person", email: "real@example.com", emailVerified: true });
  assert.notEqual(id, "auth0|person");
  const revision = (await f.repo.read()).revision;
  assert.equal(await ensureIdentityAccount(f.service, { sub: "auth0|person", email: "real@example.com", emailVerified: true }), id);
  assert.equal((await f.repo.read()).revision, revision, "Normal auth does not cause a state-change loop");
  assert.equal((await f.repo.read()).members.some(m => m.userId === id), false);
  const state = await f.service.state({ userId: id, tokenHash: "test", role: "player", expiresAt: Date.now() + 10000, csrf: "test" });
  assert.equal(state.setupStage, "player"); assert.equal(state.consent.contacts.email?.verified, true);
});

test("real-email demo rejects sample sessions, operator controls and changing a verified delivery address", async t => {
  const f = await fixture(t);
  f.config.emailDemo = true;
  await assert.rejects(f.service.initializeRules(), /separate empty data file/);
  await assert.rejects(f.service.createSession("alex"), /Verify your email/);
  await assert.rejects(f.service.reset(true), /disabled/);
  await assert.rejects(f.service.advance(60), /disabled/);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/demo/session", payload: { player: "alex" } })).statusCode, 403);
  await f.repo.transact(db => { db.accounts![0].consent.contacts.email = { destination: "alex@example.com", verified: true, verifiedAt: Date.now(), method: "verify" }; });
  const session = await f.service.createSession("alex");
  assert.equal((await f.call(session.token, "/api/account/setup", { ...details("Alex"), email: "other@example.com" })).statusCode, 409);
  assert.equal((await f.call(session.token, "/api/account/setup", details("Alex"))).statusCode, 200);
});

test("signing out revokes the server session and expires its browser cookie", async t => {
  const f = await fixture(t);
  const response = await f.call(f.alex.token, "/api/session/logout", {});
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["set-cookie"]), /fp_session=;/);
  assert.equal(await f.service.sessionForToken(f.alex.token), null);
  assert.equal((await f.call(f.alex.token, "/api/state")).statusCode, 401);
  assert.equal((await f.call(f.jordan.token, "/api/state")).statusCode, 200, "Other sessions remain active");
});
