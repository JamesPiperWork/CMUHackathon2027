import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { createSeed } from "@fp/shared";
import { FileRepository, gamePools } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { getReadiness, SmtpAdapter } from "../src/providers.js";
import { canonicalEmailReceipt, emailRecipientHash, registerEmailReceiptRoutes, signEmailReceipt, smtpMessageId, type EmailReceipt } from "../src/email-receipts.js";

const relaySecret = "test-relay-key-only-at-least-32-characters";
async function setup(t: TestContext, pooled = false, emailDemo = false) {
  const dir = await mkdtemp(join(tmpdir(), "fp-email-receipts-"));
  const file = join(dir, "state.json");
  let repo = await FileRepository.open(file, () => createSeed());
  // Test-only ownership evidence. Every SMTP adapter call below is replaced;
  // these synthetic addresses never leave the process.
  if (emailDemo) await repo.transact((db) => {
    db.accounts = db.members.map((member) => ({ userId: member.userId, consent: {
      ...structuredClone(member.consent), contacts: { email: {
        destination: `${member.userId}@example.invalid`, verified: true, method: "verify", verifiedAt: Date.now(),
      } },
    } }));
  });
  const config = { ruleSet: "email-casts-v2" as const, mode: emailDemo ? "demo" as const : "live" as const, emailDemo, port: 0,
    apiOrigin: "https://example.invalid", appOrigin: "https://app.example.invalid",
    dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  let service = new GameService(repo, config);
  await service.initializeRules();
  const now = Date.now();
  const matchId = pooled ? (await repo.read()).matchPools!.find((p) => p.match.week === 4)!.match.id : (await repo.read()).match.id;
  const target = service.forMatch(matchId);
  await target.transact((db) => {
    const template = structuredClone(gamePools(db).flatMap((p) => p.scenarios).find((s) => s.channel === "email")!);
    db.match.state = "active"; db.match.startedAt = now - 300000; db.match.deadline = now + 60000;
    db.scenarios = [{ ...template, id: "receipt-scenario", matchId, authorId: db.match.players[0], recipientId: db.match.players[1],
      kind: "regular", slot: 1, locked: true, isPhishing: true, releasedAt: now - 180000,
      tokenExpiresAt: now + 60000, deliveryStatus: "accepted" }];
    db.attempts = [{ id: "receipt-attempt", scenarioId: "receipt-scenario", recipientId: db.match.players[1],
      channel: "email", provider: "smtp", providerId: "<receipt-attempt@mail.example.invalid>",
      recipientAddressHash: emailRecipientHash("recipient@example.invalid"), status: "accepted",
      createdAt: now - 180000, updatedAt: now - 180000, callbackIds: [] }];
    db.jobs = [{ id: "receipt-job", scenarioId: "receipt-scenario", type: "delivery", status: "complete",
      dueAt: now - 180000, leaseExpiresAt: null, attempts: 1, idempotencyKey: "delivery:receipt-scenario" }];
    db.decisions = []; db.scoreEvents = [];
  });
  const recipientId = (await target.readDb()).match.players[1];
  const env = { EMAIL_RECEIPT_RELAY_SECRET: relaySecret };
  let app = Fastify();
  registerEmailReceiptRoutes(app, service, env);
  const receipt = (overrides: Partial<EmailReceipt> = {}): EmailReceipt => ({ version: 1, eventId: "event-1",
    attemptId: "receipt-attempt", providerMessageId: "<receipt-attempt@mail.example.invalid>", recipientId,
    recipientAddress: "recipient@example.invalid", status: "delivered", occurredAt: now - 60000, ...overrides });
  const send = (payload: EmailReceipt, overrides: Record<string, string> = {}) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return app.inject({ method: "POST", url: "/webhooks/email/receipts", payload,
      headers: { "x-fp-receipt-timestamp": timestamp, "x-fp-receipt-signature": signEmailReceipt(payload, timestamp, relaySecret), ...overrides } });
  };
  const restart = async () => {
    await app.close(); await repo.close();
    repo = await FileRepository.open(file, () => { throw new Error("Expected persisted receipts"); });
    service = new GameService(repo, config); app = Fastify();
    registerEmailReceiptRoutes(app, service, env);
  };
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  return { get repo() { return repo; }, get service() { return service; }, get app() { return app; },
    scoped: () => service.forMatch(matchId), env, now, matchId, recipientId, receipt, send, restart };
}

