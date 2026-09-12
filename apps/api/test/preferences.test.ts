import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containsStrongLanguage, createSeed, type GenerateRequest } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { saveAccount } from "../src/accounts.js";

const strongBody = "Shit, your Mooncrate parcel MC-204 is on hold. Please review the delivery change using the response below. Thanks, Mooncrate.";
const input = (slot: 1 | 2 = 1): GenerateRequest => ({ recipientMemberId: "jordan", channel: "email", interest: "Board games", templateId: "parcel-update", kind: "regular", slot });
async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "fp-preferences-"));
  const file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => createSeed());
  const service = new GameService(repo, { mode: "demo", ruleSet: "email-casts-v2", port: 0,
    apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const { app } = await createServer(service, { startJobs: false });
  for (const player of ["alex", "jordan"]) await service.consent(player, { adult: true,
    channels: { email: true, sms: false, voice: false }, timezone: "UTC", startHour: 0, endHour: 24, familyFriendly: false });
  const session = await service.createSession("alex");
  const preferences = async (personal: boolean, league: boolean) => repo.transact((db) => {
    db.members.find((m) => m.userId === "jordan" && m.leagueId === db.match.leagueId)!.consent.familyFriendly = personal;
    db.leagues!.find((l) => l.id === db.match.leagueId)!.settings.familyFriendly = league;
  });
  await preferences(false, false);
  const prepare = async () => (await service.generate("alex", input(), true)).scenarioId;
  const edit = (id: string, bodyText: string) => app.inject({ method: "PATCH", url: `/api/drafts/${id}`,
    headers: { authorization: `Bearer ${session.token}` }, payload: { bodyText } });
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  return { repo, service, app, preferences, prepare, edit };
}

test("recipient or league strong-language preference rejects edits and rechecks existing drafts when locked", async (t) => {
  const f = await setup(t);
  const id = await f.prepare();
  for (const [personal, league] of [[true, false], [false, true]]) {
    await f.preferences(personal, league);
    const rejected = await f.edit(id, strongBody);
    assert.equal(rejected.statusCode, 409);
    assert.match(rejected.body, /family-friendly filter/);
    assert.equal(containsStrongLanguage((await f.repo.read()).scenarios.find((s) => s.id === id)!.content.bodyText), false);
  }
  await f.preferences(false, false);
  // The author's own receiving preference does not control their opponent's inbox.
  await f.repo.transact((db) => { db.members.find((m) => m.userId === "alex")!.consent.familyFriendly = true; });
  assert.equal((await f.edit(id, strongBody)).statusCode, 200);
  await f.preferences(true, false);
  await assert.rejects(f.service.lock("alex", id), /family-friendly filter/);
  assert.equal((await f.repo.read()).scenarios.find((s) => s.id === id)!.locked, false);
  await f.preferences(false, false);
  assert.equal((await f.edit(id, "Your MC-204 order is on hold. You are an idiot; use the response below.")).statusCode, 400, "turning off the optional filter must retain baseline friendly-content review");
  await f.service.lock("alex", id);
  assert.equal((await f.repo.read()).scenarios.find((s) => s.id === id)!.locked, true);
});

test("generated strong language falls back when filtered and remains eligible when both preferences are off", async (t) => {
  const f = await setup(t);
  const oldFetch = globalThis.fetch, oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
    subject: "Your Saturday parcel", body: strongBody.replace("the response below", "{{TRACKING_LINK}}"),
  }) }] } }] }))) as typeof fetch;
  try {
    await f.preferences(true, false);
    const protectedDraft = await f.service.generate("alex", input(1));
    await f.service.tick();
    let draft = (await f.repo.read()).scenarios.find((s) => s.id === protectedDraft.scenarioId)!;
    assert.equal(draft.source, "fallback");
    assert.equal(containsStrongLanguage(draft.content.bodyText), false);
    await f.preferences(false, false);
    const allowedDraft = await f.service.generate("alex", input(2));
    await f.service.tick();
    draft = (await f.repo.read()).scenarios.find((s) => s.id === allowedDraft.scenarioId)!;
    assert.equal(draft.source, "gemini");
    assert.equal(containsStrongLanguage(draft.content.bodyText), true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("a stronger recipient preference is rechecked before dispatch even for previously locked bait", async (t) => {
  const f = await setup(t);
  const id = await f.prepare();
  assert.equal((await f.edit(id, strongBody)).statusCode, 200);
  await f.service.lock("alex", id);
  await f.service.activate("alex");
  await f.preferences(true, false);
  await f.service.release(undefined, true);
  const db = await f.repo.read();
  assert.equal(db.jobs.find((j) => j.scenarioId === id && j.type === "delivery")!.status, "cancelled");
  assert.equal(db.scenarios.find((s) => s.id === id)!.deliveryStatus, "cancelled");
  assert.equal(db.attempts.length, 0);
});

test("saving the personal language filter immediately cancels queued matching mail", async (t) => {
  const f = await setup(t);
  const id = await f.prepare();
  assert.equal((await f.edit(id, strongBody)).statusCode, 200);
  await f.service.lock("alex", id);
  await f.service.activate("alex");
  await saveAccount(f.service, "jordan", { displayName: "Jordan", email: "jordan@demo.invalid", adult: true,
    channels: { email: true, sms: false, voice: false }, timezone: "UTC", startHour: 0, endHour: 24,
    familyFriendly: true, excludedThemes: [] });
  const db = await f.repo.read();
  assert.equal(db.jobs.find((j) => j.scenarioId === id && j.type === "delivery")!.status, "cancelled");
  assert.equal(db.scenarios.find((s) => s.id === id)!.deliveryStatus, "cancelled");
  assert.equal(db.attempts.length, 0);
});

test("strong-language matching avoids ordinary-word substrings and permits mild wording", () => {
  assert.equal(containsStrongLanguage("Scunthorpe's new game title is Shellfish."), false);
  assert.equal(containsStrongLanguage("Damn, that was a close game."), false);
  assert.equal(containsStrongLanguage("That was fucking close."), true);
  assert.equal(containsStrongLanguage("What a SHITTY mix-up."), true);
});
