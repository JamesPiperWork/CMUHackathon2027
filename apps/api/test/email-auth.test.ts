import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { z } from "zod";
import { createFreshSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService, hash } from "../src/service.js";
import { registerEmailAuth } from "../src/email-auth.js";
import type { Config } from "../src/config.js";

async function setup(t: TestContext, options: { failSend?: boolean; enabled?: boolean; https?: boolean; crossHost?: boolean; sendEnabled?: boolean; recipientList?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "fp-email-login-"));
  const file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => createFreshSeed(Date.now(), false));
  const config: Config = { mode: "demo", emailDemo: options.enabled !== false, port: 0, apiOrigin: `${options.https ? "https" : "http"}://localhost:3001`, appOrigin: `${options.https ? "https" : "http"}://${options.crossHost ? "app.example.test" : "localhost"}:8081`, dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  const service = new GameService(repo, config);
  const app = Fastify();
  await app.register(cookie);
  await app.register(formbody);
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof z.ZodError ? 400 : (error as { statusCode?: number }).statusCode ?? 500).send({ error: error instanceof Error ? error.message : "Failed" }));
  let currentTime = Date.now();
  const messages: { email: string; code: string }[] = [];
  registerEmailAuth(app, service, { env: { EMAIL_DEMO_SEND_ENABLED: options.sendEnabled === false ? "false" : "true", SESSION_SECRET: "email-test-secret-do-not-use-in-real-demo-123456", EMAIL_DEMO_RECIPIENTS: options.recipientList ?? Array.from({ length: 12 }, (_, i) => `player${i}@example.test`).join(",") }, now: () => currentTime, sendCode: async message => { messages.push(message); if (options.failSend) throw new Error("Mock SMTP failure"); } });
  await app.ready();
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  const browser = async () => {
    const response = await app.inject("/api/auth/email");
    const csrf = response.json<{ csrf: string }>().csrf;
    return { csrf, headers: { cookie: `fp_email_csrf=${csrf}`, origin: config.appOrigin } };
  };
  const start = async (client: Awaited<ReturnType<typeof browser>>, email = "player0@example.test", extra: Record<string, string> = {}, ip?: string) => app.inject({ method: "POST", url: "/api/auth/email/start", headers: client.headers, payload: { email, csrf: client.csrf, ...extra }, remoteAddress: ip });
  const verify = async (client: Awaited<ReturnType<typeof browser>>, requestId: string, code: string, extra: Record<string, string> = {}) => app.inject({ method: "POST", url: "/api/auth/email/verify", headers: client.headers, payload: { requestId, code, csrf: client.csrf, ...extra } });
  return { app, config, repo, service, messages, browser, start, verify, advance: (milliseconds: number) => { currentTime += milliseconds; } };
}

test("email codes create an owned account without participation consent; sessions and OTPs are single-use", async t => {
  const f = await setup(t, { https: true });
  const browser = await f.browser();
  const started = await f.start(browser, "  PLAYER0@example.test ");
  assert.equal(started.statusCode, 200, started.body);
  assert.equal(f.messages[0].email, "player0@example.test");
  assert.match(f.messages[0].code, /^\d{6}$/);
  const record = (await f.repo.read()).emailLogins![0];
  assert.match(record.codeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(record.codeHash, hash(f.messages[0].code));
  assert.ok(!Object.values(record).includes(f.messages[0].code));
  assert.equal(record.status, "sent");
  const requestId = started.json<{ requestId: string }>().requestId;
  const results = await Promise.all([f.verify(browser, requestId, f.messages[0].code), f.verify(browser, requestId, f.messages[0].code)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 401]);
  const successful = results.find(result => result.statusCode === 200)!;
  const setCookie = successful.headers["set-cookie"];
  assert.match(String(setCookie), /HttpOnly/);
  assert.match(String(setCookie), /Secure/);
  assert.match(String(setCookie), /SameSite=Lax/);
  const session = await f.service.sessionForToken(successful.json<{ token: string }>().token);
  assert.equal(session?.role, "player");
  const db = await f.repo.read();
  assert.equal(db.accounts?.length, 1);
  assert.equal(db.accounts![0].userId, session?.userId);
  assert.equal(db.accounts![0].consent.acceptedAt, null);
  assert.equal(db.accounts![0].consent.channels.email, false);
  assert.equal(db.accounts![0].consent.contacts.email?.method, "verify");
  assert.equal(db.accounts![0].consent.contacts.email?.verified, true);
  assert.equal(db.leagues?.length, 0);
  assert.equal(db.members.length, 0);
  f.advance(60001);
  const again = await f.start(browser);
  const login = await f.verify(browser, again.json<{ requestId: string }>().requestId, f.messages[1].code);
  assert.equal(login.statusCode, 200, login.body);
  assert.equal((await f.repo.read()).accounts?.length, 1);
});

test("an optional invitation list is enforced alongside browser CSRF and the approved origin", async t => {
  const f = await setup(t);
  const browser = await f.browser();
  assert.equal((await f.start(browser, "outside@example.test")).statusCode, 403);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/auth/email/start", payload: { email: "player0@example.test", csrf: browser.csrf } })).statusCode, 403);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/auth/email/start", headers: { ...browser.headers, cookie: `fp_email_csrf=${encodeURIComponent("é".repeat(browser.csrf.length))}` }, payload: { email: "player0@example.test", csrf: browser.csrf } })).statusCode, 403);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/auth/email/start", headers: { ...browser.headers, origin: "https://evil.example" }, payload: { email: "player0@example.test", csrf: browser.csrf } })).statusCode, 403);
  assert.equal(f.messages.length, 0);
  const started = await f.start(browser);
  const otherBrowser = await f.browser();
  assert.equal((await f.verify(otherBrowser, started.json<{ requestId: string }>().requestId, f.messages[0].code)).statusCode, 401);
  assert.equal((await f.repo.read()).emailLogins![0].attempts, 0);
  assert.equal((await f.verify(browser, started.json<{ requestId: string }>().requestId, f.messages[0].code)).statusCode, 200);
});

