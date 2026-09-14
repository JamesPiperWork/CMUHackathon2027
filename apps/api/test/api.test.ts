import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as clientSocket } from "socket.io-client";
import { createSeed, type Database } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService, hash } from "../src/service.js";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-api-"));
  const file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => createSeed());
  const config: Config = {
    mode: "demo",
    port: 0,
    apiOrigin: "http://localhost:3001",
    appOrigin: "http://localhost:8081",
    dataFile: file,
    mongodbUri: "",
    matchDurationMinutes: 30,
    jobIntervalMs: 500,
  };
  const service = new GameService(repo, config);
  const { app, io } = await createServer(service, { startJobs: false });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const sessions = {
    alex: await service.createSession("alex"),
    jordan: await service.createSession("jordan"),
    operator: await service.createSession("alex", "operator"),
  };
  const headers = (user: keyof typeof sessions) => ({
    authorization: `Bearer ${sessions[user].token}`,
  });
  return { app, io, service, repo, config, file, sessions, headers };
}
async function enroll(service: GameService) {
  for (const user of ["alex", "jordan"])
    await service.consent(user, {
      adult: true,
      channels: { email: true, sms: true, voice: true },
      timezone: "America/New_York",
      startHour: 10,
      endHour: 20,
      familyFriendly: true,
    });
}
async function active(service: GameService) {
  await enroll(service);
  await service.activate("alex");
  await service.release(undefined, true);
}
test("HTTP sender notes accept arbitrary topics without a legacy hobby tag and prepare a topical email", async t => {
  const { app, service, config, headers } = await setup(t);
  config.ruleSet = "email-casts-v2";
  await service.initializeRules();
  await enroll(service);
  const authorPrompt = "They enjoy chess. Invite them to a fictional puzzle afternoon.";
  const saved = await app.inject({ method: "PUT", url: "/api/scouting/jordan", headers: headers("alex"), payload: { interests: [], markdown: authorPrompt } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(saved.json().interests, []);
  assert.equal(saved.json().markdown, authorPrompt);
  const prepared = await app.inject({ method: "POST", url: "/api/drafts/prepare", headers: headers("alex"), payload: { recipientMemberId: "jordan", channel: "email", kind: "regular", slot: 1, authorPrompt } });
  assert.equal(prepared.statusCode, 200, prepared.body);
  const state = (await app.inject({ url: "/api/state", headers: headers("alex") })).json();
  assert.equal(state.drafts[0].contentPolicy, "email-prompt-v3");
  assert.match(state.drafts[0].content.bodyText, /chess puzzle/);
  assert.equal(state.drafts[0].authorPrompt, authorPrompt);
  const invalid = await app.inject({ method: "PUT", url: "/api/scouting/jordan", headers: headers("alex"), payload: { interests: ["Chess"], markdown: authorPrompt } });
  assert.equal(invalid.statusCode, 400, "The old enum field cannot silently accept unrecognized values");
});
test("clean demo seed, issued sessions, scoped DTOs, private drafts and immutable answers", async (t) => {
  const { app, service, headers, repo, sessions } = await setup(t);
  assert.equal((await repo.read()).profiles.length, 8);
  assert.equal((await app.inject("/api/state")).statusCode, 401);
  assert.equal(
    (await app.inject({ url: "/api/state", headers: { "x-user-id": "alex" } }))
      .statusCode,
    401,
  );
  await enroll(service);
  const generated = await service.generate("alex", {
    recipientMemberId: "jordan",
    channel: "email",
    interest: "Board games",
    templateId: "parcel-update",
  });
  await service.tick();
  const alex = await service.state(
    (await service.sessionForToken(sessions.alex.token))!,
  );
  const jordan = await service.state(
    (await service.sessionForToken(sessions.jordan.token))!,
  );
  assert.equal(alex.drafts.length, 1);
  assert.equal(alex.drafts[0].source, "fixture");
  assert.equal(jordan.drafts.length, 0);
  assert.equal(jordan.incoming.length, 0);
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/drafts/${generated.scenarioId}`,
        headers: headers("jordan"),
        payload: { subject: "My stolen draft" },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/drafts/${generated.scenarioId}`,
        headers: headers("alex"),
        payload: { isPhishing: false },
      })
    ).statusCode,
    400,
  );
  await service.lock("alex", generated.scenarioId);
  await service.activate("jordan");
  await service.release("jordan", true);
  const incoming = (
    await service.state((await service.sessionForToken(sessions.jordan.token))!)
  ).incoming;
  assert.equal(incoming.length, 6);
  assert.equal(new Set(incoming.map((s) => s.channel)).size, 3);
  for (const scenario of incoming) {
    const json = JSON.stringify(scenario);
    for (const secret of [
      "isPhishing",
      "cueAnnotations",
      "explanation",
      "templateId",
      "source",
      "authorId",
      "tokenHash",
      "order",
    ])
      assert.ok(!json.includes(`"${secret}"`), `${secret} leaked`);
    assert.equal(scenario.deliveryStatus, "simulated");
  }
  const otherState = await app.inject({
    url: "/api/state",
    headers: headers("jordan"),
  });
  assert.ok(!otherState.body.includes("tokenHash"));
  assert.ok(!("seed" in otherState.json().match));
});
test("all channels share scoring; duplicate decisions and finalization stay idempotent through restart", async (t) => {
  const { service, repo, file } = await setup(t);
  await enroll(service);
  const authored = await service.generate("alex", {
    recipientMemberId: "jordan",
    channel: "voice",
    interest: "Outdoor adventures",
    templateId: "game-night",
  });
  await service.tick();
  await service.lock("alex", authored.scenarioId);
  await service.activate("alex");
  await service.release(undefined, true);
  let db = await repo.read();
  assert.equal(db.scenarios.length, 12);
  const target = db.scenarios.find((s) => s.id === authored.scenarioId)!;
  const decisions = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.decisionFor("jordan", target.id, "trust"),
    ),
  );
  assert.ok(decisions.every((d) => d.id === decisions[0].id));
  db = await repo.read();
  assert.equal(db.match.scores.alex, 2);
  assert.equal(db.match.scores.jordan, -3);
  assert.equal(db.scoreEvents.length, 2);
  for (const scenario of db.scenarios.filter((s) => s.id !== target.id))
    await service.decisionFor(
      scenario.recipientId,
      scenario.id,
      scenario.isPhishing ? "flag" : "trust",
    );
  db = await repo.read();
  assert.equal(db.match.state, "completed");
  assert.equal(db.match.result, "win");
  assert.equal(db.match.winnerId, "alex");
  assert.equal(db.match.scores.alex, 20);
  assert.equal(db.match.scores.jordan, 12);
  const points = db.profiles.find((p) => p.id === "alex")!.leaguePoints;
  await service.finalize();
  await service.finalize();
  assert.equal(
    (await repo.read()).profiles.find((p) => p.id === "alex")!.leaguePoints,
    points,
  );
  const restarted = await FileRepository.open(file, () => {
    throw new Error("Must read persisted state");
  });
  const persisted = await restarted.read();
  assert.equal(persisted.decisions.length, 12);
  assert.equal(persisted.match.scores.alex, 20);
  assert.equal(persisted.match.standingsApplied, true);
  await restarted.close();
  const recap = (
    await service.state({
      userId: "alex",
      role: "player",
      tokenHash: "test",
      expiresAt: Date.now() + 1000,
      csrf: "test",
    })
  ).recap!;
  assert.equal(recap.detectedPhish, 3);
  assert.equal(recap.correctTrust, 3);
  assert.equal(recap.authorSuccess, 1);
  assert.equal(recap.score, 20);
});
test("GET/prefetch is neutral; wrong recipient, cookie CSRF, expired link, unknown fields rejected", async (t) => {
  const { app, service, repo, headers, sessions } = await setup(t);
  await active(service);
  const scenario = (await repo.read()).scenarios.find(
    (s) => s.recipientId === "jordan",
  )!;
  const url = new URL(service.actionUrl(scenario)).pathname;
  const preview = await app.inject(url);
  assert.equal(preview.statusCode, 200);
  assert.ok(preview.body.includes("Your surprise"));
  assert.ok(preview.body.includes("const receipt = null"), "A raw preview cannot record a click");
  assert.equal((await repo.read()).decisions.length, 0);
  assert.ok(
    !JSON.stringify(await repo.read()).includes(
      new URL(service.actionUrl(scenario)).pathname.slice(3),
    ),
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/scenarios/${scenario.id}/decision`,
        headers: headers("alex"),
        payload: { choice: "trust" },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: `fp_session=${sessions.jordan.token}` },
        payload: { choice: "trust", csrf: "wrong" },
      })
    ).statusCode,
    403,
  );
  const response = await app.inject({
    method: "POST",
    url,
    headers: { cookie: `fp_session=${sessions.jordan.token}` },
    payload: { choice: "trust", csrf: sessions.jordan.csrf },
  });
  assert.equal(response.statusCode, 302);
  assert.equal((await repo.read()).decisions.length, 1);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/scenarios/${scenario.id}/decision`,
        headers: headers("jordan"),
        payload: { choice: "flag", score: 999 },
      })
    ).statusCode,
    400,
  );
  await service.transact((db) => {
    db.scenarios.find((s) => s.id === scenario.id)!.tokenExpiresAt =
      Date.now() - 1;
  });
  assert.equal((await app.inject(url)).statusCode, 410);
  assert.equal((await repo.read()).decisions.length, 1);
  assert.equal(
    (await app.inject({ url: "/api/operator", headers: headers("jordan") }))
      .statusCode,
    403,
  );
});
test("pause cancels queued deliveries durably, ignore earns zero and carrier-unknown leases are never retried", async (t) => {
  const { service, repo, file, config } = await setup(t);
  await enroll(service);
  await service.activate("alex");
  await service.pauseUser("jordan");
  let db = await repo.read();
  assert.equal(db.jobs.filter((j) => j.status === "cancelled").length, 6);
  await service.release("alex", true);
  db = await repo.read();
  const call = db.scenarios.find(
    (s) => s.recipientId === "alex" && s.channel === "voice",
  )!;
  await service.ignore("alex", call.id);
  assert.equal((await repo.read()).match.scores.alex, 0);
  await service.transact((db) => {
    const job = db.jobs.find((j) => j.status === "cancelled")!;
    job.status = "leased";
    job.leaseExpiresAt = Date.now() - 1;
  });
  const restarted = await FileRepository.open(file, () => createSeed());
  const restartedService = new GameService(restarted, config);
  await restartedService.tick();
  const recovered = await restarted.read();
  assert.equal(recovered.jobs.filter((j) => j.status === "unknown").length, 1);
  const attempts = recovered.attempts.length;
  await restartedService.tick();
  assert.equal((await restarted.read()).attempts.length, attempts);
  assert.ok(
    (await restarted.read()).members.find((m) => m.userId === "jordan")!.consent
      .paused,
  );
  await restarted.close();
});
for (const outcome of ["forfeit", "no-contest", "draw"] as const)
  test(`finalize ${outcome} and movement use competitive minimum, apply once`, async (t) => {
    const { service, repo } = await setup(t);
    await active(service);
    const db = await repo.read();
    if (outcome !== "no-contest")
      for (const id of outcome === "draw" ? ["alex", "jordan"] : ["alex"])
        for (const scenario of db.scenarios
          .filter((s) => s.recipientId === id)
          .slice(0, 4))
          await service.decisionFor(
            id,
            scenario.id,
            scenario.isPhishing ? "flag" : "trust",
          );
    await service.finalize();
    const final = await repo.read();
    assert.equal(final.match.result, outcome);
    assert.equal(final.match.winnerId, outcome === "forfeit" ? "alex" : null);
    const before = final.profiles.map((p) => p.leaguePoints);
    await service.finalize();
    assert.deepEqual(
      (await repo.read()).profiles.map((p) => p.leaguePoints),
      before,
    );
    if (outcome === "no-contest") assert.equal(final.match.scores.alex, 0);
    const state = await service.state({
      userId: "alex",
      role: "player",
      tokenHash: "",
      expiresAt: Date.now() + 1000,
      csrf: "",
    });
    for (const p of state.league.members)
      assert.equal(p.movement, final.match.standingsBefore[p.id] - p.rank);
  });
