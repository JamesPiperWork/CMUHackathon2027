import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed, type DeliveryResult, type GenerateRequest } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { getReadiness, SmtpAdapter } from "../src/providers.js";
import { loadConfig, type Config } from "../src/config.js";
import twilio from "twilio";
import { phoneDestinationHash, TwilioAdapter } from "../src/providers.js";

async function fixture(t: TestContext, real = false, immediate = true) {
  const dir = await mkdtemp(join(tmpdir(), "fp-immediate-")), file = join(dir, "db.json");
  const env = { SMTP_USER: "organizer@example.invalid", SMTP_FROM: "organizer@example.invalid", SMTP_HOST: "smtp.example.invalid", SMTP_PASS: "test-only", SMTP_PORT: "587", SMTP_SECURE: "false",
    EMAIL_DEMO_SEND_ENABLED: "true", EMAIL_DEMO_RECIPIENTS: "", SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32) };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const config: Config = { mode: "demo", emailDemo: real, emailDemoImmediate: immediate, ruleSet: "email-casts-v2", port: 0,
    apiOrigin: "https://demo.example.invalid", appOrigin: "https://demo.example.invalid", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  let repo = await FileRepository.open(file, () => {
    const db = createSeed();
    for (const member of db.members) {
      member.accepted = true;
      // Deliberately outside contact hours. Test SMTP is always replaced below.
      const startHour = (new Date().getUTCHours() + 2) % 24;
      Object.assign(member.consent, { adult: true, acceptedAt: Date.now(), timezone: "UTC", startHour, endHour: startHour + 1, channels: { email: true, sms: false, voice: false } });
      member.consent.contacts.email = { destination: `${member.userId}@example.invalid`, verified: true, method: "verify", verifiedAt: Date.now() };
    }
    db.accounts = db.members.map(member => ({ userId: member.userId, consent: structuredClone(member.consent) }));
    return db;
  });
  let service = new GameService(repo, config);
  let { app } = await createServer(service, { startJobs: false });
  t.after(async () => {
    await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const call = (url: string, payload?: object, token = alex.token) => app.inject({ method: payload ? "POST" : "GET", url, ...(payload ? { payload } : {}), headers: { authorization: `Bearer ${token}` } });
  const prepare = async (slot: 1 | 2 | "spear" = 1) => {
    const input: GenerateRequest = { recipientMemberId: "jordan", channel: "email", templateId: "parcel-update", interest: "Board games", ...(slot === "spear" ? { kind: "spear" } : { kind: "regular", slot }) };
    const response = await call("/api/drafts/prepare", input);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().scenarioId as string;
  };
  const send = (id: string, token = alex.token) => call(`/api/drafts/${id}/send`, {}, token);
  const restart = async () => {
    await app.close(); await repo.close();
    repo = await FileRepository.open(file, () => { throw new Error("Expected persisted state"); });
    service = new GameService(repo, config);
    ({ app } = await createServer(service, { startJobs: false }));
  };
  return { get repo() { return repo; }, get service() { return service; }, get app() { return app; }, config, env, alex, jordan, call, prepare, send, restart };
}

test("Send starts a week and submits only the chosen simulated cast; concurrent clicks and workers cannot duplicate it", async t => {
  const f = await fixture(t);
  const first = await f.prepare(), second = await f.prepare(2);
  await f.service.lock("alex", second);
  assert.equal((await f.call("/api/state")).json().deliveryTiming, "immediate");
  assert.equal((await f.app.inject("/api/config")).json().deliveryTiming, "immediate");
  assert.equal((await f.send(first, f.jordan.token)).statusCode, 404);
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.send(first)));
  assert.ok(responses.every(response => response.statusCode === 200));
  await f.service.tick();
  let db = await f.repo.read();
  assert.equal(db.match.state, "active");
  assert.equal(db.scenarios.length, 2, "No ordinary mail or opponent drafts are created");
  assert.equal(db.jobs.filter(job => job.type === "delivery").length, 1, "Sending one cast does not release other ready drafts");
  assert.equal(db.attempts.length, 1);
  assert.equal(db.attempts[0].status, "simulated");
  assert.equal((await f.send(first)).json().status, "simulated");
  assert.equal((await f.repo.read()).attempts.length, 1);
  const spear = await f.prepare("spear");
  await Promise.all([f.send(spear), f.send(spear), f.service.tick()]);
  db = await f.repo.read();
  assert.equal(db.spearUses!.length, 1);
  assert.equal(db.attempts.filter(attempt => attempt.scenarioId === spear).length, 1);
  const secondResponses = await Promise.all([f.send(second), f.service.tick()]);
  assert.equal(secondResponses[0].statusCode, 200);
  assert.equal((await f.repo.read()).attempts.length, 3);
});

