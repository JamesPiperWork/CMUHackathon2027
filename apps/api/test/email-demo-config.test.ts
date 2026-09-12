import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "@fp/shared";
import { loadConfig } from "../src/config.js";
import { loopbackEmailDemo } from "../src/email-demo-config.js";
import { getReadiness } from "../src/providers.js";

const local = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", EMAIL_DEMO_LOCAL_ONLY: "true", API_ORIGIN: "http://127.0.0.1:3001", APP_ORIGIN: "http://127.0.0.1:3001", PORT: "3001" };

test("a local email rehearsal requires an explicit single loopback origin; full live stays HTTPS", () => {
  assert.equal(loadConfig(local).emailDemoLocalOnly, true);
  for (const patch of [
    { API_ORIGIN: "http://192.168.1.10:3001", APP_ORIGIN: "http://192.168.1.10:3001" },
    { APP_ORIGIN: "http://127.0.0.1:8081" }, { API_ORIGIN: "http://127.0.0.1.evil.test:3001" },
    { API_ORIGIN: "http://user:password@127.0.0.1:3001" }, { API_ORIGIN: "http://127.0.0.1:3001/path" },
    { API_ORIGIN: "http://127.0.0.1:3001/?query=1" }, { PORT: "4000" },
  ]) {
    assert.equal(loopbackEmailDemo({ ...local, ...patch }), false);
    assert.throws(() => loadConfig({ ...local, ...patch }), /loopback/);
  }
  assert.throws(() => loadConfig({ ...local, EMAIL_DEMO_LOCAL_ONLY: "false" }), /HTTPS/);
  assert.equal(loopbackEmailDemo({ ...local, APP_MODE: "live" }), false);
  assert.throws(() => loadConfig({ ...local, APP_MODE: "live", EMAIL_DELIVERY_MODE: "simulated" }), /HTTPS/);
});

test("signup recipients need verified ownership and consent without an env list; optional invitations still apply", () => {
  const now = Date.now(), db = createSeed(now);
  const member = db.members.find(item => item.userId === "jordan")!;
  member.accepted = true;
  Object.assign(member.consent, { adult: true, acceptedAt: now, paused: false, timezone: "UTC", startHour: 0, endHour: 24 });
  member.consent.channels.email = true;
  member.consent.contacts.email = { destination: "new-player@temporary.example", verified: true, method: "verify", verifiedAt: now };
  db.attempts = []; db.matchPools = []; db.allAttempts = [];
  const env = { ...local, EMAIL_DEMO_SEND_ENABLED: "true", SESSION_SECRET: "a".repeat(32), TOKEN_SECRET: "b".repeat(32), SMTP_HOST: "smtp.gmail.com", SMTP_USER: "sender@example.test", SMTP_FROM: "sender@example.test", SMTP_PASS: "test-only-password", SMTP_PORT: "587" };
  const email = (settings = env) => getReadiness(db, "jordan", now, settings).find(item => item.channel === "email")!;
  assert.equal(email().status, "ready", email().reason);
  assert.equal(getReadiness(db, "jordan", now, env).find(item => item.channel === "sms")!.status, "blocked");
  assert.equal(email({ ...env, EMAIL_DEMO_LOCAL_ONLY: "false" }).status, "blocked");
  assert.equal(email({ ...env, ...{ EMAIL_DEMO_RECIPIENTS: "someone-else@example.test" } }).status, "blocked");
  member.consent.contacts.email.verified = false;
  assert.equal(email().status, "blocked");
  member.consent.contacts.email.verified = true; member.consent.channels.email = false;
  assert.equal(email().status, "blocked");
});
