// Round-robin scheduling via the circle method.
// Produces a full single round-robin (n-1 unique rounds) for n players, then the
// season replays rounds 1..3 as weeks 8..10. Week 1's first matchup is forced to be
// player index 0 vs player index 1 (Alice vs Bob) by seat assignment.

export interface SchedulePairing {
  week: number;
  homeIndex: number; // index into the players array
  awayIndex: number;
}

// Circle method over seat indices 0..n-1. Returns n-1 rounds, each n/2 pairs of seats.
function circleMethod(n: number): [number, number][][] {
  if (n % 2 !== 0) throw new Error("circleMethod requires an even number of players");
  const rounds: [number, number][][] = [];
  const seats = Array.from({ length: n }, (_, i) => i);
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([seats[i], seats[n - 1 - i]]);
    }
    rounds.push(pairs);
    // Rotate all seats except the first (classic circle rotation).
    const fixed = seats[0];
    const rest = seats.slice(1);
    rest.unshift(rest.pop() as number); // rotate right by one
    seats.splice(0, seats.length, fixed, ...rest);
  }
  return rounds;
}

// Assert the circle-method output is a valid round-robin. Throws on failure.
export function assertRoundRobin(
  rounds: [number, number][][],
  n: number
): { ok: true; message: string } {
  const expectedRounds = n - 1;
  if (rounds.length !== expectedRounds) {
    throw new Error(`Expected ${expectedRounds} rounds, got ${rounds.length}`);
  }
  const opponents: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  rounds.forEach((round, ri) => {
    const seen = new Set<number>();
    if (round.length !== n / 2) {
      throw new Error(`Round ${ri + 1} has ${round.length} pairings, expected ${n / 2}`);
    }
    for (const [a, b] of round) {
      if (seen.has(a) || seen.has(b)) {
        throw new Error(`Round ${ri + 1}: a player appears more than once`);
      }
      seen.add(a);
      seen.add(b);
      opponents[a].add(b);
      opponents[b].add(a);
    }
    if (seen.size !== n) {
      throw new Error(`Round ${ri + 1}: not every player appears exactly once`);
    }
  });
  for (let p = 0; p < n; p++) {
    if (opponents[p].size !== n - 1) {
      throw new Error(`Player ${p} has ${opponents[p].size} distinct opponents, expected ${n - 1}`);
    }
  }
  return {
    ok: true,
    message: `round-robin OK: ${n} players, ${expectedRounds} unique rounds, each player once per week & ${n - 1} distinct opponents`,
  };
}

// Build the 10-week schedule as index pairings.
// Seat->player mapping forces the round-1 first matchup to be players[0] vs players[1].
export function buildSchedule(
  n: number,
  regularSeasonWeeks: number
): { pairings: SchedulePairing[]; assertion: { ok: true; message: string } } {
  const rounds = circleMethod(n);
  const assertion = assertRoundRobin(rounds, n);

  // Round 0's first pair is seats [0, n-1]. Put Alice (player 0) on seat 0 and
  // Bob (player 1) on seat n-1; distribute the rest to the remaining seats in order.
  const seatToPlayer = new Array<number>(n);
  seatToPlayer[0] = 0; // Alice
  seatToPlayer[n - 1] = 1; // Bob
  let nextPlayer = 2;
  for (let seat = 1; seat < n - 1; seat++) {
    seatToPlayer[seat] = nextPlayer++;
  }

  const pairings: SchedulePairing[] = [];
  // Weeks 1..(n-1): the unique rounds.
  rounds.forEach((round, ri) => {
    const week = ri + 1;
    for (const [seatA, seatB] of round) {
      pairings.push({ week, homeIndex: seatToPlayer[seatA], awayIndex: seatToPlayer[seatB] });
    }
  });
  // Weeks n..regularSeasonWeeks: replay rounds 0,1,2,...
  for (let week = n; week <= regularSeasonWeeks; week++) {
    const round = rounds[(week - n) % rounds.length];
    for (const [seatA, seatB] of round) {
      pairings.push({ week, homeIndex: seatToPlayer[seatA], awayIndex: seatToPlayer[seatB] });
    }
  }

  return { pairings, assertion };
}
