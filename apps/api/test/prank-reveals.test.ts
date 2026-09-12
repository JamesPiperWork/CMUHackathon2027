import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "fp-prank-")), file = join(directory, "state.json");
  const repo = await FileRepository.open(file, () => createSeed());
  const config: Config = { mode: "demo", ruleSet: "email-casts-v2", port: 0, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 };
  const service = new GameService(repo, config), { app } = await createServer(service, { startJobs: false });
  for (const id of ["alex", "jordan"]) await service.consent(id, { adult: true, channels: { email: true, sms: true, voice: true }, timezone: "UTC", startHour: 0, endHour: 24, familyFriendly: true });
  const alex = await service.createSession("alex"), jordan = await service.createSession("jordan");
  const { scenarioId } = await service.generate("alex", { recipientMemberId: "jordan", channel: "email", authorPrompt: "A fictional chess club afternoon.", kind: "regular", slot: 1 }, true);
  const photo = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#50e3c2" } }).png().withMetadata({ exif: { IFD0: { Artist: "Private author metadata" } } }).toBuffer();
  const request = (method: "GET" | "POST" | "PUT" | "HEAD", url: string, payload?: object, token = alex.token) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const upload = (overrides: object = {}, token = alex.token) => request("POST", `/api/drafts/${scenarioId}/reveal/photo`, { mime: "image/png", base64: photo.toString("base64"), expectedRevision: "default", ...overrides }, token);
  const draft = async () => (await repo.read()).scenarios.find(item => item.id === scenarioId)!;
  const actionPath = async () => new URL(service.actionUrl(await draft())).pathname;
  t.after(async () => { await app.close(); await repo.close(); await rm(directory, { recursive: true, force: true }); });
  return { file, repo, service, app, alex, jordan, scenarioId, photo, request, upload, draft, actionPath };
}

test("uploaded photos decode to metadata-free WebP; only author can preview before Trust", async t => {
  const f = await setup(t), result = await f.upload();
  assert.equal(result.statusCode, 200, result.body);
  const saved = result.json(); assert.equal(saved.choice, "photo"); assert.equal(saved.base64, undefined); assert.equal(saved.photo, undefined);
  const preview = await f.request("GET", saved.imageUrl); assert.equal(preview.statusCode, 200); assert.match(preview.headers["content-type"]!, /image\/webp/); assert.match(preview.headers["cache-control"]!, /no-store/);
  const metadata = await sharp(preview.rawPayload).metadata(); assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 48); assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  assert.equal((await f.app.inject(saved.imageUrl)).statusCode, 401);
  assert.equal((await f.request("GET", saved.imageUrl, undefined, f.jordan.token)).statusCode, 404);
  const recipientUrl = saved.imageUrl.replace("/api/drafts/", "/api/scenarios/");
  assert.equal((await f.request("GET", recipientUrl, undefined, f.jordan.token)).statusCode, 404);
  assert.equal((await f.request("GET", recipientUrl)).statusCode, 404);
  const publicState = await f.request("GET", "/api/state"); assert.equal(publicState.statusCode, 200);
  assert.ok(!publicState.body.includes((await f.draft()).prankReveal!.photo!.base64));
  const reopened = await FileRepository.open(f.file, () => { throw new Error("Must reload persisted photo"); });
  assert.equal((await reopened.read()).scenarios.find(item => item.id === f.scenarioId)?.prankReveal?.revision, saved.revision); await reopened.close();
});

