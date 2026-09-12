import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeed, emailSenderNameValid, fictionalEmailSender } from "@fp/shared";
import { gameplayEmailPresentation } from "../src/email-presentation.js";
import { emailPromptFallback } from "../src/email-lure.js";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";

const content = emailPromptFallback("Invite a chess enthusiast to a friendly puzzle afternoon.");
const actionUrl = "https://game.example.test/r/server-owned-token";
const smtpDemo = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", APP_ORIGIN: "https://game.example.test" };

test("SMTP demo retains explicit game labeling unless every training condition is recorded", () => {
  for (const partial of [{}, { EMAIL_PRESENTATION: "training" }, { EMAIL_PRESENTATION: "training", EMAIL_PERMISSION_REFERENCE: "" }, { EMAIL_PRESENTATION: "training", EMAIL_PERMISSION_REFERENCE: "approved-format", EMAIL_FORMAT_SUPPORTED: "false" }, { EMAIL_PERMISSION_REFERENCE: "approved-format", EMAIL_FORMAT_SUPPORTED: "true" }]) {
    const presented = gameplayEmailPresentation(content, actionUrl, { ...smtpDemo, ...partial });
    assert.equal(presented.fromName, "Fantasy Phishing");
    assert.equal(presented.subject, `[Game simulation] ${content.subject}`);
    assert.match(presented.text, /game simulation you agreed to receive/);
    assert.ok(presented.text.includes(content.bodyText));
    assert.ok(presented.text.includes(actionUrl));
    assert.match(presented.text, /Manage or pause game emails:/);
  }
});

test("approved SMTP training and local capture use fictional names and raw subjects while preserving applicable disclosures", () => {
  const approved = gameplayEmailPresentation(content, actionUrl, { ...smtpDemo, EMAIL_PRESENTATION: "training", EMAIL_PERMISSION_REFERENCE: "provider-approved-training-format", EMAIL_FORMAT_SUPPORTED: "true", EMAIL_DISCLOSURE_TEXT: "Required operator disclosure." });
  assert.equal(approved.fromName, "Cedar Chess Circle");
  assert.equal(approved.subject, content.subject);
  assert.doesNotMatch(approved.text, /game simulation you agreed to receive/);
  assert.match(approved.text, /^Required operator disclosure\./);
  assert.match(approved.text, /Manage or pause game emails:/);
  const captured = gameplayEmailPresentation(content, actionUrl, { ...smtpDemo, EMAIL_DELIVERY_MODE: "mailpit", EMAIL_DISCLOSURE_TEXT: "External provider disclosure." });
  assert.deepEqual(captured, { fromName: "Cedar Chess Circle", subject: content.subject, text: `${content.bodyText}\n\n${actionUrl}` });
  assert.deepEqual(Object.keys(captured), ["fromName", "subject", "text"], "Presentation cannot select the actual sending address");
});

test("legacy live email retains required disclosure independently of demo presentation flags", () => {
  const result = gameplayEmailPresentation(content, actionUrl, { APP_MODE: "live", EMAIL_PRESENTATION: "training", EMAIL_DISCLOSURE_TEXT: "Required live-format disclosure." });
  assert.equal(result.fromName, content.senderDisplayName);
  assert.equal(result.subject, content.subject);
  assert.equal(result.text, `Required live-format disclosure.\n\n${content.bodyText}\n\n${actionUrl}`);
});

test("email names and subjects cannot carry addresses, header injection, or invisible control characters", () => {
  for (const name of ["Cedar Chess Circle", "Willow Makers' Club", "Érable Arts Circle", "Maple Studio (West)"]) assert.ok(emailSenderNameValid(name), name);
  for (const name of ["A", "x".repeat(61), " Cedar Circle", "Cedar Circle ", "Cedar\r\nBcc: other@example.invalid", "Cedar\n", "Cedar\u0000Circle", "Cedar\u202eCircle", "Cedar\u2028Circle", "Cedar <other@example.invalid>", "other@example.invalid", "Cedar: Bcc", "Cedar; other", 'Cedar "other"', "cedar.example", "Cedar +12025550123"]) {
    assert.equal(emailSenderNameValid(name), false, name);
    assert.throws(() => gameplayEmailPresentation({ ...content, senderDisplayName: name }, actionUrl, smtpDemo));
  }
  for (const subject of ["Chess\r\nBcc:other@example.invalid", "Chess\u2028bcc", "Chess\u0000afternoon", "Chess\u202eafternoon"]) assert.throws(() => gameplayEmailPresentation({ ...content, subject }, actionUrl, smtpDemo));
  assert.throws(() => gameplayEmailPresentation(content, "javascript:alert(1)", smtpDemo));
  assert.throws(() => gameplayEmailPresentation(content, `${actionUrl}\r\nBcc:x`, smtpDemo));
  assert.equal(fictionalEmailSender("Pottery and ceramics"), "Willow Clay Studio");
  assert.equal(fictionalEmailSender("A community invitation"), "Willow Community Circle");
});

