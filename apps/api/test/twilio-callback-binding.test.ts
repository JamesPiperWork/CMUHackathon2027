import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import twilio from "twilio";
import { createSeed, fixtureContent, type Channel } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { phoneDestinationHash, registerProviderRoutes, TwilioAdapter } from "../src/providers.js";

async function fixture(t: TestContext, channel: Channel = "voice") {
  const directory = await mkdtemp(join(tmpdir(), "fp-twilio-binding-")), file = join(directory, "state.json"), now = Date.now();
  const env = { APP_MODE: "live", TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-only", TWILIO_CALLBACK_BASE: "https://callback.example.invalid", TWILIO_SMS_FROM: "+12025550100" };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  const repo = await FileRepository.open(file, () => {
    const db = createSeed(now); db.match.ruleSet = "email-casts-v2"; db.match.state = "active"; db.match.startedAt = now; db.match.deadline = now + 3600000;
    db.scenarios.push({ id: "cast", matchId: db.match.id, authorId: "alex", recipientId: "jordan", channel, templateId: "ticket-drop", interest: "Board games", content: fixtureContent(channel, "ticket-drop", true), isPhishing: true, locked: true, source: "fixture", model: "fixture", promptVersion: "legacy", generationAttempts: 0, generationStatus: "complete", tokenHash: "test-only", tokenExpiresAt: db.match.deadline, releasedAt: null, deliveryStatus: "queued", order: 0 });
    db.attempts.push({ id: "attempt", scenarioId: "cast", recipientId: "jordan", channel, provider: "twilio", recipientPhoneHash: phoneDestinationHash("+12025550101"), status: "queued", createdAt: now, updatedAt: now, callbackIds: [] });
    return db;
  });
  const service = new GameService(repo, { mode: "demo", ruleSet: "email-casts-v2", port: 0, apiOrigin: env.TWILIO_CALLBACK_BASE, appOrigin: env.TWILIO_CALLBACK_BASE, dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const app = Fastify(); await app.register(formbody); registerProviderRoutes(app, service);
  const post = (route: "status" | "voice-decision", values: Record<string, string>, attemptId = "attempt", signedAttempt = attemptId) => {
    const body = { AccountSid: env.TWILIO_ACCOUNT_SID, To: "+12025550101", ...values }, path = `/webhooks/twilio/${route}?attemptId=${attemptId}`;
    return app.inject({ method: "POST", url: path, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, `${env.TWILIO_CALLBACK_BASE}/webhooks/twilio/${route}?attemptId=${signedAttempt}`, body) }, payload: new URLSearchParams(body).toString() });
  };
  t.after(async () => { await app.close(); await repo.close(); for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(directory, { recursive: true, force: true }); });
  return { repo, service, app, post, env };
}

test("signed attempt-bound callbacks accept early evidence, survive phone removal, and never rebind a SID", async t => {
  const f = await fixture(t);
  const sid = `CA${"2".repeat(32)}`;
  assert.equal((await f.post("status", { CallSid: sid, CallStatus: "ringing" }, "other", "attempt")).statusCode, 403, "Signature covers the attempt query");
  assert.equal((await f.post("status", { CallSid: sid, To: "+12025550999", CallStatus: "ringing" })).statusCode, 404);
  assert.equal((await f.post("status", { MessageSid: `SM${"2".repeat(32)}`, MessageStatus: "sent" })).statusCode, 404, "Channel is bound to the attempt");
  assert.equal((await f.post("status", { CallSid: sid, CallStatus: "ringing" })).statusCode, 204);
  let db = await f.repo.read(); assert.equal(db.attempts[0].providerId, sid); assert.equal(db.attempts[0].status, "accepted"); assert.ok(db.scenarios[0].releasedAt);
  await f.repo.transact(db => { for (const member of db.members.filter(member => member.userId === "jordan")) delete member.consent.contacts.voice; });
  assert.equal((await f.post("status", { CallSid: sid, CallStatus: "completed" })).statusCode, 204, "Original immutable destination is used after contact removal");
  assert.equal((await f.post("status", { CallSid: `CA${"3".repeat(32)}`, CallStatus: "completed" })).statusCode, 404);
  await f.post("status", { CallSid: sid, CallStatus: "completed" });
  await f.post("status", { CallSid: sid, CallStatus: "ringing" });
  db = await f.repo.read(); assert.equal(db.attempts[0].status, "delivered"); assert.equal(db.attempts[0].callbackIds.length, 2); assert.equal(db.decisions.length, 0);
});

test("an early keypad callback releases only its verified attempt and scores once without waiting for acknowledgement", async t => {
  const f = await fixture(t), sid = `CA${"4".repeat(32)}`;
  assert.equal((await f.post("voice-decision", { CallSid: sid, Digits: "1" })).statusCode, 200);
  assert.equal((await f.post("voice-decision", { CallSid: sid, Digits: "1" })).statusCode, 200);
  const db = await f.repo.read(); assert.equal(db.attempts[0].providerId, sid); assert.equal(db.attempts[0].callbackIds.length, 1);
  assert.equal(db.decisions.length, 1); assert.equal(db.decisions[0].defenderPoints, -1); assert.equal(db.decisions[0].authorPoints, 3); assert.ok(db.scenarios[0].releasedAt);
  assert.equal((await f.post("voice-decision", { CallSid: `CA${"5".repeat(32)}`, Digits: "2" })).statusCode, 403);
});

test("early SMS status binds its own SID and destination without granting a click decision", async t => {
  const f = await fixture(t, "sms"), sid = `SM${"6".repeat(32)}`;
  assert.equal((await f.post("status", { MessageSid: sid, MessageStatus: "delivered" })).statusCode, 204);
  const db = await f.repo.read(); assert.equal(db.attempts[0].providerId, sid); assert.equal(db.attempts[0].status, "delivered"); assert.equal(db.decisions.length, 0);
});

test("Twilio submissions include the durable attempt in signed callback URLs", async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = new TwilioAdapter({ TWILIO_CALLBACK_BASE: "https://callback.example.invalid", TWILIO_SMS_FROM: "+12025550100", TWILIO_VOICE_FROM: "+12025550100" }, {
    messages: { create: async (request: Record<string, unknown>) => { requests.push(request); return { sid: "SM-test" }; } },
    calls: { create: async (request: Record<string, unknown>) => { requests.push(request); return { sid: "CA-test" }; } },
  });
  for (const channel of ["sms", "voice"] as const) await adapter.send({ attemptId: "attempt-bound", scenarioId: "cast", recipientId: "jordan", channel, destination: "+12025550101", content: fixtureContent(channel, "ticket-drop", true), actionUrl: "https://game.example.invalid/r/test", audioUrl: "https://game.example.invalid/media/voice/test" });
  assert.ok(requests.every(request => String(request.statusCallback).endsWith("?attemptId=attempt-bound")));
  assert.match(String(requests[1].twiml), /voice-decision\?attemptId=attempt-bound/);
});