test("malformed images, mismatched MIME, animation, large payloads and unauthenticated uploads are rejected", async t => {
  const f = await setup(t);
  assert.equal((await f.upload({}, f.jordan.token)).statusCode, 404);
  assert.equal((await f.app.inject({ method: "POST", url: `/api/drafts/${f.scenarioId}/reveal/photo`, payload: {} })).statusCode, 401);
  for (const overrides of [
    { base64: "not base64" }, { base64: Buffer.from("<svg onload='alert(1)'></svg>").toString("base64") },
    { mime: "image/jpeg" }, { mime: "image/svg+xml" }, { base64: f.photo.subarray(0, 40).toString("base64") },
    { base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64") },
  ]) assert.equal((await f.upload(overrides)).statusCode, 400);
  const animated = Buffer.from("UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAQAAAQAAQU5JTQYAAAD/////AABBTk1GFgAAAAAAAAAAAAABAAABAAADAAAAAA==", "base64");
  assert.equal((await f.upload({ mime: "image/webp", base64: animated.toString("base64") })).statusCode, 400);
  assert.equal((await f.draft()).prankReveal, undefined);
});

test("preset changes enforce ownership and revision; replacing a photo revokes its old URLs", async t => {
  const f = await setup(t), uploaded = (await f.upload()).json(), url = `/api/drafts/${f.scenarioId}/reveal`;
  assert.equal((await f.request("PUT", url, { choice: "rubber-duck", expectedRevision: uploaded.revision }, f.jordan.token)).statusCode, 404);
  assert.equal((await f.request("PUT", url, { choice: "rubber-duck", expectedRevision: "default" })).statusCode, 409);
  assert.equal((await f.request("PUT", url, { choice: "https://evil.example", expectedRevision: uploaded.revision })).statusCode, 400);
  const results = await Promise.all(["gone-fishing", "rubber-duck"].map(choice => f.request("PUT", url, { choice, expectedRevision: uploaded.revision })));
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  assert.equal((await f.request("GET", uploaded.imageUrl)).statusCode, 404); assert.equal((await f.draft()).prankReveal?.photo, undefined);
  assert.equal((await f.upload({ expectedRevision: uploaded.revision })).statusCode, 409);
});

test("challenge GET and HEAD stay score-neutral; only recipient Trust unlocks the chosen reveal", async t => {
  const f = await setup(t), saved = (await f.upload()).json();
  const sent = await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {}); assert.equal(sent.statusCode, 200, sent.body);
  const url = await f.actionPath();
  for (const method of ["GET", "HEAD"] as const) {
    const page = await f.request(method, url, undefined, f.jordan.token); assert.equal(page.statusCode, 200); assert.ok(!page.body.includes(saved.revision));
  }
  assert.equal((await f.repo.read()).decisions.length, 0);
  const recipientUrl = saved.imageUrl.replace("/api/drafts/", "/api/scenarios/");
  assert.equal((await f.request("GET", recipientUrl, undefined, f.jordan.token)).statusCode, 404);
  assert.equal((await f.request("POST", url, { choice: "trust", csrf: f.jordan.csrf }, f.jordan.token)).statusCode, 302);
  const page = await f.request("GET", url, undefined, f.jordan.token); assert.match(page.body, /You’ve been phished/); assert.ok(page.body.includes(recipientUrl));
  assert.equal((await f.request("GET", recipientUrl, undefined, f.jordan.token)).statusCode, 200);
  assert.equal((await f.request("GET", recipientUrl)).statusCode, 404);
  await f.request("GET", url, undefined, f.jordan.token); await f.request("HEAD", recipientUrl, undefined, f.jordan.token);
  assert.equal((await f.repo.read()).decisions.length, 1); assert.equal((await f.repo.read()).match.scores.alex, 3); assert.equal((await f.repo.read()).match.scores.jordan, -1);
  assert.equal((await f.request("PUT", `/api/drafts/${f.scenarioId}/reveal`, { choice: "rickroll", expectedRevision: saved.revision })).statusCode, 409);
  assert.equal((await f.upload({ expectedRevision: saved.revision })).statusCode, 409);
});

test("Flag and an ended week never reveal a private photo; default Rickroll is fixed and opt-in", async t => {
  const f = await setup(t), saved = (await f.upload()).json();
  await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
  await f.request("POST", await f.actionPath(), { choice: "flag", csrf: f.jordan.csrf }, f.jordan.token);
  const page = await f.request("GET", await f.actionPath(), undefined, f.jordan.token); assert.ok(!page.body.includes(saved.revision));
  await f.repo.transact(db => { db.match.state = "completed"; });
  assert.equal((await f.request("GET", saved.imageUrl.replace("/api/drafts/", "/api/scenarios/"), undefined, f.jordan.token)).statusCode, 404);
  const { prankRevealHtml } = await import("../src/prank-reveals.js");
  const scenario = await f.draft(); delete scenario.prankReveal;
  const html = prankRevealHtml(scenario); assert.match(html, /https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ/); assert.match(html, /noopener noreferrer/); assert.ok(!html.includes("iframe"));
});

test("native browser form accepts same-origin cookie and encoded CSRF while rejecting missing or foreign CSRF", async t => {
  const f = await setup(t);
  await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
  const url = await f.actionPath();
  const headers = { cookie: `fp_session=${f.jordan.token}`, origin: "http://localhost:3001", "content-type": "application/x-www-form-urlencoded" };
  for (const [csrf, origin] of [["wrong", headers.origin], [f.jordan.csrf, "https://unrelated.example"]]) {
    const denied = await f.app.inject({ method: "POST", url, headers: { ...headers, origin }, payload: new URLSearchParams({ csrf, choice: "trust" }).toString() });
    assert.equal(denied.statusCode, 403, denied.body);
  }
  assert.equal((await f.repo.read()).decisions.length, 0);
  const posted = await f.app.inject({ method: "POST", url, headers, payload: new URLSearchParams({ csrf: f.jordan.csrf, choice: "trust" }).toString() });
  assert.equal(posted.statusCode, 302, posted.body); assert.equal(posted.headers.location, url);
  assert.equal((await f.repo.read()).decisions.length, 1);
});
