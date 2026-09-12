import { getStore, resetStore, newId } from "./store";
import { buildSchedule } from "./schedule";
import { RULES, DEMO_LEAGUE_NAME } from "./config";
import type { LeagueDoc, PlayerDoc, MatchupDoc, PlayerAttributes } from "./types";

// 8 players. Index 0 = Alice, Index 1 = Bob (forced Week-1 opponents).
// Email addresses are display-only; nothing is ever sent outside the app.
export const SEED_PLAYERS: { name: string; email: string; attributes: PlayerAttributes }[] = [
  { name: "Alice", email: "alice@demo.test", attributes: { hobbies: ["trail running", "sourdough baking"], sportsTeams: ["Golden State Warriors"], hometown: "Portland, OR", employer: "Northwind Labs" } },
  { name: "Bob", email: "bob@demo.test", attributes: { hobbies: ["mountain biking", "craft beer"], sportsTeams: ["Seattle Seahawks"], hometown: "Seattle, WA", employer: "Cascade Systems" } },
  { name: "Carol", email: "carol@demo.test", attributes: { hobbies: ["photography", "yoga"], sportsTeams: ["Chicago Bulls"], hometown: "Chicago, IL", employer: "Lakeshore Media" } },
  { name: "Dave", email: "dave@demo.test", attributes: { hobbies: ["fantasy football", "grilling"], sportsTeams: ["Dallas Cowboys"], hometown: "Austin, TX", employer: "Lone Star Fintech" } },
  { name: "Erin", email: "erin@demo.test", attributes: { hobbies: ["rock climbing", "podcasts"], sportsTeams: ["Boston Celtics"], hometown: "Boston, MA", employer: "Charles River Bio" } },
  { name: "Frank", email: "frank@demo.test", attributes: { hobbies: ["golf", "wine tasting"], sportsTeams: ["New York Yankees"], hometown: "Brooklyn, NY", employer: "Empire Consulting" } },
  { name: "Grace", email: "grace@demo.test", attributes: { hobbies: ["gardening", "board games"], sportsTeams: ["Atlanta Braves"], hometown: "Atlanta, GA", employer: "Peachtree Health" } },
  { name: "Heidi", email: "heidi@demo.test", attributes: { hobbies: ["surfing", "vinyl records"], sportsTeams: ["LA Dodgers"], hometown: "San Diego, CA", employer: "Pacific Design Co" } },
];

export interface SeedResult {
  league: LeagueDoc;
  players: PlayerDoc[];
  matchupCount: number;
  assertion: string;
  week1AliceVsBob: boolean;
}

// Idempotent: wipes and rebuilds the Demo League identically every time.
export function seedLeague(): SeedResult {
  const store = resetStore();

  const league: LeagueDoc = {
    _id: newId(),
    name: DEMO_LEAGUE_NAME,
    season: 1,
    joinCode: "DEMO24",
    currentWeek: 1,
    regularSeasonWeeks: RULES.REGULAR_SEASON_WEEKS,
  };
  store.leagues.push(league);

  const players: PlayerDoc[] = SEED_PLAYERS.map((p) => ({
    _id: newId(),
    leagueId: league._id,
    name: p.name,
    email: p.email,
    attributes: p.attributes,
    spearUsedThisSeason: false,
  }));
  store.players.push(...players);

  // Build + assert the round-robin schedule (guards the circle-method off-by-one).
  const { pairings, assertion } = buildSchedule(RULES.LEAGUE_SIZE, RULES.REGULAR_SEASON_WEEKS);
  console.log(`[seed] ${assertion.message}`);

  const matchups: MatchupDoc[] = pairings.map((pr) => ({
    _id: newId(),
    leagueId: league._id,
    week: pr.week,
    homeId: players[pr.homeIndex]._id,
    awayId: players[pr.awayIndex]._id,
    status: "live",
    homeScore: 0,
    awayScore: 0,
    winnerId: null,
  }));
  store.matchups.push(...matchups);

  const week1AliceVsBob = matchups.some(
    (m) =>
      m.week === 1 &&
      ((m.homeId === players[0]._id && m.awayId === players[1]._id) ||
        (m.homeId === players[1]._id && m.awayId === players[0]._id))
  );
  console.log(`[seed] Week-1 Alice vs Bob present: ${week1AliceVsBob}`);

  return { league, players, matchupCount: matchups.length, assertion: assertion.message, week1AliceVsBob };
}

// Auto-seed on first touch so a fresh Vercel instance (or fresh dev server) always has
// a league. POST /api/seed still exists to reset explicitly.
export function ensureSeeded(): void {
  if (getStore().leagues.length === 0) seedLeague();
}
