import { fixtureContent, type GenerationInput } from "@fp/shared";
import { generateEmailLure } from "../apps/api/src/email-lure.js";
import { buildEmailBrief, emailAuthoringQuality } from "../apps/api/src/email-authoring.js";

// Synthetic inputs only. This exercises drafting; it never creates accounts or sends mail.
const samples = [
  { id: "wings", name: "Wings and Broncos TNF promotion", prompt: "Jordan loves buffalo wings and the Denver Broncos. Write a local wing restaurant promotional deal for Broncos vs Chargers on Thursday Night Football, with a specific menu offer and table options." },
  { id: "chess", name: "Chess invitation", prompt: "They enjoy chess puzzles. Invite them to a relaxed puzzle evening with casual matches. Keep the tone conversational, without urgency." },
  { id: "baking", name: "Baking resource", prompt: "Interest: sourdough baking\nIdea: share a beginner technique guide, not an event invitation.\nTone: friendly and practical." },
  { id: "trains", name: "Model railway update", prompt: "They enjoy model trains. Write an update about an invented community exhibition with one concrete layout detail." },
  { id: "origami", name: "Sparse hobby", prompt: "origami" },
];

const live = process.argv.includes("--live");
const sampleId = process.argv.find(arg => arg.startsWith("--sample="))?.slice("--sample=".length);
const selected = sampleId ? samples.filter(sample => sample.id === sampleId) : samples;
if (!selected.length) throw new Error("Choose --sample=chess, baking, trains, or origami.");
if (live && !process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY locally before using --live. Never put it in a prompt.");
const env = live ? process.env : {};
process.stdout.write(`${live ? "Live Gemini" : "Offline fallback"} authoring check: ${selected.length} synthetic briefs; no email delivery.\n`);
let passed = 0;
let attempted = 0;
for (const sample of selected) {
  attempted++;
  const input: GenerationInput = {
    policy: "email-prompt-v3", channel: "email", templateId: "sender-prompt", interest: "Board games",
    authorPrompt: sample.prompt, fixture: fixtureContent("email", "ticket-drop", true),
  };
  const started = Date.now();
  let requests = 0;
  const completions: { status: number; finishReason?: string; blocked: boolean; thoughtTokens?: number; outputTokens?: number }[] = [];
  const result = await generateEmailLure(input, { env, fetcher: async (...args) => {
    requests++;
    const response = await fetch(...args);
    const metadata = await response.clone().json().catch(() => ({}));
    completions.push({ status: response.status, finishReason: metadata.candidates?.[0]?.finishReason,
      blocked: !!metadata.promptFeedback?.blockReason, thoughtTokens: metadata.usageMetadata?.thoughtsTokenCount, outputTokens: metadata.usageMetadata?.candidatesTokenCount });
    return response;
  } });
  const issues = emailAuthoringQuality(result.content, buildEmailBrief(sample.prompt));
  const ok = issues.length === 0 && (!live || result.source === "gemini");
  if (ok) passed++;
  process.stdout.write(`${JSON.stringify({ sample: sample.name, ok, source: result.source, model: result.model, promptVersion: result.promptVersion, requests, completions, elapsedMs: Date.now() - started, issues, reason: result.reason, subject: result.content.subject, body: result.content.bodyText }, null, 2)}\n`);
  if (completions.some(item => item.status === 429)) {
    process.stdout.write("Provider rate limit reached; remaining samples were skipped. Wait before running another live check.\n");
    break;
  }
}
process.stdout.write(`${passed}/${attempted} attempted samples passed format/topic checks; ${selected.length - attempted} skipped. This is a small writing smoke test, not evidence of recipient click rates.\n`);
if (passed !== selected.length) process.exitCode = 1;
