import { z } from "zod";
export const channels = ["email", "sms", "voice"] as const;
export type Channel = (typeof channels)[number];
export const interests = [
  "Board games",
  "Live music",
  "Outdoor adventures",
] as const;
export type Interest = (typeof interests)[number];
export type DecisionChoice = "trust" | "flag";
export type MatchState =
  "drafting" | "active" | "resolving" | "completed" | "cancelled";
export type ContentSource = "fixture" | "gemini" | "fallback";
export type DeliveryStatus =
  | "queued"
  | "simulated"
  | "accepted"
  | "delivered"
  | "failed"
  | "unknown"
  | "cancelled"
  | "unanswered";
export type ChannelStatus = "simulated" | "blocked" | "ready" | "error";
export const contentSchema = z
  .object({
    subject: z.string().min(3).max(100),
    senderDisplayName: z.string().min(2).max(60),
    bodyText: z.string().min(20).max(700),
    smsText: z.string().min(15).max(300),
    voiceScript: z.string().min(40).max(440),
    cueAnnotations: z.array(z.string().min(5).max(200)).min(1).max(3),
    explanation: z.string().min(15).max(500),
  })
  .strict();
export type ApprovedContent = z.infer<typeof contentSchema>;
export interface Profile {
  id: string;
  name: string;
  initials: string;
  color: string;
  interests: Interest[];
  historical: boolean;
  leaguePoints: number;
  wins: number;
  losses: number;
  draws: number;
}
export interface Consent {
  version: string;
  acceptedAt: number | null;
  adult: boolean;
  channels: Record<Channel, boolean>;
  paused: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  familyFriendly: boolean;
  excludedThemes: string[];
  contacts: Partial<
    Record<
      Channel,
      {
        destination: string;
        verified: boolean;
        method: "demo" | "auth0" | "operator" | "verify";
        verifiedAt?: number;
        evidence?: string;
      }
    >
  >;
}
export interface Member {
  userId: string;
  leagueId: string;
  accepted: boolean;
  consent: Consent;
  auth0Sub?: string;
}
export interface Scenario {
  id: string;
  matchId: string;
  recipientId: string;
  authorId: string | null;
  channel: Channel;
  templateId: string;
  interest: Interest;
  content: ApprovedContent;
  isPhishing: boolean;
  locked: boolean;
  source: ContentSource;
  model: string;
  promptVersion: string;
  generationAttempts: number;
  generationStatus: "idle" | "pending" | "complete" | "fallback" | "failed";
  generationReason?: string;
  tokenHash: string;
  tokenExpiresAt: number;
  encryptedToken?: string;
  actionUrl?: string;
  releasedAt: number | null;
  deliveryStatus: DeliveryStatus;
  order: number;
}
export interface Decision {
  id: string;
  scenarioId: string;
  recipientId: string;
  choice: DecisionChoice;
  correct: boolean;
  defenderPoints: number;
  authorPoints: number;
  createdAt: number;
}
export interface ScoreEvent {
  id: string;
  sourceId: string;
  userId: string;
  type: "defense" | "author";
  points: number;
}
export interface Job {
  id: string;
  type: "delivery" | "generation";
  scenarioId: string;
  dueAt: number;
  status: "queued" | "leased" | "complete" | "cancelled" | "failed" | "unknown";
  leaseExpiresAt: number | null;
  attempts: number;
  idempotencyKey: string;
}
export interface DeliveryAttempt {
  id: string;
  scenarioId: string;
  recipientId: string;
  channel: Channel;
  provider: "simulator" | "twilio" | "smtp";
  status: DeliveryStatus;
  providerId?: string;
  createdAt: number;
  updatedAt: number;
  reason?: string;
  callbackIds: string[];
}
export interface Match {
  id: string;
  leagueId: string;
  players: string[];
  state: MatchState;
  seed: number;
  deadline: number;
  startedAt: number | null;
  completedAt: number | null;
  scores: Record<string, number>;
  result: null | "win" | "draw" | "forfeit" | "no-contest" | "incomplete";
  winnerId: string | null;
  standingsApplied: boolean;
  standingsBefore: Record<string, number>;
  incompleteReason?: string;
}
export interface Session {
  mode?: "demo" | "live";
  tokenHash: string;
  userId: string;
  role: "player" | "operator";
  expiresAt: number;
  csrf: string;
}
export interface Database {
  version: 1;
  revision: number;
  clockOffset: number;
  profiles: Profile[];
  members: Member[];
  match: Match;
  scenarios: Scenario[];
  decisions: Decision[];
  scoreEvents: ScoreEvent[];
  jobs: Job[];
  attempts: DeliveryAttempt[];
  sessions: Session[];
  callbackIds: string[];
}
export interface ScenarioPublic {
  id: string;
  channel: Channel;
  content: Pick<
    ApprovedContent,
    "subject" | "senderDisplayName" | "bodyText" | "smsText" | "voiceScript"
  >;
  deliveryStatus: DeliveryStatus;
  releasedAt: number | null;
  inspection: {
    sender: string;
    destination: string;
  };
  actionUrl?: string;
  decision?: Decision;
  reveal?: {
    isPhishing: boolean;
    explanation: string;
    cueAnnotations: string[];
    authorName: string | null;
  };
}
export interface DraftPublic {
  id: string;
  channel: Channel;
  templateId: string;
  interest: Interest;
  content: ApprovedContent;
  locked: boolean;
  source: ContentSource;
  generationAttempts: number;
  generationStatus: Scenario["generationStatus"];
  generationReason?: string;
  deliveryStatus: DeliveryStatus;
}
export interface ReadinessCondition {
  name: string;
  ok: boolean;
  detail: string;
}
export interface Readiness {
  channel: Channel;
  status: ChannelStatus;
  reason: string;
  conditions: ReadinessCondition[];
}
export interface Recap {
  detectedPhish: number;
  correctTrust: number;
  falseAlarms: number;
  tookBait: number;
  authorSuccess: number;
  decisions: number;
  score: number;
  strength: string;
  tip: string;
}
export interface PlayerState {
  mode: "demo" | "live";
  revision: number;
  now: number;
  me: Profile;
  opponent: Profile;
  consent: Consent;
  match: Omit<Match, "seed">;
  league: {
    id: string;
    name: string;
    members: (Profile & {
      rank: number;
      movement: number;
    })[];
  };
  drafts: DraftPublic[];
  incoming: ScenarioPublic[];
  remaining: number;
  draftProgress: {
    mine: number;
    opponent: number;
  };
  recap: Recap | null;
  readiness: Readiness[];
  activityCard: {
    order: string;
    event: string;
    voice: string;
  };
  role: "player" | "operator";
}
export interface GenerateRequest {
  recipientMemberId: string;
  channel: Channel;
  interest: Interest;
  templateId: string;
}
export const generateSchema = z
  .object({
    recipientMemberId: z.string(),
    channel: z.enum(channels),
    interest: z.enum(interests),
    templateId: z.enum(["ticket-drop", "parcel-update", "game-night"]),
  })
  .strict();
