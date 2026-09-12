import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSeed, type DeliveryResult } from "@fp/shared";
import { FileRepository, gamePools } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import { getReadiness, SmtpAdapter } from "../src/providers.js";
import { signEmailReceipt, type EmailReceipt } from "../src/email-receipts.js";

test("only the verified SMTP organizer can reset active leagues; in-flight evidence, quotas and account access survive", { timeout: 5000 }, async () => {
  const env = { SMTP_USER: "alex@example.invalid", SMTP_FROM: "alex@example.invalid", SMTP_HOST: "smtp.example.invalid", SMTP_PASS: "test-only",
    EMAIL_DEMO_SEND_ENABLED: "true", EMAIL_DEMO_RECIPIENTS: "", SESSION_SECRET: "s".repeat(32), TOKEN_SECRET: "t".repeat(32), EMAIL_RECEIPT_RELAY_SECRET: "r".repeat(32) };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const originalSend = SmtpAdapter.prototype.send;
  const dir = await mkdtemp(join(tmpdir(), "fp-real-reset-")), file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => {
    const db = createSeed();
    // Synthetic test evidence only; the SMTP adapter is replaced before running any job.
    for (const member of db.members) {
      member.accepted = true;
      Object.assign(member.consent, { adult: true, acceptedAt: Date.now(), timezone: "UTC", startHour: 0, endHour: 24, channels: { email: true, sms: false, voice: false } });
      member.consent.contacts.email = { destination: `${member.userId}@example.invalid`, verified: true, method: "verify", verifiedAt: Date.now() };
    }
    db.accounts = db.members.map(member => ({ userId: member.userId, consent: structuredClone(member.consent) }));
    return db;
  });
  const service = new GameService(repo, { mode: "demo", emailDemo: true, ruleSet: "email-casts-v2", port: 0,
    apiOrigin: "https://demo.example.invalid", appOrigin: "https://demo.example.invalid", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const { app } = await createServer(service, { startJobs: false });
  let releaseSend!: (result: DeliveryResult) => void;
  let sending: Promise<void> | undefined;
  try {
    const organizer = await service.createSession("alex"), other = await service.createSession("jordan");
    const post = (url: string, payload: object, token = organizer.token) => app.inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${token}` } });
    assert.equal((await app.inject({ url: "/api/state", headers: { authorization: `Bearer ${organizer.token}` } })).json().demoReset, "active-leagues");
    assert.equal((await app.inject({ url: "/api/state", headers: { authorization: `Bearer ${other.token}` } })).json().demoReset, null);
    assert.equal((await post("/api/demo/reset", { confirm: "RESET" }, other.token)).statusCode, 403);
    const ids: string[] = [];
    for (const selection of [{ kind: "regular" as const, slot: 1 as const }, { kind: "regular" as const, slot: 2 as const }, { kind: "spear" as const }]) {
      const prepared = await service.generate("alex", { recipientMemberId: "jordan", channel: "email", interest: "Board games", templateId: "parcel-update", ...selection }, true);
      ids.push(prepared.scenarioId); await service.lock("alex", prepared.scenarioId);
    }
    await service.activate("alex");
    await repo.transact(db => { for (const job of db.jobs) job.dueAt = Date.now() - 1; });
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<DeliveryResult>(resolve => { releaseSend = resolve; });
    let submissions = 0;
    SmtpAdapter.prototype.send = async () => { submissions++; started(); return pending; };
    sending = service.tick();
    await Promise.race([entered, sending.then(() => { throw new Error("Expected the mocked SMTP submission to start"); })]);
    const before = await repo.read();
    const archivedId = before.match.leagueId;
    const originalCode = before.leagues!.find(league => league.id === archivedId)!.inviteCode;
    const attempt = before.attempts[0];
    assert.equal(attempt.status, "queued");
    const completed = gamePools(before).filter(pool => pool.match.state === "completed");
    const response = await post("/api/demo/reset", { confirm: "RESET" });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { ok: true, preserveSession: true });
    let after = await repo.read();
    assert.equal(after.match.state, "cancelled");
    assert.equal(after.attempts[0].status, "unknown");
    assert.equal(after.attempts[0].id, attempt.id);
    assert.ok(after.jobs.filter(job => job.scenarioId !== ids[0]).every(job => job.status === "cancelled"));
    assert.deepEqual(after.spearUses, before.spearUses);
    assert.deepEqual(after.accounts, before.accounts);
    assert.deepEqual(gamePools(after).filter(pool => pool.match.state === "completed"), completed);
    releaseSend({ status: "accepted", providerId: attempt.providerId });
    await sending;
    after = await repo.read();
    assert.equal(submissions, 1, "reset must not start another queued cast");
    assert.equal(after.attempts[0].status, "accepted", "the original SMTP outcome remains honest transport history");
    const challenge = new URL(service.actionUrl(after.scenarios.find(scenario => scenario.id === ids[0])!)).pathname;
    assert.equal((await app.inject(challenge)).statusCode, 410);
    const rooms = await app.inject({ url: "/api/leagues", headers: { authorization: `Bearer ${organizer.token}` } });
    assert.equal(rooms.json().leagues.length, 0);
    assert.equal(rooms.json().selectedLeagueId, "");
    assert.equal((await post("/api/leagues/join", { inviteCode: originalCode }, other.token)).statusCode, 404);
    assert.equal((await post(`/api/leagues/${archivedId}/select`, {})).statusCode, 404);
    assert.equal((await post(`/api/leagues/${archivedId}/chat`, { body: "Old league mutation" })).statusCode, 404);
    const fresh = (await post("/api/leagues", { name: "Another fishing day" })).json();
    assert.ok(fresh.id);
    assert.equal((await post("/api/leagues/join", { inviteCode: fresh.inviteCode }, other.token)).statusCode, 200);
    const selected = await service.forSession((await service.sessionForToken(organizer.token))!, true);
    const current = await selected.readDb();
    assert.equal(current.scenarios.length, 0);
    const quota = getReadiness(current, "jordan", Date.now(), { ...process.env, APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", API_ORIGIN: service.config.apiOrigin, APP_ORIGIN: service.config.appOrigin }).find(row => row.channel === "email")!.conditions.find(condition => condition.name === "Daily quota")!;
    assert.equal(quota.ok, false, "archived sends must still consume today's recipient quota");
    const receipt: EmailReceipt = { version: 1, eventId: "after-reset", attemptId: attempt.id, providerMessageId: attempt.providerId!, recipientId: "jordan", recipientAddress: "jordan@example.invalid", status: "delivered", occurredAt: Date.now() };
    const timestamp = String(Math.floor(Date.now() / 1000));
    assert.equal((await app.inject({ method: "POST", url: "/webhooks/email/receipts", payload: receipt,
      headers: { "x-fp-receipt-timestamp": timestamp, "x-fp-receipt-signature": signEmailReceipt(receipt, timestamp, env.EMAIL_RECEIPT_RELAY_SECRET) } })).statusCode, 204);
    after = await repo.read();
    assert.equal(after.emailReceipts!.at(-1)!.disposition, "terminal");
    assert.equal(after.match.state, "cancelled");
    assert.deepEqual(after.match.scores, before.match.scores);
    assert.deepEqual(after.spearUses, before.spearUses);
  } finally {
    releaseSend?.({ status: "unknown" });
    await sending;
    SmtpAdapter.prototype.send = originalSend;
    await app.close(); await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
