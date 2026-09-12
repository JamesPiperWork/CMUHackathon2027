import test from "node:test";
import assert from "node:assert/strict";
import { assertRoundRobin, buildSchedule, type ScheduleRound } from "./schedule";

test("every supported roster meets each opponent exactly once, with fair odd-roster byes", () => {
  for (let n = 2; n <= 16; n++) {
    const cycleLength = n % 2 ? n : n - 1;
    const schedule = buildSchedule(n, cycleLength * 2);
    const opponents = Array.from({ length: n }, () => new Set<number>());
    const byes = Array<number>(n).fill(0);
    for (let week = 1; week <= cycleLength; week++) {
      const pairs = schedule.pairings.filter((p) => p.week === week);
      const players = pairs.flatMap((p) => [p.homeIndex, p.awayIndex]);
      assert.equal(pairs.length, Math.floor(n / 2), `${n} players, week ${week}`);
      assert.equal(new Set(players).size, pairs.length * 2);
      for (const pair of pairs) {
        assert.equal(opponents[pair.homeIndex].has(pair.awayIndex), false);
        opponents[pair.homeIndex].add(pair.awayIndex);
        opponents[pair.awayIndex].add(pair.homeIndex);
      }
      for (const bye of schedule.byes.filter((b) => b.week === week)) byes[bye.playerIndex]++;
      assert.deepEqual(
        schedule.pairings.filter((p) => p.week === week + cycleLength).map(({ homeIndex, awayIndex }) => [homeIndex, awayIndex]),
        pairs.map(({ homeIndex, awayIndex }) => [homeIndex, awayIndex]),
      );
    }
    assert.ok(opponents.every((p) => p.size === n - 1));
    assert.ok(byes.every((count) => count === n % 2));
    assert.deepEqual(buildSchedule(n, cycleLength * 2), schedule);
  }
});

test("seeded existing matches retain their opponents while the rest of the cycle stays valid", () => {
  for (const n of [5, 6, 15, 16]) {
    const initial: ScheduleRound = [[3, 1], [0, 4]];
    const result = buildSchedule(n, n, initial);
    assert.deepEqual(result.pairings.filter((p) => p.week === 1).slice(0, 2).map(({ homeIndex, awayIndex }) => [homeIndex, awayIndex]), initial);
    assert.equal(result.assertion.ok, true);
  }
  // A short season should not silently include extra rounds.
  const short = buildSchedule(8, 2);
  assert.equal(short.pairings.length, 8);
  assert.ok(short.pairings.every((p) => p.week <= 2));
});

test("schedule invariants reject invalid rosters, double assignments and repeated opponents", () => {
  for (const n of [0, 1, 2.5, 17, NaN]) assert.throws(() => buildSchedule(n, 1));
  for (const weeks of [0, -1, 1.5, NaN]) assert.throws(() => buildSchedule(4, weeks));
  assert.throws(() => buildSchedule(4, 3, [[0, 1], [1, 2]]), /more than once/);
  assert.throws(() => buildSchedule(4, 3, [[0, 0]]), /invalid/);
  assert.throws(() => buildSchedule(4, 3, [[0, 4]]), /invalid/);
  assert.throws(() => assertRoundRobin([[[0, 1], [2, 3]]], 4), /Expected/);
  assert.throws(() => assertRoundRobin([
    [[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 1], [2, 3]],
  ], 4), /more than once/);
  assert.throws(() => assertRoundRobin([
    [[0, 1], [0, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]],
  ], 4), /more than once/);
});
