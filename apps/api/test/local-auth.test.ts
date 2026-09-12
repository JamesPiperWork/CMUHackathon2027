import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFreshSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";

const password = "fishing-demo-2027";
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "fp-local-auth-")), file = join(dir, "state.json");
  let repo = await FileRepository.open(file, () => createFreshSeed());
  const config = { mode: "demo" as const, ruleSet: "email-casts-v2" as const, port: 0,
    apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  let service = new GameService(repo, config), app = (await createServer(service, { startJobs: false })).app;
  const post = (url: string, payload: object, token?: string) => app.inject({ method: "POST", url, payload,
    headers: { origin: config.appOrigin, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  const register = (email = "angler@example.com") => post("/api/account/register", { name: "Fresh Angler", email, password });
  const restart = async () => {
    await app.close(); repo = await FileRepository.open(file, () => { throw new Error("Expected saved accounts"); });
    service = new GameService(repo, config); app = (await createServer(service, { startJobs: false })).app;
  };
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { get repo() { return repo; }, get service() { return service; }, get app() { return app; }, config, post, register, restart };
}
const setupDetails = (email: string) => ({ displayName: "Fresh Angler", email, adult: true,
  channels: { email: true, sms: false, voice: false }, timezone: "UTC", startHour: 0, endHour: 24, familyFriendly: true, excludedThemes: [] });

test("empty local signup creates distinct password accounts with no memberships or claimed email verification", async t => {
  const f = await fixture(t);
  assert.equal((await f.repo.read()).accounts!.length, 0);
  assert.equal((await f.repo.read()).profiles.length, 0);
  const registration = await f.register();
  assert.equal(registration.statusCode, 200, registration.body);
  assert.ok(registration.json().token && registration.json().csrf);
  assert.match(String(registration.headers["set-cookie"]), /HttpOnly/);
  const second = await f.register("other@example.com");
  assert.equal(second.statusCode, 200);
  let db = await f.repo.read();
  assert.equal(db.accounts!.length, 2);
  assert.equal(db.members.length, 0);
  assert.equal(db.leagues!.length, 0);
  assert.ok(db.accounts!.every(account => account.localAuth!.passwordHash.startsWith("scrypt-v1$") && !account.localAuth!.passwordHash.includes(password)));
  assert.notEqual(db.accounts![0].localAuth!.passwordHash, db.accounts![1].localAuth!.passwordHash);
  assert.equal(db.accounts![0].consent.contacts.email!.verified, false);
  assert.equal(db.accounts![0].consent.contacts.email!.method, "demo");
  const state = await f.app.inject({ url: "/api/state", headers: { authorization: `Bearer ${registration.json().token}` } });
  assert.equal(state.statusCode, 200);
  assert.equal(state.json().setupStage, "player");
  assert.equal(state.json().demoReset, "all");
  assert.ok(!state.body.includes("passwordHash") && !state.body.includes(password));
  assert.equal((await f.post("/api/demo/session", { player: "alex" })).statusCode, 410);
  await f.restart();
  const login = await f.post("/api/account/login", { email: "ANGLER@EXAMPLE.COM", password });
  assert.equal(login.statusCode, 200);
  const wrong = await f.post("/api/account/login", { email: "angler@example.com", password: "incorrect-password" });
  const unknown = await f.post("/api/account/login", { email: "missing@example.com", password: "incorrect-password" });
  assert.equal(wrong.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.deepEqual(wrong.json(), unknown.json());
  db = await f.repo.read();
  assert.equal(db.accounts!.length, 2);
  const firstToken = login.json().token, secondToken = second.json().token;
  await f.post("/api/account/setup", setupDetails("angler@example.com"), firstToken);
  await f.post("/api/account/setup", setupDetails("other@example.com"), secondToken);
  const league = await f.post("/api/leagues", { name: "Private credential test" }, firstToken);
  assert.equal(league.statusCode, 200, league.body);
  const joined = await f.post("/api/leagues/join", { inviteCode: league.json().inviteCode }, secondToken);
  assert.equal(joined.statusCode, 200, joined.body);
  assert.equal((await f.repo.read()).members.length, 2);
  assert.ok(!JSON.stringify((await f.repo.read()).members).includes("passwordHash"), "Joining a league must not duplicate account credentials into membership records");
});

test("registration rejects duplicate ownership, extra identity fields, weak bodies and cross-origin requests", async t => {
  const f = await fixture(t);
  const registrations = await Promise.all([f.register(), f.register("ANGLER@example.com")]);
  assert.deepEqual(registrations.map(response => response.statusCode).sort(), [200, 409]);
  assert.equal((await f.repo.read()).accounts!.length, 1);
  for (const patch of [{ name: "x" }, { email: "bad-address" }, { password: "short" }, { password: "x".repeat(129) }, { userId: "someone-else" }, { role: "operator" }])
    assert.equal((await f.post("/api/account/register", { name: "Another Angler", email: "new@example.com", password, ...patch })).statusCode, 400);
  assert.equal((await f.post("/api/account/register", { name: "Angler", email: "new@example.com", password: "x".repeat(3000) })).statusCode, 413);
  const forbidden = await f.app.inject({ method: "POST", url: "/api/account/login", headers: { origin: "https://another.example" }, payload: { email: "angler@example.com", password } });
  assert.equal(forbidden.statusCode, 403);
  f.service.config.emailDemo = true;
  assert.equal((await f.register("smtp@example.com")).statusCode, 403);
  assert.equal((await f.post("/api/account/login", { email: "angler@example.com", password })).statusCode, 403);
});

test("login throttling persists through restart and cannot be bypassed using forwarded IP headers", async t => {
  const f = await fixture(t);
  await f.register();
  for (let i = 0; i < 7; i++) {
    const response = await f.app.inject({ method: "POST", url: "/api/account/login", headers: { "x-forwarded-for": `192.0.2.${i}` }, payload: { email: "angler@example.com", password: "incorrect-password" } });
    assert.equal(response.statusCode, 401);
  }
  assert.equal((await f.post("/api/account/login", { email: "angler@example.com", password })).statusCode, 429);
  await f.restart();
  assert.equal((await f.post("/api/account/login", { email: "angler@example.com", password })).statusCode, 429);
  assert.ok(!JSON.stringify((await f.repo.read()).localAuthAttempts).includes("angler@example.com"));
});

test("editing the account email preserves its password, rejects duplicates, and changes the sign-in address", async t => {
  const f = await fixture(t);
  const registration = await f.register(), token = registration.json().token;
  await f.register("occupied@example.com");
  const initialHash = (await f.repo.read()).accounts![0].localAuth!.passwordHash;
  assert.equal((await f.post("/api/account/setup", setupDetails("occupied@example.com"), token)).statusCode, 409);
  assert.equal((await f.post("/api/account/setup", setupDetails("updated@example.com"), token)).statusCode, 200);
  assert.equal((await f.repo.read()).accounts![0].localAuth!.passwordHash, initialHash);
  assert.equal((await f.post("/api/account/login", { email: "angler@example.com", password })).statusCode, 401);
  assert.equal((await f.post("/api/account/login", { email: "updated@example.com", password })).statusCode, 200);
});

test("authenticated local reset requires explicit confirmation and clears accounts, matches and sessions", async t => {
  const f = await fixture(t);
  const token = (await f.register()).json().token;
  await f.post("/api/account/setup", setupDetails("angler@example.com"), token);
  await f.post("/api/leagues", { name: "Local anglers" }, token);
  assert.equal((await f.post("/api/demo/reset", { confirm: "RESET" })).statusCode, 401);
  assert.equal((await f.post("/api/demo/reset", {}, token)).statusCode, 400);
  const response = await f.post("/api/demo/reset", { confirm: "RESET" }, token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, preserveSession: false });
  const db = await f.repo.read();
  for (const values of [db.accounts, db.profiles, db.members, db.leagues, db.sessions, db.matchPools, db.scouting]) assert.equal(values!.length, 0);
  assert.equal(db.localAuthAttempts, undefined);
  assert.equal((await f.app.inject({ url: "/api/state", headers: { authorization: `Bearer ${token}` } })).statusCode, 401);
  assert.equal((await f.register()).statusCode, 200);
});
