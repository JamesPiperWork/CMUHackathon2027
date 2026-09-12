import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed, type GenerateRequest } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import type { Config } from "../src/config.js";

const input = (slot: 1 | 2): GenerateRequest => ({
  recipientMemberId: "jordan", channel: "email", interest: "Live music",
  templateId: "ticket-drop", kind: "regular", slot,
});

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "fp-generation-lifecycle-"));
  const file = join(directory, "state.json");
  const repo = await FileRepository.open(file, () => createSeed());
  const config: Config = {
    ruleSet: "email-casts-v2", mode: "demo", port: 0,
    apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081",
    dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500,
  };
  const service = new GameService(repo, config);
  await service.initializeRules();
  for (const user of ["alex", "jordan"]) await service.consent(user, {
    adult: true, channels: { email: true, sms: false, voice: false }, timezone: "America/New_York",
    startHour: 10, endHour: 20, familyFriendly: true,
  });
  await service.saveScouting("alex", "jordan", { interests: ["Live music"], markdown: "Small acoustic shows." });
  t.after(async () => { await repo.close(); await rm(directory, { recursive: true, force: true }); });
  const expire = () => repo.transact(db => { db.clockOffset = db.match.deadline - Date.now() + 1000; });
  const prepareActive = async () => {
    const { scenarioId } = await service.generate("alex", input(1), true);
    await service.lock("alex", scenarioId);
    await service.activate("alex");
    return scenarioId;
  };
  return { repo, service, config, file, expire, prepareActive };
}

function delayedGemini() {
  const oldFetch = globalThis.fetch, oldKey = process.env.GEMINI_API_KEY;
  let entered!: () => void, respond!: (response: Response) => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const response = new Promise<Response>(resolve => { respond = resolve; });
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = (async () => { entered(); return response; }) as typeof fetch;
  const finish = () => respond(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
    subject: "A late generated message",
    body: "Hi there,\n\nYour JS-118 booking has been selected for a backstage upgrade. Review the update: {{TRACKING_LINK}}\n\nThanks,\nJuniper Sessions",
  }) }] } }] })));
  const restore = () => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  };
  return { started, finish, restore };
}

test("a generation crossing the deadline cannot release a later queued cast", { timeout: 5000 }, async t => {
  const f = await setup(t);
  const first = await f.prepareActive();
  const second = await f.service.generate("alex", input(2));
  await f.repo.transact(db => {
    db.jobs.sort((a, b) => Number(b.type === "generation") - Number(a.type === "generation"));
    for (const job of db.jobs) job.dueAt = Date.now() - 1;
  });
  const original = (await f.repo.read()).scenarios.find(s => s.id === second.scenarioId)!.content;
  const gemini = delayedGemini();
  const running = f.service.tick();
  try {
    await gemini.started;
    await f.expire();
    gemini.finish();
    await running;
    const db = await f.repo.read();
    assert.equal(db.match.state, "completed");
    assert.equal(db.attempts.length, 0);
    assert.equal(db.scenarios.find(s => s.id === first)!.releasedAt, null);
    assert.equal(db.scenarios.find(s => s.id === first)!.deliveryStatus, "cancelled");
    assert.equal(db.scenarios.find(s => s.id === second.scenarioId)!.generationStatus, "failed");
    assert.deepEqual(db.scenarios.find(s => s.id === second.scenarioId)!.content, original);
    assert.ok(db.jobs.every(job => job.status === "cancelled"));
  } finally { gemini.finish(); await running; gemini.restore(); }
});

test("a cancelled generation result cannot rewrite a completed match, including after restart", { timeout: 5000 }, async t => {
  const f = await setup(t);
  await f.prepareActive();
  await f.service.generate("alex", input(2));
  const gemini = delayedGemini();
  const running = f.service.tick();
  try {
    await gemini.started;
    await f.expire();
    await f.service.finalize();
    const completed = await f.repo.read();
    assert.equal(completed.match.state, "completed");
    gemini.finish();
    await running;
    const after = await f.repo.read();
    assert.deepEqual(after.match, completed.match);
    assert.deepEqual(after.scenarios, completed.scenarios);
    assert.deepEqual(after.jobs, completed.jobs);
    await f.repo.close();
    const restarted = await FileRepository.open(f.file, () => { throw new Error("Expected persisted state"); });
    try {
      await new GameService(restarted, f.config).tick();
      const saved = await restarted.read();
      assert.deepEqual(saved.match, completed.match);
      assert.deepEqual(saved.scenarios, completed.scenarios);
      assert.deepEqual(saved.jobs, completed.jobs);
    } finally { await restarted.close(); }
  } finally { gemini.finish(); await running; gemini.restore(); }
});

test("an expired generation attempt cannot overwrite a newer worker's lease", { timeout: 5000 }, async t => {
  const f = await setup(t);
  const { scenarioId } = await f.service.generate("alex", input(1));
  const gemini = delayedGemini();
  const running = f.service.tick();
  try {
    await gemini.started;
    await f.repo.transact(db => {
      const job = db.jobs.find(j => j.scenarioId === scenarioId)!;
      job.attempts++;
      job.leaseExpiresAt = Date.now() + 45000;
      db.scenarios.find(s => s.id === scenarioId)!.content.subject = "Newer worker owns this draft";
    });
    const latest = await f.repo.read();
    gemini.finish();
    await running;
    const after = await f.repo.read();
    assert.deepEqual(after.jobs, latest.jobs);
    assert.deepEqual(after.scenarios, latest.scenarios);
  } finally { gemini.finish(); await running; gemini.restore(); }
});

test("an authenticated flag proves receipt for avoidance without fabricating SMTP delivery", async t => {
  const f = await setup(t);
  const id = await f.prepareActive();
  await f.service.release(undefined, true);
  await f.repo.transact(db => { db.scenarios.find(s => s.id === id)!.deliveryStatus = "accepted"; });
  f.config.mode = "live";
  await f.service.decisionFor("jordan", id, "flag");
  assert.equal((await f.repo.read()).match.scores.jordan, 0);
  await f.expire();
  await f.service.tick();
  await f.service.finalize();
  const db = await f.repo.read();
  assert.equal(db.match.state, "completed");
  assert.equal(db.match.scores.jordan, 1);
  assert.equal(db.scoreEvents.filter(e => e.type === "avoidance" && e.sourceId === id).length, 1);
  assert.equal(db.scenarios.find(s => s.id === id)!.deliveryStatus, "accepted");
});

test("late confirmed delivery settles an incomplete week exactly once", async t => {
  const f = await setup(t);
  const id = await f.prepareActive();
  await f.service.release(undefined, true);
  await f.repo.transact(db => { db.scenarios.find(s => s.id === id)!.deliveryStatus = "accepted"; });
  f.config.mode = "live";
  await f.expire();
  await f.service.tick();
  let db = await f.repo.read();
  assert.equal(db.match.result, "incomplete");
  assert.equal(db.match.scores.jordan, 0);
  await f.repo.transact(state => { state.scenarios.find(s => s.id === id)!.deliveryStatus = "delivered"; });
  await f.service.tick();
  await f.service.tick();
  db = await f.repo.read();
  assert.equal(db.match.state, "completed");
  assert.equal(db.match.scores.jordan, 1);
  assert.equal(db.scoreEvents.filter(e => e.type === "avoidance" && e.sourceId === id).length, 1);
});