test("five wrong codes lock a request, expiration and resending invalidate old codes", async t => {
  const f = await setup(t);
  const browser = await f.browser();
  const first = await f.start(browser);
  const id = first.json<{ requestId: string }>().requestId;
  const wrong = f.messages[0].code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await f.verify(browser, id, wrong)).statusCode, 401);
  assert.equal((await f.repo.read()).emailLogins![0].attempts, 5);
  assert.equal((await f.verify(browser, id, f.messages[0].code)).statusCode, 401);
  assert.equal((await f.start(browser)).statusCode, 429);
  f.advance(60001);
  const second = await f.start(browser);
  f.advance(60001);
  const third = await f.start(browser);
  assert.equal((await f.verify(browser, second.json<{ requestId: string }>().requestId, f.messages[1].code)).statusCode, 401);
  f.advance(600000);
  assert.equal((await f.verify(browser, third.json<{ requestId: string }>().requestId, f.messages[2].code)).statusCode, 401);
  assert.equal((await f.start(browser)).statusCode, 429);
  assert.equal((await f.repo.read()).accounts?.length, 0);
});

test("atomic send reservations enforce per-IP and global hourly limits", async t => {
  const f = await setup(t);
  const browser = await f.browser();
  const first = await Promise.all(Array.from({ length: 6 }, (_, i) => f.start(browser, `player${i}@example.test`, {}, "192.0.2.1")));
  assert.equal(first.filter(result => result.statusCode === 200).length, 5);
  assert.equal(first.filter(result => result.statusCode === 429).length, 1);
  for (let i = 6; i < 11; i++) assert.equal((await f.start(browser, `player${i}@example.test`, {}, "192.0.2.2")).statusCode, 200);
  assert.equal((await f.start(browser, "player11@example.test", {}, "192.0.2.3")).statusCode, 429);
  assert.equal(f.messages.length, 10);
  f.advance(3600001);
  assert.equal((await f.start(browser, "player11@example.test", {}, "192.0.2.3")).statusCode, 200);
});

test("failed SMTP code submission cannot authenticate and still consumes its send reservation", async t => {
  const f = await setup(t, { failSend: true });
  const browser = await f.browser();
  const result = await f.start(browser);
  assert.equal(result.statusCode, 503);
  assert.ok(!result.body.includes(f.messages[0].code));
  const record = (await f.repo.read()).emailLogins![0];
  assert.equal(record.status, "failed");
  assert.equal((await f.verify(browser, record.id, f.messages[0].code)).statusCode, 401);
  assert.equal((await f.start(browser)).statusCode, 429);
});

test("email code routes are disabled outside explicit email demo mode", async t => {
  const f = await setup(t, { enabled: false });
  assert.equal((await f.app.inject("/api/auth/email")).statusCode, 404);
  assert.equal((await f.app.inject("/auth/email")).statusCode, 404);
  assert.equal(f.messages.length, 0);
});

test("the send gate blocks email before any OTP reservation or submission", async t => {
  const f = await setup(t, { sendEnabled: false });
  const browser = await f.browser();
  assert.equal((await f.start(browser)).statusCode, 503);
  assert.equal(f.messages.length, 0);
  assert.equal((await f.repo.read()).emailLogins?.length ?? 0, 0);
});

