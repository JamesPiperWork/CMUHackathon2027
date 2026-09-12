import { publicPrankReveal } from "./prank-reveals.js";
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
  createFreshSeed,
  fixtureContent,
  contentReview,
  containsStrongLanguage,
  scenarioConsistent,
  emailContentConsistent,
  emailTeachingContent,
  emailPromptContentValid,
  emailPromptTeachingContent,
  messagePromptContentValid,
  messagePromptTeachingContent,
  matchOutcome,
  scoreDecision,
  type ApprovedContent,
  type Channel,
  type Database,
  type Decision,
  type DecisionChoice,
  type DeliveryResult,
  type GenerateRequest,
  type GenerationResult,
  type Job,
  type PlayerState,
  type Scenario,
  type Session,
} from "@fp/shared";
import type { Config } from "./config.js";
import { MatchRepository, gamePools, type Repository } from "./repository.js";
import { leagueProfile, leagueSummaries } from "./leagues.js";
import { getScouting, saveScouting, validateScoutingMarkdown } from "./scouting.js";
import { dispatch, generateContent, getReadiness, phoneDestinationHash } from "./providers.js";
import { accountFor, setupState, ensureIdentityAccount } from "./accounts.js";
import { emailGame, initializeEmailRules, castDraft, reserveSpear, spearUses, awardAvoidance } from "./email-casts.js";
import { emailRecipientHash, smtpMessageId } from "./email-receipts.js";
import { generateMessageLure, messagePromptFallback } from "./message-lure.js";
import { invalidateVoiceDraft, publicVoiceAudio, voiceAudioApproved } from "./voice-authoring.js";
import { emailPromptFallback } from "./email-lure.js";
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
  private scopes = new Map<string, GameService>();
  constructor(
    public repo: Repository,
    public config: Config,
  ) {}
  get simulated() { return this.config.mode === "demo" && !this.config.emailDemo && !this.config.phoneDemo; }
  get immediateDelivery() { return this.simulated || (this.config.mode === "demo" && Boolean(this.config.emailDemo && this.config.emailDemoImmediate)); }
  forMatch(matchId: string) {
    let scoped = this.scopes.get(matchId);
    if (!scoped) {
      scoped = new GameService(new MatchRepository(this.repo, matchId), this.config);
      scoped.onChange = () => this.onChange();
      this.scopes.set(matchId, scoped);
    }
    return scoped;
  }
  async forSession(session: Session, requireSelectedMatch = false) {
    const db = await this.readDb();
    const selection = db.userSelections?.[session.userId];
    const matchId = session.selectedMatchId ?? selection?.matchId;
    const selectedLeagueId = session.selectedLeagueId ?? selection?.leagueId;
    const available = gamePools(db).filter(p => !db.leagues?.find(l => l.id === p.match.leagueId)?.archivedAt);
    const requested = available.find((p) => p.match.id === matchId && p.match.players.includes(session.userId));
    const selectedLeagueMatches = available.filter((p) => p.match.leagueId === selectedLeagueId && p.match.players.includes(session.userId)).sort((a, b) => (b.match.week ?? 0) - (a.match.week ?? 0));
    const newlyAssigned = selectedLeagueMatches.find((p) => p.match.state !== "completed") ?? selectedLeagueMatches[0];
    const fallback = available.find((p) => p.match.players.includes(session.userId) && p.match.state !== "completed") ?? available.find((p) => p.match.players.includes(session.userId));
    const chosen = requested ?? newlyAssigned ?? fallback;
    if (!chosen) {
      if (requireSelectedMatch) throw new ApiError(409, "Join a league with another player to get your first matchup");
      return this;
    }
    if (requireSelectedMatch && selectedLeagueId && chosen.match.leagueId !== selectedLeagueId)
      throw new ApiError(409, "This league is waiting for an opponent. Invite another player before drafting or starting a matchup.");
    return chosen.match.id === db.match.id ? this : this.forMatch(chosen.match.id);
  }
  async forScenario(scenarioId: string) {
    const db = await this.readDb();
    const pool = gamePools(db).find((p) => p.scenarios.some((s) => s.id === scenarioId));
    return pool && pool.match.id !== db.match.id ? this.forMatch(pool.match.id) : this;
  }
  async tickAll() {
    await this.tick();
    const db = await this.readDb();
    for (const pool of db.matchPools ?? [])
      if (pool.match.state !== "completed" && pool.match.state !== "cancelled") await this.forMatch(pool.match.id).tick();
  }
  async initializeRules() {
    if (this.config.emailDemo) {
      const db = await this.readDb();
      if (db.clockOffset || db.profiles.some(p => !db.accounts?.some(a => a.userId === p.id && a.consent.contacts.email?.verified && a.consent.contacts.email.method === (this.config.emailCapture ? "captured" : "verify"))))
        throw new ApiError(503, "Use a separate empty data file for this delivery mode. Local capture identities, real-email identities and sample data cannot be mixed.");
    }
    if (this.config.ruleSet === "email-casts-v2") await this.transact(db => initializeEmailRules(db, this.now(db)));
  }
  async scouting(userId: string, targetId: string) {
    return getScouting(await this.readDb(), userId, targetId);
  }
  async saveScouting(userId: string, targetId: string, input: { interests: string[]; markdown: string }) {
    return this.transact((db) => saveScouting(db, userId, targetId, input, this.now(db)));
  }
  now(db: Database) {
    return Date.now() + db.clockOffset;
  }
  readDb() {
    return this.repo.read();
  }
  private tokenKey() {
    const secret =
      process.env.TOKEN_SECRET ||
      (this.simulated
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
      EMAIL_DELIVERY_MODE: this.config.emailCapture ? "mailpit" : this.config.emailDemo ? "smtp-demo" : "simulated",
      EMAIL_DEMO_IMMEDIATE: this.config.emailDemoImmediate ? "true" : "false",
      PHONE_DELIVERY_MODE: this.config.phoneDemo ? "twilio-demo" : "simulated",
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
    if (!this.simulated && role === "operator")
      throw new ApiError(
        403,
        "Demo operator sessions are disabled in live mode",
      );
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(24).toString("base64url");
    await this.transact((db) => {
      accountFor(db, userId);
      if (this.config.emailDemo && !db.accounts?.find(a => a.userId === userId)?.consent.contacts.email?.verified) throw new ApiError(403, "Verify your email to sign in");
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
          (this.simulated || s.role === "player"),
      ) ?? null
    );
  }
  async ensureLiveMember(identity: {
    sub: string;
    email?: string;
    emailVerified?: boolean;
  }) {
    return ensureIdentityAccount(this, identity);
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
    if (db.match.state !== "drafting" && !(emailGame(db) && db.match.state === "active" && this.now(db) < db.match.deadline))
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
          : templateId === "game-night" ? [
              "walk",
              "trail",
              "outdoor",
              "adventure",
              "hiking",
              "guest list",
              "game night",
            ] : [];
    const visible = [
      content.subject,
      content.senderDisplayName,
      content.bodyText,
      content.smsText,
      content.voiceScript,
    ]
      .join(" ")
      .toLowerCase();
    const consent = this.member(db, recipientId).consent;
    const familyFriendly = consent.familyFriendly || db.leagues?.find((league) => league.id === db.match.leagueId)?.settings.familyFriendly;
    if (familyFriendly && containsStrongLanguage(visible)) return "strong language (family-friendly filter)";
    return consent.excludedThemes.find((theme) => {
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
    if (!db.match.players.includes(userId) || db.leagues?.find(l => l.id === db.match.leagueId)?.archivedAt) return setupState(db, session, this.config.mode, this.now(db));
    const member = this.member(db, userId);
    const me = leagueProfile(db, userId, db.match.leagueId);
    const opponent = leagueProfile(db, db.match.players.find((p) => p !== userId)!, db.match.leagueId);
    const { seed: _privateSeed, ...publicMatch } = db.match;
    const league = db.leagues?.find((l) => l.id === db.match.leagueId);
    const sorted = db.profiles.filter((p) => db.members.some((m) => m.userId === p.id && m.leagueId === db.match.leagueId)).map((p) => ({ ...p, ...league?.standings?.[p.id] })).sort(
      (a, b) => b.leaguePoints - a.leaguePoints || a.name.localeCompare(b.name),
    );
    return {
      setupStage: member.consent.acceptedAt ? "ready" : "player",
      castRules: { version: emailGame(db) ? "email-casts-v2" : "multichannel-v1", regularLimit: emailGame(db) ? 2 : 3, spearLimit: emailGame(db) ? 1 : 0, spearUsed: spearUses(db, userId).length, spearRemaining: emailGame(db) ? Math.max(0, 1 - spearUses(db, userId).length) : 0 },
      mode: this.config.mode,
      selectedLeagueId: session.selectedLeagueId ?? db.userSelections?.[userId]?.leagueId ?? db.match.leagueId,
      leagues: leagueSummaries(db, userId),
      revision: db.revision,
      now: this.now(db),
      me,
      opponent,
      consent: member.consent,
      match: publicMatch,
      league: {
        id: db.match.leagueId,
        name: league?.name ?? "The Usual Suspects",
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
          kind: s.kind,
          slot: s.slot,
          contentPolicy: s.contentPolicy,
          authorPrompt: s.authorPrompt,
          voiceAudio: publicVoiceAudio(s, this.providerEnv()),
          prankReveal: publicPrankReveal(s, "author"),
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
            ...(s.encryptedToken ? { actionUrl: this.actionUrl(s) } : {}),
            ...(emailGame(db) ? { avoidancePoints: db.scoreEvents.filter(e => e.type === "avoidance" && e.sourceId === s.id && e.userId === userId).reduce((sum, e) => sum + e.points, 0) } : {}),
            ...(decision || db.match.state === "completed"
              ? {
                  decision,
                  reveal: {
                    ...(s.isPhishing && decision?.choice === "trust" ? { prank: publicPrankReveal(s, "recipient") } : {}),
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
        emailGame(db) ? db.scenarios.filter(s => s.recipientId === userId && s.releasedAt !== null && !db.decisions.some(d => d.scenarioId === s.id)).length : 6 - db.decisions.filter((d) => d.recipientId === userId).length,
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
      const members = db.members.filter((m) => m.userId === userId);
      const account = db.accounts?.find(a => a.userId === userId);
      if (account) account.consent.paused = paused;
      if (!members.length && !account) throw new ApiError(404, "Membership not found");
      for (const member of members) member.consent.paused = paused;
      if (paused) for (const pool of gamePools(db))
        for (const job of pool.jobs.filter(
          (j) => j.type === "delivery" && j.status === "queued",
        )) {
          const scenario = pool.scenarios.find((s) => s.id === job.scenarioId)!;
          if (scenario.recipientId === userId) {
            job.status = "cancelled";
            scenario.deliveryStatus = "cancelled";
          }
        }
    });
  }
  async generate(userId: string, input: GenerateRequest, prepared = false) {
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
      const scouting = getScouting(db, userId, recipient.userId);
      const promptBased = input.authorPrompt !== undefined;
      const messageBased = emailGame(db) && input.channel !== "email";
      if (promptBased && !emailGame(db)) throw new ApiError(400, "Prompt-based casts are available in new weekly matches.");
      if (messageBased && !promptBased) throw new ApiError(400, "Describe your idea for this text or voice cast.");
      if (!promptBased && (!input.interest || !input.templateId || !scouting.interests.includes(input.interest)))
        throw new ApiError(400, "Choose an interest before creating your message");
      const authorPrompt = input.authorPrompt?.trim();
      const templateId = promptBased ? "sender-prompt" : input.templateId!;
      // Retained only for old persisted schemas; it never enters a v3 model prompt.
      const interest = promptBased ? "Board games" : input.interest!;
      const fixture = messageBased ? messagePromptFallback(authorPrompt!, input.channel as "sms" | "voice") : promptBased ? emailPromptFallback(authorPrompt!) : fixtureContent(input.channel, templateId, true);
      const league = db.leagues?.find((l) => l.id === db.match.leagueId);
      if (league && !league.settings.channels[input.channel]) throw new ApiError(409, "This league has disabled that channel");
      this.enforceExclusions(
        db,
        recipient.userId,
        templateId,
        fixture,
      );
      const cast = emailGame(db) ? castDraft(db, userId, input) : null;
      if (!cast && (input.kind || input.slot || prepared)) throw new ApiError(400, "Cast slots are available in new weekly matches.");
      let scenario = cast ? cast.draft : db.scenarios.find(
        (s) => s.authorId === userId && s.channel === input.channel,
      );
      if (input.previousDraft?.senderDisplayName !== undefined && input.channel !== "email") throw new ApiError(400, "Only email casts have an editable sender name.");
      const previousDraft = input.previousDraft ? { ...(input.channel === "email" && scenario?.channel === "email" ? { senderDisplayName: scenario.content.senderDisplayName } : {}), ...input.previousDraft } : undefined;
      if (input.refinement || input.previousDraft) {
        if (!cast || !scenario || prepared || !input.refinement || !input.previousDraft)
          throw new ApiError(400, "Generate a cast first, then describe the change you want.");
        if (scenario.channel !== input.channel) throw new ApiError(400, "Choose the new medium before refining its draft.");
        if (!promptBased && templateId !== scenario.templateId)
          throw new ApiError(400, "Keep the same story while refining an email.");
        validateScoutingMarkdown(input.refinement);
        const previous = contentSchema.parse(messageBased ? messagePromptTeachingContent({ ...fixture, ...previousDraft }, input.channel) : promptBased ? emailPromptTeachingContent({ ...fixture, ...previousDraft }) : emailTeachingContent({ ...scenario.content, ...previousDraft }, scenario.templateId));
        if (!contentReview(previous).valid || !(messageBased ? messagePromptContentValid(previous, input.channel) : promptBased ? emailPromptContentValid(previous) : emailContentConsistent(previous, scenario.templateId)))
          throw new ApiError(400, "Keep a valid cast before asking for a new version.");
        this.enforceExclusions(db, recipient.userId, templateId, previous);
      }
      if (!scenario)
        scenario = this.scenario(
          db,
          recipient.userId,
          input.channel,
          true,
          userId,
          templateId,
        );
      if (scenario.locked || scenario.releasedAt !== null || db.attempts.some(attempt => attempt.scenarioId === scenario.id)) throw new ApiError(409, "This draft is locked");
      if (scenario.generationStatus === "pending")
        throw new ApiError(409, "Generation is already queued");
      const limit = league?.settings.difficulty === "rookie" ? 5 : league?.settings.difficulty === "expert" ? 1 : 3;
      if (!prepared && scenario.generationAttempts >= limit)
        throw new ApiError(429, `${limit === 3 ? "Three" : limit} generation attempts used for this draft`);
      invalidateVoiceDraft(scenario);
      scenario.channel = input.channel;
      scenario.interest = interest;
      scenario.templateId = templateId;
      if (authorPrompt !== undefined) scenario.authorPrompt = authorPrompt;
      else delete scenario.authorPrompt;
      if (cast) { scenario.kind = cast.kind; scenario.slot = cast.slot; scenario.contentPolicy = messageBased ? "message-prompt-v1" : promptBased ? "email-prompt-v3" : "email-narrative-v1"; }
      if (promptBased) scenario.content = previousDraft ? messageBased ? messagePromptTeachingContent({ ...fixture, ...previousDraft }, input.channel) : emailPromptTeachingContent({ ...fixture, ...previousDraft }) : fixture;
      if (prepared) {
        scenario.content = promptBased ? fixture : emailTeachingContent(fixture, templateId);
        scenario.source = "fixture"; scenario.model = "reviewed-fixture"; scenario.promptVersion = scenario.contentPolicy ?? "email-narrative-v1";
        scenario.generationStatus = "complete"; scenario.generationReason = "Prepared starting point for your handwritten cast.";
        return { scenarioId: scenario.id, queued: false };
      }
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
        generationInput: {
          policy: scenario.contentPolicy,
          channel: scenario.channel,
          interest: scenario.interest,
          templateId: scenario.templateId,
          fixture,
          ...(promptBased ? { authorPrompt } : { scouting: { interest, markdown: scouting.markdown } }),
          ...(input.refinement ? { refinement: input.refinement, previousDraft: structuredClone(previousDraft!) } : {}),
        },
      });
      return { scenarioId: scenario.id, queued: true };
    });
  }
  async editDraft(
    userId: string,
    id: string,
    input: Partial<
      Pick<ApprovedContent, "subject" | "bodyText" | "senderDisplayName" | "smsText" | "voiceScript">
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
      if (input.senderDisplayName !== undefined && draft.channel !== "email") throw new ApiError(400, "Only email casts have an editable sender name.");
      let content = contentSchema.parse({ ...draft.content, ...input });
      if (draft.contentPolicy === "email-narrative-v1") content = emailTeachingContent(content, draft.templateId);
      if (draft.contentPolicy === "email-prompt-v3") content = emailPromptTeachingContent(content);
      if (draft.contentPolicy === "message-prompt-v1") content = messagePromptTeachingContent(content, draft.channel);
      const review = contentReview(content);
      if (!review.valid || !this.validDraftContent(draft, content))
        throw new ApiError(
          400,
          review.reason ?? (draft.contentPolicy === "email-prompt-v3" ? "Keep the email friendly and free of destinations, credentials, and payments." : "Keep the approved scenario and learning cue intact"),
        );
      this.enforceExclusions(db, draft.recipientId, draft.templateId, content);
      if (JSON.stringify(content) !== JSON.stringify(draft.content)) invalidateVoiceDraft(draft);
      draft.content = content;
    });
  }
  async lock(userId: string, id: string) {
    await this.transact(db => this.lockDraft(db, userId, id));
  }
  private validDraftContent(draft: Scenario, content = draft.content) {
    return draft.contentPolicy === "message-prompt-v1" ? messagePromptContentValid(content, draft.channel)
      : draft.contentPolicy === "email-prompt-v3" ? emailPromptContentValid(content)
      : draft.contentPolicy === "email-narrative-v1" ? emailContentConsistent(content, draft.templateId)
      : scenarioConsistent(content, draft.templateId);
  }
  private lockDraft(db: Database, userId: string, id: string) {
    this.editable(db);
    const draft = db.scenarios.find(s => s.id === id && s.authorId === userId);
    if (!draft) throw new ApiError(404, "Draft not found");
    if (draft.locked) return;
    if (draft.generationStatus === "pending" || draft.generationStatus === "failed")
      throw new ApiError(409, "Finish a valid draft before sending");
    const review = contentReview(draft.content);
    if (!review.valid || !this.validDraftContent(draft))
      throw new ApiError(400, review.reason ?? "Content review failed");
    this.enforceExclusions(db, draft.recipientId, draft.templateId, draft.content);
    if (draft.channel === "voice" && draft.contentPolicy === "message-prompt-v1" && !voiceAudioApproved(draft)) throw new ApiError(409, "Generate, preview and approve the voice audio before sending.");
    if (emailGame(db)) reserveSpear(db, draft, this.now(db));
    draft.locked = true;
    if (emailGame(db) && db.match.state === "active") this.enqueueCast(db, draft);
  }
  /** The button and background worker share the same durable delivery lease. */
  async sendCast(userId: string, id: string) {
    if (!this.immediateDelivery) throw new ApiError(409, "This app uses scheduled delivery. Make the bait ready and start the week.");
    const job = await this.transact(db => {
      this.member(db, userId);
      if (!emailGame(db)) throw new ApiError(409, "Immediate sending is available for weekly cast matches.");
      if (db.leagues?.find(league => league.id === db.match.leagueId)?.archivedAt) throw new ApiError(404, "League not found");
      const draft = db.scenarios.find(scenario => scenario.id === id && scenario.authorId === userId);
      if (!draft) throw new ApiError(404, "Draft not found");
      // A retry acknowledges the original operation. Even an unknown or failed
      // submission never creates another attempt for the same cast.
      const existing = db.jobs.find(item => item.type === "delivery" && item.scenarioId === id);
      if (db.attempts.some(attempt => attempt.scenarioId === id) || (existing && existing.status !== "queued")) return null;
      this.editable(db);
      if (!db.match.players.every(playerId => {
        const member = this.member(db, playerId);
        return member.accepted && member.consent.adult && member.consent.acceptedAt !== null;
      })) throw new ApiError(409, "Both players must finish player setup before sending.");
      const recipient = this.member(db, draft.recipientId);
      if (recipient.consent.paused || !recipient.consent.channels[draft.channel] || !(db.leagues?.find(league => league.id === db.match.leagueId)?.settings.channels[draft.channel] ?? true))
        throw new ApiError(409, "The recipient must enable this medium and unpause delivery before you send.");
      this.enforceExclusions(db, draft.recipientId, draft.templateId, draft.content);
      if (!this.simulated) {
        const readiness = this.readiness(db, draft.recipientId).find(row => row.channel === draft.channel);
        if (readiness?.status !== "ready" && readiness?.status !== "simulated") throw new ApiError(409, `This cast cannot be sent yet: ${readiness?.reason ?? "recipient readiness is unavailable"}.`);
      }
      this.lockDraft(db, userId, id);
      if (db.match.state === "drafting") {
        db.match.startedAt = this.now(db);
        db.match.deadline = this.now(db) + this.config.matchDurationMinutes * 60000;
        db.match.state = "active";
      }
      this.enqueueCast(db, draft);
      const selected = db.jobs.find(item => item.type === "delivery" && item.scenarioId === id)!;
      selected.dueAt = this.now(db);
      selected.status = "leased";
      selected.leaseExpiresAt = this.now(db) + 45000;
      selected.attempts++;
      return selected;
    });
    if (job) await this.runDelivery(job);
    const db = await this.readDb();
    const draft = db.scenarios.find(scenario => scenario.id === id && scenario.authorId === userId);
    if (!draft) throw new ApiError(410, "This cast is no longer available.");
    const attempt = db.attempts.filter(item => item.scenarioId === id).at(-1);
    const current = db.jobs.find(item => item.type === "delivery" && item.scenarioId === id);
    return { scenarioId: id, status: attempt?.status ?? (current?.status === "unknown" ? "unknown" : draft.deliveryStatus),
      reason: attempt?.reason ?? (current?.status === "leased" ? "This cast is already being submitted. Its status will update shortly." : undefined) };
  }
  private enqueueCast(db: Database, scenario: Scenario) {
    if (db.jobs.some(job => job.type === "delivery" && job.scenarioId === scenario.id)) return;
    const earlier = db.jobs.filter(job => job.type === "delivery" && db.scenarios.some(s => s.id === job.scenarioId && s.recipientId === scenario.recipientId));
    const previous = earlier.length ? Math.max(...earlier.map(job => job.dueAt)) : undefined;
    const earliest = Math.max(this.now(db) + 60000, previous === undefined ? 0 : previous + 60000);
    const dueAt = this.immediateDelivery ? this.now(db) : this.simulated ? earliest : this.nextContactTime(db, scenario.recipientId, earliest, previous);
    if (dueAt >= db.match.deadline || (!this.immediateDelivery && !this.simulated && dueAt + 3600000 > db.match.deadline)) throw new ApiError(409, "No contact window remains for this cast before the week ends.");
    scenario.order = earlier.length; scenario.tokenExpiresAt = db.match.deadline;
    db.jobs.push({ id: randomUUID(), type: "delivery", scenarioId: scenario.id, dueAt, status: "queued", leaseExpiresAt: null, attempts: 0, idempotencyKey: `delivery:${scenario.id}` });
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
      if (emailGame(db)) {
        const casts = db.scenarios.filter(s => s.authorId && s.locked);
        if (!casts.length) throw new ApiError(409, "Prepare at least one cast to start the week.");
        for (const cast of casts) this.enforceExclusions(db, cast.recipientId, cast.templateId, cast.content);
        db.match.startedAt = this.now(db);
        db.match.deadline = this.now(db) + this.config.matchDurationMinutes * 60000;
        db.match.state = "active";
        for (const cast of casts) this.enqueueCast(db, cast);
        return;
      }
      if (db.scenarios.some((s) => !s.locked))
        throw new ApiError(409, "Lock all authored drafts before activation");
      for (const scenario of db.scenarios)
        this.enforceExclusions(
          db,
          scenario.recipientId,
          scenario.templateId,
          scenario.content,
        );
      const league = db.leagues?.find((l) => l.id === db.match.leagueId);
      const enabledChannels = channels.filter((channel) => !league || league.settings.channels[channel]);
      if (!enabledChannels.length) throw new ApiError(409, "Enable a league channel before starting");
      if (db.scenarios.some((scenario) => !enabledChannels.includes(scenario.channel))) throw new ApiError(409, "Your draft uses a channel disabled by league rules");
      for (const recipient of db.match.players)
        for (let slot = 0; slot < 3; slot++) {
          const channel = enabledChannels[slot % enabledChannels.length];
          const required = Math.floor(slot / enabledChannels.length) + 1;
          for (const isPhishing of [true, false])
            if (db.scenarios.filter((s) => s.recipientId === recipient && s.channel === channel && s.isPhishing === isPhishing).length < required) {
              const choice = this.platformContent(db, recipient, channel, isPhishing);
              this.scenario(db, recipient, channel, isPhishing, null, choice.templateId).content = choice.content;
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
            this.simulated
              ? this.now(db) + (i + 1) * 60000
              : this.nextContactTime(db, recipient, earliest, previous);
          const deadline =
            this.now(db) + this.config.matchDurationMinutes * 60000;
          if (!this.simulated && dueAt + 60 * 60000 > deadline)
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
        this.now(db) >= db.match.deadline
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
        db.match.ruleSet,
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
        !emailGame(db) && db.match.players.every(
          (player) =>
            db.decisions.filter((d) => d.recipientId === player).length === 6,
        )
      )
        this.finalizeDb(db);
      return decision;
    });
  }
  async ignore(userId: string, id: string) {
    if (!this.simulated)
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
  private unresolvedDeliveries(db: Database) {
    return !this.simulated && db.scenarios.some(s =>
      (!emailGame(db) || s.locked) && !db.decisions.some(d => d.scenarioId === s.id) &&
      !(emailGame(db) && db.attempts.some(a => a.scenarioId === s.id && a.provider === "smtp" && a.receiptStatus === "bounced")) &&
      !(emailGame(db) ? ["delivered", "unanswered", "cancelled"] : ["delivered", "unanswered"]).includes(s.deliveryStatus));
  }
  private finalizeDb(db: Database) {
    if (db.match.state === "completed") return;
    if (db.match.state !== "active" && db.match.state !== "resolving")
      throw new ApiError(409, "Activate the match first");
    if (emailGame(db) && this.now(db) < db.match.deadline) throw new ApiError(409, "Avoidance points settle at the weekly deadline. Advance demo time to finish early.");
    db.match.state = "resolving";
    if (this.unresolvedDeliveries(db)) {
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
    if (emailGame(db)) {
      awardAvoidance(db);
      const [a, b] = db.match.players;
      db.match.result = db.match.scores[a] === db.match.scores[b] ? "draw" : "win";
      db.match.winnerId = db.match.result === "draw" ? null : db.match.scores[a] > db.match.scores[b] ? a : b;
    } else Object.assign(db.match, matchOutcome(db.match.players, db.match.scores, counts));
    delete db.match.incompleteReason;
    db.match.completedAt = this.now(db);
    db.match.state = "completed";
    for (const job of db.jobs.filter(
      (j) => (j.status === "queued" || (j.type === "generation" && j.status === "leased")),
    )) {
      job.status = "cancelled";
      job.leaseExpiresAt = null;
      const s = db.scenarios.find((s) => s.id === job.scenarioId);
      if (s && job.type === "delivery") s.deliveryStatus = "cancelled";
      if (s && job.type === "generation") { s.generationStatus = "failed"; s.generationReason = "The week ended before this draft was finished."; }
    }
    if (!db.match.standingsApplied) {
      const league = db.leagues?.find((l) => l.id === db.match.leagueId);
      for (const id of db.match.players) {
        const profile = league?.standings?.[id] ?? db.profiles.find((p) => p.id === id)!;
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
  /** Receipt ingress only reconciles ended matches; it never dispatches queued mail. */
  async settleEmailReceipts() {
    await this.transact((db) => {
      if (["active", "resolving"].includes(db.match.state) && this.now(db) >= db.match.deadline)
        this.finalizeDb(db);
    });
  }
  async reset(fresh = false) {
    if (!this.simulated && !(this.config.emailCapture && fresh))
      throw new ApiError(403, "Demo controls disabled in live mode");
    await this.transact((db) => {
      const sessions = db.sessions;
      for (const key of Object.keys(db)) delete (db as unknown as Record<string, unknown>)[key];
      Object.assign(db, fresh ? createFreshSeed(Date.now()) : createSeed(Date.now()));
      db.sessions = fresh ? [] : sessions;
      if (this.config.ruleSet === "email-casts-v2") initializeEmailRules(db, this.now(db));
    });
  }
  async advance(minutes: number) {
    if (!this.simulated)
      throw new ApiError(403, "Demo controls disabled in live mode");
    await this.transact((db) => {
      db.clockOffset += minutes * 60000;
    });
    await this.tickAll();
  }
  async release(recipientId?: string, all = false) {
    if (!this.simulated)
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
        if (initial.match.result !== "incomplete" || !this.unresolvedDeliveries(initial)) await this.finalize();
        return;
      }
      for (let i = 0; i < 24; i++) {
        const snapshot = await this.readDb();
        if (["completed", "cancelled"].includes(snapshot.match.state)) return;
        if (["active", "resolving"].includes(snapshot.match.state) && this.now(snapshot) >= snapshot.match.deadline) {
          if (snapshot.match.result !== "incomplete" || !this.unresolvedDeliveries(snapshot)) await this.finalize();
          return;
        }
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
    const promptBased = s.contentPolicy === "email-prompt-v3" || s.contentPolicy === "message-prompt-v1";
    const originalContent = job.generationInput?.fixture ?? (promptBased ? s.content : fixtureContent(s.channel, s.templateId, true));
    let result: GenerationResult;
    try {
      const generate = s.contentPolicy === "message-prompt-v1" ? generateMessageLure : generateContent;
      result = await generate(job.generationInput ?? {
        policy: s.contentPolicy,
        channel: s.channel,
        interest: s.interest,
        templateId: s.templateId,
        fixture: originalContent,
        ...(promptBased ? { authorPrompt: s.authorPrompt } : s.authorId ? { scouting: { interest: s.interest, markdown: getScouting(db, s.authorId, s.recipientId).markdown } } : {}),
      });
    } catch {
      result = {
        content: originalContent,
        source: "fallback" as const,
        model: "reviewed-fixture",
        promptVersion: promptBased ? s.contentPolicy! : "v1",
        reason: promptBased ? "Generation unavailable; the prepared draft around your topic was kept." : "Generation unavailable; reviewed fixture used",
      };
    }
    await this.transact((db) => {
      const draft = db.scenarios.find((s) => s.id === job.scenarioId);
      const current = db.jobs.find((j) => j.id === job.id);
      if (!draft || !current || draft.locked || current.status !== "leased" || current.attempts !== job.attempts) return;
      if (!["drafting", "active"].includes(db.match.state) || (db.match.state === "active" && this.now(db) >= db.match.deadline)) {
        current.status = "cancelled"; current.leaseExpiresAt = null;
        draft.generationStatus = "failed"; draft.generationReason = "The week ended before this draft was finished.";
        return;
      }
      if (
        this.exclusionReason(
          db,
          draft.recipientId,
          draft.templateId,
          result.content,
        )
      ) {
        const fallback = promptBased ? originalContent : fixtureContent(draft.channel, draft.templateId, true);
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
            "Recipient excluded this theme; choose another cast idea.";
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
      invalidateVoiceDraft(draft);
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
      if (!current || current.status !== "leased" || !s || db.attempts.some(attempt => attempt.scenarioId === s.id)) return null;
      const m = this.member(db, s.recipientId);
      const readiness = this.readiness(db, s.recipientId).find(
        (r) => r.channel === s.channel,
      );
      const simulated = readiness?.status === "simulated";
      const eligible =
        db.match.state === "active" &&
        !db.leagues?.find(league => league.id === db.match.leagueId)?.archivedAt &&
        this.now(db) < db.match.deadline &&
        m.accepted &&
        m.consent.adult &&
        !m.consent.paused &&
        m.consent.channels[s.channel] &&
        (db.leagues?.find((l) => l.id === db.match.leagueId)?.settings.channels[s.channel] ?? true) &&
        s.locked &&
        (s.channel !== "voice" || s.contentPolicy !== "message-prompt-v1" || voiceAudioApproved(s)) &&
        !this.exclusionReason(db, s.recipientId, s.templateId, s.content);
      if (!eligible) {
        current.status = "cancelled";
        s.deliveryStatus = "cancelled";
        return null;
      }
      if (!simulated && readiness?.status !== "ready") {
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
      const destination = m.consent.contacts[s.channel]?.destination ?? `fictional-${s.recipientId}`;
      db.attempts.push({
        id,
        scenarioId: s.id,
        recipientId: s.recipientId,
        channel: s.channel,
        provider:
          simulated
            ? "simulator"
            : s.channel === "email"
              ? "smtp"
              : "twilio",
        status: "queued",
        ...(!simulated && s.channel === "email" ? {
          recipientAddressHash: emailRecipientHash(destination),
          providerId: smtpMessageId(id, this.config.emailCapture ? "notifications@demo.test" : process.env.SMTP_FROM ?? ""),
        } : {}),
        ...(!simulated && s.channel !== "email" ? { recipientPhoneHash: phoneDestinationHash(destination) } : {}),
        createdAt: this.now(db),
        updatedAt: this.now(db),
        callbackIds: [],
      });
      return {
        id,
        scenario: s,
        destination,
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
      !(fresh.leagues?.find((l) => l.id === fresh.match.leagueId)?.settings.channels[s.channel] ?? true) ||
      fresh.match.state !== "active" ||
      this.now(fresh) >= fresh.match.deadline ||
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
    let submissionTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const submission = dispatch(
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
      ).catch((): DeliveryResult => ({
        status: "unknown",
        reason: "Provider submission outcome unknown; automatic retry disabled",
      }));
    let result: DeliveryResult;
    try {
      result = await Promise.race([submission, new Promise<DeliveryResult>(resolve => {
        submissionTimeout = setTimeout(() => {
          timedOut = true;
          resolve({ status: "unknown", reason: "Submission did not confirm within 25 seconds. It may have been sent; automatic retry is disabled." });
        }, 25000);
      })]);
    } finally {
      if (submissionTimeout) clearTimeout(submissionTimeout);
    }
    await this.recordDeliveryOutcome(job.id, s.id, prepared.id, result);
    // Keep evidence from the original submission if it acknowledges later.
    // This does not start another provider request or allow a retry.
    if (timedOut) void submission.then(late => this.recordDeliveryOutcome(job.id, s.id, prepared.id, late)).catch(() => undefined);
  }
  private async recordDeliveryOutcome(jobId: string, scenarioId: string, attemptId: string, result: DeliveryResult) {
    await this.transact((db) => {
      const current = db.jobs.find((j) => j.id === jobId),
        scenario = db.scenarios.find((item) => item.id === scenarioId),
        attempt = db.attempts.find((a) => a.id === attemptId);
      if (!current || !scenario || !attempt) return;
      // A receipt may beat the SMTP acknowledgement; later submission results
      // must not erase authenticated delivery or bounce evidence.
      if (attempt.receiptStatus) return;
      if (attempt.provider === "twilio" && attempt.callbackIds.length) {
        // Signed carrier evidence may arrive before create() acknowledges.
        // Its assigned SID and transport status outrank that later response.
        current.status = attempt.status === "failed" ? "failed" : attempt.status === "unknown" ? "unknown" : "complete";
        current.leaseExpiresAt = null;
        if (scenario.releasedAt === null && ["accepted", "delivered", "unanswered"].includes(attempt.status)) scenario.releasedAt = this.now(db);
        return;
      }
      current.status =
        result.status === "failed"
          ? "failed"
          : result.status === "unknown"
            ? "unknown"
            : "complete";
      current.leaseExpiresAt = null;
      attempt.status = result.status;
      attempt.providerId = result.providerId ?? attempt.providerId;
      attempt.reason = result.reason;
      attempt.updatedAt = this.now(db);
      scenario.deliveryStatus = result.status;
      if (result.status === "simulated" || result.status === "accepted")
        scenario.releasedAt = this.now(db);
    });
  }
  async challengeToken(token: string): Promise<{ scenario: Scenario; db: Database }> {
    const db = await this.readDb();
    const scenario = db.scenarios.find((s) => s.tokenHash === hash(token));
    if (!scenario && !(this.repo instanceof MatchRepository)) {
      const pool = db.matchPools?.find((p) => p.scenarios.some((s) => s.tokenHash === hash(token)));
      if (pool) return this.forMatch(pool.match.id).challengeToken(token);
    }
    if (
      !scenario ||
      db.leagues?.find(l => l.id === db.match.leagueId)?.archivedAt ||
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