test("three attempts, content guards, channel consent and membership enforced server-side", async (t) => {
  const { service, repo } = await setup(t);
  await assert.rejects(
    () =>
      service.generate("alex", {
        recipientMemberId: "jordan",
        channel: "email",
        interest: "Board games",
        templateId: "parcel-update",
      }),
    /personally accept/,
  );
  await enroll(service);
  for (let i = 0; i < 3; i++) {
    await service.generate("alex", {
      recipientMemberId: "jordan",
      channel: "email",
      interest: "Board games",
      templateId: "parcel-update",
    });
    await service.tick();
  }
  await assert.rejects(
    () =>
      service.generate("alex", {
        recipientMemberId: "jordan",
        channel: "email",
        interest: "Board games",
        templateId: "parcel-update",
      }),
    /Three generation/,
  );
  const draft = (await repo.read()).scenarios[0];
  await assert.rejects(
    () =>
      service.editDraft("alex", draft.id, {
        bodyText:
          "Use your password at https://evil.example to receive this parcel right now.",
      }),
    /approved low-stakes/,
  );
  await assert.rejects(
    () =>
      service.editDraft("alex", draft.id, {
        bodyText:
          "Everything is confirmed and nothing has changed about your upcoming event.",
      }),
    /approved scenario/,
  );
  await assert.rejects(
    () =>
      service.generate("alex", {
        recipientMemberId: "sam",
        channel: "sms",
        interest: "Board games",
        templateId: "ticket-drop",
      }),
    /membership/,
  );
  await service.lock("alex", draft.id);
  await assert.rejects(
    () =>
      service.editDraft("alex", draft.id, { subject: "A different subject" }),
    /cannot be changed/,
  );
});
test("live mode closes demo controls, blocks unconfigured delivery, and unresolved transport ends incomplete", async (t) => {
  const { app, service, repo, headers, sessions } = await setup(t);
  await enroll(service);
  await service.activate("alex");
  service.config.mode = "live";
  assert.equal(await service.sessionForToken(sessions.alex.token), null);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/demo/session",
        payload: { player: "operator" },
      })
    ).statusCode,
    403,
  );
  for (const url of [
    "/api/operator/reset",
    "/api/operator/advance",
    "/api/operator/release",
    "/api/operator/finalize",
  ])
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url,
          headers: headers("operator"),
          payload: { minutes: 1 },
        })
      ).statusCode,
      403,
    );
  await assert.rejects(() => service.reset(), /disabled/);
  await service.transact((db) => {
    for (const j of db.jobs) j.dueAt = Date.now() - 1;
  });
  await service.tick();
  const db = await repo.read();
  assert.ok(db.scenarios.every((s) => s.deliveryStatus === "failed"));
  assert.ok(db.attempts.every((a) => a.provider !== "simulator"));
  await service.finalize();
  assert.equal((await repo.read()).match.result, "incomplete");
  assert.equal((await repo.read()).match.state, "resolving");
  assert.equal((await repo.read()).match.standingsApplied, false);
});
test(
  "socket sessions share committed changes and reject identity spoofing or arbitrary subscriptions",
  { timeout: 5000 },
  async (t) => {
    const { app, io, service, sessions } = await setup(t);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const alex = clientSocket(endpoint, {
      auth: { token: sessions.alex.token },
      transports: ["websocket"],
      reconnection: false,
    });
    const jordan = clientSocket(endpoint, {
      auth: { token: sessions.jordan.token },
      transports: ["websocket"],
      reconnection: false,
    });
    t.after(() => {
      alex.close();
      jordan.close();
    });
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        alex.once("connect", () => resolve());
        alex.once("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        jordan.once("connect", () => resolve());
        jordan.once("connect_error", reject);
      }),
    ]);
    assert.equal(
      io.sockets.sockets.get(alex.id!)?.rooms.has("user:alex"),
      true,
    );
    assert.equal(
      io.sockets.sockets.get(alex.id!)?.rooms.has("user:jordan"),
      false,
    );
    const subscribed = await new Promise<{
      error: string;
    }>((resolve) => alex.emit("subscribe", { userId: "jordan" }, resolve));
    assert.match(subscribed.error, /assigned by the server/);
    const notifications = Promise.all([
      new Promise<void>((resolve) => alex.once("state:changed", resolve)),
      new Promise<void>((resolve) => jordan.once("state:changed", resolve)),
    ]);
    await service.pauseUser("alex");
    await notifications;
    const fake = clientSocket(endpoint, {
      auth: { userId: "jordan" },
      transports: ["websocket"],
      reconnection: false,
    });
    t.after(() => fake.close());
    assert.match(
      (
        await new Promise<Error>((resolve) =>
          fake.once("connect_error", resolve),
        )
      ).message,
      /Unauthorized/,
    );
  },
);
test("atomic file critical section rolls back failed changes and stores session hashes", async (t) => {
  const { repo, file, sessions } = await setup(t);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      repo.transact((db) => {
        db.clockOffset++;
      }),
    ),
  );
  assert.equal((await repo.read()).clockOffset, 20);
  await assert.rejects(
    () =>
      repo.transact((db) => {
        db.clockOffset = 999;
        throw new Error("rollback");
      }),
    /rollback/,
  );
  assert.equal((await repo.read()).clockOffset, 20);
  const text = await readFile(file, "utf8");
  assert.ok(!text.includes(sessions.alex.token));
  assert.ok(text.includes(hash(sessions.alex.token)));
  const parsed = JSON.parse(text) as Database;
  assert.equal(parsed.version, 1);
  assert.equal(parsed.clockOffset, 20);
});

