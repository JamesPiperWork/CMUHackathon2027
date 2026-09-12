import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import twilio from "twilio";
import {
  createSeed,
  fixtureContent,
  type DeliveryEnvelope,
  type Scenario,
  type Database,
} from "@fp/shared";
import {
  generateContent,
  getReadiness,
  dispatch,
  SimulatorAdapter,
  SmtpAdapter,
  TwilioAdapter,
  nextTransportStatus,
  validTwilioWebhook,
  registerProviderRoutes,
  createAudioToken,
  readAudioToken,
  pcmToWav,
  prepareVoiceAudio,
  voiceTwiml,
} from "../src/providers.js";
import { sealLoginState, openLoginState } from "../src/auth-live.js";
import { synthesizeVoiceDraft, voiceRevision } from "../src/voice-audio.js";

const now = Date.UTC(2026, 8, 12, 16),
  fixture = fixtureContent("email", "ticket-drop", true);
const input = {
  channel: "email" as const,
  interest: "Board games" as const,
  templateId: "ticket-drop",
  fixture,
};
const envelope: DeliveryEnvelope = {
  attemptId: "attempt-a",
  scenarioId: "scenario-a",
  recipientId: "jordan",
  channel: "email",
  destination: "jordan@example.invalid",
  content: fixture,
  actionUrl: "https://api.example.invalid/r/opaque",
};
const liveEnv = {
  APP_MODE: "live",
  LIVE_SEND_AUTHORIZED: "true",
  API_ORIGIN: "https://api.example.invalid",
  APP_ORIGIN: "https://app.example.invalid",
  MONGODB_URI: "mongodb://localhost:27017/fantasy?replicaSet=rs0",
  AUTH0_DOMAIN: "tenant.auth0.com",
  AUTH0_AUDIENCE: "https://api.example.invalid",
  AUTH0_CLIENT_ID: "test-client",
  AUTH0_CLIENT_SECRET: "test-only",
  SESSION_SECRET: "a".repeat(32),
  TOKEN_SECRET: "b".repeat(32),
  TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "test-signature-only",
  TWILIO_SMS_FROM: "+12025550100",
  TWILIO_VOICE_FROM: "+12025550100",
  TWILIO_CALLBACK_BASE: "https://api.example.invalid",
  SMTP_HOST: "smtp.example.invalid",
  SMTP_FROM: "league@example.invalid",
  SMTP_USER: "test",
  SMTP_PASS: "test",
  ELEVENLABS_API_KEY: "test-only",
  ELEVENLABS_VOICE_ID: "stock-test",
  ELEVENLABS_PERMISSION_REFERENCE: "Test evidence only",
  ELEVENLABS_STOCK_VOICE_CONFIRMED: "true",
  ...Object.fromEntries(
    ["EMAIL", "SMS", "VOICE"].flatMap((c) => [
      [`ENABLE_LIVE_${c}`, "true"],
      [`${c}_PERMISSION_REFERENCE`, "Test evidence only"],
      [`${c}_REGISTRATION_REFERENCE`, "Test evidence only"],
      [`${c}_FORMAT_SUPPORTED`, "true"],
    ]),
  ),
};
function liveDb() {
  const db = createSeed(now),
    m = db.members.find((m) => m.userId === "jordan")!;
  m.accepted = true;
  m.auth0Sub = "auth0|fictional";
  m.consent = {
    ...m.consent,
    adult: true,
    acceptedAt: now,
    channels: { email: true, sms: true, voice: true },
    contacts: {
      email: {
        destination: envelope.destination,
        verified: true,
        method: "auth0",
        verifiedAt: now,
      },
      sms: {
        destination: "+12025550101",
        verified: true,
        method: "operator",
        verifiedAt: now,
        evidence: "Independent ownership check recorded",
      },
      voice: {
        destination: "+12025550101",
        verified: true,
        method: "operator",
        verifiedAt: now,
        evidence: "Independent ownership check recorded",
      },
    },
  };
  return db;
}
test("fixture mode needs no network and Gemini refusals/malformed/errors use labeled approved fallback", async () => {
  let called = 0;
  const fail = (async () => {
    called++;
    throw new Error("offline");
  }) as typeof fetch;
  const noKey = await generateContent(input, { env: {}, fetcher: fail });
  assert.equal(noKey.source, "fixture");
  assert.equal(called, 0);
  for (const body of [
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...fixture,
                  smsText: "Visit https://bad.invalid/",
                }),
              },
            ],
          },
        },
      ],
    },
  ]) {
    const result = await generateContent(input, {
      env: { GEMINI_API_KEY: "test" },
      fetcher: (async () => new Response(JSON.stringify(body))) as typeof fetch,
    });
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.content, fixture);
  }
  assert.equal(
    (
      await generateContent(input, {
        env: { GEMINI_API_KEY: "test" },
        fetcher: fail,
      })
    ).source,
    "fallback",
  );
  const timeoutFetch = ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("test watchdog")), 100);
      init!.signal!.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    })) as typeof fetch;
  assert.equal(
    (
      await generateContent(input, {
        env: { GEMINI_API_KEY: "test" },
        fetcher: timeoutFetch,
        timeoutMs: 5,
      })
    ).source,
    "fallback",
  );
});
test("structured Gemini request caps budget, supplies no tools, preserves private teaching fields", async () => {
  let body: Record<string, unknown> = {};
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ...fixture,
                    senderDisplayName: "Wrong merchant",
                    explanation: "Invented explanation goes here",
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  }) as typeof fetch;
  const result = await generateContent(input, {
    env: { GEMINI_API_KEY: "fake", GEMINI_MODEL: "configured-model" },
    fetcher,
  });
  assert.equal(result.source, "gemini");
  assert.equal(result.model, "configured-model");
  assert.equal(result.content.senderDisplayName, fixture.senderDisplayName);
  assert.equal(result.content.explanation, fixture.explanation);
  assert.equal(
    (body.generationConfig as { maxOutputTokens: number }).maxOutputTokens,
    1500,
  );
  assert.equal(body.tools, undefined);
});
test("readiness makes configuration assertions and rejects missing evidence, demo verification, quotas and windows", () => {
  const db = liveDb();
  assert.ok(
    getReadiness(db, "jordan", now, liveEnv).every((r) => r.status === "ready"),
  );
  assert.ok(
    getReadiness(db, "jordan", now, {}).every((r) => r.status === "simulated"),
  );
  assert.ok(
    getReadiness(db, "jordan", now, { APP_MODE: "live" }).every(
      (r) => r.status === "blocked",
    ),
  );
  const m = db.members.find((m) => m.userId === "jordan")!;
  m.consent.contacts.voice!.method = "demo";
  assert.equal(getReadiness(db, "jordan", now, liveEnv)[2].status, "blocked");
  m.consent.contacts.voice!.method = "operator";
  m.consent.paused = true;
  assert.ok(
    getReadiness(db, "jordan", now, liveEnv).every(
      (r) => r.status === "blocked",
    ),
  );
  m.consent.paused = false;
  assert.ok(
    getReadiness(db, "jordan", Date.UTC(2026, 8, 12, 7), liveEnv).every(
      (r) => r.status === "blocked",
    ),
  );
  db.attempts.push({
    id: "used",
    scenarioId: "s",
    recipientId: "jordan",
    channel: "email",
    provider: "smtp",
    status: "unknown",
    createdAt: now,
    updatedAt: now,
    callbackIds: [],
  });
  assert.equal(getReadiness(db, "jordan", now, liveEnv)[0].status, "blocked");
});
test("all simulator channels share the adapter contract; missing live gates never send", async () => {
  for (const channel of ["email", "sms", "voice"] as const)
    assert.equal(
      (await new SimulatorAdapter().send({ ...envelope, channel })).status,
      "simulated",
    );
  assert.equal(
    (await dispatch(envelope, undefined, { APP_MODE: "live" })).status,
    "failed",
  );
  assert.equal(
    (await dispatch(envelope, { db: liveDb(), now }, { APP_MODE: "live" }))
      .status,
    "failed",
  );
});
test("SMTP reports accepted, rejected and uncertain submission without claiming inbox delivery", async () => {
  let body: Record<string, unknown> = {};
  const smtp = new SmtpAdapter(liveEnv, async (message) => {
    body = message;
    return { accepted: ["recipient"], messageId: "smtp-1" };
  });
  const accepted = await smtp.send(envelope);
  assert.equal(accepted.status, "accepted");
  assert.match(accepted.reason!, /inbox delivery is unconfirmed/);
  assert.match(String(body.text), /https:\/\/api.example.invalid\/r\/opaque/);
  assert.equal(body.html, undefined);
  assert.equal(
    (
      await new SmtpAdapter(liveEnv, async () => ({
        rejected: ["recipient"],
      })).send(envelope)
    ).status,
    "failed",
  );
  assert.equal(
    (
      await new SmtpAdapter(liveEnv, async () => {
        throw new Error("timeout");
      }).send(envelope)
    ).status,
    "unknown",
  );
});
test("Twilio transport is one submission, fixed sender, server link, DTMF only and no recording", async () => {
  let sms: Record<string, unknown> = {},
    call: Record<string, unknown> = {};
  let calls = 0;
  const client = {
    messages: {
      create: async (body: Record<string, unknown>) => {
        sms = body;
        return { sid: "SM-test" };
      },
    },
    calls: {
      create: async (body: Record<string, unknown>) => {
        calls++;
        call = body;
        return { sid: "CA-test" };
      },
    },
  };
  const adapter = new TwilioAdapter(liveEnv, client);
  assert.equal(
    (await adapter.send({ ...envelope, channel: "sms" })).status,
    "accepted",
  );
  assert.equal(sms.from, liveEnv.TWILIO_SMS_FROM);
  assert.match(String(sms.body), /Reply STOP/);
  await adapter.send({
    ...envelope,
    channel: "voice",
    audioUrl: "https://api.example.invalid/media/voice/scope",
  });
  assert.equal(calls, 1);
  assert.equal(call.record, false);
  assert.match(String(call.twiml), /input="dtmf"/);
  assert.match(String(call.twiml), /numDigits="1"/);
  assert.doesNotMatch(String(call.twiml), /Record|Transcribe|speech/);
  assert.equal(
    (
      await new TwilioAdapter(liveEnv, {
        ...client,
        calls: {
          create: async () => {
            throw new Error("timeout");
          },
        },
      }).send({
        ...envelope,
        channel: "voice",
        audioUrl: "https://example.invalid/audio",
      })
    ).status,
    "unknown",
  );
  assert.match(
    voiceTwiml(
      "https://example.invalid/audio",
      "https://example.invalid/response",
      "Synthetic voice game.",
    ),
    /Synthetic voice game/,
  );
});
test("transport evidence remains monotonic and never constitutes a decision", () => {
  assert.equal(nextTransportStatus("accepted", "delivered"), "delivered");
  assert.equal(nextTransportStatus("delivered", "queued"), "delivered");
  assert.equal(nextTransportStatus("failed", "sent"), "failed");
  assert.equal(nextTransportStatus("unknown", "delivered"), "delivered");
  assert.equal(nextTransportStatus("accepted", "no-answer"), "unanswered");
});
test("Twilio signature binds exact callback URL, body and account", () => {
  const url = `${liveEnv.TWILIO_CALLBACK_BASE}/webhooks/twilio/status`,
    params = {
      AccountSid: liveEnv.TWILIO_ACCOUNT_SID,
      MessageSid: "SM-test",
      MessageStatus: "delivered",
      To: "+12025550101",
    };
  const sig = twilio.getExpectedTwilioSignature(
    liveEnv.TWILIO_AUTH_TOKEN,
    url,
    params,
  );
  assert.equal(validTwilioWebhook(sig, url, params, liveEnv), true);
  assert.equal(
    validTwilioWebhook(sig, url, { ...params, To: "+12025550999" }, liveEnv),
    false,
  );
  assert.equal(validTwilioWebhook(sig, `${url}?x=1`, params, liveEnv), false);
  assert.equal(validTwilioWebhook("invalid", url, params, liveEnv), false);
  assert.equal(
    validTwilioWebhook(sig, url, params, { ...liveEnv, APP_MODE: "demo" }),
    false,
  );
});
test("audio scope rejects tampering, expiry and wrong secret; PCM length enforces measured 15–25 seconds", () => {
  const scope = {
      key: "a".repeat(64),
      scenarioId: "scenario",
      attemptId: "attempt",
      recipientId: "recipient",
      expiresAt: now + 600000,
    },
    token = createAudioToken(scope, liveEnv.TOKEN_SECRET);
  assert.deepEqual(readAudioToken(token, liveEnv.TOKEN_SECRET, now), scope);
  assert.equal(readAudioToken(token + "x", liveEnv.TOKEN_SECRET, now), null);
  assert.equal(readAudioToken(token, liveEnv.TOKEN_SECRET, now + 600001), null);
  assert.equal(readAudioToken(token, "c".repeat(32), now), null);
  assert.equal(pcmToWav(Buffer.alloc(20 * 32000)).length, 20 * 32000 + 44);
  assert.throws(() => pcmToWav(Buffer.alloc(14 * 32000)), /15–25/);
  assert.throws(() => pcmToWav(Buffer.alloc(26 * 32000)), /15–25/);
});
test("ElevenLabs uses cached validated audio and never fabricates silent fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fp-audio-"));
  let calls = 0;
  const env = { ...liveEnv, AUDIO_CACHE_DIR: dir };
  const fetcher = (async () => {
    calls++;
    const pcm = Buffer.alloc(20 * 32000);
    for (let i = 0; i < pcm.length; i += 2)
      pcm.writeInt16LE(Math.round(Math.sin(i / 20) * 1000), i);
    return new Response(pcm);
  }) as typeof fetch;
  try {
    const first = await prepareVoiceAudio(
      { ...envelope, channel: "voice" },
      { env, fetcher, now },
    );
    const second = await prepareVoiceAudio(
      { ...envelope, channel: "voice" },
      { env, fetcher, now },
    );
    assert.equal(first, second);
    assert.equal(calls, 1);
    assert.match(first, /\/media\/voice\//);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("voice dispatch rechecks pause after reading reviewed audio before any carrier submission", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fp-pause-")),
    env = { ...liveEnv, AUDIO_CACHE_DIR: dir },
    currentNow = Date.now(),
    db = liveDb(),
    m = db.members.find((m) => m.userId === "jordan")!;
  m.consent.startHour = 0;
  m.consent.endHour = 24;
  db.match.state = "active";
  db.match.deadline = currentNow + 3600000;
  const e = {
    ...envelope,
    channel: "voice" as const,
    destination: m.consent.contacts.voice!.destination,
  };
  db.scenarios.push({
    id: e.scenarioId,
    matchId: db.match.id,
    recipientId: e.recipientId,
    authorId: "alex",
    channel: "voice",
    templateId: "ticket-drop",
    interest: "Board games",
    content: fixture,
    isPhishing: true,
    locked: true,
    source: "fixture",
    model: "fixture",
    promptVersion: "v1",
    generationAttempts: 0,
    generationStatus: "complete",
    tokenHash: "hash",
    tokenExpiresAt: currentNow + 3600000,
    actionUrl: e.actionUrl,
    releasedAt: null,
    deliveryStatus: "queued",
    order: 0,
  });
  try {
    const scenario = db.scenarios.find(s => s.id === e.scenarioId)!;
    const result = await synthesizeVoiceDraft(scenario, { env, fetcher: (async () => new Response(Buffer.alloc(20 * 32000, 1))) as typeof fetch });
    scenario.voiceAudio = { status: "ready", revision: voiceRevision(scenario.content.voiceScript, env), requestId: "test-only", requestedAt: currentNow, voiceId: env.ELEVENLABS_VOICE_ID, model: "eleven_multilingual_v2", key: result.key, durationSeconds: result.durationSeconds, generatedAt: currentNow, previewedAt: currentNow, approvedAt: currentNow };
    let reloaded = false;
    const outcome = await dispatch(
      e,
      {
        db,
        now: currentNow,
        reload: async () => {
          reloaded = true;
          const latest = structuredClone(db);
          latest.members.find((m) => m.userId === "jordan")!.consent.paused =
            true;
          return latest;
        },
      },
      env,
    );
    assert.equal(reloaded, true);
    assert.equal(outcome.status, "failed");
    assert.match(outcome.reason!, /Eligibility changed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("server-browser login state encrypts PKCE and preserves challenge with tamper/expiry checks", () => {
  const value = {
    state: "s".repeat(43),
    verifier: "v".repeat(43),
    nonce: "n".repeat(43),
    challenge: "c".repeat(43),
    expiresAt: now + 600000,
  };
  const cookie = sealLoginState(value, liveEnv.SESSION_SECRET);
  assert.ok(!cookie.includes(value.verifier));
  assert.deepEqual(openLoginState(cookie, liveEnv.SESSION_SECRET, now), value);
  assert.equal(openLoginState(cookie + "x", liveEnv.SESSION_SECRET, now), null);
  assert.equal(
    openLoginState(cookie, liveEnv.SESSION_SECRET, now + 600001),
    null,
  );
});
test("signed webhook routes reject unknown recipients, dedupe statuses, process STOP and keypad 9 after match ends", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, liveEnv);
  const db = liveDb();
  db.match.state = "active";
  const scenario: Scenario = {
    id: "scenario-a",
    matchId: db.match.id,
    recipientId: "jordan",
    authorId: "alex",
    channel: "voice",
    templateId: "ticket-drop",
    interest: "Board games",
    content: fixture,
    isPhishing: true,
    locked: true,
    source: "fixture",
    model: "fixture",
    promptVersion: "v1",
    generationAttempts: 0,
    generationStatus: "complete",
    tokenHash: "hash",
    tokenExpiresAt: now + 600000,
    releasedAt: now,
    deliveryStatus: "accepted",
    order: 0,
  };
  db.scenarios.push(scenario);
  db.attempts.push({
    id: "attempt-a",
    scenarioId: scenario.id,
    recipientId: "jordan",
    channel: "voice",
    provider: "twilio",
    status: "accepted",
    providerId: "CA-test",
    createdAt: now,
    updatedAt: now,
    callbackIds: [],
  });
  let decisions = 0,
    pauses = 0;
  const app = Fastify();
  await app.register(formbody);
  registerProviderRoutes(app, {
    readDb: async () => db,
    transact: async <T>(fn: (db: Database) => T | Promise<T>) => fn(db),
    now: () => now,
    decisionFor: async () => {
      decisions++;
    },
    pauseUser: async () => {
      pauses++;
    },
  });
  const post = (
    path: string,
    fields: Record<string, string>,
    signature = true,
  ) => {
    const p = { AccountSid: liveEnv.TWILIO_ACCOUNT_SID, ...fields },
      url = `${liveEnv.TWILIO_CALLBACK_BASE}${path}`;
    return app.inject({
      method: "POST",
      url: path,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature
          ? twilio.getExpectedTwilioSignature(liveEnv.TWILIO_AUTH_TOKEN, url, p)
          : "bad",
      },
      payload: new URLSearchParams(p).toString(),
    });
  };
  try {
    const status = {
      CallSid: "CA-test",
      To: "+12025550101",
      CallStatus: "completed",
    };
    assert.equal(
      (await post("/webhooks/twilio/status", status, false)).statusCode,
      403,
    );
    assert.equal(
      (await post("/webhooks/twilio/status", status)).statusCode,
      204,
    );
    await post("/webhooks/twilio/status", status);
    await post("/webhooks/twilio/status", { ...status, CallStatus: "ringing" });
    assert.equal(db.attempts[0].status, "delivered");
    assert.equal(db.callbackIds.length, 2);
    assert.equal(decisions, 0);
    assert.equal(
      (
        await post("/webhooks/twilio/voice-decision", {
          CallSid: "CA-test",
          To: "+12025550999",
          Digits: "1",
        })
      ).statusCode,
      403,
    );
    await post("/webhooks/twilio/voice-decision", {
      CallSid: "CA-test",
      To: "+12025550101",
      Digits: "",
    });
    assert.equal(decisions, 0);
    await post("/webhooks/twilio/voice-decision", {
      CallSid: "CA-test",
      To: "+12025550101",
      Digits: "2",
    });
    assert.equal(decisions, 1);
    db.match.state = "completed";
    await post("/webhooks/twilio/voice-decision", {
      CallSid: "CA-test",
      To: "+12025550101",
      Digits: "9",
    });
    await post("/webhooks/twilio/sms", {
      MessageSid: "SM-incoming",
      To: liveEnv.TWILIO_SMS_FROM,
      From: "+12025550101",
      Body: "STOP",
    });
    assert.equal(pauses, 2);
  } finally {
    await app.close();
    for (const k of Object.keys(process.env))
      if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
