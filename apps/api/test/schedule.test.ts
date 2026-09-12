import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed, type LeagueSummary, type Match } from "@fp/shared";
import { FileRepository, gamePools } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";

async function setup(t: TestContext, ruleSet?: "email-casts-v2") {
  const dir = await mkdtemp(join(tmpdir(), "fp-schedule-"));
  const file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => createSeed());
  const service = new GameService(repo, {
    mode: "demo", port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081",
    dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500, ruleSet,
  });
  const { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await repo.close(); await rm(dir, { recursive: true, force: true }); });
  const users = (await repo.read()).profiles.map((p) => p.id);
  const tokens = Object.fromEntries(await Promise.all(users.map(async (id) => [id, (await service.createSession(id)).token])));
  const post = async (userId: string, url: string, payload: unknown = {}) => {
    const response = await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${tokens[userId]}` }, payload: payload as Record<string, unknown> });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const league: LeagueSummary = await post(users[0], "/api/leagues", { name: "Circle anglers" });
  const joinLeague = (userId: string) => post(userId, "/api/leagues/join", { inviteCode: league.inviteCode });
  const matches = async (week: number) => gamePools(await repo.read()).map((p) => p.match).filter((m) => m.leagueId === league.id && m.week === week);
  const nextWeek = async () => {
    await repo.transact((db) => {
      const week = db.leagues!.find((l) => l.id === league.id)!.currentWeek;
      for (const pool of gamePools(db).filter((p) => p.match.leagueId === league.id && p.match.week === week))
        pool.match.state = "cancelled";
    });
    await post(users[0], `/api/leagues/${league.id}/next-week`);
  };
  return { repo, file, users, league, joinLeague, matches, nextWeek };
}

function checkWeek(matches: Match[], playerCount: number) {
  assert.equal(matches.length, Math.floor(playerCount / 2));
  const assigned = matches.flatMap((m) => m.players);
  assert.equal(new Set(assigned).size, assigned.length, "a player must not be assigned twice");
}

function pairKey(match: Match) { return [...match.players].sort().join("/"); }

test("sequential league joins seed a durable round robin without changing existing matches or other leagues", async (t) => {
  const f = await setup(t);
  const original = gamePools(await f.repo.read());
  await f.joinLeague(f.users[1]);
  const first = (await f.matches(1))[0];
  await f.joinLeague(f.users[2]);
  await f.joinLeague(f.users[3]);
  await f.joinLeague(f.users[1]);
  assert.deepEqual((await f.matches(1)).find((m) => m.id === first.id), first);
  const opponents = new Set<string>();
  for (let week = 1; week <= 3; week++) {
    const matches = await f.matches(week);
    checkWeek(matches, 4);
    for (const match of matches) {
      assert.equal(opponents.has(pairKey(match)), false, "no opponent repeats within the stable-roster cycle");
      opponents.add(pairKey(match));
    }
    if (week < 3) await f.nextWeek();
  }
  assert.equal(opponents.size, 6);
  const db = await f.repo.read();
  assert.deepEqual(gamePools(db).filter((p) => p.match.leagueId !== f.league.id), original);
  const reopened = await FileRepository.open(f.file, () => createSeed());
  assert.deepEqual((await reopened.read()).leagues!.find((l) => l.id === f.league.id)!.scheduleCycle,
    db.leagues!.find((l) => l.id === f.league.id)!.scheduleCycle);
  await reopened.close();
});

test("a midweek join fills an odd-roster bye once and starts a cycle without reshuffling current opponents", async (t) => {
  const f = await setup(t);
  for (const id of f.users.slice(1, 5)) await f.joinLeague(id);
  await f.nextWeek();
  const assigned = await f.matches(2);
  checkWeek(assigned, 5);
  const bye = f.users.slice(0, 5).find((id) => !assigned.some((m) => m.players.includes(id)))!;
  await f.joinLeague(f.users[5]);
  await f.joinLeague(f.users[5]);
  const joined = await f.matches(2);
  checkWeek(joined, 6);
  assert.deepEqual(joined.filter((m) => assigned.some((old) => old.id === m.id)), assigned);
  assert.ok(joined.some((m) => m.players.includes(bye) && m.players.includes(f.users[5])));
  const seen = new Set<string>();
  for (let week = 2; week <= 6; week++) {
    const matches = await f.matches(week);
    checkWeek(matches, 6);
    for (const match of matches) {
      assert.equal(seen.has(pairKey(match)), false);
      seen.add(pairKey(match));
    }
    if (week < 6) await f.nextWeek();
  }
  assert.equal(seen.size, 15);
});

test("legacy leagues acquire a cycle anchored to their saved week before advancing", async (t) => {
  const f = await setup(t);
  for (const id of f.users.slice(1, 4)) await f.joinLeague(id);
  const old = await f.matches(1);
  await f.repo.transact((db) => { delete db.leagues!.find((l) => l.id === f.league.id)!.scheduleCycle; });
  await f.nextWeek();
  const next = await f.matches(2);
  checkWeek(next, 4);
  assert.ok(next.every((match) => !old.some((prior) => pairKey(prior) === pairKey(match))));
  assert.equal((await f.repo.read()).leagues!.find((l) => l.id === f.league.id)!.scheduleCycle!.firstWeek, 1);
});

test("email-cast leagues carry their configured rules and season into every scheduled week", async (t) => {
  const f = await setup(t, "email-casts-v2");
  assert.deepEqual(f.league.settings.channels, { email: true, sms: false, voice: false });
  await f.joinLeague(f.users[1]);
  for (let week = 1; week <= 2; week++) {
    const match = (await f.matches(week))[0];
    assert.equal(match.ruleSet, "email-casts-v2");
    assert.equal(match.season, f.league.season);
    if (week === 1) await f.nextWeek();
  }
});