test("live identities read without notification loops and cannot fabricate unanswered transport", async (t) => {
  const { service, repo } = await setup(t);
  await service.transact((db) => {
    db.members[0].auth0Sub = "auth0|alex";
  });
  const initial = (await repo.read()).revision;
  assert.equal(await service.ensureLiveMember({ sub: "auth0|alex" }), "alex");
  assert.equal((await repo.read()).revision, initial);
  await service.ensureLiveMember({
    sub: "auth0|alex",
    email: "alex@demo.invalid",
    emailVerified: true,
  });
  const verified = (await repo.read()).revision;
  assert.equal(verified, initial + 1);
  await service.ensureLiveMember({
    sub: "auth0|alex",
    email: "alex@demo.invalid",
    emailVerified: true,
  });
  assert.equal((await repo.read()).revision, verified);
  service.config.mode = "live";
  await assert.rejects(
    () => service.ignore("alex", "any-scenario"),
    /provider/,
  );
});

test("live schedules separate recipient contact days and rejects impossible deadlines", async (t) => {
  const { service, repo } = await setup(t);
  const previous = process.env.TOKEN_SECRET;
  process.env.TOKEN_SECRET = "test-only-live-token-key-32-characters";
  t.after(() => {
    if (previous === undefined) delete process.env.TOKEN_SECRET;
    else process.env.TOKEN_SECRET = previous;
  });
  await enroll(service);
  service.config.mode = "live";
  await assert.rejects(
    () => service.activate("alex"),
    /two recipient contact days/,
  );
  assert.equal((await repo.read()).match.state, "drafting");
  service.config.matchDurationMinutes = 4320;
  await service.activate("alex");
  const db = await repo.read();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const userId of db.match.players)
    for (const channel of ["email", "sms", "voice"]) {
      const due = db.jobs
        .filter((j) =>
          db.scenarios.some(
            (s) =>
              s.id === j.scenarioId &&
              s.recipientId === userId &&
              s.channel === channel,
          ),
        )
        .map((j) =>
          Object.fromEntries(
            formatter.formatToParts(j.dueAt).map((p) => [p.type, p.value]),
          ),
        );
      assert.equal(due.length, 2);
      assert.notEqual(
        `${due[0].year}-${due[0].month}-${due[0].day}`,
        `${due[1].year}-${due[1].month}-${due[1].day}`,
      );
      assert.ok(due.every((d) => Number(d.hour) >= 10 && Number(d.hour) < 20));
    }
});

