import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  activityCard,
  channels,
  computeRecap,
  contentSchema,
  createSeed,
  fixtureContent,
  contentReview,
  scenarioConsistent,
  matchOutcome,
  scoreDecision,
  type ApprovedContent,
  type Channel,
  type Database,
  type Decision,
  type DecisionChoice,
  type GenerateRequest,
  type GenerationResult,
  type Job,
  type PlayerState,
  type Scenario,
  type Session,
} from "@fp/shared";
import type { Config } from "./config.js";
import type { Repository } from "./repository.js";
import { dispatch, generateContent, getReadiness } from "./providers.js";
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const templates: Record<Channel, string> = {
  email: "parcel-update",
  sms: "ticket-drop",
  voice: "game-night",
};
export class GameService {
  onChange: () => void = () => undefined;
  private ticking = false;
  constructor(
    public repo: Repository,
    public config: Config,
  ) {}
  now(db: Database) {
    return Date.now() + db.clockOffset;
  }
  readDb() {
    return this.repo.read();
  }
  private tokenKey() {
    const secret =
      process.env.TOKEN_SECRET ||
      (this.config.mode === "demo"
        ? "fictional-local-demo-token-key-only"
        : "");
    if (secret.length < 32)
      throw new ApiError(503, "Strong TOKEN_SECRET required");
    return createHash("sha256").update(secret).digest();
  }
  private encryptToken(token: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.tokenKey(), iv);
    const bytes = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
      "base64url",
    );
  }
  actionUrl(scenario: Scenario) {
    if (!scenario.encryptedToken)
      throw new ApiError(410, "Challenge token unavailable; reset the demo");
    const bytes = Buffer.from(scenario.encryptedToken, "base64url"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        this.tokenKey(),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const token = Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return `${this.config.apiOrigin}/r/${token}`;
  }
  private providerEnv() {
    return {
      ...process.env,
      APP_MODE: this.config.mode,
      API_ORIGIN: this.config.apiOrigin,
      APP_ORIGIN: this.config.appOrigin,
      MONGODB_URI: this.config.mongodbUri,
    };
  }
  private readiness(db: Database, userId: string) {
    return getReadiness(db, userId, this.now(db), this.providerEnv());
  }
  async transact<T>(change: (db: Database) => T | Promise<T>) {
    const result = await this.repo.transact(change);
    this.onChange();
    return result;
  }
  async createSession(userId: string, role: "player" | "operator" = "player") {
    if (this.config.mode === "live" && role === "operator")
      throw new ApiError(
        403,
        "Demo operator sessions are disabled in live mode",
      );
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(24).toString("base64url");
    await this.transact((db) => {
      if (!db.members.some((m) => m.userId === userId))
        throw new ApiError(403, "Membership required");
      db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
      db.sessions.push({
        mode: this.config.mode,
        tokenHash: hash(token),
        userId,
        role,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        csrf,
      });
    });
    return { token, csrf };
  }
  async sessionForToken(token: string) {
    const db = await this.readDb();
    return (
      db.sessions.find(
        (s) =>
          s.tokenHash === hash(token) &&
          s.expiresAt > Date.now() &&
          (s.mode ?? "demo") === this.config.mode &&
          (this.config.mode === "demo" || s.role === "player"),
      ) ?? null
    );
  }
  async ensureLiveMember(identity: {
    sub: string;
    email?: string;
    emailVerified?: boolean;
  }) {
    const snapshot = await this.readDb();
    const member = snapshot.members.find((m) => m.auth0Sub === identity.sub);
    if (!member)
      throw new ApiError(
        403,
        "An operator must invite this verified Auth0 identity to the private league",
      );
    const email = member.consent.contacts.email;
    if (
      identity.emailVerified &&
      identity.email &&
      email?.destination.toLowerCase() === identity.email.toLowerCase() &&
      (!email.verified || email.method !== "auth0")
    ) {
      await this.transact((db) => {
        const current = db.members.find((m) => m.auth0Sub === identity.sub);
        if (
          current?.consent.contacts.email?.destination.toLowerCase() ===
          identity.email!.toLowerCase()
        )
          current.consent.contacts.email = {
            destination: identity.email!,
            verified: true,
            method: "auth0",
            verifiedAt: Date.now(),
          };
      });
    }
    return member.userId;
  }
  private localContactParts(timestamp: number, timezone: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(timestamp)
        .map((p) => [p.type, p.value]),
    );
    return {
      day: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
    };
  }
  private nextContactTime(
    db: Database,
    userId: string,
    earliest: number,
    previous?: number,
  ) {
    const consent = this.member(db, userId).consent;
    const previousDay = previous
      ? this.localContactParts(previous, consent.timezone).day
      : null;
    for (
      let candidate = earliest;
      candidate < earliest + 4 * 86400000;
      candidate += 60000
    ) {
      const local = this.localContactParts(candidate, consent.timezone);
      if (
        local.day !== previousDay &&
        local.hour >= consent.startHour &&
        local.hour < consent.endHour
      )
        return candidate;
    }
    throw new ApiError(
      409,
      "No eligible recipient contact window could be scheduled",
    );
  }
  private member(db: Database, userId: string) {
    const member = db.members.find(
      (m) => m.userId === userId && m.leagueId === db.match.leagueId,
    );
    if (!member || !db.match.players.includes(userId))
      throw new ApiError(403, "Active private-league membership required");
    return member;
  }
  private editable(db: Database) {
    if (db.match.state !== "drafting")
      throw new ApiError(409, "Drafting has closed");
  }
  private exclusionReason(
    db: Database,
    recipientId: string,
    templateId: string,
    content: ApprovedContent,
  ) {
    const tags =
      templateId === "ticket-drop"
        ? ["ticket", "music", "concert", "event", "upgrade"]
        : templateId === "parcel-update"
          ? ["parcel", "deliver", "package", "order", "shopping", "board game"]
          : [
              "walk",
              "trail",
              "outdoor",
              "adventure",
              "hiking",
              "guest list",
              "game night",
            ];
    const visible = [
      content.subject,
      content.senderDisplayName,
      content.bodyText,
      content.smsText,
      content.voiceScript,
    ]
      .join(" ")
      .toLowerCase();
    return this.member(db, recipientId).consent.excludedThemes.find((theme) => {
      const excluded = theme.toLowerCase().trim();
      return (
        excluded.length > 0 &&
        (visible.includes(excluded) ||
          tags.some((tag) => excluded.includes(tag)))
      );
    });
  }
  private enforceExclusions(
    db: Database,
    recipientId: string,
    templateId: string,
    content: ApprovedContent,
  ) {
    const excluded = this.exclusionReason(db, recipientId, templateId, content);
    if (excluded)
      throw new ApiError(
        409,
        `This story overlaps the recipient's excluded theme: ${excluded}. Choose another approved scenario.`,
      );
  }
  private platformContent(
    db: Database,
    recipientId: string,
    channel: Channel,
    isPhishing: boolean,
  ) {
    const alternatives = [
      templates[channel],
      ...Object.values(templates).filter((id) => id !== templates[channel]),
    ];
    for (const templateId of alternatives) {
      const fixtureChannel = (Object.entries(templates).find(
        ([, id]) => id === templateId,
      )?.[0] ?? channel) as Channel;
      const content = fixtureContent(
        isPhishing ? channel : fixtureChannel,
        templateId,
        isPhishing,
      );
      if (!this.exclusionReason(db, recipientId, templateId, content))
        return { templateId, content };
    }
    throw new ApiError(
      409,
      "No curated scenario fits the recipient’s excluded themes. Review those preferences together before starting.",
    );
  }
  private scenario(
    db: Database,
    recipientId: string,
    channel: Channel,
    isPhishing: boolean,
    authorId: string | null,
    templateId = templates[channel],
  ) {
    const token = randomBytes(32).toString("base64url");
    const interest = db.profiles.find((p) => p.id === recipientId)!
      .interests[0];
    const content = fixtureContent(channel, templateId, isPhishing);
    const value: Scenario = {
      id: randomUUID(),
      matchId: db.match.id,
      recipientId,
      authorId,
      channel,
      templateId,
      interest,
      content,
      isPhishing,
      locked: !authorId,
      source: "fixture",
      model: "reviewed-fixture",
      promptVersion: "v1",
      generationAttempts: 0,
      generationStatus: "complete",
      tokenHash: hash(token),
      tokenExpiresAt: this.now(db) + 7 * 86400000,
      encryptedToken: this.encryptToken(token),
      releasedAt: null,
      deliveryStatus: "queued",
      order: 0,
    };
    db.scenarios.push(value);
    return value;
  }
  async state(session: Session): Promise<PlayerState> {
    const db = await this.readDb();
    const userId = session.userId;
    const member = this.member(db, userId);
    const me = db.profiles.find((p) => p.id === userId)!;
    const opponent = db.profiles.find(
      (p) => p.id === db.match.players.find((p) => p !== userId),
    )!;
    const { seed: _privateSeed, ...publicMatch } = db.match;
    const sorted = [...db.profiles].sort(
      (a, b) => b.leaguePoints - a.leaguePoints || a.name.localeCompare(b.name),
    );
    return {
      mode: this.config.mode,
      revision: db.revision,
      now: this.now(db),
      me,
      opponent,
      consent: member.consent,
      match: publicMatch,
      league: {
        id: db.match.leagueId,
        name: "The Usual Suspects",
        members: sorted.map((p, i) => ({
          ...p,
          rank: i + 1,
          movement: (db.match.standingsBefore[p.id] ?? i + 1) - (i + 1),
        })),
      },
      drafts: db.scenarios
        .filter((s) => s.authorId === userId)
        .map((s) => ({
          id: s.id,
          channel: s.channel,
          templateId: s.templateId,
          interest: s.interest,
          content: s.content,
          locked: s.locked,
          source: s.source,
          generationAttempts: s.generationAttempts,
          generationStatus: s.generationStatus,
          generationReason: s.generationReason,
          deliveryStatus: s.deliveryStatus,
        })),
      incoming: db.scenarios
        .filter((s) => s.recipientId === userId && s.releasedAt !== null)
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const decision = db.decisions.find(
            (d) => d.scenarioId === s.id && d.recipientId === userId,
          );
          const { subject, senderDisplayName, bodyText, smsText, voiceScript } =
            s.content;
          return {
            id: s.id,
            channel: s.channel,
            content: {
              subject,
              senderDisplayName,
              bodyText,
              smsText,
              voiceScript,
            },
            deliveryStatus: s.deliveryStatus,
            releasedAt: s.releasedAt,
            inspection: {
              sender:
                s.channel === "email"
                  ? `${senderDisplayName} · league-controlled fictional sender`
                  : senderDisplayName,
              destination: new URL(this.config.apiOrigin).host,
            },
            actionUrl: this.actionUrl(s),
            ...(decision
              ? {
                  decision,
                  reveal: {
                    isPhishing: s.isPhishing,
                    explanation: s.content.explanation,
                    cueAnnotations: s.content.cueAnnotations,
                    authorName: s.authorId
                      ? (db.profiles.find((p) => p.id === s.authorId)?.name ??
                        null)
                      : null,
                  },
                }
              : {}),
          };
        }),
      remaining:
        6 - db.decisions.filter((d) => d.recipientId === userId).length,
      draftProgress: {
        mine: db.scenarios.filter((s) => s.authorId === userId && s.locked)
          .length,
        opponent: db.scenarios.filter(
          (s) => s.authorId === opponent.id && s.locked,
        ).length,
      },
      recap: db.match.state === "completed" ? computeRecap(db, userId) : null,
      readiness: this.readiness(db, userId),
      activityCard,
      role: session.role,
    };
  }
  async consent(
    userId: string,
    input: {
      adult: boolean;
      channels: Record<Channel, boolean>;
      timezone: string;
      startHour: number;
      endHour: number;
      familyFriendly: boolean;
      interests?: string[];
      displayName?: string;
      excludedThemes?: string[];
    },
  ) {
    if (input.adult !== true) throw new ApiError(400, "Only adults may join");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format();
    } catch {
      throw new ApiError(400, "Select a valid timezone");
    }
    if (
      input.startHour < 0 ||
      input.endHour > 24 ||
      input.startHour >= input.endHour
    )
      throw new ApiError(
        400,
        "Contact window must have a start before its end",
      );
    await this.transact((db) => {
      const member = this.member(db, userId);
      member.accepted = true;
      member.consent = {
        ...member.consent,
        version: "2026-09-v1",
        acceptedAt: this.now(db),
        adult: true,
        channels: input.channels,
        timezone: input.timezone,
        startHour: input.startHour,
        endHour: input.endHour,
        familyFriendly: input.familyFriendly,
        excludedThemes: input.excludedThemes ?? [],
      };
      const profile = db.profiles.find((p) => p.id === userId)!;
      if (input.displayName) profile.name = input.displayName.trim();
      if (input.interests)
        profile.interests = input.interests as typeof profile.interests;
      for (const job of db.jobs.filter(
        (j) => j.type === "delivery" && ["queued", "leased"].includes(j.status),
      )) {
        const scenario = db.scenarios.find((s) => s.id === job.scenarioId)!;
        if (
          scenario.recipientId === userId &&
          (!input.channels[scenario.channel] ||
            this.exclusionReason(
              db,
              userId,
              scenario.templateId,
              scenario.content,
            ))
        ) {
          if (job.status === "queued") job.status = "cancelled";
          scenario.deliveryStatus = "cancelled";
        }
      }
    });
  }
  async pauseUser(userId: string) {
    return this.setPaused(userId, true);
  }
  async setPaused(userId: string, paused: boolean) {
    await this.transact((db) => {
      const member = db.members.find((m) => m.userId === userId);
      if (!member) throw new ApiError(404, "Membership not found");
      member.consent.paused = paused;
      if (paused)
        for (const job of db.jobs.filter(
          (j) => j.type === "delivery" && j.status === "queued",
        )) {
          const scenario = db.scenarios.find((s) => s.id === job.scenarioId)!;
          if (scenario.recipientId === userId) {
            job.status = "cancelled";
            scenario.deliveryStatus = "cancelled";
          }
        }
    });
  }
  async generate(userId: string, input: GenerateRequest) {
    return this.transact((db) => {
      this.editable(db);
      const author = this.member(db, userId),
        recipient = this.member(db, input.recipientMemberId);
      if (userId === recipient.userId)
        throw new ApiError(400, "Choose your opponent");
      if (!author.accepted || !recipient.accepted)
        throw new ApiError(409, "Both players must personally accept first");
      if (!recipient.consent.channels[input.channel])
        throw new ApiError(409, "Recipient has not enabled this channel");
      if (
        !db.profiles
          .find((p) => p.id === recipient.userId)!
          .interests.includes(input.interest)
      )
        throw new ApiError(400, "Select a recipient-approved interest");
      this.enforceExclusions(
        db,
        recipient.userId,
        input.templateId,
        fixtureContent(input.channel, input.templateId, true),
      );
      let scenario = db.scenarios.find(
        (s) => s.authorId === userId && s.channel === input.channel,
      );
      if (!scenario)
        scenario = this.scenario(
          db,
          recipient.userId,
          input.channel,
          true,
          userId,
          input.templateId,
        );
      if (scenario.locked) throw new ApiError(409, "This draft is locked");
      if (scenario.generationStatus === "pending")
        throw new ApiError(409, "Generation is already queued");
      if (scenario.generationAttempts >= 3)
        throw new ApiError(
          429,
          "Three generation attempts used for this draft",
        );
      scenario.interest = input.interest;
      scenario.templateId = input.templateId;
      scenario.generationAttempts++;
      scenario.generationStatus = "pending";
      db.jobs.push({
        id: randomUUID(),
        type: "generation",
        scenarioId: scenario.id,
        dueAt: this.now(db),
        status: "queued",
        leaseExpiresAt: null,
        attempts: 0,
        idempotencyKey: `generation:${scenario.id}:${scenario.generationAttempts}`,
      });
      return { scenarioId: scenario.id, queued: true };
    });
  }
  async editDraft(
    userId: string,
    id: string,
    input: Partial<
      Pick<ApprovedContent, "subject" | "bodyText" | "smsText" | "voiceScript">
    >,
  ) {
    await this.transact((db) => {
      this.editable(db);
      const draft = db.scenarios.find(
        (s) => s.id === id && s.authorId === userId,
      );
      if (!draft) throw new ApiError(404, "Draft not found");
      if (draft.locked || draft.generationStatus === "pending")
        throw new ApiError(409, "Draft cannot be changed now");
      const content = contentSchema.parse({ ...draft.content, ...input });
      const review = contentReview(content);
      if (!review.valid || !scenarioConsistent(content, draft.templateId))
        throw new ApiError(
          400,
          review.reason ?? "Keep the approved scenario and learning cue intact",
        );
      this.enforceExclusions(db, draft.recipientId, draft.templateId, content);
      draft.content = content;
    });
  }
  async lock(userId: string, id: string) {
    await this.transact((db) => {
      this.editable(db);
      const draft = db.scenarios.find(
        (s) => s.id === id && s.authorId === userId,
      );
      if (!draft) throw new ApiError(404, "Draft not found");
      if (draft.generationStatus === "pending")
        throw new ApiError(409, "Wait for generation to finish");
      const review = contentReview(draft.content);
      if (!review.valid || !scenarioConsistent(draft.content, draft.templateId))
        throw new ApiError(400, review.reason ?? "Content review failed");
      this.enforceExclusions(
        db,
        draft.recipientId,
        draft.templateId,
        draft.content,
      );
      draft.locked = true;
    });
  }
  async activate(userId: string) {
    await this.transact((db) => {
      this.member(db, userId);
      if (db.match.state === "active") return;
      this.editable(db);
      if (
        !db.match.players.every((id) => {
          const m = this.member(db, id);
          return m.accepted && m.consent.adult && m.consent.acceptedAt !== null;
        })
      )
        throw new ApiError(
          409,
          "Both players must personally enroll before activation",
        );
      if (db.scenarios.some((s) => !s.locked))
        throw new ApiError(409, "Lock all authored drafts before activation");
      for (const scenario of db.scenarios)
        this.enforceExclusions(
          db,
          scenario.recipientId,
          scenario.templateId,
          scenario.content,
        );
      for (const recipient of db.match.players)
        for (const channel of channels) {
          for (const isPhishing of [true, false])
            if (
              !db.scenarios.some(
                (s) =>
                  s.recipientId === recipient &&
                  s.channel === channel &&
                  s.isPhishing === isPhishing,
              )
            ) {
              const choice = this.platformContent(
                db,
                recipient,
                channel,
                isPhishing,
              );
              this.scenario(
                db,
                recipient,
                channel,
                isPhishing,
                null,
                choice.templateId,
              ).content = choice.content;
            }
        }
      let seed = db.match.seed >>> 0;
      const rand = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (const recipient of db.match.players) {
        const list = db.scenarios.filter((s) => s.recipientId === recipient);
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        const previousByChannel: Partial<Record<Channel, number>> = {};
        list.forEach((s, i) => {
          const previous = previousByChannel[s.channel];
          const earliest = previous
            ? previous + 60000
            : this.now(db) + (i + 1) * 60000;
          const dueAt =
            this.config.mode === "demo"
              ? this.now(db) + (i + 1) * 60000
              : this.nextContactTime(db, recipient, earliest, previous);
          const deadline =
            this.now(db) + this.config.matchDurationMinutes * 60000;
          if (this.config.mode === "live" && dueAt + 60 * 60000 > deadline)
            throw new ApiError(
              409,
              "Live matches need at least two recipient contact days plus response time. Increase MATCH_DURATION_MINUTES (4320 recommended).",
            );
          previousByChannel[s.channel] = dueAt;
          s.order = i;
          s.locked = true;
          s.tokenExpiresAt = deadline;
          db.jobs.push({
            id: randomUUID(),
            type: "delivery",
            scenarioId: s.id,
            dueAt,
            status: "queued",
            leaseExpiresAt: null,
            attempts: 0,
            idempotencyKey: `delivery:${s.id}`,
          });
        });
      }
      db.match.startedAt = this.now(db);
      db.match.deadline =
        this.now(db) + this.config.matchDurationMinutes * 60000;
      db.match.state = "active";
    });
  }
  async decisionFor(
    userId: string,
    id: string,
    choice: DecisionChoice,
  ): Promise<Decision> {
    return this.transact((db) => {
      this.member(db, userId);
      const scenario = db.scenarios.find(
        (s) => s.id === id && s.recipientId === userId,
      );
      if (!scenario) throw new ApiError(404, "Challenge not found");
      const existing = db.decisions.find(
        (d) => d.scenarioId === id && d.recipientId === userId,
      );
      if (existing) return existing;
      if (
        !["active", "resolving"].includes(db.match.state) ||
        this.now(db) > db.match.deadline
      )
        throw new ApiError(410, "This match has ended");
      if (
        scenario.releasedAt === null ||
        ["cancelled", "failed", "unknown", "queued"].includes(
          scenario.deliveryStatus,
        )
      )
        throw new ApiError(409, "Challenge is not available");
      if (scenario.tokenExpiresAt < this.now(db))
        throw new ApiError(410, "Challenge has expired");
      const score = scoreDecision(
        scenario.isPhishing,
        choice,
        !!scenario.authorId,
      );
      const decision: Decision = {
        id: randomUUID(),
        scenarioId: id,
        recipientId: userId,
        choice,
        ...score,
        createdAt: this.now(db),
      };
      db.decisions.push(decision);
      const sourceId = decision.id;
      db.scoreEvents.push({
        id: randomUUID(),
        sourceId,
        userId,
        type: "defense",
        points: score.defenderPoints,
      });
      db.match.scores[userId] += score.defenderPoints;
      if (score.authorPoints && scenario.authorId) {
        db.scoreEvents.push({
          id: randomUUID(),
          sourceId,
          userId: scenario.authorId,
          type: "author",
          points: score.authorPoints,
        });
        db.match.scores[scenario.authorId] += score.authorPoints;
      }
      if (
        db.match.players.every(
          (player) =>
            db.decisions.filter((d) => d.recipientId === player).length === 6,
        )
      )
        this.finalizeDb(db);
      return decision;
    });
  }
  async ignore(userId: string, id: string) {
    if (this.config.mode !== "demo")
      throw new ApiError(
        403,
        "Live transport status is controlled by the provider",
      );
    await this.transact((db) => {
      this.member(db, userId);
      const s = db.scenarios.find(
        (item) => item.id === id && item.recipientId === userId,
      );
      if (!s || s.releasedAt === null)
        throw new ApiError(404, "Challenge not found");
      if (s.channel !== "voice")
        throw new ApiError(400, "Ignore applies to calls");
      if (
        !["simulated", "unanswered"].includes(s.deliveryStatus) ||
        db.match.state !== "active"
      )
        throw new ApiError(409, "This simulated call is no longer available");
      if (!db.decisions.some((d) => d.scenarioId === id))
        s.deliveryStatus = "unanswered";
    });
  }
  private finalizeDb(db: Database) {
    if (db.match.state === "completed") return;
    if (db.match.state !== "active" && db.match.state !== "resolving")
      throw new ApiError(409, "Activate the match first");
    db.match.state = "resolving";
    if (
      this.config.mode === "live" &&
      db.scenarios.some(
        (s) =>
          !db.decisions.some((d) => d.scenarioId === s.id) &&
          !["delivered", "unanswered"].includes(s.deliveryStatus),
      )
    ) {
      db.match.result = "incomplete";
      db.match.incompleteReason =
        "One or more carrier opportunities failed or remain unresolved. Operator resolution required.";
      return;
    }
    const counts = Object.fromEntries(
      db.match.players.map((id) => [
        id,
        db.decisions.filter((d) => d.recipientId === id).length,
      ]),
    );
    Object.assign(
      db.match,
      matchOutcome(db.match.players, db.match.scores, counts),
    );
    db.match.completedAt = this.now(db);
    db.match.state = "completed";
    for (const job of db.jobs.filter(
      (j) => j.type === "delivery" && j.status === "queued",
    )) {
      job.status = "cancelled";
      const s = db.scenarios.find((s) => s.id === job.scenarioId)!;
      s.deliveryStatus = "cancelled";
    }
    if (!db.match.standingsApplied) {
      for (const id of db.match.players) {
        const profile = db.profiles.find((p) => p.id === id)!;
        if (db.match.result === "draw") {
          profile.leaguePoints++;
          profile.draws++;
        } else if (db.match.winnerId === id) {
          profile.leaguePoints += 3;
          profile.wins++;
        } else if (db.match.winnerId) profile.losses++;
      }
      db.match.standingsApplied = true;
    }
  }
  async finalize() {
    await this.transact((db) => this.finalizeDb(db));
  }
  async reset() {
    if (this.config.mode !== "demo")
      throw new ApiError(403, "Demo controls disabled in live mode");
    await this.transact((db) => {
      const sessions = db.sessions;
      Object.assign(db, createSeed(Date.now()));
      db.sessions = sessions;
    });
  }
  async advance(minutes: number) {
    if (this.config.mode !== "demo")
      throw new ApiError(403, "Demo controls disabled in live mode");
    await this.transact((db) => {
      db.clockOffset += minutes * 60000;
    });
    await this.tick();
  }
  async release(recipientId?: string, all = false) {
    if (this.config.mode !== "demo")
      throw new ApiError(403, "Demo controls disabled in live mode");
    await this.transact((db) => {
      if (db.match.state !== "active")
        throw new ApiError(409, "Activate the match first");
      for (const id of recipientId ? [recipientId] : db.match.players) {
        this.member(db, id);
        const jobs = db.jobs
          .filter(
            (j) =>
              j.type === "delivery" &&
              j.status === "queued" &&
              db.scenarios.find((s) => s.id === j.scenarioId)?.recipientId ===
                id,
          )
          .sort(
            (a, b) =>
              db.scenarios.find((s) => s.id === a.scenarioId)!.order -
              db.scenarios.find((s) => s.id === b.scenarioId)!.order,
          );
        for (const job of all ? jobs : jobs.slice(0, 1))
          job.dueAt = this.now(db);
      }
    });
    await this.tick();
  }
  async operator() {
    const db = await this.readDb();
    return {
      mode: this.config.mode,
      now: this.now(db),
      match: db.match,
      jobs: db.jobs,
      attempts: db.attempts.map(({ providerId, ...a }) => ({
        ...a,
        providerId: providerId ?? null,
      })),
      readiness: db.match.players.map((userId) => ({
        userId,
        channels: this.readiness(db, userId),
      })),
      note: "Local presentation controls. Time advancement and release never contact real recipients in demo mode.",
    };
  }
  private async recover() {
    await this.transact((db) => {
      for (const job of db.jobs.filter(
        (j) => j.status === "leased" && (j.leaseExpiresAt ?? 0) < this.now(db),
      )) {
        if (job.type === "generation") {
          job.status = "queued";
          continue;
        }
        job.status = "unknown";
        const s = db.scenarios.find((s) => s.id === job.scenarioId)!;
        s.deliveryStatus = "unknown";
        for (const attempt of db.attempts.filter(
          (a) => a.scenarioId === s.id && a.status === "queued",
        )) {
          attempt.status = "unknown";
          attempt.reason =
            "Worker lease expired; submission may have occurred. Manual reconciliation required.";
        }
      }
    });
  }
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      let initial = await this.readDb();
      if (
        initial.jobs.some(
          (j) =>
            j.status === "leased" &&
            (j.leaseExpiresAt ?? 0) < this.now(initial),
        )
      )
        await this.recover();
      initial = await this.readDb();
      if (
        ["active", "resolving"].includes(initial.match.state) &&
        this.now(initial) >= initial.match.deadline
      ) {
        if (initial.match.result !== "incomplete") await this.finalize();
        return;
      }
      for (let i = 0; i < 24; i++) {
        const snapshot = await this.readDb();
        if (
          !snapshot.jobs.some(
            (j) => j.status === "queued" && j.dueAt <= this.now(snapshot),
          )
        )
          break;
        const job = await this.transact((db) => {
          const found = db.jobs.find(
            (j) => j.status === "queued" && j.dueAt <= this.now(db),
          );
          if (!found) return null;
          found.status = "leased";
          found.leaseExpiresAt = this.now(db) + 45000;
          found.attempts++;
          return found;
        });
        if (!job) break;
        if (job.type === "generation") await this.runGeneration(job);
        else await this.runDelivery(job);
      }
    } finally {
      this.ticking = false;
    }
  }
  private async runGeneration(job: Job) {
    const db = await this.readDb(),
      s = db.scenarios.find((s) => s.id === job.scenarioId);
    if (!s) return;
    let result: GenerationResult;
    try {
      result = await generateContent({
        channel: s.channel,
        interest: s.interest,
        templateId: s.templateId,
        fixture: fixtureContent(s.channel, s.templateId, true),
      });
    } catch {
      result = {
        content: fixtureContent(s.channel, s.templateId, true),
        source: "fallback" as const,
        model: "reviewed-fixture",
        promptVersion: "v1",
        reason: "Generation unavailable; reviewed fixture used",
      };
    }
    await this.transact((db) => {
      const draft = db.scenarios.find((s) => s.id === job.scenarioId);
      const current = db.jobs.find((j) => j.id === job.id);
      if (!draft || !current || draft.locked) return;
      if (
        this.exclusionReason(
          db,
          draft.recipientId,
          draft.templateId,
          result.content,
        )
      ) {
        const fallback = fixtureContent(draft.channel, draft.templateId, true);
        if (
          this.exclusionReason(
            db,
            draft.recipientId,
            draft.templateId,
            fallback,
          )
        ) {
          draft.generationStatus = "failed";
          draft.generationReason =
            "Recipient excluded this theme; choose another scenario.";
          current.status = "failed";
          current.leaseExpiresAt = null;
          return;
        }
        result = {
          ...result,
          content: fallback,
          source: "fallback",
          reason:
            "Generated wording overlapped an excluded theme; reviewed fixture used.",
        };
      }
      draft.content = result.content;
      draft.source = result.source;
      draft.model = result.model;
      draft.promptVersion = result.promptVersion;
      draft.generationReason = result.reason;
      draft.generationStatus =
        result.source === "fallback" ? "fallback" : "complete";
      current.status = "complete";
      current.leaseExpiresAt = null;
    });
  }
  private async runDelivery(job: Job) {
    const prepared = await this.transact((db) => {
      const current = db.jobs.find((j) => j.id === job.id),
        s = db.scenarios.find((s) => s.id === job.scenarioId);
      if (!current || !s) return null;
      const m = this.member(db, s.recipientId);
      const readiness = this.readiness(db, s.recipientId).find(
        (r) => r.channel === s.channel,
      );
      const eligible =
        db.match.state === "active" &&
        m.accepted &&
        m.consent.adult &&
        !m.consent.paused &&
        m.consent.channels[s.channel] &&
        s.locked &&
        !this.exclusionReason(db, s.recipientId, s.templateId, s.content);
      if (!eligible) {
        current.status = "cancelled";
        s.deliveryStatus = "cancelled";
        return null;
      }
      if (this.config.mode === "live" && readiness?.status !== "ready") {
        current.status = "failed";
        s.deliveryStatus = "failed";
        db.attempts.push({
          id: randomUUID(),
          scenarioId: s.id,
          recipientId: s.recipientId,
          channel: s.channel,
          provider: s.channel === "email" ? "smtp" : "twilio",
          status: "failed",
          createdAt: this.now(db),
          updatedAt: this.now(db),
          reason: readiness?.reason ?? "Readiness checks did not pass",
          callbackIds: [],
        });
        return null;
      }
      const id = randomUUID();
      db.attempts.push({
        id,
        scenarioId: s.id,
        recipientId: s.recipientId,
        channel: s.channel,
        provider:
          this.config.mode === "demo"
            ? "simulator"
            : s.channel === "email"
              ? "smtp"
              : "twilio",
        status: "queued",
        createdAt: this.now(db),
        updatedAt: this.now(db),
        callbackIds: [],
      });
      return {
        id,
        scenario: s,
        destination:
          m.consent.contacts[s.channel]?.destination ??
          `fictional-${s.recipientId}`,
      };
    });
    if (!prepared) return;
    const fresh = await this.readDb();
    const s = prepared.scenario;
    fresh.scenarios.find((item) => item.id === s.id)!.actionUrl =
      this.actionUrl(s);
    const m = this.member(fresh, s.recipientId);
    if (
      m.consent.paused ||
      !m.consent.channels[s.channel] ||
      fresh.match.state !== "active" ||
      this.exclusionReason(fresh, s.recipientId, s.templateId, s.content)
    ) {
      await this.transact((db) => {
        const j = db.jobs.find((j) => j.id === job.id)!;
        j.status = "cancelled";
        db.scenarios.find((item) => item.id === s.id)!.deliveryStatus =
          "cancelled";
        db.attempts.find((a) => a.id === prepared.id)!.status = "cancelled";
      });
      return;
    }
    let result;
    try {
      result = await dispatch(
        {
          attemptId: prepared.id,
          scenarioId: s.id,
          recipientId: s.recipientId,
          channel: s.channel,
          destination: prepared.destination,
          content: s.content,
          actionUrl: this.actionUrl(s),
        },
        { db: fresh, now: this.now(fresh), reload: () => this.readDb() },
        this.providerEnv(),
      );
    } catch {
      result = {
        status: "unknown" as const,
        reason: "Provider submission outcome unknown; automatic retry disabled",
      };
    }
    await this.transact((db) => {
      const current = db.jobs.find((j) => j.id === job.id),
        scenario = db.scenarios.find((item) => item.id === s.id),
        attempt = db.attempts.find((a) => a.id === prepared.id);
      if (!current || !scenario || !attempt) return;
      current.status =
        result.status === "failed"
          ? "failed"
          : result.status === "unknown"
            ? "unknown"
            : "complete";
      current.leaseExpiresAt = null;
      attempt.status = result.status;
      attempt.providerId = result.providerId;
      attempt.reason = result.reason;
      attempt.updatedAt = this.now(db);
      scenario.deliveryStatus = result.status;
      if (result.status === "simulated" || result.status === "accepted")
        scenario.releasedAt = this.now(db);
    });
  }
  async challengeToken(token: string) {
    const db = await this.readDb();
    const scenario = db.scenarios.find((s) => s.tokenHash === hash(token));
    if (
      !scenario ||
      scenario.tokenExpiresAt < this.now(db) ||
      db.match.state === "cancelled" ||
      scenario.deliveryStatus === "cancelled"
    )
      throw new ApiError(410, "Challenge link expired or unavailable");
    if (scenario.releasedAt === null)
      throw new ApiError(404, "Challenge has not been released");
    return { scenario, db };
  }
}
