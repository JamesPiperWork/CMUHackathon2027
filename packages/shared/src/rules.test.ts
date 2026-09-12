import test from "node:test";
import assert from "node:assert/strict";
import {
  channels,
  contentSchema,
  contentReview,
  createSeed,
  fixtureContent,
  matchOutcome,
  scenarioConsistent,
  scoreDecision,
} from "./index";
test("all scoring events follow the published table", () => {
  assert.deepEqual(scoreDecision(true, "flag", true), {
    correct: true,
    defenderPoints: 3,
    authorPoints: 0,
  });
  assert.deepEqual(scoreDecision(false, "trust", false), {
    correct: true,
    defenderPoints: 3,
    authorPoints: 0,
  });
  assert.deepEqual(scoreDecision(true, "trust", true), {
    correct: false,
    defenderPoints: -3,
    authorPoints: 2,
  });
  assert.deepEqual(scoreDecision(true, "trust", false), {
    correct: false,
    defenderPoints: -3,
    authorPoints: 0,
  });
  assert.deepEqual(scoreDecision(false, "flag", false), {
    correct: false,
    defenderPoints: -3,
    authorPoints: 0,
  });
});
test("competitive threshold controls wins, forfeits, draws and no contests", () => {
  assert.deepEqual(matchOutcome(["a", "b"], { a: 12, b: 0 }, { a: 4, b: 3 }), {
    result: "forfeit",
    winnerId: "a",
  });
  assert.deepEqual(matchOutcome(["a", "b"], { a: 12, b: 0 }, { a: 3, b: 3 }), {
    result: "no-contest",
    winnerId: null,
  });
  assert.deepEqual(matchOutcome(["a", "b"], { a: 12, b: 12 }, { a: 4, b: 4 }), {
    result: "draw",
    winnerId: null,
  });
  assert.deepEqual(matchOutcome(["a", "b"], { a: 12, b: 6 }, { a: 4, b: 4 }), {
    result: "win",
    winnerId: "a",
  });
});
test("approved fixtures validate, preserve the cue and contain no destinations", () => {
  for (const channel of channels)
    for (const templateId of ["ticket-drop", "parcel-update", "game-night"])
      for (const truth of [true, false]) {
        const c = fixtureContent(channel, templateId, truth);
        assert.equal(
          contentSchema.safeParse(c).success,
          true,
          `${channel}/${templateId}/${truth}`,
        );
        assert.equal(contentReview(c).valid, true);
        if (truth) assert.equal(scenarioConsistent(c, templateId), true);
      }
});
test("edits cannot introduce links, secrets or remove the teaching cue", () => {
  const c = fixtureContent("email", "ticket-drop", true);
  assert.equal(
    contentReview({ ...c, bodyText: "Visit https://evil.example to claim" })
      .valid,
    false,
  );
  assert.equal(
    contentReview({ ...c, smsText: "Please share your password" }).valid,
    false,
  );
  assert.equal(
    scenarioConsistent(
      { ...c, bodyText: "All is well and confirmed" },
      "ticket-drop",
    ),
    false,
  );
});
test("seed has eight fictional members and never establishes live contact verification", () => {
  const seed = createSeed(1000);
  assert.equal(seed.profiles.length, 8);
  assert.equal(seed.profiles.filter((p) => p.historical).length, 6);
  assert.equal(seed.members.find((m) => m.userId === "alex")?.accepted, false);
  assert.ok(
    seed.members.every((m) =>
      Object.values(m.consent.contacts).every(
        (c) => !c.verified && c.method === "demo",
      ),
    ),
  );
  assert.equal(seed.match.state, "drafting");
});
