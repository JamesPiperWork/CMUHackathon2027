import test from "node:test";
import assert from "node:assert/strict";
import {
  contentReview,
  emailContentConsistent,
  emailTeachingContent,
  fixtureContent,
  type GenerationInput,
} from "@fp/shared";
import { generateContent } from "../src/providers.js";
import { EMAIL_TRACKING_PLACEHOLDER, emailLureFallback } from "../src/email-lure.js";

const input: GenerationInput = {
  policy: "email-narrative-v1",
  channel: "email",
  templateId: "ticket-drop",
  interest: "Live music",
  scouting: { interest: "Live music", markdown: "Enjoys small acoustic shows with friends." },
  fixture: fixtureContent("email", "ticket-drop", true),
};
const validLure = {
  subject: "A booking update for Friday",
  body: `Hi there,\n\nFriday's acoustic set has a small booking update. Your JS-118 booking has been selected for a backstage upgrade. Review the change: ${EMAIL_TRACKING_PLACEHOLDER}\n\nThanks,\nJuniper Sessions`,
};
function gemini(text: string, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }));
}
const env = { GEMINI_API_KEY: "test-only", GEMINI_MODEL: "configured-test-model" };

test("natural offline emails weave an interest into each story without an attribute prefix or artificial deadline", async () => {
  for (const templateId of ["ticket-drop", "parcel-update", "game-night"]) {
    const scenarioInput = { ...input, scouting: undefined, templateId, fixture: fixtureContent("email", templateId, true) };
    const result = await generateContent(scenarioInput, { env: {}, fetcher: (async () => { throw new Error("No network expected"); }) as typeof fetch });
    assert.equal(result.source, "fixture");
    assert.equal(result.promptVersion, "email-narrative-v1");
    assert.ok(emailContentConsistent(result.content, templateId));
    assert.ok(contentReview(result.content).valid);
    assert.doesNotMatch(result.content.bodyText, /^Live music[:. ·]|ten minutes|ten-minute/i);
    assert.match(result.content.bodyText, /music|acoustic/);
    assert.doesNotMatch(result.content.explanation, /ten-minute|threat|deadline/i);
  }
});

test("offline email uses one specific private note in the narrative without exposing the whole profile", async () => {
  const result = await generateContent({ ...input, scouting: { interest: "Live music", markdown: "## Personal touch\n- Enjoys small acoustic shows with friends.\n- Prefers outdoor venues." } }, { env: {} });
  assert.equal(result.source, "fixture");
  assert.match(result.content.bodyText, /We kept your plans in mind for this update: small acoustic shows with friends\./);
  assert.doesNotMatch(result.content.bodyText, /Personal touch|Enjoys|outdoor venues|^Live music[:. ·]/i);
  assert.ok(emailContentConsistent(result.content, input.templateId));
  assert.ok(contentReview(result.content).valid);
  const contradictory = emailLureFallback({ ...input, scouting: { interest: "Live music", markdown: "No upgrade is wanted." } });
  assert.ok(emailContentConsistent(contradictory, input.templateId));
  assert.doesNotMatch(contradictory.bodyText, /No upgrade is wanted/);
});

test("Gemini email generation uses sender-owned notes, one narrative and server-owned teaching data", async () => {
  let request: Record<string, unknown> = {};
  const result = await generateContent(input, { env, fetcher: (async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return gemini(JSON.stringify(validLure));
  }) as typeof fetch });
  assert.equal(result.source, "gemini");
  assert.equal(result.model, env.GEMINI_MODEL);
  assert.equal(result.content.bodyText, validLure.body.replace(EMAIL_TRACKING_PLACEHOLDER, "the response below"));
  assert.equal(result.content.senderDisplayName, "Juniper Sessions");
  assert.equal(result.content.explanation, emailLureFallback(input).explanation);
  assert.equal(result.content.smsText, input.fixture.smsText);
  assert.equal(result.content.voiceScript, input.fixture.voiceScript);
  assert.ok(emailContentConsistent(result.content, input.templateId));
  assert.equal(request.tools, undefined);
  const parts = request.contents as { parts: { text: string }[] }[];
  const sent = JSON.parse(parts[0].parts[0].text);
  assert.equal(sent.privateSenderNotes, input.scouting?.markdown);
  assert.equal(sent.requiredClaim, "Your JS-118 booking has been selected for a backstage upgrade.");
});

