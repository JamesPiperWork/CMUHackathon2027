import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSeed, messagePromptContentValid, type Channel, type GenerateRequest, type Scenario } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { voiceRevision } from "../src/voice-audio.js";
import { generateMessageLure, messagePromptFallback } from "../src/message-lure.js";

async function fixture(t: TestContext) {
  const env = { GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "test-only", ELEVENLABS_VOICE_ID: "stock_test_voice", ELEVENLABS_STOCK_VOICE_CONFIRMED: "true" };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const dir = await mkdtemp(join(tmpdir(), "fp-media-casts-")), file = join(dir, "db.json");
  const repo = await FileRepository.open(file, () => {
    const db = createSeed();
    for (const member of db.members) {
      member.accepted = true;
      Object.assign(member.consent, { adult: true, acceptedAt: Date.now(), channels: { email: true, sms: true, voice: true } });
    }
    return db;
  });
  const service = new GameService(repo, { mode: "demo", ruleSet: "email-casts-v2", port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const call = (url: string, payload?: object, token = alex.token) => app.inject({ method: payload ? "POST" : "GET", url, ...(payload ? { payload } : {}), headers: { authorization: `Bearer ${token}` } });
  const input = (channel: Channel, slot: 1 | 2 | "spear" = 1): GenerateRequest => ({ channel, recipientMemberId: "jordan", authorPrompt: "Invite someone who likes pottery to a small ceramics workshop.", ...(slot === "spear" ? { kind: "spear" } : { kind: "regular", slot }) });
  const prepare = async (channel: Channel, slot: 1 | 2 | "spear" = 1) => {
    const result = await call("/api/drafts/prepare", input(channel, slot));
    assert.equal(result.statusCode, 200, result.body); return result.json().scenarioId as string;
  };
  const approveVoice = (id: string) => repo.transact(db => approve(db.scenarios.find(scenario => scenario.id === id)!));
  return { repo, service, app, alex, jordan, call, input, prepare, approveVoice };
}
function approve(scenario: Scenario) {
  const revision = voiceRevision(scenario.content.voiceScript), now = Date.now();
  scenario.voiceAudio = { status: "ready", revision, key: revision, requestedAt: now, requestId: "synthetic-test-evidence", voiceId: process.env.ELEVENLABS_VOICE_ID!, model: "eleven_multilingual_v2", durationSeconds: 20, generatedAt: now, previewedAt: now, approvedAt: now };
}

test("regular slots and seasonal Spear are shared across media; channel changes reuse the unsent slot", async t => {
  const f = await fixture(t);
  const email = await f.prepare("email");
  const texts = await Promise.all(Array.from({ length: 5 }, () => f.prepare("sms")));
  assert.ok(texts.every(id => id === email));
  const voice = await f.prepare("voice", 2), spear = await f.prepare("sms", "spear");
  let db = await f.repo.read();
  assert.equal(db.scenarios.length, 3);
  assert.equal(db.scenarios.find(scenario => scenario.id === email)!.channel, "sms");
  assert.equal((await f.call("/api/drafts/prepare", { ...f.input("email"), slot: 3 })).statusCode, 400);
  assert.equal((await f.call(`/api/drafts/${voice}/send`, {})).statusCode, 409, "A spoken script needs reviewed audio before sending");
  assert.equal((await f.call(`/api/drafts/${spear}/send`, {}, f.jordan.token)).statusCode, 404);
  await f.approveVoice(voice);
  for (const id of [email, voice, spear]) {
    const sent = await f.call(`/api/drafts/${id}/send`, {});
    assert.equal(sent.statusCode, 200, sent.body); assert.equal(sent.json().status, "simulated");
  }
  db = await f.repo.read();
  assert.equal(db.attempts.length, 3); assert.equal(db.spearUses!.length, 1);
  assert.deepEqual(db.attempts.map(attempt => attempt.channel), ["sms", "voice", "sms"]);
  assert.ok(db.attempts.every(attempt => attempt.provider === "simulator"));
  assert.equal((await f.call("/api/drafts/prepare", f.input("email"))).statusCode, 409, "A sent slot cannot become a fresh email cast");
  assert.equal((await f.call("/api/drafts/prepare", f.input("voice", "spear"))).statusCode, 409);
});

test("switching media or using prepared drafts cannot reset the generation budget, and edits invalidate voice approval", async t => {
  const f = await fixture(t);
  let id = "";
  for (const channel of ["email", "voice", "sms"] as const) {
    const generated = await f.call("/api/drafts/generate", f.input(channel));
    assert.equal(generated.statusCode, 202, generated.body);
    if (id) assert.equal(generated.json().scenarioId, id); else id = generated.json().scenarioId;
    assert.equal((await f.call("/api/drafts/prepare", f.input("email"))).statusCode, 409, "An in-flight generation cannot be bypassed with a channel change");
    await f.service.tick();
    if (channel === "voice") {
      await f.approveVoice(id);
      const edit = await f.app.inject({ method: "PATCH", url: `/api/drafts/${id}`, headers: { authorization: `Bearer ${f.alex.token}` }, payload: { voiceScript: "Hi there. A small community ceramics workshop has opened a few places for people who enjoy pottery. We will trade ideas and try a simple project together. Use the game response after this message to join us." } });
      assert.equal(edit.statusCode, 200, edit.body);
      assert.equal((await f.repo.read()).scenarios[0].voiceAudio, undefined);
      await f.approveVoice(id);
    }
  }
  assert.equal((await f.repo.read()).scenarios[0].voiceAudio, undefined, "Changing from voice to text removes the cached audio reference");
  assert.equal(await f.prepare("email"), id);
  assert.equal((await f.repo.read()).scenarios[0].generationAttempts, 3);
  assert.equal((await f.call("/api/drafts/generate", f.input("voice"))).statusCode, 429);
  const state = (await f.call("/api/state")).json();
  assert.equal(state.drafts[0].authorPrompt, f.input("email").authorPrompt);
  assert.equal(JSON.stringify((await f.call("/api/state", undefined, f.jordan.token)).json()).includes(f.input("email").authorPrompt!), false);
});

test("medium-specific refinements are validated and apply to the existing draft", async t => {
  const f = await fixture(t);
  const id = await f.prepare("sms");
  const previousDraft = { smsText: "A community pottery session has two places left. Join us for a friendly afternoon with clay; use the game response below." };
  const revision = await f.call("/api/drafts/generate", { ...f.input("sms"), refinement: "Keep the friendly tone and make it shorter.", previousDraft });
  assert.equal(revision.statusCode, 202, revision.body);
  await f.service.tick();
  assert.equal((await f.repo.read()).scenarios.find(scenario => scenario.id === id)!.content.smsText, previousDraft.smsText, "Offline refinement preserves the supplied edited draft");
  assert.equal((await f.call("/api/drafts/generate", { ...f.input("voice"), refinement: "Make it spoken.", previousDraft: { voiceScript: messagePromptFallback(f.input("voice").authorPrompt!, "voice").voiceScript } })).statusCode, 400);
  assert.equal((await f.call("/api/drafts/generate", { ...f.input("sms"), refinement: "Change it.", previousDraft: { subject: "Wrong medium", bodyText: "This is an email rather than a text message." } })).statusCode, 400);
  const unsafe = await f.app.inject({ method: "PATCH", url: `/api/drafts/${id}`, headers: { authorization: `Bearer ${f.alex.token}` }, payload: { smsText: "Send your password to someone@example.com to join the workshop." } });
  assert.equal(unsafe.statusCode, 400);
});

test("phone drafting needs recipient opt-in but no connected transport; SMTP-only delivery blocks real phone sends", async t => {
  const f = await fixture(t);
  await f.repo.transact(db => { db.members.find(member => member.userId === "jordan")!.consent.channels.sms = false; });
  const blocked = await f.call("/api/drafts/prepare", f.input("sms"));
  assert.equal(blocked.statusCode, 409); assert.match(blocked.json().error, /enabled this channel/);
  await f.repo.transact(db => { db.members.find(member => member.userId === "jordan")!.consent.channels.sms = true; });
  const id = await f.prepare("sms", "spear");
  f.service.config.emailDemo = true; f.service.config.emailDemoImmediate = true;
  const sent = await f.call(`/api/drafts/${id}/send`, {});
  assert.equal(sent.statusCode, 409, sent.body);
  const db = await f.repo.read();
  assert.equal(db.attempts.length, 0); assert.equal(db.spearUses!.length, 0);
  assert.equal(db.scenarios[0].locked, false);
});

test("weekly voice avoidance needs an explicit flag; text delivery and clicks keep the existing scoring", async t => {
  const f = await fixture(t);
  const text = await f.prepare("sms"), voice = await f.prepare("voice", 2), flaggedVoice = await f.prepare("voice", "spear");
  await f.approveVoice(voice); await f.approveVoice(flaggedVoice);
  for (const id of [text, voice, flaggedVoice]) assert.equal((await f.call(`/api/drafts/${id}/send`, {})).statusCode, 200);
  await f.call(`/api/scenarios/${flaggedVoice}/decision`, { choice: "flag" }, f.jordan.token);
  await f.repo.transact(db => { db.scenarios.find(scenario => scenario.id === voice)!.deliveryStatus = "unanswered"; });
  await f.service.advance(10081);
  const db = await f.repo.read();
  assert.equal(db.match.scores.jordan, 2, "One unclicked text and one explicit voice flag each earn one point");
  assert.ok(!db.scoreEvents.some(event => event.sourceId === voice));
  assert.equal(db.scoreEvents.filter(event => event.sourceId === flaggedVoice).length, 1);
  await f.service.finalize();
  assert.deepEqual((await f.repo.read()).scoreEvents, db.scoreEvents);
});

test("voice trust scores once and a completed call without a player response awards nothing", async t => {
  const f = await fixture(t);
  const trusted = await f.prepare("voice"), completed = await f.prepare("voice", 2);
  for (const id of [trusted, completed]) { await f.approveVoice(id); assert.equal((await f.call(`/api/drafts/${id}/send`, {})).statusCode, 200); }
  const response = await f.call(`/api/scenarios/${trusted}/decision`, { choice: "trust" }, f.jordan.token);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual((await f.repo.read()).match.scores, { alex: 3, jordan: -1 });
  await f.call(`/api/scenarios/${trusted}/decision`, { choice: "trust" }, f.jordan.token);
  await f.repo.transact(db => { db.scenarios.find(scenario => scenario.id === completed)!.deliveryStatus = "delivered"; });
  await f.service.advance(10081);
  const db = await f.repo.read();
  assert.deepEqual(db.match.scores, { alex: 3, jordan: -1 });
  assert.equal(db.scoreEvents.some(event => event.sourceId === completed), false);
});

test("Gemini returns only the selected text/voice payload and cannot supply destinations, scoring or sender identity", async () => {
  const prompt = "Invite someone who grows orchids to a small flower-growing workshop.";
  for (const channel of ["sms", "voice"] as const) {
    const fixture = messagePromptFallback(prompt, channel);
    const text = channel === "sms" ? "Orchid growers are meeting for a friendly workshop this afternoon. Use the game response below if you'd like to join." : "Hi there. A few orchid growers are getting together for a friendly workshop this afternoon. We will compare growing tips and try a simple project. If you would like to join, use the game response after this message.";
    let captured = "";
    const result = await generateMessageLure({ policy: "message-prompt-v1", channel, authorPrompt: prompt, interest: "Board games", templateId: "sender-prompt", fixture }, { env: { GEMINI_API_KEY: "test-only" }, fetcher: async (_url, init) => {
      captured = String(init?.body);
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ text }) }] } }] }));
    } });
    assert.equal(result.source, "gemini");
    assert.equal(result.content[channel === "sms" ? "smsText" : "voiceScript"], text);
    assert.equal(result.content.senderDisplayName, "Fantasy Phishing");
    assert.equal(messagePromptContentValid(result.content, channel), true);
    assert.ok(captured.includes(prompt)); assert.equal(captured.includes('"approvedInterest"'), false);
    const unsafe = await generateMessageLure({ policy: "message-prompt-v1", channel, authorPrompt: prompt, interest: "Board games", templateId: "sender-prompt", fixture }, { env: { GEMINI_API_KEY: "test-only" }, fetcher: async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ text: "Visit https://example.com to enter your password for the workshop." }) }] } }] })) });
    assert.equal(unsafe.source, "fallback"); assert.equal(unsafe.content[channel === "sms" ? "smsText" : "voiceScript"], fixture[channel === "sms" ? "smsText" : "voiceScript"]);
  }
});
