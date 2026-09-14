import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import { createSeed } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";
import type { Config } from "../src/config.js";
import Fastify from "fastify";
import { registerEmailReveal } from "../src/email-reveal.js";

const navigation = { "sec-fetch-user": "?1", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
const receiptHeaders = { origin: "http://localhost:3001", "sec-fetch-site": "same-origin" };
const receiptFrom = (html: string): string | null => JSON.parse(/const receipt = (.*);/.exec(html)![1]);

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

test("local demo clears only the caller's unsent emails and preserves sent casts and scores", async t => {
  const f = await setup(t);
  assert.equal((await f.request("POST", "/api/drafts/reset-unsent-email", {}, f.jordan.token)).json().removed, 0);
  assert.equal((await f.request("POST", "/api/drafts/reset-unsent-email", {})).json().removed, 1);
  assert.equal(await f.draft(), undefined);
  const { scenarioId } = await f.service.generate("alex", { recipientMemberId: "jordan", channel: "email", authorPrompt: "They love buffalo wings and Denver Broncos.", kind: "regular", slot: 1 }, true);
  assert.equal((await f.request("POST", `/api/drafts/${scenarioId}/send`, {})).statusCode, 200);
  const before = await f.repo.read();
  assert.equal((await f.request("POST", "/api/drafts/reset-unsent-email", {})).json().removed, 0);
  const after = await f.repo.read();
  assert.deepEqual(after.scenarios, before.scenarios);
  assert.deepEqual(after.match.scores, before.match.scores);
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

test("email opens the photo immediately and browser receipts score exactly once", async t => {
  const f = await setup(t), saved = (await f.upload()).json();
  const sent = await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {}); assert.equal(sent.statusCode, 200, sent.body);
  const url = await f.actionPath();
  for (const method of ["GET", "HEAD"] as const) {
    const page = await f.request(method, url, undefined, f.jordan.token); assert.equal(page.statusCode, 200); assert.ok(!page.body.includes(saved.revision));
  }
  assert.equal((await f.repo.read()).decisions.length, 0);
  const recipientUrl = saved.imageUrl.replace("/api/drafts/", "/api/scenarios/");
  assert.equal((await f.request("GET", recipientUrl, undefined, f.jordan.token)).statusCode, 404);
  const opened = await f.app.inject({ url, headers: navigation });
  const receipt = receiptFrom(opened.body);
  assert.ok(receipt);
  assert.equal((await f.repo.read()).decisions.length, 0, "Even browser GETs do not mutate scores");
  for (let i = 0; i < 2; i++) {
    const result: { statusCode: number; body: string } = await f.app.inject({ method: "POST", url: `${url}/open`, headers: receiptHeaders, payload: { receipt } });
    assert.equal(result.statusCode, 204, result.body);
  }
  const page = await f.request("GET", url, undefined, f.jordan.token); assert.match(page.body, /data:image\/webp;base64,/); assert.ok(!page.body.includes("Trust it"));
  assert.equal((await f.request("GET", recipientUrl, undefined, f.jordan.token)).statusCode, 200);
  assert.equal((await f.request("GET", recipientUrl)).statusCode, 404);
  await f.request("GET", url, undefined, f.jordan.token); await f.request("HEAD", recipientUrl, undefined, f.jordan.token);
  assert.equal((await f.repo.read()).decisions.length, 1); assert.equal((await f.repo.read()).match.scores.alex, 3); assert.equal((await f.repo.read()).match.scores.jordan, -1);
  assert.equal((await f.request("PUT", `/api/drafts/${f.scenarioId}/reveal`, { choice: "rickroll", expectedRevision: saved.revision })).statusCode, 409);
  assert.equal((await f.upload({ expectedRevision: saved.revision })).statusCode, 409);
});

test("legacy Flag keeps its decision and private API photo access remains locked", async t => {
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

test("Rickroll navigates automatically; scanners, HEAD and prefetch receive no scoring receipt", async t => {
  const f = await setup(t);
  await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
  const url = await f.actionPath();
  const page = await f.app.inject({ url, headers: navigation });
  assert.match(page.body, /window.location.replace\("https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"\)/);
  assert.ok(!page.body.includes("Trust it") && !page.body.includes("Sign in"));
  assert.ok(receiptFrom(page.body));
  const events: string[] = [];
  const listeners = new Set<() => void>();
  const document = {
    visibilityState: "hidden",
    addEventListener: (_name: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_name: string, handler: () => void) => listeners.delete(handler),
  };
  runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(page.body)![1], {
    document,
    fetch: (endpoint: string, options: { body: string; keepalive: boolean }) => {
      assert.equal(endpoint, `${url}/open`);
      assert.equal(JSON.parse(options.body).receipt, receiptFrom(page.body));
      assert.equal(options.keepalive, true);
      events.push("receipt");
      return new Promise(() => {}); // Slow scoring must not hold up the redirect.
    },
    window: { location: { replace: (destination: string) => events.push(destination) } },
  });
  assert.deepEqual(events, [], "Hidden tabs neither score nor redirect");
  document.visibilityState = "visible";
  for (const handler of listeners) handler();
  assert.deepEqual(events, ["receipt", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  assert.equal(listeners.size, 0, "Changing visibility again cannot duplicate a receipt");
  for (const headers of [{}, { ...navigation, purpose: "prefetch" }, { ...navigation, "sec-purpose": "prefetch;prerender" }]) {
    const preview = await f.app.inject({ url, headers });
    assert.equal(receiptFrom(preview.body), null);
  }
  assert.equal((await f.app.inject({ method: "HEAD", url, headers: navigation })).body, "");
  assert.equal((await f.repo.read()).decisions.length, 0);
});

test("browser receipt rejects forgery, foreign origins, other tokens and expired challenges", async t => {
  const f = await setup(t);
  await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
  const url = await f.actionPath();
  const receipt = receiptFrom((await f.app.inject({ url, headers: navigation })).body)!;
  for (const [headers, proof, path] of [
    [receiptHeaders, `${Date.now() - 1}.${receipt.split(".")[1]}`, url],
    [receiptHeaders, `${Date.now() + 300000}.${"0".repeat(64)}`, url],
    [{ ...receiptHeaders, origin: "https://unrelated.example" }, receipt, url],
    [{ origin: receiptHeaders.origin }, receipt, url],
    [receiptHeaders, receipt, "/r/another-token"],
  ] as const) {
    assert.equal((await f.app.inject({ method: "POST", url: `${path}/open`, headers, payload: { receipt: proof } })).statusCode, 403);
  }
  await f.repo.transact(db => { db.scenarios.find(s => s.id === f.scenarioId)!.tokenExpiresAt = 0; });
  assert.equal((await f.app.inject({ url, headers: navigation })).statusCode, 410);
  assert.equal((await f.app.inject({ method: "POST", url: `${url}/open`, headers: receiptHeaders, payload: { receipt } })).statusCode, 410);
  assert.equal((await f.repo.read()).decisions.length, 0);
});

test("fish and duck render their selected surprise without a response form", async t => {
  for (const [choice, label] of [["gone-fishing", "A smiling fish"], ["rubber-duck", "A rubber duck"]] as const) {
    const f = await setup(t);
    await f.request("PUT", `/api/drafts/${f.scenarioId}/reveal`, { choice, expectedRevision: "default" });
    assert.equal((await f.app.inject(await f.actionPath())).statusCode, 404, "Unsent surprises stay private");
    await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
    const page = await f.app.inject(await f.actionPath());
    assert.match(page.body, new RegExp(label));
    assert.ok(!page.body.includes("<form") && !page.body.includes("Play your surprise"));
  }
});

test("local fish reveals record a visible-page receipt without Fetch Metadata; previews remain neutral", async t => {
  const f = await setup(t);
  await f.request("PUT", `/api/drafts/${f.scenarioId}/reveal`, {choice:"gone-fishing", expectedRevision:"default"});
  await f.request("POST", `/api/drafts/${f.scenarioId}/send`, {});
  // Register the capture renderer independently; the scenario was sent through the test transport.
  f.service.config.emailCapture = true;
  const app = Fastify();
  const render = registerEmailReveal(app, f.service);
  app.get<{Params:{token:string}}>("/r/:token", async (request, reply) => reply.type("text/html").send(render(request, (await f.service.challengeToken(request.params.token)).scenario)));
  t.after(() => app.close());
  const url = await f.actionPath();
  const page = await app.inject(url);
  assert.match(page.body,/A smiling fish/);
  const receipt = receiptFrom(page.body); assert.ok(receipt);
  assert.equal((await f.repo.read()).decisions.length,0);
  assert.equal(receiptFrom((await app.inject({url,headers:{purpose:"prefetch"}})).body),null);
  assert.equal((await app.inject({method:"HEAD",url})).body,"");
  const headers = {origin:f.service.config.apiOrigin};
  assert.equal((await app.inject({method:"POST",url:`${url}/open`,headers:{...headers,"sec-fetch-site":"cross-site"},payload:{receipt}})).statusCode,403);
  for(let i=0;i<2;i++) assert.equal((await app.inject({method:"POST",url:`${url}/open`,headers,payload:{receipt}})).statusCode,204);
  const db = await f.repo.read();
  assert.deepEqual(db.match.scores,{alex:3,jordan:-1});
  assert.equal(db.decisions.length,1);
});