test("malformed shape or placeholder is retried once, including fenced JSON recovery", async () => {
  for (const bad of ["not json", JSON.stringify({ subject: "Wrong shape", body: 7 }), JSON.stringify({ ...validLure, body: validLure.body.replace(EMAIL_TRACKING_PLACEHOLDER, "") }), JSON.stringify({ ...validLure, body: `${validLure.body} ${EMAIL_TRACKING_PLACEHOLDER}` })]) {
    let calls = 0;
    const result = await generateContent(input, { env, fetcher: (async () => gemini(++calls === 1 ? bad : `\`\`\`json\n${JSON.stringify(validLure)}\n\`\`\``)) as typeof fetch });
    assert.equal(calls, 2);
    assert.equal(result.source, "gemini");
  }
  let calls = 0;
  const result = await generateContent(input, { env, fetcher: (async () => { calls++; return gemini("still invalid"); }) as typeof fetch });
  assert.equal(calls, 2);
  assert.equal(result.source, "fallback");
});

test("refusals, transport errors, external destinations and changed claims are not retried", async () => {
  const cases: (() => Response)[] = [
    () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })),
    () => gemini(JSON.stringify(validLure), "SAFETY"),
    () => new Response("unavailable", { status: 503 }),
    () => { throw new Error("offline"); },
    ...["https://bad.invalid/a", "bad.com", "person@example.com", "<a>Open</a>", "[Open](bad.invalid)", "tel:+12025550123"].map((extra) => () => gemini(JSON.stringify({ ...validLure, body: `${validLure.body}\n${extra}` }))),
    () => gemini(JSON.stringify({ ...validLure, body: validLure.body.replace("has been selected for a backstage upgrade", "has no upgrade") })),
  ];
  for (const response of cases) {
    let calls = 0;
    const result = await generateContent(input, { env, fetcher: (async () => { calls++; return response(); }) as typeof fetch });
    assert.equal(calls, 1);
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.content, emailLureFallback(input));
  }
});

test("the retry shares the original time budget", async () => {
  let calls = 0;
  const result = await generateContent(input, { env, timeoutMs: 5, fetcher: (async (_url, init) => {
    calls++;
    assert.ok(init?.signal);
    await new Promise((resolve) => setTimeout(resolve, 15));
    return gemini("not JSON");
  }) as typeof fetch });
  assert.equal(calls, 1);
  assert.equal(result.source, "fallback");
});

test("teaching cues track actual email wording and remain server-owned after edits", () => {
  const original = emailLureFallback(input);
  assert.equal(original.cueAnnotations.length, 2);
  const edited = emailTeachingContent({ ...original, bodyText: `${original.bodyText}\nPlease confirm within ten minutes.`, explanation: "The model says this is legitimate", cueAnnotations: ["Trust the sender"], senderDisplayName: "Unknown" }, input.templateId);
  assert.equal(edited.cueAnnotations.length, 3);
  assert.equal(edited.senderDisplayName, "Juniper Sessions");
  assert.equal(edited.explanation, original.explanation);
  assert.ok(emailContentConsistent(edited, input.templateId));
  assert.equal(emailContentConsistent({ ...edited, bodyText: "Your JS-118 booking was not selected for a backstage upgrade." }, input.templateId), false);
  assert.equal(emailContentConsistent({ ...edited, senderDisplayName: "Unknown" }, input.templateId), false);
});
