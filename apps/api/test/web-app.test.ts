import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { createFreshSeed } from "@fp/shared";
import { registerWebApp, webAppRoutes } from "../src/web-app.js";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { createServer } from "../src/server.js";

async function fixture(t: TestContext, built = true) {
  const dir = await mkdtemp(join(tmpdir(), "fp-web-app-"));
  const build = join(dir, "dist");
  const app = Fastify();
  if (built) {
    await mkdir(join(build, "_expo/static/js/web"), { recursive: true });
    await mkdir(join(build, "assets/fonts"), { recursive: true });
    for (const [path, contents] of [
      ["index.html", '<!doctype html><html><div id="root">Built Expo app</div></html>'],
      ["_expo/static/js/web/entry.js", 'globalThis.appLoaded = true;'],
      ["assets/theme.css", "body{color:teal}"], ["assets/mark.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      ["assets/fonts/ui.woff2", "test-font"], ["assets/photo.png", "test-png"],
      ["_expo/static/js/web/entry.js.map", '{"sourcesContent":["private source"]}'],
      ["assets/.env", "PRIVATE_KEY=never-serve"], ["metadata.json", '{"internal":true}'],
    ]) await writeFile(join(build, path), contents);
  }
  app.get("/api/ping", async () => ({ api: true }));
  app.get("/auth/callback", async () => "auth route");
  app.get("/r/test", async () => "challenge route");
  app.post("/webhooks/test", async () => ({ received: true }));
  app.get("/mobile-preview", async () => "phone preview");
  registerWebApp(app, build);
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { app, dir, build };
}

test("the exact app routes serve built Expo HTML while API/auth/challenge/preview routes retain ownership", async (t) => {
  const { app } = await fixture(t);
  for (const path of webAppRoutes) {
    const response = await app.inject(`${path}?from=email`);
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /^text\/html/);
    assert.match(response.body, /Built Expo app/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
  assert.deepEqual((await app.inject("/api/ping")).json(), { api: true });
  assert.equal((await app.inject("/auth/callback")).body, "auth route");
  assert.equal((await app.inject("/r/test")).body, "challenge route");
  assert.deepEqual((await app.inject({ method: "POST", url: "/webhooks/test" })).json(), { received: true });
  assert.equal((await app.inject("/mobile-preview")).body, "phone preview");
  for (const path of ["/api/missing", "/auth/missing", "/r/missing", "/webhooks/missing", "/unrecognized", "/operator"])
    assert.equal((await app.inject(path)).statusCode, 404, path);
  assert.equal((await app.inject({ method: "POST", url: "/draft", payload: {} })).statusCode, 404);
});

test("built JavaScript, styles, fonts and images use correct MIME types and HEAD has no body", async (t) => {
  const { app } = await fixture(t);
  for (const [path, mime] of [
    ["/_expo/static/js/web/entry.js", "text/javascript"], ["/assets/theme.css", "text/css"],
    ["/assets/mark.svg", "image/svg+xml"], ["/assets/fonts/ui.woff2", "font/woff2"], ["/assets/photo.png", "image/png"],
  ]) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 200, path);
    assert.ok(String(response.headers["content-type"]).startsWith(mime));
    const head = await app.inject({ method: "HEAD", url: path });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, "");
    assert.equal(head.headers["content-length"], response.headers["content-length"]);
  }
  const home = await app.inject({ method: "HEAD", url: "/" });
  assert.equal(home.statusCode, 200);
  assert.equal(home.body, "");
  assert.ok(Number(home.headers["content-length"]) > 0);
});

test("static serving rejects traversal, symlink escape, hidden files, source maps and internal metadata", async (t) => {
  const { app, dir, build } = await fixture(t);
  await writeFile(join(dir, "outside.js"), "secret outside the build");
  await symlink(join(dir, "outside.js"), join(build, "assets/escape.js"));
  await symlink(join(build, "assets/.env"), join(build, "assets/disguised.js"));
  await mkdir(join(build, "assets/directory.js"));
  for (const path of [
    "/assets/../outside.js", "/assets/%2e%2e/outside.js", "/assets/%252e%252e/outside.js",
    "/assets/%2e%2e%2foutside.js", "/assets/%5c..%5coutside.js", "/assets/%00photo.png",
    "/assets/escape.js", "/assets/disguised.js", "/assets/.env", "/assets/directory.js",
    "/_expo/static/js/web/entry.js.map", "/metadata.json", "/.env", "/package.json",
    "/assets/missing.js", "/assets/", "/_expo/", "/index.html",
  ]) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 404, path);
    assert.ok(!response.body.includes("never-serve") && !response.body.includes("secret outside") && !response.body.includes("private source"));
  }
});

test("a missing build returns actionable 503 instead of a sample app or HTML fallback for assets", async (t) => {
  const { app } = await fixture(t, false);
  const response = await app.inject("/");
  assert.equal(response.statusCode, 503);
  assert.match(response.body, /npm run build/);
  assert.match(response.body, /same public HTTPS origin/);
  assert.equal((await app.inject("/draft")).statusCode, 503);
  assert.equal((await app.inject("/assets/missing.js")).statusCode, 404);
  assert.deepEqual((await app.inject("/api/ping")).json(), { api: true });
});

test("the ordinary API mode keeps its landing page and does not expose built assets", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "fp-web-app-mode-"));
  const file = join(dir, "state.json");
  const repo = await FileRepository.open(file, () => createFreshSeed());
  const service = new GameService(repo, { mode: "demo", ruleSet: "email-casts-v2", port: 0,
    apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:8081", dataFile: file,
    mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const { app } = await createServer(service, { startJobs: false });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  assert.match((await app.inject("/")).body, /A little rivalry/);
  assert.equal((await app.inject("/draft")).statusCode, 404);
  assert.equal((await app.inject("/_expo/static/js/web/entry.js")).statusCode, 404);
});