export const decisionSchema = z
  .object({ choice: z.enum(["trust", "flag"]) })
  .strict();
export function scoreDecision(
  isPhishing: boolean,
  choice: DecisionChoice,
  humanAuthor: boolean,
) {
  const correct = isPhishing ? choice === "flag" : choice === "trust";
  return {
    correct,
    defenderPoints: correct ? 3 : -3,
    authorPoints: !correct && isPhishing && humanAuthor ? 2 : 0,
  };
}
export function matchOutcome(
  players: string[],
  scores: Record<string, number>,
  counts: Record<string, number>,
) {
  const qualified = players.filter((id) => (counts[id] ?? 0) >= 4);
  if (!qualified.length)
    return { result: "no-contest" as const, winnerId: null };
  if (qualified.length === 1)
    return { result: "forfeit" as const, winnerId: qualified[0] };
  if (scores[players[0]] === scores[players[1]])
    return { result: "draw" as const, winnerId: null };
  return {
    result: "win" as const,
    winnerId: players.reduce((a, b) => (scores[a] > scores[b] ? a : b)),
  };
}
export function computeRecap(db: Database, userId: string): Recap {
  const ds = db.decisions.filter((d) => d.recipientId === userId);
  const detectedPhish = ds.filter(
    (d) => d.choice === "flag" && d.correct,
  ).length;
  const correctTrust = ds.filter(
    (d) => d.choice === "trust" && d.correct,
  ).length;
  const falseAlarms = ds.filter(
    (d) => d.choice === "flag" && !d.correct,
  ).length;
  const tookBait = ds.filter((d) => d.choice === "trust" && !d.correct).length;
  const authorSuccess = db.scoreEvents.filter(
    (e) => e.userId === userId && e.type === "author" && e.points > 0,
  ).length;
  return {
    detectedPhish,
    correctTrust,
    falseAlarms,
    tookBait,
    authorSuccess,
    decisions: ds.length,
    score: db.match.scores[userId] ?? 0,
    strength:
      detectedPhish > 0
        ? `You spotted ${detectedPhish} phishing ${detectedPhish === 1 ? "challenge" : "challenges"}.`
        : correctTrust > 0
          ? `You correctly trusted ${correctTrust} expected ${correctTrust === 1 ? "message" : "messages"}.`
          : "You made time to practice.",
    tip:
      falseAlarms > 0
        ? "Check the activity card before flagging an expected message."
        : tookBait > 0
          ? "Unexpected urgency? Compare the claim with your activity card."
          : "Keep checking the context, even when the sender sounds familiar.",
  };
}
export interface DeliveryEnvelope {
  attemptId: string;
  scenarioId: string;
  recipientId: string;
  channel: Channel;
  destination: string;
  content: ApprovedContent;
  actionUrl: string;
  audioUrl?: string;
}
export interface DeliveryResult {
  status: "simulated" | "accepted" | "failed" | "unknown";
  providerId?: string;
  reason?: string;
}
export interface DeliveryAdapter {
  send(envelope: DeliveryEnvelope): Promise<DeliveryResult>;
}
export interface GenerationInput {
  channel: Channel;
  interest: Interest;
  templateId: string;
  fixture: ApprovedContent;
}
export interface GenerationResult {
  content: ApprovedContent;
  source: ContentSource;
  model: string;
  promptVersion: string;
  reason?: string;
}
export const activityCard = {
  order:
    "Mooncrate order MC-204: a board-game expansion. Delivery Saturday; no extra fee.",
  event:
    "Juniper Sessions: two Friday tickets, booking JS-118. Already confirmed; no upgrade requested.",
  voice:
    "Trail Club: you requested a Saturday walk reminder. Meet at the north gate at 10:30.",
};
