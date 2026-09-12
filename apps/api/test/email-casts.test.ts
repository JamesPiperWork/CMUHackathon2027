import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed, type GenerateRequest } from "@fp/shared";
import { FileRepository, gamePools } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

type Player = "alex" | "jordan";
async function setup(t: TestContext, legacy = false) {
  const dir = await mkdtemp(join(tmpdir(), "fp-email-casts-"));
  const file = join(dir, "state.json");
  const config: Config = {
    ruleSet: legacy ? undefined : "email-casts-v2", mode: "demo", port: 0,
    apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081",
    dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500,
  };
  let repo = await FileRepository.open(file, () => createSeed());
  let service = new GameService(repo, config);
  let { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  const sessions = {
    alex: await service.createSession("alex"), jordan: await service.createSession("jordan"),
    operator: await service.createSession("alex", "operator"),
  };
  for (const player of ["alex", "jordan"] as const) await service.consent(player, {
    adult: true, channels: { email: true, sms: true, voice: true },
    timezone: "America/New_York", startHour: 10, endHour: 20, familyFriendly: true,
  });
  const headers = (user: keyof typeof sessions) => ({ authorization: `Bearer ${sessions[user].token}` });
  const post = async (user: keyof typeof sessions, url: string, payload: object = {}, status = 200) => {
    const response = await app.inject({ method: "POST", url, headers: headers(user), payload });
    assert.equal(response.statusCode, status, `${url}: ${response.body}`);
    return response.json();
  };
  const prepare = async (player: Player, slot: 1 | 2 | "spear" = 1) => {
    const input = castInput(player, slot);
    const result = await post(player, "/api/drafts/prepare", input);
    assert.equal(result.queued, false);
    return result.scenarioId as string;
  };
  const lock = (player: Player, id: string) => post(player, `/api/drafts/${id}/lock`);
  const newLeague = async () => {
    const league = await post("alex", "/api/leagues", { name: "Email anglers" });
    await post("jordan", "/api/leagues/join", { inviteCode: league.inviteCode });
    for (const player of ["alex", "jordan"] as const) {
      const response = await app.inject({ method: "PUT", url: `/api/scouting/${player === "alex" ? "jordan" : "alex"}`, headers: headers(player), payload: { interests: ["Board games"], markdown: "Friendly game nights." } });
      assert.equal(response.statusCode, 200, response.body);
    }
    return league as { id: string; season: number };
  };
  const selectedService = async (player: Player = "alex") => service.forSession((await service.sessionForToken(sessions[player].token))!, true);
  const restart = async () => {
    await app.close(); await repo.close();
    repo = await FileRepository.open(file, () => { throw new Error("Restart must retain persisted state"); });
    service = new GameService(repo, config);
    ({ app } = await createServer(service, { startJobs: false }));
  };
  return { get repo() { return repo; }, get service() { return service; }, get app() { return app; }, config, sessions, headers, post, prepare, lock, newLeague, selectedService, restart };
}

function castInput(player: Player, slot: 1 | 2 | "spear" = 1): GenerateRequest {
  return {
    recipientMemberId: player === "alex" ? "jordan" : "alex", channel: "email",
    interest: "Board games", templateId: "parcel-update",
    ...(slot === "spear" ? { kind: "spear" as const } : { kind: "regular" as const, slot }),
  };
}

test("cast slots are transactionally bounded and authenticated authors cannot assign another player's bait", async (t) => {
  const f = await setup(t);
  const first = await Promise.all(Array.from({ length: 8 }, () => f.prepare("alex", 1)));
  assert.equal(new Set(first).size, 1, "concurrent retries must address one slot");
  await f.prepare("alex", 2);
  await f.prepare("alex", "spear");
  let db = await f.repo.read();
  assert.equal(db.scenarios.length, 3);
  assert.ok(db.scenarios.every((s) => s.source === "fixture" && s.generationStatus === "complete" && s.generationAttempts === 0));
  assert.equal(db.jobs.length, 0, "handwritten starting points must not invoke AI");
  for (const payload of [
    { ...castInput("alex"), slot: 3 },
    { ...castInput("alex"), kind: "spear", slot: 1 },
    { ...castInput("alex"), authorId: "jordan" },
    { ...castInput("alex"), recipientMemberId: "alex" },
    { ...castInput("alex"), channel: "voice" },
  ]) await f.post("alex", "/api/drafts/prepare", payload, 400);
  await f.post("alex", "/api/drafts/prepare", { ...castInput("alex"), recipientMemberId: "sam" }, 403);
  await f.post("jordan", `/api/drafts/${first[0]}/lock`, {}, 404);
  const changed = await f.app.inject({ method: "PATCH", url: `/api/drafts/${first[0]}`, headers: f.headers("jordan"), payload: { subject: "Stolen bait" } });
  assert.equal(changed.statusCode, 404);
  const queued = await Promise.all(Array.from({ length: 6 }, () => f.app.inject({ method: "POST", url: "/api/drafts/generate", headers: f.headers("alex"), payload: castInput("alex") })));
  assert.equal(queued.filter((r) => r.statusCode === 202).length, 1);
  assert.equal(queued.filter((r) => r.statusCode === 409).length, 5);
  db = await f.repo.read();
  assert.equal(db.scenarios.length, 3);
  assert.equal(db.jobs.filter((j) => j.type === "generation").length, 1);
  assert.equal(db.scenarios.find((s) => s.id === first[0])!.generationAttempts, 1);
});

test("sender-only casts remain editable during the week and settle +3/-1 clicks and +1 avoidance exactly once", async (t) => {
  const f = await setup(t);
  await f.post("alex", "/api/match/activate", {}, 409);
  const clicked = await f.prepare("alex", 1);
  const initiallyUnfinished = await f.prepare("jordan", 1);
  await f.lock("alex", clicked);
  await f.post("alex", "/api/match/activate");
  let db = await f.repo.read();
  assert.equal(db.match.state, "active");
  assert.equal(db.match.deadline - db.match.startedAt!, 10080 * 60000);
  assert.equal(db.scenarios.length, 2, "starting must not autofill ordinary messages or missing casts");
  assert.equal(db.jobs.filter((j) => j.type === "delivery").length, 1);
  assert.equal(db.scenarios.find((s) => s.id === initiallyUnfinished)!.locked, false);
  await f.lock("jordan", initiallyUnfinished);
  const flagged = await f.prepare("alex", 2);
  const unanswered = await f.prepare("alex", "spear");
  const unsent = await f.prepare("jordan", 2);
  await f.lock("alex", flagged);
  await f.lock("alex", unanswered);
  await f.service.release(undefined, true);
  db = await f.repo.read();
  assert.equal(db.scenarios.length, 5);
  assert.ok(db.scenarios.every((s) => s.authorId && s.isPhishing && s.channel === "email"));
  assert.equal(db.scenarios.filter((s) => s.deliveryStatus === "simulated").length, 4);
  assert.equal(db.attempts.length, 4);
  assert.equal(db.scenarios.find((s) => s.id === unsent)!.releasedAt, null);
  const decisions = await Promise.all(Array.from({ length: 8 }, () => f.post("jordan", `/api/scenarios/${clicked}/decision`, { choice: "trust" })));
  assert.equal(new Set(decisions.map((d) => d.id)).size, 1);
  const flag = await f.post("jordan", `/api/scenarios/${flagged}/decision`, { choice: "flag" });
  assert.equal(flag.defenderPoints, 0, "flagging does not award points before the deadline");
  db = await f.repo.read();
  assert.deepEqual(db.match.scores, { alex: 3, jordan: -1 });
  assert.equal(db.decisions.length, 2);
  assert.equal(db.scoreEvents.length, 3);
  await assert.rejects(f.service.finalize(), /weekly deadline/);
  assert.equal((await f.repo.read()).match.state, "active");
  await f.service.advance(10081);
  db = await f.repo.read();
  assert.equal(db.match.state, "completed");
  assert.equal(db.match.winnerId, "alex");
  assert.deepEqual(db.match.scores, { alex: 4, jordan: 1 });
  assert.deepEqual(new Set(db.scoreEvents.filter((e) => e.type === "avoidance").map((e) => e.sourceId)), new Set([flagged, unanswered, initiallyUnfinished]));
  assert.ok(!db.scoreEvents.some((e) => e.sourceId === unsent));
  const immutable = { scores: db.match.scores, decisions: db.decisions, events: db.scoreEvents, standings: db.leagues };
  await f.service.finalize();
  await f.restart();
  await f.service.finalize();
  const retry = await f.post("jordan", `/api/scenarios/${clicked}/decision`, { choice: "flag" });
  assert.equal(retry.id, decisions[0].id);
  assert.equal(retry.choice, "trust");
  const after = await f.repo.read();
  assert.deepEqual({ scores: after.match.scores, decisions: after.decisions, events: after.scoreEvents, standings: after.leagues }, immutable);
});

test("Spear is consumed atomically at lock, survives restart and next week, and remains independent across leagues", async (t) => {
  const f = await setup(t);
  const league = await f.newLeague();
  const spear = await f.prepare("alex", "spear");
  assert.equal((await f.repo.read()).spearUses!.length, 0);
  await Promise.all(Array.from({ length: 8 }, () => f.lock("alex", spear)));
  let db = await f.repo.read();
  assert.equal(db.spearUses!.length, 1);
  assert.deepEqual({ leagueId: db.spearUses![0].leagueId, season: db.spearUses![0].season, scenarioId: db.spearUses![0].scenarioId }, { leagueId: league.id, season: league.season, scenarioId: spear });
  await f.restart();
  await f.lock("alex", spear);
  assert.equal((await f.repo.read()).spearUses!.length, 1);
  await f.post("alex", "/api/match/activate");
  await (await f.selectedService()).release(undefined, true);
  await f.service.advance(10081);
  await f.post("alex", `/api/leagues/${league.id}/next-week`);
  await f.post("alex", "/api/drafts/prepare", castInput("alex", "spear"), 409);
  const regular = await f.prepare("alex", 1);
  assert.ok(regular);
  const other = await f.newLeague();
  const freshSpear = await f.prepare("alex", "spear");
  await f.lock("alex", freshSpear);
  db = await f.repo.read();
  assert.equal(db.spearUses!.length, 2);
  assert.deepEqual(new Set(db.spearUses!.map((use) => use.leagueId)), new Set([league.id, other.id]));
});

test("email challenge GET, HEAD and prefetch are score-neutral and require the recipient for a decision", async (t) => {
  const f = await setup(t);
  const id = await f.prepare("alex");
  await f.lock("alex", id);
  await f.post("alex", "/api/match/activate");
  await f.service.release(undefined, true);
  const scenario = (await f.repo.read()).scenarios.find((s) => s.id === id)!;
  const url = new URL(f.service.actionUrl(scenario)).pathname;
  for (const method of ["GET", "HEAD"] as const) {
    const preview = await f.app.inject({ method, url, headers: { purpose: "prefetch", "sec-purpose": "prefetch" } });
    assert.equal(preview.statusCode, 200);
  }
  const db = await f.repo.read();
  assert.deepEqual(db.match.scores, { alex: 0, jordan: 0 });
  assert.equal(db.decisions.length, 0);
  assert.equal(db.scoreEvents.length, 0);
  await f.post("alex", `/api/scenarios/${id}/decision`, { choice: "trust" }, 404);
  const wrongCookie = await f.app.inject({ method: "POST", url, headers: { cookie: `fp_session=${f.sessions.jordan.token}` }, payload: { choice: "trust", csrf: "wrong" } });
  assert.equal(wrongCookie.statusCode, 403);
  const clicked = await f.app.inject({ method: "POST", url, headers: { cookie: `fp_session=${f.sessions.jordan.token}` }, payload: { choice: "trust", csrf: f.sessions.jordan.csrf } });
  assert.equal(clicked.statusCode, 302);
  assert.deepEqual((await f.repo.read()).match.scores, { alex: 3, jordan: -1 });
});

test("a Spear that cannot be scheduled rolls back its lock and seasonal reservation together", async (t) => {
  const f = await setup(t);
  const first = await f.prepare("alex");
  await f.lock("alex", first);
  await f.post("alex", "/api/match/activate");
  const spear = await f.prepare("alex", "spear");
  await f.service.advance(10079.5);
  await f.post("alex", `/api/drafts/${spear}/lock`, {}, 409);
  const db = await f.repo.read();
  assert.equal(db.match.state, "active");
  assert.equal(db.scenarios.find((s) => s.id === spear)!.locked, false);
  assert.equal(db.spearUses!.length, 0);
  assert.ok(!db.jobs.some((j) => j.type === "delivery" && j.scenarioId === spear));
});

test("v2 migration archives unplayed extra channels while preserving legacy active matches and completed history", async (t) => {
  const f = await setup(t, true);
  const ids: string[] = [];
  for (const channel of ["email", "sms", "voice"] as const) {
    const result = await f.service.generate("alex", { recipientMemberId: "jordan", channel, interest: "Board games", templateId: "parcel-update" });
    ids.push(result.scenarioId);
  }
  await f.repo.transact((db) => {
    const active = db.matchPools!.find((p) => p.match.state === "drafting")!;
    active.match.state = "active";
    active.match.startedAt = Date.now();
    active.scenarios.push({ ...structuredClone(db.scenarios[1]), id: "legacy-active-sms", matchId: active.match.id, authorId: active.match.players[0], recipientId: active.match.players[1] });
  });
  const before = await f.repo.read();
  const preserved = gamePools(before).filter((p) => ["active", "completed"].includes(p.match.state));
  f.config.ruleSet = "email-casts-v2";
  await f.restart();
  let db = await f.repo.read();
  assert.equal(db.match.ruleSet, "email-casts-v2");
  assert.deepEqual(db.scenarios.map((s) => s.id), [ids[0]]);
  assert.equal(db.scenarios[0].kind, "regular");
  assert.equal(db.scenarios[0].slot, 1);
  assert.deepEqual(db.scenarios[0].content, before.scenarios[0].content);
  assert.deepEqual(db.archivedDrafts, before.scenarios.slice(1));
  assert.ok(db.jobs.filter((j) => ids.slice(1).includes(j.scenarioId)).every((j) => j.status === "cancelled"));
  assert.deepEqual(gamePools(db).filter((p) => ["active", "completed"].includes(p.match.state)), preserved);
  await f.restart();
  db = await f.repo.read();
  assert.equal(db.archivedDrafts!.length, 2, "restarts must not archive the same draft twice");
  assert.deepEqual(gamePools(db).filter((p) => ["active", "completed"].includes(p.match.state)), preserved);
});