test("an explicitly allowed HTTPS app origin can use secure cross-site cookies without bypassing CSRF", async t => {
  const f = await setup(t, { https: true, crossHost: true });
  const response = await f.app.inject("/api/auth/email");
  assert.match(String(response.headers["set-cookie"]), /SameSite=None/);
  assert.match(String(response.headers["set-cookie"]), /Secure/);
  const csrf = response.json<{ csrf: string }>().csrf;
  const headers = { cookie: `fp_email_csrf=${csrf}`, origin: f.config.appOrigin, "sec-fetch-site": "cross-site" };
  const started = await f.app.inject({ method: "POST", url: "/api/auth/email/start", headers, payload: { email: "player0@example.test", csrf } });
  assert.equal(started.statusCode, 200, started.body);
  const verified = await f.verify({ csrf, headers }, started.json<{ requestId: string }>().requestId, f.messages[0].code);
  assert.equal(verified.statusCode, 200, verified.body);
  assert.match(String(verified.headers["set-cookie"]), /SameSite=None/);
  const rejected = await f.app.inject({ method: "POST", url: "/api/auth/email/start", headers: { ...headers, origin: "https://evil.example" }, payload: { email: "player1@example.test", csrf } });
  assert.equal(rejected.statusCode, 403);
});

test("external sign-in is tied to the intended recipient and returns to the exact score-neutral challenge", async t => {
  const f = await setup(t);
  const standalone = await f.app.inject("/auth/email");
  assert.equal(standalone.statusCode, 302);
  assert.equal(standalone.headers.location, f.config.appOrigin, "Standalone signup uses the app's bearer-session flow");
  const browser = await f.browser();
  const started = await f.start(browser);
  await f.verify(browser, started.json<{ requestId: string }>().requestId, f.messages[0].code);
  const db = await f.repo.read();
  const challenge = "a".repeat(43);
  await f.repo.transact(state => {
    state.match.state = "active";
    state.match.players = [db.accounts![0].userId, "opponent"];
    state.match.deadline = Date.now() + 86400000;
  });
  // A generated challenge uses the same opaque token contract as the standalone response route.
  const { createSeed } = await import("@fp/shared");
  await f.repo.transact(state => {
    state.scenarios = [{ ...createSeed().scenarios[0], tokenHash: hash(challenge), tokenExpiresAt: Date.now() + 86400000, releasedAt: Date.now(), deliveryStatus: "accepted", recipientId: db.accounts![0].userId }];
  });
  const page = await f.app.inject(`/auth/email?challenge=${challenge}`);
  assert.equal(page.statusCode, 200, page.body);
  assert.match(page.body, /does not accept a challenge or change your score/);
  assert.ok(!page.body.includes("player0@example.test"));
  const csrf = /name="csrf" value="([^"]+)"/.exec(page.body)![1];
  const headers = { cookie: `fp_email_csrf=${csrf}`, origin: f.config.apiOrigin, "content-type": "application/x-www-form-urlencoded" };
  f.advance(60001);
  const wrong = await f.app.inject({ method: "POST", url: "/auth/email/start", headers, payload: new URLSearchParams({ csrf, email: "player1@example.test", challenge }).toString() });
  assert.equal(wrong.statusCode, 403);
  const sent = await f.app.inject({ method: "POST", url: "/auth/email/start", headers, payload: new URLSearchParams({ csrf, email: "player0@example.test", challenge }).toString() });
  assert.equal(sent.statusCode, 200, sent.body);
  const requestId = /name="requestId" value="([^"]+)"/.exec(sent.body)![1];
  const verified = await f.app.inject({ method: "POST", url: "/auth/email/verify", headers, payload: new URLSearchParams({ csrf, requestId, code: f.messages[1].code, challenge }).toString() });
  assert.equal(verified.statusCode, 302, verified.body);
  assert.equal(verified.headers.location, `/r/${challenge}`);
  assert.equal((await f.repo.read()).decisions.length, 0);
  assert.equal((await f.repo.read()).scoreEvents.length, 0);
});


test("signup accepts a participant-entered email without an environment invitation list", async t => {
  const f = await setup(t, { recipientList: "" });
  const browser = await f.browser();
  const result = await f.start(browser, "new-player@temporary.example");
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(f.messages[0].email, "new-player@temporary.example");
  assert.equal((await f.repo.read()).accounts?.length, 0, "Requesting a code does not create an owned account");
  const verified = await f.verify(browser, result.json<{ requestId: string }>().requestId, f.messages[0].code);
  assert.equal(verified.statusCode, 200, verified.body);
  const account = (await f.repo.read()).accounts![0];
  assert.equal(account.consent.contacts.email?.destination, "new-player@temporary.example");
  assert.equal(account.consent.contacts.email?.verified, true);
  assert.equal(account.consent.acceptedAt, null, "Email ownership does not grant game participation consent");
  assert.equal((await f.start(browser, "new-player@temporary.example")).statusCode, 429, "Open enrollment keeps resend limits");
});

test("a malformed optional invitation list blocks signup instead of opening registration", async t => {
  const f = await setup(t, { recipientList: "*" });
  assert.equal((await f.app.inject("/api/auth/email")).statusCode, 503);
  assert.equal(f.messages.length, 0);
});