test("email relay rejects unsigned, stale, tampered, unconfigured and incorrectly correlated evidence", async (t) => {
  const f = await setup(t);
  const payload = f.receipt();
  assert.equal((await f.app.inject({ method: "POST", url: "/webhooks/email/receipts", payload })).statusCode, 403);
  assert.equal((await f.send(payload, { "x-fp-receipt-signature": `v1=${"0".repeat(64)}` })).statusCode, 403);
  const stale = String(Math.floor(Date.now() / 1000) - 301);
  assert.equal((await f.send(payload, { "x-fp-receipt-timestamp": stale, "x-fp-receipt-signature": signEmailReceipt(payload, stale, relaySecret) })).statusCode, 403);
  const signedAt = String(Math.floor(Date.now() / 1000));
  assert.equal((await f.send({ ...payload, status: "bounced" }, { "x-fp-receipt-timestamp": signedAt, "x-fp-receipt-signature": signEmailReceipt(payload, signedAt, relaySecret) })).statusCode, 403);
  for (const changed of [
    { attemptId: "unknown" }, { providerMessageId: "other-message" },
    { recipientId: "other-player" }, { recipientAddress: "other@example.invalid" },
  ]) assert.equal((await f.send(f.receipt(changed))).statusCode, 404);
  assert.equal((await f.send(f.receipt({ occurredAt: f.now + 120000 }))).statusCode, 400);
  assert.equal((await f.send(f.receipt({ occurredAt: f.now - 600000 }))).statusCode, 400);
  f.env.EMAIL_RECEIPT_RELAY_SECRET = "";
  assert.equal((await f.send(payload)).statusCode, 503);
  const db = await f.scoped().readDb();
  assert.equal(db.emailReceipts, undefined);
  assert.equal(db.attempts[0].status, "accepted");
  assert.equal(db.scoreEvents.length, 0);
});

test("receipt correlation uses the submitted address and duplicate deliveries persist exactly once", async (t) => {
  const f = await setup(t);
  await f.scoped().transact((db) => { db.members.find((m) => m.userId === f.recipientId)!.consent.contacts.email!.destination = "new@example.invalid"; });
  const results = await Promise.all(Array.from({ length: 8 }, () => f.send(f.receipt())));
  assert.ok(results.every((r) => r.statusCode === 204));
  let db = await f.scoped().readDb();
  assert.equal(db.emailReceipts!.length, 1);
  assert.equal(db.attempts[0].callbackIds.length, 1);
  assert.equal(db.callbackIds.length, 1);
  assert.equal(db.attempts[0].status, "delivered");
  assert.equal(db.scenarios[0].deliveryStatus, "delivered");
  assert.equal(db.attempts[0].receiptOccurredAt, f.receipt().occurredAt);
  assert.ok(db.emailReceipts![0].receivedAt > db.emailReceipts![0].occurredAt);
  assert.ok(!JSON.stringify(db.emailReceipts).includes("recipient@example.invalid"));
  await f.restart();
  assert.equal((await f.send(f.receipt())).statusCode, 204);
  assert.equal((await f.send(f.receipt({ status: "bounced" }))).statusCode, 409);
  db = await f.scoped().readDb();
  assert.equal(db.emailReceipts!.length, 1);
  assert.equal(db.match.state, "active");
});

test("out-of-order delivery evidence cannot reverse newer evidence or a permanent bounce", async (t) => {
  const f = await setup(t);
  assert.equal((await f.send(f.receipt({ occurredAt: f.now - 20000 }))).statusCode, 204);
  assert.equal((await f.send(f.receipt({ eventId: "old-bounce", status: "bounced", occurredAt: f.now - 60000 }))).statusCode, 204);
  assert.equal((await f.scoped().readDb()).attempts[0].status, "delivered");
  assert.equal((await f.send(f.receipt({ eventId: "new-bounce", status: "bounced", occurredAt: f.now - 10000 }))).statusCode, 204);
  assert.equal((await f.send(f.receipt({ eventId: "later-delivery", occurredAt: f.now - 1000 }))).statusCode, 204);
  const db = await f.scoped().readDb();
  assert.equal(db.attempts[0].status, "failed");
  assert.equal(db.attempts[0].receiptStatus, "bounced");
  assert.equal(db.jobs[0].status, "failed");
  assert.deepEqual(db.emailReceipts!.map((r) => r.disposition), ["applied", "stale", "applied", "stale"]);
});

test("late arrival settles an incomplete week using provider occurrence time, preserving completed scores", async (t) => {
  const f = await setup(t);
  await f.scoped().transact((db) => { db.match.deadline = f.now - 90000; });
  await f.scoped().finalize();
  assert.equal((await f.scoped().readDb()).match.result, "incomplete");
  const receipt = f.receipt({ occurredAt: f.now - 120000 });
  assert.equal((await f.send(receipt)).statusCode, 204);
  const finished = await f.scoped().readDb();
  assert.equal(finished.match.state, "completed");
  assert.equal(finished.match.incompleteReason, undefined);
  assert.equal(finished.match.scores[f.recipientId], 1);
  assert.equal(finished.scoreEvents.filter((e) => e.type === "avoidance").length, 1);
  assert.equal((await f.send(f.receipt({ eventId: "post-final-bounce", status: "bounced", occurredAt: f.now - 30000 }))).statusCode, 204);
  const after = await f.scoped().readDb();
  assert.equal(after.emailReceipts!.at(-1)!.disposition, "terminal");
  assert.deepEqual(after.match, finished.match);
  assert.deepEqual(after.scoreEvents, finished.scoreEvents);
  assert.equal(after.attempts[0].status, "delivered");
});

