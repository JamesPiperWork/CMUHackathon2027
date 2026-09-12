import {
  interests,
  type ApprovedContent,
  type Channel,
  type Consent,
  type Database,
  type Profile,
  type GamePool,
  scoreDecision,
} from "./domain";
export const templateOptions = [
  {
    id: "ticket-drop",
    name: "The ticket upgrade",
    description: "An unexpected upgrade to your fictional night out.",
  },
  {
    id: "parcel-update",
    name: "The mystery parcel",
    description: "A delivery update with one detail out of place.",
  },
  {
    id: "game-night",
    name: "The guest-list shuffle",
    description: "A familiar hobby. An unfamiliar request.",
  },
] as const;
export function fixtureContent(
  channel: Channel,
  templateId: string,
  isPhishing: boolean,
): ApprovedContent {
  const ticket = templateId === "ticket-drop";
  const parcel = templateId === "parcel-update";
  if (isPhishing) {
    const brand = ticket
      ? "Juniper Sessions"
      : parcel
        ? "Mooncrate"
        : "Trail Club";
    const subject = ticket
      ? "Your backstage upgrade is waiting"
      : parcel
        ? "MC-204: one last delivery step"
        : "Saturday walk: your place needs confirming";
    const claim = ticket
      ? "Your JS-118 booking has been selected for a backstage upgrade. Confirm within ten minutes or your original tickets will be released."
      : parcel
        ? "Your Mooncrate parcel MC-204 is on hold. Approve a surprise delivery change in the next ten minutes to keep your Saturday slot."
        : "Your Saturday Trail Club place has moved to a special guest list. Confirm in ten minutes or we will pass your place to someone else.";
    const explanation = ticket
      ? "Your activity card says JS-118 is already confirmed, and you never requested an upgrade. The threat to release existing tickets creates pressure to act."
      : parcel
        ? "Your activity card says MC-204 is already scheduled for Saturday with no extra fee. This unexpected hold and ten-minute deadline are a reason to verify through a known route."
        : "You requested a walk reminder, not a guest-list change. A new deadline that threatens your place conflicts with the activity card.";
    return {
      subject,
      senderDisplayName: brand,
      bodyText: `Hi there! ${claim} Use the response below to keep your place.\n\n${brand} guest team`,
      smsText: `${brand}: ${claim} Check your response below.`,
      voiceScript: `Hello, this is the ${brand} guest team. ${claim} Please make your choice after this message.`,
      cueAnnotations: [
        "An unexpected change to a confirmed plan.",
        "A short deadline pushes you to act before checking.",
      ],
      explanation,
    };
  }
  const content: ApprovedContent =
    channel === "email"
      ? {
          subject: "Your Mooncrate order MC-204 is on its way",
          senderDisplayName: "Mooncrate",
          bodyText:
            "Your board-game expansion, order MC-204, is scheduled for Saturday. Everything is set and there is no extra fee. This is the delivery update you expected.\n\nMooncrate dispatch team",
          smsText:
            "Mooncrate: MC-204 is scheduled for Saturday. No extra fee. Your board-game expansion is on its way.",
          voiceScript:
            "Hello from Mooncrate. Your board-game expansion, order MC-204, is scheduled for Saturday. Everything is set. There is no extra fee, and no change to your order. This is your expected delivery reminder.",
          cueAnnotations: [
            "The order reference and timing match your activity card.",
            "No unexpected payment or change is requested.",
          ],
          explanation:
            "Within the game, this is the order update you expected: Mooncrate, MC-204, Saturday delivery, and no extra fee all match your activity card.",
        }
      : channel === "sms"
        ? {
            subject: "Friday plans: confirmed",
            senderDisplayName: "Juniper Sessions",
            bodyText:
              "Juniper Sessions: your two Friday tickets are confirmed. Booking JS-118. No changes or upgrades have been made. See you there!",
            smsText:
              "Juniper Sessions: your two Friday tickets are confirmed. Booking JS-118. No changes or upgrades. See you there!",
            voiceScript:
              "Hello from Juniper Sessions. This is a reminder that your two Friday tickets are confirmed under booking JS-118. No changes or upgrades have been made. Your existing tickets remain valid. We look forward to seeing you on Friday.",
            cueAnnotations: [
              "The booking code and two tickets match your activity card.",
            ],
            explanation:
              "Within the game, this confirms your existing JS-118 booking and two Friday tickets. It matches the activity card and makes no unexpected demand.",
          }
        : {
            subject: "Your requested Saturday walk reminder",
            senderDisplayName: "Trail Club",
            bodyText:
              "Here is the Saturday walk reminder you requested. Meet the Trail Club at the north gate at 10:30. Your place is confirmed; no other action is needed.",
            smsText:
              "Trail Club reminder: Saturday walk, north gate, 10:30. You requested this reminder. Your place is confirmed.",
            voiceScript:
              "Hello from Trail Club. Here is the Saturday walk reminder you requested. We will meet at the north gate at ten thirty. Your place is already confirmed, and no changes are needed. Bring comfortable shoes. We look forward to seeing you there.",
            cueAnnotations: [
              "You requested this reminder; location and time match your activity card.",
            ],
            explanation:
              "Within the game, this is your requested Trail Club reminder. The north gate, Saturday, and 10:30 match your activity card. No surprise change is introduced.",
          };
  return content;
}
/** Intentionally conservative demo review. A fixed cue and claim must survive edits. */
export function contentReview(content: ApprovedContent): {
  valid: boolean;
  reason?: string;
} {
  const visible = [
    content.subject,
    content.senderDisplayName,
    content.bodyText,
    content.smsText,
    content.voiceScript,
  ].join(" ");
  if (
    /https?:|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|passcode|one.time.code|otp|credit.card|bank.account|social.security|ssn|download|attachment|bitcoin|wire.transfer|nude|sex|suicide|hospital|police|arrest|employer|fired|eviction|ransom)\b/i.test(
      visible,
    )
  )
    return {
      valid: false,
      reason:
        "Use the approved low-stakes story. Links, contact addresses, secrets, and sensitive themes are not allowed.",
    };
  if (/<[^>]+>|```|javascript:|data:/i.test(visible))
    return {
      valid: false,
      reason: "Plain text only. The server supplies every action destination.",
    };
  if (/\b(?:kill|hate|idiot|stupid|loser|dumb)\b/i.test(visible))
    return { valid: false, reason: "Keep the rivalry friendly." };
  if (
    /\b(?:ignore (?:all|previous)|system prompt|you are now)\b/i.test(visible)
  )
    return { valid: false, reason: "Choose a story edit, not instructions." };
  return { valid: true };
}
export function scenarioConsistent(
  content: ApprovedContent,
  templateId: string,
): boolean {
  const required =
    templateId === "ticket-drop"
      ? ["JS-118", "upgrade"]
      : templateId === "parcel-update"
        ? ["MC-204", "hold"]
        : ["Saturday", "guest list"];
  return [content.bodyText, content.smsText, content.voiceScript].every(
    (text) =>
      required.every((term) =>
        text.toLowerCase().includes(term.toLowerCase()),
      ) && /ten minutes|ten-minute|10 minutes/i.test(text),
  );
}
export function createSeed(now = Date.now()): Database {
  const names = [
    "Alex",
    "Jordan",
    "Sam",
    "Riley",
    "Casey",
    "Morgan",
    "Jamie",
    "Taylor",
  ];
  const points = [12, 10, 18, 15, 9, 7, 5, 3];
  const colors = [
    "#44E2C3",
    "#FF927F",
    "#B7AAFF",
    "#E7CA87",
    "#9EBADF",
    "#C1D596",
    "#E8ADD2",
    "#77BECE",
  ];
  const profiles: Profile[] = names.map((name, i) => ({
    id: name.toLowerCase(),
    name,
    initials: name.slice(0, 1),
    color: colors[i],
    interests: [...interests],
    historical: i > 1,
    leaguePoints: points[i],
    wins: Math.floor(points[i] / 3),
    losses: i + 1,
    draws: points[i] % 3,
  }));
  const ranked = [...profiles].sort((a, b) => b.leaguePoints - a.leaguePoints);
  const db: Database = {
    version: 1,
    spearUses: [],
    archivedDrafts: [],
    revision: 0,
    clockOffset: 0,
    profiles,
    members: profiles.map((p) => ({
      userId: p.id,
      leagueId: "usual-suspects",
      accepted: p.historical,
      consent: {
        version: "2026-09-v1",
        acceptedAt: p.historical ? now : null,
        adult: p.historical,
        channels: {
          email: p.historical,
          sms: p.historical,
          voice: p.historical,
        },
        paused: false,
        timezone: "America/New_York",
        startHour: 10,
        endHour: 20,
        familyFriendly: true,
        excludedThemes: ["Medical emergencies", "Money trouble", "Humiliation"],
        contacts: {
          email: {
            destination: `${p.id}@demo.invalid`,
            verified: false,
            method: "demo",
          },
          sms: {
            destination: "Fictional demo phone",
            verified: false,
            method: "demo",
          },
          voice: {
            destination: "Fictional demo phone",
            verified: false,
            method: "demo",
          },
        },
      },
    })),
    match: {
      id: "match-week-04",
      week: 4,
      leagueId: "usual-suspects",
      players: ["alex", "jordan"],
      state: "drafting",
      seed: 20270912,
      deadline: now + 7 * 24 * 60 * 60 * 1000,
      startedAt: null,
      completedAt: null,
      scores: { alex: 0, jordan: 0 },
      result: null,
      winnerId: null,
      standingsApplied: false,
      standingsBefore: Object.fromEntries(ranked.map((p, i) => [p.id, i + 1])),
    },
    scenarios: [],
    decisions: [],
    scoreEvents: [],
    jobs: [],
    attempts: [],
    sessions: [],
    callbackIds: [],
  };
  initializeLeagues(db, now);
  return db;
}

/** Adds product data to older local saves without replacing a played match. */
export function initializeLeagues(db: Database, now = Date.now()) {
  if (db.leagues) return;
  db.match.week ??= 4;
  db.leagues = [{
    id: "usual-suspects", name: "The Usual Suspects", inviteCode: "USUAL27",
    commissionerId: "alex", currentWeek: 4, season: new Date(now).getFullYear(),
    settings: { difficulty: "standard", familyFriendly: true, channels: { email: true, sms: true, voice: true } },
    createdAt: now - 28 * 86400000,
  }];
  db.matchPools = [];
  db.chat = [];
  db.scouting = [
    { authorId: "alex", targetId: "jordan", leagueId: "usual-suspects", interests: [...interests], markdown: "# Jordan\n- Always organizes Friday concert plans.\n- Brings a new board game to our monthly game night.", updatedAt: now - 5 * 86400000 },
    { authorId: "jordan", targetId: "alex", leagueId: "usual-suspects", interests: [...interests], markdown: "# Alex\n- Loves a Saturday morning walk.\n- Keeps talking about the next board-game expansion.", updatedAt: now - 5 * 86400000 },
  ];
  db.userSelections = {};
  const history = [
    { players: ["alex", "riley"], author: "alex", target: "riley", text: "I saw Mooncrate and completely forgot to check the order number. Rematch next week?" },
    { players: ["jordan", "casey"], author: "jordan", target: "casey", text: "The backstage upgrade got me. I was already planning who to take." },
  ];
  for (const [index, entry] of history.entries()) {
    const completedAt = now - (3 - index) * 86400000;
    const pool = blankGame(`week-03-${entry.players.join("-")}`, "usual-suspects", entry.players, 3, completedAt - 7 * 86400000, true);
    Object.assign(pool.match, { state: "completed", completedAt, startedAt: completedAt - 7 * 86400000, deadline: completedAt, winnerId: entry.author, result: "win", standingsApplied: true });
    for (const recipientId of entry.players) {
      const authorId = entry.players.find((id) => id !== recipientId)!;
      for (let i = 0; i < 6; i++) {
        const channel = (["email", "sms", "voice"] as const)[i % 3];
        const isPhishing = i < 3;
        const templateId = channel === "email" ? "parcel-update" : channel === "sms" ? "ticket-drop" : "game-night";
        const id = `${pool.match.id}-${recipientId}-${i}`;
        const content = fixtureContent(channel, templateId, isPhishing);
        pool.scenarios.push({ id, matchId: pool.match.id, recipientId, authorId: isPhishing ? authorId : null, channel, templateId, interest: interests[i % 3], content, isPhishing, locked: true, source: "fixture", model: "synthetic-season-history", promptVersion: "v1", generationAttempts: 1, generationStatus: "complete", tokenHash: "", tokenExpiresAt: completedAt, releasedAt: completedAt - (6-i) * 3600000, deliveryStatus: "simulated", order: i });
        const mistake = recipientId === entry.target && i === index;
        const choice = isPhishing && !mistake ? "flag" as const : "trust" as const;
        const scored = scoreDecision(isPhishing, choice, isPhishing);
        const decision = { id: `${id}-decision`, scenarioId: id, recipientId, choice, ...scored, createdAt: completedAt - (6-i) * 3600000 + 45000 };
        pool.decisions.push(decision);
        pool.match.scores[recipientId] += scored.defenderPoints;
        if (scored.authorPoints) pool.match.scores[authorId] += scored.authorPoints;
        pool.scoreEvents.push({ id: `${id}-defense`, sourceId: decision.id, userId: recipientId, type: "defense", points: scored.defenderPoints });
        if (scored.authorPoints) pool.scoreEvents.push({ id: `${id}-attack`, sourceId: decision.id, userId: authorId, type: "author", points: scored.authorPoints });
      }
    }
    db.matchPools.push(pool);
    db.chat.push({ id: `chat-week3-${index}`, leagueId: "usual-suspects", userId: entry.target, body: entry.text, createdAt: completedAt + 120000, synthetic: true });
    db.chat.push({ id: `chat-week3-reply-${index}`, leagueId: "usual-suspects", userId: entry.author, body: index === 0 ? "You beat me on the Trail Club call though. See you in the playoffs." : "Next week I am checking every booking code twice.", createdAt: completedAt + 180000, synthetic: true });
  }
  for (const pair of [["sam", "riley"], ["casey", "morgan"], ["jamie", "taylor"]])
    db.matchPools.push(blankGame(`week-04-${pair.join("-")}`, "usual-suspects", pair, 4, now, true));
}

export function blankConsent(): Consent {
  return { version: "2026-09-email-v2", acceptedAt: null, adult: false,
    channels: { email: false, sms: false, voice: false }, paused: false,
    timezone: "UTC", startHour: 10, endHour: 20, familyFriendly: true,
    excludedThemes: [], contacts: {} };
}
/** Empty accounts and leagues by default; sample identities are explicit test fixtures. */
export function createFreshSeed(now = Date.now(), sampleAccounts = false): Database {
  const db = createSeed(now);
  db.accounts = sampleAccounts ? db.members.map(member => ({
    userId: member.userId,
    consent: { ...member.consent, acceptedAt: null, adult: false, channels: { email: false, sms: false, voice: false }, contacts: {}, excludedThemes: [] },
  })) : [];
  db.profiles = sampleAccounts ? db.profiles.map(profile => ({ ...profile, historical: false, leaguePoints: 0, wins: 0, losses: 0, draws: 0 })) : [];
  Object.assign(db, blankGame("setup", "", [], 1, now));
  db.match.state = "cancelled";
  db.match.ruleSet = "email-casts-v2";
  db.members = [];
  db.leagues = [];
  db.matchPools = [];
  db.chat = [];
  db.scouting = [];
  db.userSelections = {};
  return db;
}

export function blankGame(id: string, leagueId: string, players: string[], week: number, now: number, synthetic = false): GamePool {
  return {
    match: { id, leagueId, players, week, synthetic, state: "drafting", seed: 20270912 + week, deadline: now + 7 * 86400000, startedAt: null, completedAt: null, scores: Object.fromEntries(players.map((p) => [p, 0])), result: null, winnerId: null, standingsApplied: false, standingsBefore: {} },
    scenarios: [], decisions: [], scoreEvents: [], jobs: [], attempts: [],
  };
}
