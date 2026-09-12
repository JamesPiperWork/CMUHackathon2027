import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import twilio from "twilio";
import { createSeed, fixtureContent, type Scenario } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { getReadiness } from "../src/providers.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "fp-isolation-"));
  const repo = await FileRepository.open(join(directory, "demo.json"), () => {
    const db = createSeed();
    for (const member of db.members) {
      member.accepted = true;
      member.consent.adult = true;
      member.consent.acceptedAt = Date.now();
      member.consent.channels = { email: true, sms: true, voice: true };
    }
    return db;
  });
  const service = new GameService(repo, {
    mode: "demo",
    port: 3001,
    apiOrigin: "http://localhost:3001",
    appOrigin: "http://localhost:8081",
    dataFile: join(directory, "demo.json"),
    mongodbUri: "",
    matchDurationMinutes: 30,
    jobIntervalMs: 500,
  });
  const { app } = await createServer(service, { startJobs: false });
  const alex = await service.createSession("alex"),
    jordan = await service.createSession("jordan");
  const request = (
    token: string,
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload: payload as Record<string, unknown> } : {}),
    });
  return {
    service,
    app,
    alex,
    jordan,
    request,
    close: async () => {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("an empty selected league cannot read or mutate a different league scouting/draft context", async () => {
  const f = await fixture();
  try {
    const initial = await f.service.readDb();
    const created = await f.request(f.alex.token, "POST", "/api/leagues", {
      name: "Empty private league",
    });
    assert.equal(created.statusCode, 200);
    const league = created.json();
    const before = await f.service.readDb();
    assert.equal(before.userSelections!.alex.leagueId, league.id);
    for (const [method, path, payload] of [
      ["GET", "/api/scouting/jordan", undefined],
      [
        "PUT",
        "/api/scouting/jordan",
        {
          interests: ["Board games"],
          markdown: "## Play style\n- New league report",
        },
      ],
      [
        "POST",
        "/api/drafts/generate",
        {
          recipientMemberId: "jordan",
          channel: "email",
          interest: "Board games",
          templateId: "parcel-update",
        },
      ],
      ["POST", "/api/match/activate", {}],
    ] as const) {
      const response = await f.request(f.alex.token, method, path, payload);
      assert.equal(
        response.statusCode,
        409,
        `${method} ${path}: ${response.body}`,
      );
    }
    const after = await f.service.readDb();
    assert.deepEqual(after.scenarios, initial.scenarios);
    assert.deepEqual(after.scouting, before.scouting);
    assert.equal(after.match.state, "drafting");
  } finally {
    await f.close();
  }
});

test("HTTP scouting reads stay author-private and cross-league members remain inaccessible", async () => {
  const f = await fixture();
  try {
    const note = "## Play style\n- ALEX_ONLY_COOP_PLAN for weekend game nights";
    assert.equal(
      (
        await f.request(f.alex.token, "PUT", "/api/scouting/jordan", {
          interests: ["Board games"],
          markdown: note,
        })
      ).statusCode,
      200,
    );
    const author = (
      await f.request(f.alex.token, "GET", "/api/scouting/jordan")
    ).json();
    assert.equal(author.markdown, note);
    const reverse = await f.request(
      f.jordan.token,
      "GET",
      "/api/scouting/alex",
    );
    assert.equal(reverse.statusCode, 200);
    assert.ok(!reverse.body.includes("ALEX_ONLY_COOP_PLAN"));
    const targetState = await f.request(f.jordan.token, "GET", "/api/state");
    assert.equal(targetState.statusCode, 200);
    assert.ok(!targetState.body.includes("ALEX_ONLY_COOP_PLAN"));
    assert.ok(!("scouting" in targetState.json()));
    assert.equal(
      (await f.request(f.jordan.token, "GET", "/api/scouting/jordan"))
        .statusCode,
      403,
    );
    const league = (
      await f.request(f.alex.token, "POST", "/api/leagues", {
        name: "Two player scouts",
      })
    ).json();
    await f.request(f.jordan.token, "POST", "/api/leagues/join", {
      inviteCode: league.inviteCode,
    });
    assert.equal(
      (await f.request(f.alex.token, "GET", "/api/scouting/sam")).statusCode,
      403,
    );
    const newReport = (
      await f.request(f.alex.token, "GET", "/api/scouting/jordan")
    ).json();
    assert.equal(newReport.markdown, "");
  } finally {
    await f.close();
  }
});

test("finishing a new-league matchup changes only its standings and is idempotent", async () => {
  const f = await fixture();
  try {
    const old = await f.service.readDb();
    const originalProfiles = structuredClone(old.profiles),
      originalMatch = structuredClone(old.match);
    const league = (
      await f.request(f.alex.token, "POST", "/api/leagues", {
        name: "A fresh scoreboard",
      })
    ).json();
    await f.request(f.jordan.token, "POST", "/api/leagues/join", {
      inviteCode: league.inviteCode,
    });
    const db = await f.service.readDb(),
      pool = db.matchPools!.find((p) => p.match.leagueId === league.id)!;
    const game = f.service.forMatch(pool.match.id);
    await game.activate("alex");
    await game.repo.transact((view) => {
      for (const recipientId of view.match.players) {
        const scenarios = view.scenarios.filter(
          (s) => s.recipientId === recipientId,
        );
        for (const scenario of scenarios) {
          scenario.deliveryStatus = "simulated";
          scenario.releasedAt = Date.now();
        }
      }
    });
    const active = await game.readDb();
    for (const id of active.match.players)
      for (const scenario of active.scenarios.filter(
        (s) => s.recipientId === id,
      ))
        await game.decisionFor(
          id,
          scenario.id,
          scenario.isPhishing ? "flag" : "trust",
        );
    await game.finalize();
    await game.finalize();
    const final = await f.service.readDb();
    assert.deepEqual(final.match, originalMatch);
    assert.deepEqual(final.profiles, originalProfiles);
    const standings = final.leagues!.find(
      (l) => l.id === league.id,
    )!.standings!;
    assert.equal(standings.alex.leaguePoints, 1);
    assert.equal(standings.jordan.leaguePoints, 1);
    assert.equal(standings.alex.draws, 1);
    const finished = final.matchPools!.find(
      (p) => p.match.id === pool.match.id,
    )!;
    assert.equal(finished.match.state, "completed");
    assert.equal(finished.decisions.length, 12);
  } finally {
    await f.close();
  }
});

test("signed pooled call callbacks score their assigned recipient without touching the primary match", async () => {
  const f = await fixture(),
    saved = { ...process.env };
  const env = {
    APP_MODE: "live",
    TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "local-signature-test",
    TWILIO_CALLBACK_BASE: "https://api.example.invalid",
  };
  Object.assign(process.env, env);
  try {
    const now = Date.now();
    let scenarioId = "";
    const providerId = "CA-pooled-test";
    let poolId = "";
    await f.service.repo.transact((db) => {
      const pool = db.matchPools!.find(
        (p) =>
          p.match.players.includes("sam") && p.match.players.includes("riley"),
      )!;
      poolId = pool.match.id;
      pool.match.state = "active";
      pool.match.deadline = now + 3600000;
      pool.match.startedAt = now;
      const scenario: Scenario = {
        id: "pooled-voice-scenario",
        matchId: pool.match.id,
        recipientId: "riley",
        authorId: "sam",
        channel: "voice",
        templateId: "game-night",
        interest: "Outdoor adventures",
        content: fixtureContent("voice", "game-night", true),
        isPhishing: true,
        locked: true,
        source: "fixture",
        model: "fixture",
        promptVersion: "v1",
        generationAttempts: 0,
        generationStatus: "complete",
        tokenHash: "unused",
        tokenExpiresAt: now + 3600000,
        releasedAt: now,
        deliveryStatus: "accepted",
        order: 0,
      };
      scenarioId = scenario.id;
      pool.scenarios.push(scenario);
      pool.attempts.push({
        id: "pooled-voice-attempt",
        scenarioId,
        recipientId: "riley",
        channel: "voice",
        provider: "twilio",
        providerId,
        status: "accepted",
        createdAt: now,
        updatedAt: now,
        callbackIds: [],
      });
      const member = db.members.find(
        (m) => m.userId === "riley" && m.leagueId === pool.match.leagueId,
      )!;
      member.consent.contacts.voice = {
        destination: "+12025550121",
        method: "operator",
        verified: true,
        verifiedAt: now,
        evidence: "Mock ownership check",
      };
      const unrelatedMembership = structuredClone(member);
      unrelatedMembership.leagueId = "unrelated-contact-league";
      unrelatedMembership.consent.contacts.voice!.destination = "+12025550122";
      db.members.unshift(unrelatedMembership);
    });
    const post = (path: string, extra: Record<string, string>) => {
      const params = {
          AccountSid: env.TWILIO_ACCOUNT_SID,
          CallSid: providerId,
          To: "+12025550121",
          ...extra,
        },
        signature = twilio.getExpectedTwilioSignature(
          env.TWILIO_AUTH_TOKEN,
          env.TWILIO_CALLBACK_BASE + path,
          params,
        );
      return f.app.inject({
        method: "POST",
        url: path,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": signature,
        },
        payload: new URLSearchParams(params).toString(),
      });
    };
    assert.equal(
      (
        await post("/webhooks/twilio/status", {
          CallStatus: "completed",
          To: "+12025550122",
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await post("/webhooks/twilio/voice-decision", {
          Digits: "2",
          To: "+12025550122",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await post("/webhooks/twilio/status", { CallStatus: "completed" }))
        .statusCode,
      204,
    );
    assert.equal(
      (await post("/webhooks/twilio/voice-decision", { Digits: "2" }))
        .statusCode,
      200,
    );
    assert.equal(
      (await post("/webhooks/twilio/voice-decision", { Digits: "2" }))
        .statusCode,
      200,
    );
    const final = await f.service.readDb(),
      pool = final.matchPools!.find((p) => p.match.id === poolId)!;
    assert.equal(final.decisions.length, 0);
    assert.equal(final.match.scores.alex, 0);
    assert.equal(pool.decisions.length, 1);
    assert.equal(pool.decisions[0].scenarioId, scenarioId);
    assert.equal(pool.match.scores.riley, 3);
    assert.equal(pool.attempts[0].status, "delivered");
    assert.equal(final.callbackIds.length, 1);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    await f.close();
  }
});

test("live daily quota includes primary and other match attempts when viewed from a pooled match", async () => {
  const f = await fixture();
  try {
    const now = Date.now();
    let poolId = "";
    await f.service.repo.transact((db) => {
      poolId = db.matchPools!.find(
        (p) =>
          p.match.players.includes("sam") && p.match.players.includes("riley"),
      )!.match.id;
      const member = db.members.find((m) => m.userId === "riley")!;
      member.consent.startHour = 0;
      member.consent.endHour = 24;
      db.attempts.push({
        id: "primary-quota-evidence",
        scenarioId: "old-scenario",
        recipientId: "riley",
        channel: "voice",
        provider: "twilio",
        status: "unknown",
        createdAt: now,
        updatedAt: now,
        callbackIds: [],
      });
    });
    const view = await f.service.forMatch(poolId).readDb();
    assert.ok(view.allAttempts!.some((a) => a.id === "primary-quota-evidence"));
    const row = getReadiness(view, "riley", now, { APP_MODE: "live" }).find(
      (r) => r.channel === "voice",
    )!;
    assert.equal(
      row.conditions.find((c) => c.name === "Daily quota")!.ok,
      false,
    );
    await f.service.forMatch(poolId).repo.transact((db) => {
      db.match.scores.riley = 1;
    });
    const root = await f.service.readDb();
    assert.equal(root.allAttempts, undefined);
  } finally {
    await f.close();
  }
});
