import test from "node:test";
import assert from "node:assert/strict";
import { contentReview, emailPromptContentValid, fixtureContent, type GenerationInput } from "@fp/shared";
import { buildEmailBrief, emailAuthoringQuality } from "../src/email-authoring.js";
import { EMAIL_TRACKING_PLACEHOLDER } from "../src/email-lure.js";
import { generateContent } from "../src/providers.js";

const env = { GEMINI_API_KEY: "test-only", GEMINI_MODEL: "configured-test-model" };
const input = (authorPrompt: string): GenerationInput => ({
  policy: "email-prompt-v3", channel: "email", templateId: "sender-prompt",
  interest: "Live music", authorPrompt, fixture: fixtureContent("email", "ticket-drop", true),
});
const chessBrief = "They enjoy chess. Invite them to a friendly puzzle evening with casual matches.";
const chessEmail = {
  subject: "A friendly chess puzzle evening",
  body: `Hi there,\n\nOur chess circle is putting together a relaxed puzzle evening. Try a few opening puzzles, then compare ideas over a casual match. If that sounds like a good evening, confirm your interest using ${EMAIL_TRACKING_PLACEHOLDER}.\n\nThanks,\nCedar Chess Circle`,
};
const unrelatedEmail = {
  subject: "Join a community seed swap",
  body: `Hi there,\n\nOur garden club is planning a relaxed seed swap. Bring an idea for a small flower bed and compare growing tips with fellow gardeners. Confirm your interest using ${EMAIL_TRACKING_PLACEHOLDER}.\n\nThanks,\nCedar Circle`,
};
const parsed = (email: { subject: string; body: string }) => ({ subject: email.subject, bodyText: email.body.replace(EMAIL_TRACKING_PLACEHOLDER, "the response below") });
function gemini(email: { subject: string; body: string }, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(email) }] } }] }));
}

test("a multiline brief separates the interest from the suggested event and writing style", () => {
  const brief = buildEmailBrief("Interest: chess\nIdea: a friendly puzzle evening\nTone: warm and concise");
  assert.match(brief.topic, /chess/i);
  assert.doesNotMatch(brief.topic, /interest:|idea:|tone:|warm|concise/i);
  assert.ok(brief.topicTerms.includes("chess"));
  assert.equal(brief.angle, "invitation");
});

test("the brief distinguishes useful resources and updates from invitations", () => {
  const resource = buildEmailBrief("They enjoy sourdough baking. Share a beginner technique guide.");
  assert.match(resource.topic, /sourdough baking/i);
  assert.equal(resource.angle, "resource");
  const update = buildEmailBrief("They enjoy model trains. Write an update about a community exhibition.");
  assert.match(update.topic, /model trains/i);
  assert.equal(update.angle, "update");
});

test("negative guidance and an explicit angle change take precedence over a mentioned guide", () => {
  assert.equal(buildEmailBrief("They enjoy model trains. Write an update, not a guide.").angle, "update");
  const original = "They enjoy chess. Share a beginner strategy guide.";
  assert.equal(buildEmailBrief(original).angle, "resource");
  assert.equal(buildEmailBrief(original, "Make this an invitation instead.").angle, "invitation");
  assert.equal(buildEmailBrief(original, "Turn this guide into a friendly invitation.").angle, "invitation");
  assert.equal(buildEmailBrief(original, "Make it shorter and more conversational.").angle, "resource");
});

test("quality review accepts a topical email and detects a mismatched body even with a topical subject", () => {
  const brief = buildEmailBrief(chessBrief);
  assert.deepEqual(emailAuthoringQuality(parsed(chessEmail), brief), []);
  assert.ok(emailAuthoringQuality(parsed(unrelatedEmail), brief).includes("topic_missing"));
  assert.ok(emailAuthoringQuality({ ...parsed(unrelatedEmail), subject: chessEmail.subject }, brief).includes("topic_missing"));
  assert.ok(emailAuthoringQuality({ ...parsed(unrelatedEmail), bodyText: `${parsed(unrelatedEmail).bodyText}\n\nCedar Chess Circle` }, brief).includes("topic_missing"));
});