test("recipient excluded themes constrain authoring and platform fallback content", async (t) => {
  const { service, repo } = await setup(t);
  await enroll(service);
  await service.consent("jordan", {
    adult: true,
    channels: { email: true, sms: true, voice: true },
    timezone: "America/New_York",
    startHour: 10,
    endHour: 20,
    familyFriendly: true,
    excludedThemes: ["tickets", "parcel deliveries"],
  });
  await assert.rejects(
    () =>
      service.generate("alex", {
        recipientMemberId: "jordan",
        channel: "email",
        interest: "Board games",
        templateId: "parcel-update",
      }),
    /excluded theme/,
  );
  await service.activate("alex");
  assert.ok(
    (await repo.read()).scenarios
      .filter((s) => s.recipientId === "jordan")
      .every((s) => s.templateId === "game-night"),
  );
  await service.reset();
  await enroll(service);
  const generated = await service.generate("alex", {
    recipientMemberId: "jordan",
    channel: "email",
    interest: "Board games",
    templateId: "parcel-update",
  });
  await service.tick();
  await service.consent("jordan", {
    adult: true,
    channels: { email: true, sms: true, voice: true },
    timezone: "America/New_York",
    startHour: 10,
    endHour: 20,
    familyFriendly: true,
    excludedThemes: ["parcels"],
  });
  await assert.rejects(
    () => service.lock("alex", generated.scenarioId),
    /excluded theme/,
  );
});