test("permanent bounces and deliveries after the deadline settle without unearned avoidance points", async (t) => {
  for (const status of ["delivered", "bounced"] as const) {
    const f = await setup(t);
    await f.scoped().transact((db) => { db.match.deadline = f.now - 90000; });
    await f.scoped().finalize();
    assert.equal((await f.send(f.receipt({ status }))).statusCode, 204);
    const db = await f.scoped().readDb();
    assert.equal(db.match.state, "completed");
    assert.equal(db.match.scores[f.recipientId], 0);
    assert.equal(db.scoreEvents.length, 0);
  }
});

test("a pooled match receipt leaves the primary match and other leagues untouched", async (t) => {
  const f = await setup(t, true);
  const original = gamePools(await f.repo.read()).filter((p) => p.match.id !== f.matchId);
  assert.equal((await f.send(f.receipt())).statusCode, 204);
  assert.deepEqual(gamePools(await f.repo.read()).filter((p) => p.match.id !== f.matchId), original);
  assert.equal((await f.scoped().readDb()).attempts[0].status, "delivered");
});

test("real-email demo stores correlation before SMTP and preserves a receipt that beats its acknowledgement", async (t) => {
  const env = {
    EMAIL_DEMO_SEND_ENABLED: "true", EMAIL_DEMO_RECIPIENTS: "recipient@example.invalid,alex@example.invalid",
    SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32),
    SMTP_HOST: "smtp.example.invalid", SMTP_USER: "sender", SMTP_PASS: "test-only", SMTP_FROM: "sender@example.invalid",
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  const originalSend = SmtpAdapter.prototype.send;
  Object.assign(process.env, env);
  try {
    const f = await setup(t, false, true);
    await f.scoped().transact((db) => {
      db.match.state = "drafting"; db.scenarios = []; db.attempts = []; db.jobs = [];
      for (const id of db.match.players) {
        const member = db.members.find((m) => m.userId === id && m.leagueId === db.match.leagueId)!;
        member.accepted = true; member.consent.adult = true; member.consent.acceptedAt = f.now;
        member.consent.timezone = "UTC"; member.consent.startHour = 0; member.consent.endHour = 24;
        member.consent.channels = { email: true, sms: false, voice: false };
        member.consent.contacts.email = { destination: id === f.recipientId ? "recipient@example.invalid" : "alex@example.invalid", verified: true, method: "verify", verifiedAt: f.now };
      }
    });
    const prepared = await f.service.generate("alex", { recipientMemberId: f.recipientId, channel: "email", interest: "Board games", templateId: "parcel-update", kind: "regular", slot: 1 }, true);
    await f.service.lock("alex", prepared.scenarioId);
    await f.service.activate("alex");
    await f.scoped().transact((db) => { for (const job of db.jobs) job.dueAt = Date.now() - 1; });
    const ready = getReadiness(await f.scoped().readDb(), f.recipientId, Date.now(), { ...process.env, APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", API_ORIGIN: "https://example.invalid", APP_ORIGIN: "https://app.example.invalid" }).find((r) => r.channel === "email")!;
    assert.equal(ready.status, "ready", ready.reason);
    let submissions = 0;
    SmtpAdapter.prototype.send = async (envelope) => {
      submissions++;
      const attempt = (await f.scoped().readDb()).attempts.find((a) => a.id === envelope.attemptId)!;
      assert.equal(attempt.provider, "smtp");
      assert.equal(attempt.recipientAddressHash, emailRecipientHash(envelope.destination));
      assert.equal(attempt.providerId, smtpMessageId(envelope.attemptId, env.SMTP_FROM));
      assert.equal((await f.send(f.receipt({ attemptId: envelope.attemptId, providerMessageId: attempt.providerId, recipientAddress: envelope.destination, occurredAt: Date.now() }))).statusCode, 204);
      return { status: "unknown", reason: "SMTP acknowledgement timed out after relay delivery proof" };
    };
    await f.service.tick();
    const db = await f.scoped().readDb();
    assert.equal(submissions, 1);
    assert.equal(db.attempts[0].status, "delivered");
    assert.equal(db.scenarios[0].deliveryStatus, "delivered");
    assert.equal(db.jobs[0].status, "complete");
    assert.equal(db.emailReceipts!.length, 1);
    assert.ok(db.scenarios[0].releasedAt);
  } finally {
    SmtpAdapter.prototype.send = originalSend;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("relay signing uses fixed field order and SMTP identifiers are stable", () => {
  const receipt: EmailReceipt = { version: 1, eventId: "e", attemptId: "a", providerMessageId: "m", recipientId: "r", recipientAddress: "r@example.invalid", status: "delivered", occurredAt: 1000 };
  assert.equal(canonicalEmailReceipt(receipt), '[1,"e","a","m","r","r@example.invalid","delivered",1000]');
  assert.equal(smtpMessageId("attempt-123", "sender@example.invalid"), "<attempt-123@example.invalid>");
  assert.equal(emailRecipientHash("Recipient@Example.Invalid"), emailRecipientHash("recipient@example.invalid"));
});