test("topic checks do not confuse short words with substrings or drop a concise substantive paragraph", () => {
  const art = buildEmailBrief("They enjoy art. Invite them to a friendly drawing afternoon.");
  assert.ok(emailAuthoringQuality({ subject: "An art invitation", bodyText: "Join our party and bring an empty carton. Compare ideas over refreshments using the response below." }, art).includes("topic_missing"));
  assert.deepEqual(emailAuthoringQuality({ subject: "Three chess puzzles", bodyText: "Hello,\n\nTry three chess puzzles using the response below." }, buildEmailBrief(chessBrief)), []);
});

test("quality feedback distinguishes boilerplate, private instructions, invented history, and missing resources", () => {
  const brief = buildEmailBrief(chessBrief);
  const email = parsed(chessEmail);
  for (const [prefix, issue] of [
    ["I hope this email finds you well.", "generic_boilerplate"],
    ["Here is your email, based on the private brief.", "brief_leak"],
    ["We noticed your chess performances.", "unsupported_familiarity"],
  ] as const) {
    assert.ok(emailAuthoringQuality({ ...email, bodyText: `${prefix}\n\n${email.bodyText}` }, brief).includes(issue));
  }
  const resourceBrief = buildEmailBrief("They enjoy chess. Share a beginner strategy guide.");
  assert.ok(emailAuthoringQuality(email, resourceBrief).includes("resource_missing"));
  assert.deepEqual(emailAuthoringQuality({ subject: "A short chess strategy guide", bodyText: "Hello,\n\nOur chess guide explores opening principles and common mistakes. Each section pairs a position with a short explanation. Browse the guide using the response below.\n\nThanks,\nCedar Chess Circle" }, resourceBrief), []);
});

test("a valid but unrelated model response receives one targeted rewrite", async () => {
  const requests: Record<string, unknown>[] = [];
  const result = await generateContent(input(chessBrief), { env, fetcher: (async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push(JSON.parse(request.contents[0].parts[0].text));
    return gemini(requests.length === 1 ? unrelatedEmail : chessEmail);
  }) as typeof fetch });
  assert.equal(requests.length, 2);
  assert.equal(result.source, "gemini");
  assert.equal(result.promptVersion, "email-authoring-v4");
  assert.equal(result.content.subject, chessEmail.subject);
  assert.equal(result.content.bodyText, parsed(chessEmail).bodyText);
  assert.equal(requests[1].authorPrompt, chessBrief);
  assert.ok(requests[1].correction, "The revision request must explain the quality problem");
  assert.match(JSON.stringify(requests[1].correction), /topic|chess|brief|relevan/i);
  assert.ok(emailPromptContentValid(result.content));
  assert.ok(contentReview(result.content).valid);
});

test("a second unrelated response falls back to the author's topic without more provider calls", async () => {
  let calls = 0;
  const result = await generateContent(input(chessBrief), { env, fetcher: (async () => { calls++; return gemini(unrelatedEmail); }) as typeof fetch });
  assert.equal(calls, 2);
  assert.equal(result.source, "fallback");
  assert.match(result.content.subject, /chess/i);
  assert.match(result.content.bodyText, /chess/i);
  assert.doesNotMatch(result.content.bodyText, /garden club|seed swap|backstage|parcel/i);
  assert.ok(emailPromptContentValid(result.content));
  assert.ok(contentReview(result.content).valid);
});

test("a good topical response needs no rewrite or separate model scoring request", async () => {
  let calls = 0;
  const result = await generateContent(input(chessBrief), { env, fetcher: (async () => { calls++; return gemini(chessEmail); }) as typeof fetch });
  assert.equal(calls, 1);
  assert.equal(result.source, "gemini");
  assert.deepEqual(emailAuthoringQuality(result.content, buildEmailBrief(chessBrief)), []);
});