test("explicit immediate SMTP testing bypasses hours and daily delay, keeps cast caps, and reports accepted rather than delivered", async t => {
  const f = await fixture(t, true);
  const submissions: string[] = [];
  t.mock.method(SmtpAdapter.prototype, "send", async (envelope: { attemptId: string }): Promise<DeliveryResult> => { submissions.push(envelope.attemptId); return { status: "accepted", reason: "Test SMTP accepted; delivery unconfirmed." }; });
  for (const slot of [1, 2, "spear"] as const) {
    const id = await f.prepare(slot);
    const result = await f.send(id);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().status, "accepted");
  }
  assert.equal(submissions.length, 3, "All three allowed casts can be tested in one sitting");
  const db = await f.repo.read();
  assert.equal(db.scenarios.length, 3); assert.equal(db.spearUses!.length, 1);
  assert.ok(db.jobs.every(job => job.dueAt <= Date.now()));
  const third = await f.call("/api/drafts/prepare", { recipientMemberId: "jordan", channel: "email", templateId: "parcel-update", interest: "Board games", kind: "regular", slot: 3 });
  assert.equal(third.statusCode, 400);
  await f.restart();
  assert.equal((await f.send(db.scenarios[0].id)).json().status, "accepted");
  assert.equal(submissions.length, 3, "Restart never allows an already submitted cast to be resent");
});

test("Send now can advance an unattempted scheduled cast without dispatching another queued cast", async t => {
  const f = await fixture(t, true, false);
  let submissions = 0;
  t.mock.method(SmtpAdapter.prototype, "send", async (): Promise<DeliveryResult> => { submissions++; return { status: "accepted" }; });
  const first = await f.prepare(), second = await f.prepare(2);
  await f.service.lock("alex", first); await f.service.lock("alex", second); await f.service.activate("alex");
  const before = await f.repo.read();
  assert.ok(before.jobs.every(job => job.dueAt > Date.now()));
  assert.equal((await f.send(first)).statusCode, 409);
  assert.equal((await f.call("/api/state")).json().deliveryTiming, "scheduled");
  f.config.emailDemoImmediate = true;
  assert.equal((await f.send(first)).json().status, "accepted");
  const after = await f.repo.read();
  assert.equal(submissions, 1);
  assert.equal(after.jobs.find(job => job.scenarioId === second)!.dueAt, before.jobs.find(job => job.scenarioId === second)!.dueAt);
  assert.equal(after.jobs.find(job => job.scenarioId === second)!.status, "queued");
});

test("unknown or rejected SMTP outcomes are persisted and never automatically retried", async t => {
  const f = await fixture(t, true);
  let submissions = 0;
  t.mock.method(SmtpAdapter.prototype, "send", async (): Promise<DeliveryResult> => ({ status: ++submissions === 1 ? "unknown" : "failed", reason: "Synthetic transport outcome" }));
  const first = await f.prepare();
  assert.equal((await f.send(first)).json().status, "unknown");
  await f.restart();
  assert.equal((await f.send(first)).json().status, "unknown");
  await f.service.tick();
  assert.equal(submissions, 1);
  const second = await f.prepare(2);
  assert.equal((await f.send(second)).json().status, "failed");
  assert.equal((await f.send(second)).json().status, "failed");
  assert.equal(submissions, 2);
});

test("a slow submission returns unknown after the bounded wait and duplicate clicks cannot submit again", { timeout: 3000 }, async t => {
  const f = await fixture(t, true);
  let submissions = 0, entered!: () => void, finish!: (result: DeliveryResult) => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const transport = new Promise<DeliveryResult>(resolve => { finish = resolve; });
  t.mock.method(SmtpAdapter.prototype, "send", () => { submissions++; entered(); return transport; });
  const id = await f.prepare();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = f.send(id);
    await started;
    assert.equal((await f.send(id)).json().status, "queued");
    t.mock.timers.tick(25000);
    const response = await pending;
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, "unknown");
    assert.match(response.json().reason, /25 seconds/);
    assert.equal((await f.send(id)).json().status, "unknown");
    assert.equal(submissions, 1);
    finish({ status: "accepted", reason: "The original SMTP request acknowledged late." });
    await transport;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal((await f.send(id)).json().status, "accepted", "Late evidence updates the original attempt without a second send");
    assert.equal((await f.repo.read()).attempts.length, 1);
  } finally {
    finish({ status: "unknown" });
    t.mock.timers.reset();
  }
});

test("immediate mode preserves recipient ownership, enrollment, pause, channel and exclusion gates", async t => {
  const f = await fixture(t, true);
  let submissions = 0;
  t.mock.method(SmtpAdapter.prototype, "send", async (): Promise<DeliveryResult> => { submissions++; return { status: "accepted" }; });
  const id = await f.prepare("spear");
  const original = structuredClone((await f.repo.read()).members.find(member => member.userId === "jordan")!);
  for (const change of [
    (member: typeof original) => { member.consent.contacts.email!.verified = false; },
    (member: typeof original) => { member.consent.paused = true; },
    (member: typeof original) => { member.consent.channels.email = false; },
    (member: typeof original) => { member.consent.adult = false; },
    (member: typeof original) => { member.accepted = false; },
    (member: typeof original) => { member.consent.excludedThemes = ["parcel"]; },
  ]) {
    await f.repo.transact(db => { const member = db.members.find(member => member.userId === "jordan")!; Object.assign(member, structuredClone(original)); change(member); });
    const response = await f.send(id);
    assert.ok([400, 409].includes(response.statusCode), response.body);
    assert.equal((await f.repo.read()).spearUses!.length, 0, "Blocked submission must not consume the seasonal Spear");
  }
  assert.equal(submissions, 0);
  await f.repo.transact(db => { Object.assign(db.members.find(member => member.userId === "jordan")!, original); });
  assert.equal((await f.send(id)).json().status, "accepted");
  assert.equal(submissions, 1);
});

