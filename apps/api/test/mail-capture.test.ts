import test from "node:test";
import assert from "node:assert/strict";
import { createSeed, fixtureContent, type DeliveryEnvelope } from "@fp/shared";
import { loadConfig } from "../src/config.js";
import { captureConfiguration, captureTransportOptions } from "../src/mail-capture.js";
import { getReadiness, SmtpAdapter, dispatch } from "../src/providers.js";

const env = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "mailpit", EMAIL_DEMO_LOCAL_ONLY: "true", EMAIL_DEMO_SEND_ENABLED: "true", API_ORIGIN: "http://localhost:3001", APP_ORIGIN: "http://localhost:3001", PORT: "3001", SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32) };
const envelope: DeliveryEnvelope = { attemptId: "attempt-capture", scenarioId: "scenario-capture", recipientId: "jordan", channel: "email", destination: "jordan@demo.test", content: fixtureContent("email", "ticket-drop", true), actionUrl: "http://localhost:3001/r/test-token" };

test("capture config isolates local sockets, identities and data from external transports", () => {
  const config = loadConfig(env);
  assert.equal(config.emailCapture, true); assert.equal(config.emailDemo, true); assert.equal(config.emailDemoLocalOnly, true);
  assert.match(config.dataFile, /data\/capture-demo\.json$/);
  for (const patch of [{ APP_MODE: "live" }, { API_ORIGIN: "http://192.168.1.20:3001", APP_ORIGIN: "http://192.168.1.20:3001" }, { API_ORIGIN: "http://localhost:3001@external.test" }, { APP_ORIGIN: "http://localhost:8081" }, { PHONE_DELIVERY_MODE: "twilio-demo" }, { PHONE_DEMO_VERIFY_ENABLED: "true" }, { LIVE_SEND_AUTHORIZED: "true" }, { MONGODB_URI: "mongodb://localhost/test" }]) {
    assert.equal(captureConfiguration({ ...env, ...patch }), false);
    assert.throws(() => loadConfig({ ...env, ...patch }));
    assert.throws(() => captureTransportOptions({ ...env, ...patch }));
  }
  assert.throws(() => loadConfig({ ...env, DEMO_DATA_FILE: "data/email-demo.json" }), /separate/);
  assert.throws(() => loadConfig({ ...env, EMAIL_DELIVERY_MODE: "simulated", DEMO_DATA_FILE: "data/capture-demo.json" }), /capture store/);
  const smtp = captureTransportOptions({ ...env, SMTP_HOST: "smtp.external.test", SMTP_PASS: "never-use", SMTP_USER: "never-use", SMTP_PORT: "587", SMTP_SECURE: "true" });
  assert.equal(smtp.host, "127.0.0.1"); assert.equal(smtp.port, 1025); assert.equal(smtp.secure, false); assert.equal(smtp.auth, undefined);
});

test("capture readiness accepts only locally verified mailbox identities and never phones", async () => {
  const now = Date.now(), db = createSeed(now), member = db.members.find(item => item.userId === "jordan")!;
  member.accepted = true;
  Object.assign(member.consent, { adult: true, acceptedAt: now, paused: false, channels: { email: true, sms: true, voice: true } });
  member.consent.contacts.email = { destination: "jordan@demo.test", verified: true, method: "captured", verifiedAt: now };
  const readiness = () => getReadiness(db, "jordan", now, env);
  assert.equal(readiness().find(row => row.channel === "email")?.status, "ready");
  assert.ok(readiness().filter(row => row.channel !== "email").every(row => row.status === "blocked"));
  const external = getReadiness(db, "jordan", now, { ...env, EMAIL_DELIVERY_MODE: "smtp-demo" }).find(row => row.channel === "email")!;
  assert.equal(external.status, "blocked"); assert.ok(external.conditions.some(condition => condition.name === "Destination ownership" && !condition.ok));
  member.consent.contacts.email.method = "verify";
  assert.equal(readiness().find(row => row.channel === "email")?.status, "blocked");
  member.consent.contacts.email.method = "captured"; member.consent.contacts.email.destination = "jordan@gmail.com";
  assert.equal(readiness().find(row => row.channel === "email")?.status, "blocked");
  assert.equal((await dispatch({ ...envelope, channel: "sms" }, { db, now }, env)).status, "failed");
});

test("local SMTP uses the fictional display name and unprefixed subject with honest capture result", async () => {
  const messages: Record<string, unknown>[] = [];
  const adapter = new SmtpAdapter({ ...env, SMTP_FROM: "actual-account@gmail.com" }, async message => { messages.push(message); return { accepted: [envelope.destination], messageId: "<capture@demo.test>" }; });
  const sent = await adapter.send(envelope);
  assert.equal(sent.status, "delivered"); assert.match(sent.reason!, /Captured by local Mailpit/);
  assert.deepEqual(messages[0].from, { name: envelope.content.senderDisplayName, address: "notifications@demo.test" });
  assert.equal(messages[0].subject, envelope.content.subject);
  assert.ok(String(messages[0].text).includes(envelope.actionUrl)); assert.doesNotMatch(String(messages[0].text), /game simulation/i);
  assert.equal((await adapter.send({ ...envelope, destination: "real@gmail.com" })).status, "failed");
  assert.equal(messages.length, 1, "nonlocal recipients never reach the SMTP adapter");
  const unsafe = new SmtpAdapter({ ...env, APP_MODE: "live" }, async () => { throw new Error("must not connect"); });
  assert.equal((await unsafe.send(envelope)).status, "failed");
});
