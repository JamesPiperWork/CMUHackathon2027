import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { createMailboxServer, mailAccounts, type LocalMailboxMessage } from "../../../scripts/local-mailbox.mjs";

async function fixture(t: TestContext, options: { fetcher?: typeof fetch; sendMail?: (message: LocalMailboxMessage) => Promise<{ rejected?: string[] }> } = {}) {
  const requests: URL[] = [], sent: LocalMailboxMessage[] = [];
  const server = createMailboxServer({
    fetcher: options.fetcher ?? (async (url, init) => {
      requests.push(new URL(String(url)));
      assert.ok(init?.signal, "Local inbox reads need a bounded timeout");
      return Response.json({ messages: [{ ID: "message-12345", Subject: "Local test message" }], messages_count: 1 });
    }) as typeof fetch,
    sendMail: options.sendMail ?? (async message => { sent.push(message); return { rejected: [] }; }),
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); }));
  const port = (server.address() as AddressInfo).port;
  function call(path: string, options: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string | undefined> } = {}) {
    return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string; json: () => any }>((resolve, reject) => {
      const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const headers = Object.fromEntries(Object.entries({ host: "localhost:8026", ...(body === undefined ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }), ...options.headers }).filter(([, value]) => value !== undefined));
      const req = request({ host: "127.0.0.1", port, method: options.method ?? (body === undefined ? "GET" : "POST"), path, headers, agent: false }, res => {
        const parts: Buffer[] = [];
        res.on("data", chunk => parts.push(chunk));
        res.on("end", () => { const body = Buffer.concat(parts).toString(); resolve({ status: res.statusCode!, headers: res.headers, body, json: () => JSON.parse(body) }); });
        res.on("error", reject);
      });
      req.on("error", reject); req.end(body);
    });
  }
  const send = (body: unknown, headers: Record<string, string | undefined> = {}) => call("/api/send", { body, headers: { origin: "http://localhost:8026", ...headers } });
  return { call, send, requests, sent };
}

const message = { from: "alex@demo.test", to: "jordan@demo.test", subject: "Saturday plans?", text: "Coffee and board games on Saturday?" };