test("the immediate flag never relaxes full-live readiness or enables the Send endpoint there", async t => {
  const f = await fixture(t, true);
  const id = await f.prepare();
  f.config.mode = "live";
  await assert.rejects(f.service.sendCast("alex", id), /scheduled/i);
  assert.equal((await f.repo.read()).scenarios[0].locked, false);
  const rows = getReadiness(await f.repo.read(), "jordan", Date.now(), { ...f.env, APP_MODE: "live", EMAIL_DELIVERY_MODE: "smtp-demo", EMAIL_DEMO_IMMEDIATE: "true" });
  const conditions = rows.find(row => row.channel === "email")!.conditions;
  assert.ok(conditions.some(condition => condition.name === "Contact window" && !condition.ok));
  assert.ok(conditions.some(condition => condition.name === "Daily quota"));
  assert.equal(conditions.some(condition => condition.name === "Immediate email test"), false);
  assert.equal(loadConfig({ APP_MODE: "demo", EMAIL_DELIVERY_MODE: "simulated", EMAIL_DEMO_IMMEDIATE: "true" }).emailDemoImmediate, false);
});

test("an early signed phone callback survives a changed number and outranks the original send acknowledgement", async t => {
  const f = await fixture(t, true);
  const env = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", PHONE_DELIVERY_MODE: "twilio-demo", PHONE_DEMO_SEND_ENABLED: "true", ENABLE_PHONE_DEMO_SMS: "true",
    TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-only", TWILIO_SMS_FROM: "+12025550100", TWILIO_CALLBACK_BASE: f.config.apiOrigin,
    TWILIO_TRIAL_MODE: "false", SMS_REGISTRATION_REFERENCE: "test-only-registration" };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  f.config.phoneDemo = true;
  const phone = "+12025550123", sid = `SM${"2".repeat(32)}`;
  await f.repo.transact(db => {
    const recipient = db.members.find(member => member.userId === "jordan")!;
    Object.assign(recipient.consent, { channels: { email: true, sms: true, voice: false }, timezone: "UTC", startHour: 0, endHour: 24 });
    recipient.consent.contacts.sms = { destination: phone, verified: true, verifiedAt: Date.now(), method: "verify", evidence: "twilio-verify:test-only" };
  });
  const prepared = await f.call("/api/drafts/prepare", { recipientMemberId: "jordan", channel: "sms", kind: "spear", authorPrompt: "Invite a pottery enthusiast to a fictional ceramics workshop." });
  assert.equal(prepared.statusCode, 200, prepared.body);
  let entered!: () => void, finish!: (value: DeliveryResult) => void, submissions = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<DeliveryResult>(resolve => { finish = resolve; });
  t.mock.method(TwilioAdapter.prototype, "send", () => { submissions++; entered(); return pending; });
  const sending = f.send(prepared.json().scenarioId);
  try {
    await started;
    const attempt = (await f.repo.read()).attempts[0];
    assert.equal(attempt.recipientPhoneHash, phoneDestinationHash(phone));
    assert.equal(attempt.providerId, undefined);
    await f.repo.transact(db => { delete db.members.find(member => member.userId === "jordan")!.consent.contacts.sms; });
    const path = `/webhooks/twilio/status?attemptId=${attempt.id}`;
    const payload = { AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: sid, MessageStatus: "delivered", To: phone };
    const headers = { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, `${f.config.apiOrigin}${path}`, payload) };
    const callback = await f.app.inject({ method: "POST", url: path, payload, headers });
    assert.equal(callback.statusCode, 204, callback.body);
    finish({ status: "accepted", providerId: sid, reason: "Original request acknowledged after delivery evidence." });
    const sent = await sending;
    assert.equal(sent.statusCode, 200, sent.body); assert.equal(sent.json().status, "delivered");
    const db = await f.repo.read();
    assert.equal(db.attempts[0].providerId, sid); assert.equal(db.attempts[0].status, "delivered");
    assert.equal(db.jobs.find(job => job.type === "delivery")!.status, "complete");
    assert.equal(db.attempts.length, 1); assert.equal(db.spearUses!.length, 1); assert.equal(submissions, 1);
    assert.equal(db.scoreEvents.length, 0, "A carrier status is not a player response");
    assert.equal((await f.send(prepared.json().scenarioId)).json().status, "delivered");
  } finally { finish({ status: "unknown" }); await sending; }
});
