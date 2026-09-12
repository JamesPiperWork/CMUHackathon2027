import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { readVoiceFile, synthesizeVoiceDraft, voiceAudioApproved, voiceRevision } from "../src/voice-audio.js";
import { dispatch, getReadiness, TwilioAdapter } from "../src/providers.js";
import { loadConfig, type Config } from "../src/config.js";

function pcm(seconds = 20) {
  const bytes = Buffer.alloc(seconds * 32000);
  for (let i = 0; i < bytes.length; i += 2) bytes.writeInt16LE(Math.round(Math.sin(i / 20) * 1000), i);
  return bytes;
}
async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "fp-voice-authoring-")), file = join(directory, "state.json");
  const env = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "simulated", PHONE_DELIVERY_MODE: "simulated", ELEVENLABS_API_KEY: "test-only", ELEVENLABS_VOICE_ID: "stock-test", ELEVENLABS_STOCK_VOICE_CONFIRMED: "true", AUDIO_CACHE_DIR: join(directory, "audio") };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const priorFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(pcm()); }) as typeof fetch;
  let repo = await FileRepository.open(file, () => createSeed());
  const config: Config = { mode: "demo", ruleSet: "email-casts-v2", port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  let service = new GameService(repo, config), { app } = await createServer(service, { startJobs: false });
  await app.ready();
  for (const id of ["alex", "jordan"]) await service.consent(id, { adult: true, channels: { email: true, sms: true, voice: true }, timezone: "UTC", startHour: 0, endHour: 24, familyFriendly: true });
  await repo.transact(db => { for (const league of db.leagues ?? []) league.settings.channels = { email: true, sms: true, voice: true }; });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const headers = (token = alex.token) => ({ authorization: `Bearer ${token}` });
  const prepare = () => service.generate("alex", { recipientMemberId: "jordan", channel: "voice", authorPrompt: "They enjoy chess. Invite them to a fictional puzzle session.", kind: "regular", slot: 1 }, true);
  const post = (url: string, body: object = {}, token = alex.token) => app.inject({ method: "POST", url, payload: body, headers: headers(token) });
  const get = (url: string, token = alex.token) => app.inject({ method: "GET", url, headers: headers(token) });
  const waitReady = async (id: string) => {
    for (let i = 0; i < 100; i++) { const result = (await get(`/api/drafts/${id}/audio`)).json(); if (result.status !== "generating") return result; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail("Audio synthesis did not finish");
  };
  const restart = async () => { await app.close(); await repo.close(); repo = await FileRepository.open(file, () => { throw new Error("Expected persisted file"); }); service = new GameService(repo, config); ({ app } = await createServer(service, { startJobs: false })); await app.ready(); };
  t.after(async () => { await app.close(); await repo.close(); globalThis.fetch = priorFetch; for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(directory, { recursive: true, force: true }); });
  return { env, directory, config, alex, jordan, headers, prepare, post, get, waitReady, restart, get calls() { return calls; }, get repo() { return repo; }, get service() { return service; }, get app() { return app; } };
}

test("voice audio is async, author-private, approved only after preview, and never regenerated at Send", async t => {
  const f = await setup(t), { scenarioId } = await f.prepare(), base = `/api/drafts/${scenarioId}/audio`;
  assert.equal((await f.post(`/api/drafts/${scenarioId}/send`)).statusCode, 409);
  const responses = await Promise.all(Array.from({ length: 6 }, () => f.post(base)));
  assert.ok(responses.every(response => [200, 202].includes(response.statusCode)));
  const state = await f.waitReady(scenarioId); assert.equal(state.status, "ready"); assert.equal(state.durationSeconds, 20); assert.equal(f.calls, 1);
  assert.equal(state.key, undefined); assert.equal(state.voiceId, undefined);
  assert.equal((await f.post(`${base}/approve`, { revision: state.revision })).statusCode, 409);
  assert.equal((await f.get(state.previewUrl, f.jordan.token)).statusCode, 404);
  assert.equal((await f.app.inject(state.previewUrl)).statusCode, 401);
  const preview = await f.get(state.previewUrl); assert.equal(preview.statusCode, 200); assert.match(preview.headers["content-type"]!, /audio\/wav/); assert.equal(preview.rawPayload.length, 640044);
  assert.equal((await f.post(`${base}/approve`, { revision: state.revision })).statusCode, 200);
  assert.ok(voiceAudioApproved((await f.repo.read()).scenarios.find(s => s.id === scenarioId)!));
  const send = await f.post(`/api/drafts/${scenarioId}/send`); assert.equal(send.statusCode, 200, send.body); assert.equal(send.json().status, "simulated");
  assert.equal(f.calls, 1, "Sending cannot create new ElevenLabs audio");
  await f.restart(); assert.equal((await f.get(base)).json().approvedAt > 0, true); assert.equal(f.calls, 1);
});

test("editing a script or switching a cast medium invalidates its prior audio and approval", async t => {
  const f = await setup(t), { scenarioId } = await f.prepare(), base = `/api/drafts/${scenarioId}/audio`;
  await f.post(base); const original = await f.waitReady(scenarioId);
  await f.get(original.previewUrl); await f.post(`${base}/approve`, { revision: original.revision });
  await f.service.editDraft("alex", scenarioId, { voiceScript: "Hi there. Our fictional chess circle is hosting a relaxed puzzle afternoon for new players. There will be beginner boards and time to compare ideas. Confirm your interest using the game response after this message." });
  assert.equal((await f.get(base)).json().status, "not-created");
  assert.equal((await f.get(original.previewUrl)).statusCode, 409);
  await f.post(base); const changed = await f.waitReady(scenarioId); assert.notEqual(changed.revision, original.revision); assert.equal(f.calls, 2);
  await f.service.generate("alex", { recipientMemberId: "jordan", channel: "sms", authorPrompt: "They enjoy chess.", kind: "regular", slot: 1 }, true);
  assert.equal((await f.get(base)).statusCode, 404);
  assert.equal((await f.repo.read()).scenarios.find(s => s.id === scenarioId)!.voiceAudio, undefined);
});

test("unfinished synthesis cannot overwrite an edited draft; interruption and failures remain explicit", async t => {
  const f = await setup(t), { scenarioId } = await f.prepare(), base = `/api/drafts/${scenarioId}/audio`;
  let finish!: (response: Response) => void;
  globalThis.fetch = (async () => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  await f.post(base);
  await f.service.editDraft("alex", scenarioId, { voiceScript: "Hi there. A fictional chess group is gathering to try some friendly puzzles and share ideas. If you would enjoy an afternoon around the board, please confirm your interest using the game response after this message." });
  finish(new Response(pcm()));
  await f.restart();
  assert.equal((await f.get(base)).json().status, "not-created");
  await f.repo.transact(db => { const draft = db.scenarios.find(s => s.id === scenarioId)!; draft.voiceAudio = { status: "generating", revision: voiceRevision(draft.content.voiceScript), requestId: "interrupted", requestedAt: Date.now(), voiceId: "stock-test", model: "eleven_multilingual_v2" }; });
  await f.restart(); assert.match((await f.get(base)).json().error, /interrupted/);
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await f.post(base); const failed = await f.waitReady(scenarioId); assert.equal(failed.status, "failed"); assert.match(failed.error, /key or stock voice/); assert.equal(failed.previewUrl, undefined);
});

test("missing setup is actionable and no missing, short, silent or malformed audio is replaced with a fake preview", async t => {
  const f = await setup(t), { scenarioId } = await f.prepare(), base = `/api/drafts/${scenarioId}/audio`;
  delete process.env.ELEVENLABS_API_KEY;
  const config = (await f.get("/api/voice/config")).json(); assert.equal(config.ready, false); assert.ok(config.checks.some((check: { code: string; ok: boolean }) => check.code === "api_key" && !check.ok));
  assert.equal((await f.post(base)).statusCode, 409); assert.equal(f.calls, 0); process.env.ELEVENLABS_API_KEY = "test-only";
  const draft = (await f.repo.read()).scenarios.find(s => s.id === scenarioId)!;
  await assert.rejects(() => synthesizeVoiceDraft(draft, { env: f.env, fetcher: (async () => new Response(JSON.stringify({ detail: { status: "payment_required", message: "Free users cannot use library voices via the API." } }), { status: 402 })) as typeof fetch }), /included built-in voice.*upgrade/);
  for (const invalid of [pcm(14), Buffer.alloc(20 * 32000), Buffer.from("not audio")]) await assert.rejects(() => synthesizeVoiceDraft(draft, { env: f.env, fetcher: (async () => new Response(invalid)) as typeof fetch }));
  await f.post(base); const ready = await f.waitReady(scenarioId);
  await rm(join(f.env.AUDIO_CACHE_DIR, `${ready.revision}.wav`));
  assert.equal((await f.get(ready.previewUrl)).statusCode, 409);
  assert.equal((await f.get(base)).json().status, "failed");
  await f.post(base); assert.equal((await f.waitReady(scenarioId)).status, "ready");
  assert.equal(f.calls, 2);
  assert.ok((await readFile(join(f.env.AUDIO_CACHE_DIR, `${ready.revision}.wav`))).length > 44);
});

test("phone-demo readiness requires recipient verification, individual switches and public callbacks without weakening email", async t => {
  const f = await setup(t), db = await f.repo.read(), member = db.members.find(m => m.userId === "jordan")!;
  member.consent.contacts.email = { destination: "jordan@example.invalid", verified: true, method: "verify", verifiedAt: Date.now() };
  db.accounts = db.members.map(member => ({ userId: member.userId, consent: structuredClone(member.consent) }));
  const env = { ...f.env, EMAIL_DELIVERY_MODE: "smtp-demo", PHONE_DELIVERY_MODE: "twilio-demo", EMAIL_DEMO_SEND_ENABLED: "true", PHONE_DEMO_SEND_ENABLED: "true", ENABLE_PHONE_DEMO_SMS: "true", ENABLE_PHONE_DEMO_VOICE: "true", EMAIL_DEMO_IMMEDIATE: "true", SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32), TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-only", TWILIO_SMS_FROM: "+12025550100", TWILIO_VOICE_FROM: "+12025550100", TWILIO_CALLBACK_BASE: "https://game.example.invalid", TWILIO_TRIAL_MODE: "false", SMS_REGISTRATION_REFERENCE: "test approved carrier registration", API_ORIGIN: "https://game.example.invalid", APP_ORIGIN: "https://game.example.invalid", SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "587", SMTP_USER: "test", SMTP_PASS: "test", SMTP_FROM: "game@example.invalid" };
  const row = (overrides = {}) => getReadiness(db, "jordan", Date.now(), { ...env, ...overrides });
  assert.equal(row().find(r => r.channel === "email")!.status, "ready");
  assert.equal(row().find(r => r.channel === "voice")!.status, "blocked");
  const contact = { destination: "+12025550101", verified: true, method: "verify" as const, verifiedAt: Date.now(), evidence: `twilio-verify:VE${"1".repeat(32)}` };
  member.consent.contacts.sms = contact; member.consent.contacts.voice = contact;
  assert.equal(row().find(r => r.channel === "voice")!.status, "ready");
  for (const overrides of [{ PHONE_DEMO_SEND_ENABLED: "false" }, { ENABLE_PHONE_DEMO_VOICE: "false" }, { API_ORIGIN: "http://localhost:3001" }, { TWILIO_CALLBACK_BASE: "http://localhost:3001" }, { TWILIO_TRIAL_MODE: "true", TWILIO_TRIAL_RECIPIENTS: "" }]) assert.equal(row(overrides).find(r => r.channel === "voice")!.status, "blocked");
  assert.equal(row({ SMS_REGISTRATION_REFERENCE: "" }).find(r => r.channel === "sms")!.status, "blocked");
  assert.throws(() => loadConfig({ APP_MODE: "demo", PHONE_DELIVERY_MODE: "twilio-demo" }), /verified email accounts/);
});

test("real voice dispatch reads the exact reviewed cache and cannot call ElevenLabs during Send", async t => {
  const f = await setup(t), { scenarioId } = await f.prepare(), base = `/api/drafts/${scenarioId}/audio`;
  await f.post(base); const audio = await f.waitReady(scenarioId); await f.get(audio.previewUrl); await f.post(`${base}/approve`, { revision: audio.revision });
  const db = await f.repo.read(), scenario = db.scenarios.find(s => s.id === scenarioId)!, recipient = db.members.find(m => m.userId === "jordan")!;
  db.match.state = "active"; db.match.deadline = Date.now() + 3600000; scenario.locked = true; scenario.tokenExpiresAt = db.match.deadline; scenario.actionUrl = "https://game.example.invalid/r/example";
  recipient.consent.contacts.email = { destination: "jordan@example.invalid", verified: true, method: "verify", verifiedAt: Date.now() };
  recipient.consent.contacts.voice = { destination: "+12025550101", verified: true, method: "verify", verifiedAt: Date.now(), evidence: "twilio-verify:VE-test" };
  db.accounts = db.members.map(member => ({ userId: member.userId, consent: structuredClone(member.consent) }));
  const env = { ...f.env, EMAIL_DELIVERY_MODE: "smtp-demo", PHONE_DELIVERY_MODE: "twilio-demo", PHONE_DEMO_SEND_ENABLED: "true", ENABLE_PHONE_DEMO_VOICE: "true", SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32), TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-only", TWILIO_VOICE_FROM: "+12025550100", TWILIO_CALLBACK_BASE: "https://game.example.invalid", TWILIO_TRIAL_MODE: "false", API_ORIGIN: "https://game.example.invalid", APP_ORIGIN: "https://game.example.invalid" };
  let carrierCalls = 0; t.mock.method(TwilioAdapter.prototype, "send", async (envelope: { audioUrl: string }) => { carrierCalls++; assert.match(envelope.audioUrl, /\/media\/voice\//); return { status: "accepted" }; });
  globalThis.fetch = (async () => assert.fail("Send made an unexpected provider/audio fetch")) as typeof fetch;
  const envelope = { attemptId: "test", scenarioId, recipientId: "jordan", channel: "voice" as const, destination: recipient.consent.contacts.voice.destination, content: scenario.content, actionUrl: scenario.actionUrl };
  const result = await dispatch(envelope, { db, now: Date.now(), reload: async () => structuredClone(db) }, env);
  assert.equal(result.status, "accepted"); assert.equal(carrierCalls, 1);
  await readVoiceFile(audio.revision, env);
  delete scenario.voiceAudio!.approvedAt;
  assert.equal((await dispatch(envelope, { db, now: Date.now(), reload: async () => db }, env)).status, "failed"); assert.equal(carrierCalls, 1);
});
