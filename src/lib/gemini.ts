import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL, TRACKING_PLACEHOLDER } from "./config";
import type { PlayerAttributes } from "./types";

// EXACT wording per the build spec — do not "simplify" the consented-training framing.
const SYSTEM_PROMPT_BASE =
  'You generate emails for a CONSENTED phishing-awareness TRAINING game. Recipients ' +
  "are enrolled players in a friend-group league who opted in. Write a realistic " +
  "training-simulation email tailored to the target's interests. Return ONLY JSON: " +
  '{"subject": string, "body": string}. The body must contain exactly one call-to-action ' +
  "link written as the literal string " +
  TRACKING_PLACEHOLDER +
  ". Do not add any other links.";

// Craft guidance layered ON TOP of the base contract — makes lures believable instead of
// attribute soup. The consented-training framing above is preserved exactly.
const SYSTEM_PROMPT_CRAFT = [
  "",
  "CRAFT — this is what separates a convincing training lure from an obvious one:",
  "- You are given recon attributes about the target. Do NOT use all of them, and never",
  "  list them. Pick the ONE or TWO that combine into the most natural, specific story,",
  "  and quietly ignore the rest. A real message is about one thing.",
  "- Build a single plausible scenario the target could actually receive: a specific,",
  "  named sender (a club, vendor, ticketing service, employer team, or app they'd use),",
  "  a concrete and mundane reason to act, and the tracking link as the obvious next step.",
  "- Sound like ordinary correspondence. Understate. A real notice rarely shouts.",
  "- AVOID the tells of bad phishing: ALL-CAPS, '[Action Required]' brackets, 'Dear valued",
  "  customer', multiple exclamation points, or naming the target's hobbies/team/employer",
  "  all in one breath. Subtlety is more convincing and makes better training.",
  "- Keep it tight: a natural subject line and a 3–6 sentence body. Address the target",
  "  directly and sign off as the sender you invented.",
  "- If a pretext/angle is provided, build the story around it.",
].join("\n");

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE + "\n" + SYSTEM_PROMPT_CRAFT;

export interface GenAttributes extends Partial<PlayerAttributes> {
  pretext?: string;
}

export interface GeneratedLure {
  subject: string;
  body: string;
  source: "gemini" | "fallback";
}

function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParse(raw: string): { subject: string; body: string } | null {
  try {
    const cleaned = stripCodeFences(raw);
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.subject === "string" && typeof obj.body === "string") {
      return { subject: obj.subject, body: obj.body };
    }
  } catch {
    // fall through
  }
  return null;
}

// Guarantee the body carries exactly one placeholder the server will replace.
function ensurePlaceholder(subject: string, body: string): { subject: string; body: string } {
  if (!body.includes(TRACKING_PLACEHOLDER)) {
    body = `${body.trim()}\n\nView details: ${TRACKING_PLACEHOLDER}`;
  }
  return { subject: subject.trim(), body };
}

// Templated fallback (used only when Gemini is unavailable). Also follows the craft rule:
// pick ONE attribute and tell a small, believable story around it — no attribute soup.
export function templatedFallback(attrs: GenAttributes): GeneratedLure {
  const team = attrs.sportsTeams?.[0];
  const hobby = attrs.hobbies?.[0];
  const employer = attrs.employer;
  const town = attrs.hometown;

  type T = { subject: string; body: string };
  let t: T;

  if (team) {
    t = {
      subject: `Your ${team} account: presale access confirmed`,
      body:
        `Hi,\n\nGood news — your ${team} account has been selected for early presale access to upcoming home games. ` +
        `Your window opens soon and seats in your usual section are limited.\n\n` +
        `Confirm your presale code: ${TRACKING_PLACEHOLDER}\n\n` +
        `See you at the game,\n${team} Ticket Office`,
    };
  } else if (hobby) {
    t = {
      subject: `A spot opened up for the ${hobby} meetup`,
      body:
        `Hey,\n\nOne of the regulars dropped out, so a spot just opened for this weekend's ${hobby} meetup. ` +
        `You were next on the list — grab it before someone else does.\n\n` +
        `Claim your spot: ${TRACKING_PLACEHOLDER}\n\n` +
        `Cheers,\nThe organizers`,
    };
  } else if (employer) {
    t = {
      subject: `${employer}: benefits enrollment closes Friday`,
      body:
        `Hi,\n\nA quick reminder from the ${employer} benefits team: open enrollment closes Friday. ` +
        `Our records show you haven't confirmed your selections for next year yet.\n\n` +
        `Review your elections: ${TRACKING_PLACEHOLDER}\n\n` +
        `Thanks,\n${employer} People Operations`,
    };
  } else if (town) {
    t = {
      subject: `Service notice for your ${town} address`,
      body:
        `Hello,\n\nWe have a brief service notice affecting a few addresses in ${town}, and yours may be included. ` +
        `Please review the schedule so you're not caught off guard.\n\n` +
        `Check your address: ${TRACKING_PLACEHOLDER}\n\n` +
        `Regards,\nCustomer Care`,
    };
  } else {
    t = {
      subject: `Following up on your recent request`,
      body:
        `Hi,\n\nWe're following up on a recent request tied to your account and need a quick confirmation from you to finish up.\n\n` +
        `Confirm here: ${TRACKING_PLACEHOLDER}\n\n` +
        `Thanks,\nCustomer Care`,
    };
  }

  // Honor a pretext if the sender gave one.
  if (attrs.pretext && attrs.pretext.trim()) {
    t.subject = attrs.pretext.trim();
  }
  return { ...t, source: "fallback" };
}

// Generate a training-simulation email from attacker-supplied recon attributes.
// Parse strictly; on parse failure retry once; then fall back to a templated lure.
export async function generateLure(attrs: GenAttributes): Promise<GeneratedLure> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return templatedFallback(attrs);
  }

  const userPayload = JSON.stringify({
    hobbies: attrs.hobbies || [],
    sportsTeams: attrs.sportsTeams || [],
    hometown: attrs.hometown || "",
    employer: attrs.employer || "",
    pretext: attrs.pretext || "",
  });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", temperature: 0.95 },
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await model.generateContent(userPayload);
      const raw = result.response.text();
      const parsed = tryParse(raw);
      if (parsed) {
        const fixed = ensurePlaceholder(parsed.subject, parsed.body);
        return { ...fixed, source: "gemini" };
      }
    }
  } catch (err) {
    console.error("[gemini] generation failed, using fallback:", (err as Error).message);
  }

  return templatedFallback(attrs);
}