test("authors can edit an email name, retain it through refinement and restart, but cannot change phone identities or locked drafts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "fp-email-names-")), file = join(directory, "state.json");
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  let repo = await FileRepository.open(file, () => createSeed());
  const config = { mode: "demo" as const, ruleSet: "email-casts-v2" as const, port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  let service = new GameService(repo, config), { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await repo.close(); await rm(directory, { recursive: true, force: true }); if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
  for (const player of ["alex", "jordan"]) await service.consent(player, { adult: true, channels: { email: true, sms: true, voice: true }, timezone: "America/New_York", startHour: 10, endHour: 20, familyFriendly: true });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const headers = { authorization: `Bearer ${alex.token}` };
  const input = { recipientMemberId: "jordan", channel: "email", kind: "regular", slot: 1, authorPrompt: "Invite a chess enthusiast to a friendly puzzle afternoon." };
  const prepared = await app.inject({ method: "POST", url: "/api/drafts/prepare", headers, payload: input });
  assert.equal(prepared.statusCode, 200, prepared.body);
  const id = prepared.json().scenarioId;
  const patch = (payload: object, token = alex.token) => app.inject({ method: "PATCH", url: `/api/drafts/${id}`, headers: { authorization: `Bearer ${token}` }, payload });
  assert.equal((await patch({ senderDisplayName: "Cedar Chess Club" }, jordan.token)).statusCode, 404);
  for (const senderDisplayName of ["Cedar\r\n", "Cedar <other@example.invalid>", "Cedar: Bcc", "x".repeat(61)]) assert.equal((await patch({ senderDisplayName })).statusCode, 400);
  const edited = await patch({ senderDisplayName: "  Maple Chess Club  " });
  assert.equal(edited.statusCode, 200, edited.body);
  const before = (await repo.read()).scenarios.find(s => s.id === id)!;
  const revised = await app.inject({ method: "POST", url: "/api/drafts/generate", headers, payload: { ...input, refinement: "Make it shorter.", previousDraft: { subject: before.content.subject, bodyText: before.content.bodyText } } });
  assert.equal(revised.statusCode, 202, revised.body);
  assert.equal((await repo.read()).jobs[0].generationInput?.previousDraft?.senderDisplayName, "Maple Chess Club");
  await service.tick();
  assert.equal((await repo.read()).scenarios.find(s => s.id === id)!.content.senderDisplayName, "Maple Chess Club");
  await app.close(); await repo.close();
  repo = await FileRepository.open(file, () => { throw new Error("Persisted state required"); });
  service = new GameService(repo, config); ({ app } = await createServer(service, { startJobs: false }));
  const state = await app.inject({ method: "GET", url: "/api/state", headers });
  assert.equal(state.json().drafts.find((draft: { id: string }) => draft.id === id).content.senderDisplayName, "Maple Chess Club");
  const locked = await app.inject({ method: "POST", url: `/api/drafts/${id}/lock`, headers, payload: {} });
  assert.equal(locked.statusCode, 200, locked.body);
  assert.equal((await patch({ senderDisplayName: "Another Chess Club" })).statusCode, 409);
  const phoneInput = { ...input, channel: "sms", slot: 2 };
  const text = await app.inject({ method: "POST", url: "/api/drafts/prepare", headers, payload: phoneInput });
  assert.equal(text.statusCode, 200, text.body);
  const phoneDraft = (await repo.read()).scenarios.find(s => s.id === text.json().scenarioId)!;
  const phoneEdit = await app.inject({ method: "PATCH", url: `/api/drafts/${phoneDraft.id}`, headers, payload: { senderDisplayName: "Changed SMS identity" } });
  assert.equal(phoneEdit.statusCode, 400);
  const phoneRefine = await app.inject({ method: "POST", url: "/api/drafts/generate", headers, payload: { ...phoneInput, refinement: "Make it shorter.", previousDraft: { smsText: phoneDraft.content.smsText, senderDisplayName: "Changed SMS identity" } } });
  assert.equal(phoneRefine.statusCode, 400);
  assert.equal((await repo.read()).attempts.length, 0, "Editing and refining never sends email");
});
