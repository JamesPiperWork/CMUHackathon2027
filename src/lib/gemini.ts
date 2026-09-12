import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL, TRACKING_PLACEHOLDER } from "./config";
import type { PlayerAttributes } from "./types";

// EXACT wording per the build spec — do not "simplify" the consented-training framing.
const SYSTEM_PROMPT =
  'You generate emails for a CONSENTED phishing-awareness TRAINING game. Recipients ' +
  "are enrolled players in a friend-group league who opted in. Write a realistic " +
  "training-simulation email tailored to the target's interests. Return ONLY JSON: " +
  '{"subject": string, "body": string}. The body must contain exactly one call-to-action ' +
  "link written as the literal string " +
  TRACKING_PLACEHOLDER +
  ". Do not add any other links.";

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
    body = `${body.trim()}\n\nTap here to continue: ${TRACKING_PLACEHOLDER}`;
  }
  return { subject: subject.trim(), body };
}

export function templatedFallback(attrs: GenAttributes): GeneratedLure {
  const team = attrs.sportsTeams?.[0];
  const hobby = attrs.hobbies?.[0];
  const employer = attrs.employer;
  const hook = team
    ? `${team} season-ticket holder update`
    : hobby
    ? `Your ${hobby} club membership needs attention`
    : employer
    ? `${employer} benefits portal — action required`
    : "Your account needs attention";
  const subject = `[Action needed] ${hook}`;
  const body =
    `Hi there,\n\n` +
    `We noticed something that needs your attention regarding ${team || hobby || employer || "your account"}. ` +
    `To avoid any interruption, please review the details as soon as possible.\n\n` +
    `Review now: ${TRACKING_PLACEHOLDER}\n\n` +
    `Thanks,\nMember Services`;
  return { subject, body, source: "fallback" };
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
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
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