test("the separate mailbox rejects foreign hosts and cross-origin writes without exposing CORS access", async t => {
  const f = await fixture(t);
  for (const host of ["evil.example:8026", "localhost", "localhost:3001", "127.0.0.1:9999"]) assert.equal((await f.call("/api/accounts", { headers: { host } })).status, 403);
  for (const headers of [{ origin: undefined }, { origin: "https://evil.example" }, { origin: "null" }, { origin: "http://127.0.0.1:8026" }, { "sec-fetch-site": "cross-site" }]) assert.equal((await f.send(message, headers)).status, 403);
  const preflight = await f.call("/api/send", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
  assert.equal(preflight.status, 404);
  assert.equal(preflight.headers["access-control-allow-origin"], undefined);
  const accounts = await f.call("/api/accounts", { headers: { origin: "https://evil.example" } });
  assert.equal(accounts.headers["access-control-allow-origin"], undefined);
  assert.deepEqual(accounts.json(), mailAccounts);
  assert.equal(f.sent.length, 0);
  assert.equal(f.requests.length, 0);
});

test("mailbox selection and folder searches are restricted and cannot inject Mailpit search operators", async t => {
  const f = await fixture(t);
  for (const account of mailAccounts) for (const folder of ["inbox", "sent"]) {
    const response = await f.call(`/api/messages?account=${encodeURIComponent(account.email)}&folder=${folder}`);
    assert.equal(response.status, 200, response.body);
    assert.equal(response.json().total, 1);
    const target = f.requests.at(-1)!;
    assert.equal(target.origin, "http://127.0.0.1:8025");
    assert.equal(target.pathname, "/api/v1/search");
    assert.equal(target.searchParams.get("query"), `${folder === "sent" ? "from" : "to"}:${account.email}`);
    assert.equal(target.searchParams.get("limit"), "200");
  }
  for (const account of ["other@demo.test", "alex@example.com", "alex@demo.test OR from:jordan@demo.test", 'alex@demo.test"', "", "../message/id"]) assert.equal((await f.call(`/api/messages?account=${encodeURIComponent(account)}`)).status, 400);
  assert.equal((await f.call("/api/messages?account=alex%40demo.test&folder=all")).status, 400);
  assert.equal(f.requests.length, 6, "Rejected selections never query the inbox backend");
});

test("local composer allows only a preset sender and local recipients and forwards plain text with file/URL access disabled", async t => {
  const f = await fixture(t);
  const html = '<script>alert("inert mail text")</script><img src="https://outside.invalid/a">';
  const response = await f.send({ ...message, to: "CASEY@DEMO.TEST", subject: "  A local note  ", text: html });
  assert.equal(response.status, 200, response.body);
  assert.deepEqual(response.json(), { sent: true });
  assert.deepEqual(f.sent, [{ from: { name: "Alex Morgan", address: "alex@demo.test" }, to: "casey@demo.test", subject: "A local note", text: html, disableFileAccess: true, disableUrlAccess: true }]);
  for (const to of ["outside@gmail.com", "jordan@demo.test.evil.example", "jordan@demo.test, outsider@example.com", "Jordan <jordan@demo.test>", "jordan@demo.test\r\nBcc: outsider@example.com", "jordan@[127.0.0.1]", "jordan@demo.test."]) assert.equal((await f.send({ ...message, to })).status, 400, to);
  for (const from of ["someone@demo.test", "Alex <alex@demo.test>", { address: "alex@demo.test" }, "alex@demo.test\r\nBcc:x"]) assert.equal((await f.send({ ...message, from })).status, 400);
  assert.equal(f.sent.length, 1);
  assert.equal(f.requests.length, 0);
});

test("malformed, oversized, or header-injecting requests are rejected before SMTP submission", async t => {
  const f = await fixture(t);
  for (const body of [null, [], {}, "plain string", { ...message, html: "<b>unsupported</b>" }, { ...message, subject: "" }, { ...message, subject: "x".repeat(151) }, { ...message, text: " " }, { ...message, text: "x".repeat(12001) }, { ...message, to: ["jordan@demo.test"] }]) assert.equal((await f.send(body)).status, 400);
  for (const subject of ["Chess\r\nBcc: other@example.com", "Chess\u0000", "Chess\u2028header", "Chess\u202eheader", "Chess\tHeader"]) assert.equal((await f.send({ ...message, subject })).status, 400);
  for (const contentType of ["text/plain", "application/jsonp", "application/x-www-form-urlencoded"]) assert.equal((await f.send(message, { "content-type": contentType })).status, 400);
  const malformed = await f.call("/api/send", { raw: "{not JSON}", headers: { origin: "http://localhost:8026" } });
  assert.equal(malformed.status, 400); assert.equal(malformed.json().error, "Invalid message format.");
  const oversized = await f.send({ ...message, text: "x".repeat(19000) });
  assert.equal(oversized.status, 400); assert.match(oversized.json().error, /under 18 KB/);
  assert.equal(f.sent.length, 0);
  assert.equal((await f.call("/health")).status, 200, "Oversized requests leave the server usable");
});

test("only fixed assets are served as HTML or script; message MIME and attacker markup remain JSON data", async t => {
  const malicious = { ID: "message-12345", Subject: "<script>alert(1)</script>", HTML: '<img src=x onerror="alert(1)">', Text: "<script>alert(2)</script>" };
  const calls: string[] = [];
  const f = await fixture(t, { fetcher: (async url => { calls.push(String(url)); return Response.json(malicious); }) as typeof fetch });
  const detail = await f.call("/api/message/message-12345");
  assert.equal(detail.status, 200); assert.match(detail.headers["content-type"]!, /^application\/json/);
  assert.deepEqual(detail.json(), malicious);
  assert.equal(detail.headers["x-content-type-options"], "nosniff");
  assert.equal(detail.headers["cache-control"], "no-store");
  assert.match(String(detail.headers["content-security-policy"]), /default-src 'none'; script-src 'self'/);
  assert.doesNotMatch(String(detail.headers["content-security-policy"]), /unsafe-inline|unsafe-eval/);
  assert.deepEqual(calls, ["http://127.0.0.1:8025/api/v1/message/message-12345"]);
  for (const path of ["/api/message/message-12345/HTML", "/api/message/%2e%2e%2fsecret", "/api/message/id?invalid", "/.env", "/../.env", "/mailbox/../../.env"]) assert.ok([400, 404].includes((await f.call(path)).status), path);
  assert.equal(calls.length, 1);
  const home = await f.call("/?subject=%3Cscript%3Eevil%3C%2Fscript%3E");
  assert.equal(home.status, 200); assert.match(home.headers["content-type"]!, /^text\/html/); assert.ok(!home.body.includes("evil"));
  const script = await f.call("/mailbox.js");
  assert.match(script.headers["content-type"]!, /^text\/javascript/);
  assert.match((await f.call("/mailbox.css")).headers["content-type"]!, /^text\/css/);
});

test("ambiguous SMTP outcomes are reported without automatic retries or fabricated success", async t => {
  for (const outcome of ["rejected", "timeout"]) {
    let attempts = 0;
    const f = await fixture(t, { sendMail: async () => { attempts++; if (outcome === "timeout") throw new Error("socket timed out after DATA"); return { rejected: [message.to] }; } });
    const response = await f.send(message);
    assert.equal(response.status, 502);
    assert.match(response.json().error, /could not be confirmed.*Check Sent/);
    assert.equal(response.json().sent, undefined);
    assert.equal(attempts, 1);
  }
});
