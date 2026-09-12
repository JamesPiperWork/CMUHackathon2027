/**
 * Adapted from main's src/lib/schedule.ts at
 * 9901d38602d031864f5be8a99903e141473eed53 (circle method and round-robin checks).
 * Adds odd-roster byes and seeds the first round from already assigned matches.
 */
export type ScheduleRound = [number, number][];

export interface SchedulePairing {
  week: number;
  homeIndex: number;
  awayIndex: number;
}

/** Stored per league so a roster change starts a new, reproducible cycle. */
export interface ScheduleCycle {
  playerIds: string[];
  firstWeek: number;
  firstRound: [string, string][];
}

function requirePlayerCount(n: number) {
  if (!Number.isInteger(n) || n < 2 || n > 16)
    throw new Error("A round-robin needs between 2 and 16 players");
}

export function assertRoundRobin(
  rounds: ScheduleRound[],
  n: number,
): { ok: true; message: string } {
  requirePlayerCount(n);
  const expectedRounds = n % 2 ? n : n - 1;
  if (rounds.length !== expectedRounds)
    throw new Error(`Expected ${expectedRounds} rounds, got ${rounds.length}`);
  const opponents = Array.from({ length: n }, () => new Set<number>());
  const byes = Array<number>(n).fill(0);
  rounds.forEach((round, ri) => {
    if (round.length !== Math.floor(n / 2))
      throw new Error(`Round ${ri + 1} has an incorrect number of pairings`);
    const seen = new Set<number>();
    for (const [a, b] of round) {
      if (![a, b].every((p) => Number.isInteger(p) && p >= 0 && p < n) || a === b)
        throw new Error(`Round ${ri + 1} has an invalid player pairing`);
      if (seen.has(a) || seen.has(b))
        throw new Error(`Round ${ri + 1}: a player appears more than once`);
      if (opponents[a].has(b))
        throw new Error(`Round ${ri + 1}: opponents meet more than once`);
      seen.add(a);
      seen.add(b);
      opponents[a].add(b);
      opponents[b].add(a);
    }
    for (let p = 0; p < n; p++) if (!seen.has(p)) byes[p]++;
  });
  for (let p = 0; p < n; p++) {
    if (opponents[p].size !== n - 1)
      throw new Error(`Player ${p} does not face every other player`);
    if (byes[p] !== n % 2)
      throw new Error(`Player ${p} has an incorrect number of byes`);
  }
  return {
    ok: true,
    message: `round-robin OK: ${n} players, ${expectedRounds} unique rounds, ${n - 1} opponents per player${n % 2 ? " and one bye each" : ""}`,
  };
}

/**
 * Existing first-round pairs are fixed; remaining players pair in roster order.
 * Each stable-roster cycle visits every opponent once before repeating.
 */
export function buildSchedule(
  n: number,
  regularSeasonWeeks: number,
  assignedFirstRound: ScheduleRound = [],
): {
  pairings: SchedulePairing[];
  byes: { week: number; playerIndex: number }[];
  cycleLength: number;
  assertion: { ok: true; message: string };
} {
  requirePlayerCount(n);
  if (!Number.isInteger(regularSeasonWeeks) || regularSeasonWeeks < 1)
    throw new Error("The schedule must contain at least one whole week");
  const assigned = new Set<number>();
  for (const [a, b] of assignedFirstRound) {
    if (![a, b].every((p) => Number.isInteger(p) && p >= 0 && p < n) || a === b)
      throw new Error("An existing pairing has invalid players");
    if (assigned.has(a) || assigned.has(b))
      throw new Error("A player is assigned more than once in the first round");
    assigned.add(a);
    assigned.add(b);
  }
  const waiting = Array.from({ length: n }, (_, i) => i).filter((i) => !assigned.has(i));
  const firstRound: [number, number | null][] = assignedFirstRound.map(([a, b]) => [a, b]);
  for (let i = 0; i < waiting.length; i += 2)
    firstRound.push([waiting[i], waiting[i + 1] ?? null]);
  const seatCount = n + n % 2;
  const seats = Array<number | null>(seatCount).fill(null);
  firstRound.forEach(([a, b], i) => {
    seats[i] = a;
    seats[seatCount - 1 - i] = b;
  });
  const rounds: ScheduleRound[] = [];
  for (let r = 0; r < seatCount - 1; r++) {
    const round: ScheduleRound = [];
    for (let i = 0; i < seatCount / 2; i++) {
      const a = seats[i];
      const b = seats[seatCount - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    // Keep the first seat fixed and rotate the rest right by one.
    seats.splice(1, 0, seats.pop()!);
  }
  const assertion = assertRoundRobin(rounds, n);
  const pairings: SchedulePairing[] = [];
  const byes: { week: number; playerIndex: number }[] = [];
  for (let week = 1; week <= regularSeasonWeeks; week++) {
    const round = rounds[(week - 1) % rounds.length];
    for (const [homeIndex, awayIndex] of round)
      pairings.push({ week, homeIndex, awayIndex });
    if (n % 2) {
      const playing = new Set(round.flat());
      byes.push({ week, playerIndex: Array.from({ length: n }, (_, i) => i).find((i) => !playing.has(i))! });
    }
  }
  return { pairings, byes, cycleLength: rounds.length, assertion };
}
