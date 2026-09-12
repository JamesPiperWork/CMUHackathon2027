import { z } from "zod";
import {
  interests,
  contentReview,
  contentSchema,
  type ApprovedContent,
  type Database,
  type Interest,
  type ScoutingProfile,
} from "@fp/shared";

export class ScoutingError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const scoutingInputSchema = z
  .object({
    interests: z.array(z.enum(interests)).min(1).max(3),
    markdown: z.string().max(1800),
  })
  .strict();

function authorizeScouting(db: Database, authorId: string, targetId: string) {
  if (authorId === targetId)
    throw new ScoutingError(
      403,
      "Choose someone else in your league for this bait.",
    );
  const author = db.members.find(
    (m) => m.userId === authorId && m.leagueId === db.match.leagueId,
  );
  const target = db.members.find(
    (m) => m.userId === targetId && m.leagueId === db.match.leagueId,
  );
  if (!author || !target)
    throw new ScoutingError(
      403,
      "Personal notes are private to members of the same league.",
    );
}

/** Lightweight Markdown stays inert text; no rendering, links, external retrieval, or model instructions. */
export function validateScoutingMarkdown(markdown: string) {
  const plain = markdown
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "");
  const checked = contentReview({
    subject: "Personal notes",
    senderDisplayName: "Private bait ideas",
    bodyText: plain,
    smsText: plain,
    voiceScript: plain,
    cueAnnotations: ["Sender's personal notes."],
    explanation: "Personal notes are private context for fictional challenges.",
  });
  if (!checked.valid)
    throw new ScoutingError(
      400,
      checked.reason ?? "Use friendly details and fictional plans.",
    );
  if (
    /\b[a-z0-9-]+\.(?:com|net|org|io|app|gov|edu)\b|(?:\+?\d[\d ()-]{7,}\d)|!\[|\[[^\]]*\]\(|\b(?:home address|date of birth|credit|debt|diagnos\w*|medical|politic\w*|religio\w*|intimate|humiliat\w*|employee|workplace)\b/i.test(
      markdown,
    )
  )
    throw new ScoutingError(
      400,
      "Keep personal touches to hobbies and fictional plans. Leave out contact details, links, secrets, and sensitive personal facts.",
    );
  if (
    /\b(?:follow these instructions|ignore the|override|system message|developer message|reveal the answer|change the score)\b/i.test(
      markdown,
    )
  )
    throw new ScoutingError(
      400,
      "Use friendly details about their interests. Remove instructions aimed at changing the game.",
    );
}

/** The authenticated author is supplied by the service, never by a request body. */
export function getScouting(
  db: Database,
  authorId: string,
  targetId: string,
): ScoutingProfile {
  authorizeScouting(db, authorId, targetId);
  const existing = db.scouting?.find(
    (p) =>
      p.authorId === authorId &&
      p.targetId === targetId &&
      p.leagueId === db.match.leagueId,
  );
  return existing
    ? structuredClone(existing)
    : {
        authorId,
        targetId,
        leagueId: db.match.leagueId,
        interests: [],
        markdown: "",
        updatedAt: 0,
      };
}

export function saveScouting(
  db: Database,
  authorId: string,
  targetId: string,
  input: unknown,
  now: number,
): ScoutingProfile {
  authorizeScouting(db, authorId, targetId);
  const parsed = scoutingInputSchema.parse(input);
  validateScoutingMarkdown(parsed.markdown);
  const profile: ScoutingProfile = {
    authorId,
    targetId,
    leagueId: db.match.leagueId,
    interests: [...new Set(parsed.interests)],
    markdown: parsed.markdown.trim(),
    updatedAt: now,
  };
  db.scouting ??= [];
  const index = db.scouting.findIndex(
    (p) =>
      p.authorId === authorId &&
      p.targetId === targetId &&
      p.leagueId === db.match.leagueId,
  );
  if (index < 0) db.scouting.push(profile);
  else db.scouting[index] = profile;
  return structuredClone(profile);
}

export function scoutingContext(markdown: string) {
  validateScoutingMarkdown(markdown);
  return (
    markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}\s/.test(line))
      .map((line) =>
        line
          .replace(/^(?:[-*+]\s+|\d+\.\s+)/, "")
          .replace(/[*_`~]/g, "")
          .replace(
            /^(?:interests?|play style|bait angle|notes?|context|hook)\s*:\s*/i,
            "",
          )
          .trim(),
      )
      .find(
        (line) =>
          line &&
          !interests.some(
            (interest) => line.toLowerCase() === interest.toLowerCase(),
          ),
      ) ?? ""
  );
}

/** Personalization also works offline: fixed claims/cues remain, the sender's chosen angle becomes copy. */
export function personalizeFixture(
  fixture: ApprovedContent,
  interest: Interest,
  scouting?: { interest: Interest; markdown: string },
): ApprovedContent {
  if (!scouting) return fixture;
  if (!interests.includes(interest) || scouting.interest !== interest)
    throw new ScoutingError(400, "Choose an interest for your bait first.");
  const context = scoutingContext(scouting.markdown);
  const detail = (
    context.length > 64 ? context.slice(0, 64).replace(/\s+\S*$/, "") : context
  ).replace(/[.!?;,:]+$/, "");
  const prefix = `${interest}${detail ? ` · ${detail}` : ""}. `;
  const values = { ...fixture };
  for (const [field, max] of [
    ["bodyText", 700],
    ["smsText", 300],
    ["voiceScript", 440],
  ] as const) {
    if (values[field].includes(prefix.trim())) continue;
    const room = max - values[field].length;
    if (room < prefix.length)
      throw new ScoutingError(
        400,
        "Personalized copy exceeds the channel limit. Shorten the wording before generating.",
      );
    values[field] = prefix + values[field];
  }
  if (!values.subject.toLowerCase().includes(interest.toLowerCase()))
    values.subject = `${interest}: ${values.subject}`.slice(0, 100);
  const checked = contentSchema.parse(values);
  const review = contentReview(checked);
  if (!review.valid)
    throw new ScoutingError(
      400,
      review.reason ??
        "These personal details couldn't be used. Try a hobby or fictional plan.",
    );
  return checked;
}
