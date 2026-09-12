import { RULES } from "./config";

// Minimal shape needed to score — works with either ObjectId or string ids as long
// as callers pass consistent string keys.
export interface ScorableCast {
  senderId: string;
  targetId: string;
  status: "sent" | "clicked" | "reported";
  points: number; // sender points (0 or 100)
  reportedBy?: string | null;
}

// Derive each player's weekly score from that week's casts.
// Offense: points from casts you sent that were clicked.
// Defense: +50 for each incoming lure you reported before it was clicked.
// No negatives; players never subtract from each other.
export function computeWeekScores(
  casts: ScorableCast[],
  playerIds: string[]
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of playerIds) scores[id] = 0;

  for (const c of casts) {
    // Offense credit to sender.
    if (c.points && scores[c.senderId] !== undefined) {
      scores[c.senderId] += c.points;
    }
    // Defense credit to reporter.
    if (c.status === "reported" && c.reportedBy && scores[c.reportedBy] !== undefined) {
      scores[c.reportedBy] += RULES.POINTS_REPORT;
    }
  }
  return scores;
}
