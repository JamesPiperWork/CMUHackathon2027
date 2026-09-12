export interface PlayerAttributes {
  hobbies: string[];
  sportsTeams: string[];
  hometown: string;
  employer: string;
}

export interface LeagueDoc {
  _id: string;
  name: string;
  season: number;
  joinCode: string;
  currentWeek: number;
  regularSeasonWeeks: number;
}

export interface PlayerDoc {
  _id: string;
  leagueId: string;
  name: string;
  email: string; // display-only in-app; nothing is ever sent externally
  attributes: PlayerAttributes;
  spearUsedThisSeason: boolean;
}

export type CastType = "cast" | "spear";
export type WeekSlot = 1 | 2 | "spear";
export type CastStatus = "sent" | "clicked" | "reported";

export interface CastDoc {
  _id: string;
  leagueId: string;
  week: number;
  senderId: string;
  targetId: string;
  type: CastType;
  weekSlot: WeekSlot;
  subject: string;
  body: string; // tracking URL already substituted
  trackingToken: string;
  status: CastStatus;
  points: number; // points this cast awards the SENDER (0 or 100)
  reportedBy: string | null; // defender who reported it (awards them +50)
  redFlags: string[];
  sentAt: string; // ISO
  resolvedAt: string | null; // ISO
}

export type MatchupStatus = "live" | "final";

export interface MatchupDoc {
  _id: string;
  leagueId: string;
  week: number;
  homeId: string;
  awayId: string;
  status: MatchupStatus;
  homeScore: number;
  awayScore: number;
  winnerId: string | null;
}