test("refining a resource into an invitation accepts the requested change without forcing the old angle", async () => {
  const authorPrompt = "They enjoy chess. Share a beginner strategy guide.";
  const previousDraft = {
    subject: "A short chess strategy guide", senderDisplayName: "Maple Chess Circle",
    bodyText: "Hello,\n\nOur chess guide explores opening principles and common mistakes. Each section pairs a position with a short explanation. Browse the guide using the response below.\n\nThanks,\nMaple Chess Circle",
  };
  const refinement = "Turn this guide into a friendly invitation.";
  let calls = 0;
  const result = await generateContent({ ...input(authorPrompt), previousDraft, refinement }, { env, fetcher: (async (_url, init) => {
    calls++;
    const payload = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    assert.equal(payload.requestedChange, refinement);
    return gemini({ ...chessEmail, body: chessEmail.body.replace("Cedar Chess Circle", previousDraft.senderDisplayName) });
  }) as typeof fetch });
  assert.equal(calls, 1);
  assert.equal(result.source, "gemini");
  assert.equal(result.content.subject, chessEmail.subject);
  assert.equal(result.content.senderDisplayName, previousDraft.senderDisplayName);
});

test("an output-limit response stops after one request and accurately explains the fallback", async () => {
  let calls = 0;
  const result = await generateContent(input(chessBrief), { env, fetcher: (async () => { calls++; return gemini(chessEmail, "MAX_TOKENS"); }) as typeof fetch });
  assert.equal(calls, 1);
  assert.equal(result.source, "fallback");
  assert.match(result.reason!, /output limit/i);
  assert.doesNotMatch(result.reason!, /refused/i);
  assert.ok(emailPromptContentValid(result.content));
});

test("provider rate limits stop immediately, explain the wait, and preserve the user's current edits", async () => {
  const previousDraft = { ...parsed(chessEmail), subject: "My chess puzzle evening", bodyText: parsed(chessEmail).bodyText.replace("Cedar Chess Circle", "Maple Chess Circle"), senderDisplayName: "Maple Chess Circle" };
  let calls = 0;
  const result = await generateContent({ ...input(chessBrief), previousDraft, refinement: "Make the opening more conversational." }, {
    env, fetcher: (async () => { calls++; return new Response("Rate limited", { status: 429 }); }) as typeof fetch,
  });
  assert.equal(calls, 1);
  assert.equal(result.source, "fallback");
  assert.match(result.reason!, /rate limit/i);
  assert.match(result.reason!, /wait/i);
  assert.equal(result.content.subject, previousDraft.subject);
  assert.equal(result.content.bodyText, previousDraft.bodyText);
  assert.equal(result.content.senderDisplayName, previousDraft.senderDisplayName);
  assert.match(result.reason!, /current email was kept/i);
});

test("Gemini 3 thinking settings are not sent to an older configured model", async () => {
  for (const model of ["gemini-3.6-flash", "gemini-2.5-flash"]) {
    let configuration: Record<string, unknown> = {};
    const result = await generateContent(input(chessBrief), { env: { ...env, GEMINI_MODEL: model }, fetcher: (async (_url, init) => {
      configuration = JSON.parse(String(init?.body)).generationConfig;
      return gemini(chessEmail);
    }) as typeof fetch });
    assert.equal(result.source, "gemini");
    assert.equal(result.model, model);
    if (model === "gemini-3.6-flash") assert.deepEqual(configuration.thinkingConfig, { thinkingLevel: "low" });
    else assert.equal(configuration.thinkingConfig, undefined);
  }
});

test("an unsuccessful refinement preserves the user's email and fictional sender", async () => {
  const previousDraft = { ...parsed(chessEmail), bodyText: parsed(chessEmail).bodyText.replace("Cedar Chess Circle", "Maple Chess Circle"), senderDisplayName: "Maple Chess Circle" };
  let calls = 0;
  const result = await generateContent({ ...input(chessBrief), previousDraft, refinement: "Make the invitation shorter and more conversational." }, {
    env, fetcher: (async () => { calls++; return gemini(unrelatedEmail); }) as typeof fetch,
  });
  assert.equal(calls, 2);
  assert.equal(result.source, "fallback");
  assert.equal(result.content.senderDisplayName, previousDraft.senderDisplayName);
  assert.equal(result.content.subject, previousDraft.subject);
  assert.equal(result.content.bodyText, previousDraft.bodyText);
  assert.match(result.reason!, /current email was kept/i);
});
