import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import { setTimeout as wait } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://localhost:3001";
const env = { ...process.env, APP_MODE: "demo", EMAIL_DELIVERY_MODE: "mailpit", EMAIL_DEMO_SEND_ENABLED: "true", EMAIL_DEMO_LOCAL_ONLY: "true", EMAIL_DEMO_IMMEDIATE: "true", EMAIL_DEMO_RECIPIENTS: "", PORT: "3001", API_ORIGIN: origin, APP_ORIGIN: origin, EXPO_PUBLIC_API_ORIGIN: origin, EXPO_PUBLIC_MODE: "demo", DEMO_DATA_FILE: "./data/capture-demo.json", MONGODB_URI: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_SECURE: "false", SMTP_FROM: "notifications@demo.test", SMTP_USER: "", SMTP_PASS: "", EMAIL_RECEIPT_RELAY_SECRET: "", PHONE_DELIVERY_MODE: "simulated", PHONE_DEMO_SEND_ENABLED: "false", PHONE_DEMO_VERIFY_ENABLED: "false", ENABLE_PHONE_DEMO_SMS: "false", ENABLE_PHONE_DEMO_VOICE: "false", LIVE_SEND_AUTHORIZED: "false", ENABLE_LIVE_EMAIL: "false", ENABLE_LIVE_SMS: "false", ENABLE_LIVE_VOICE: "false" };
const children = new Set();
let stopped = false;
let mailpitFailure;
function stop(signal = "SIGTERM") { stopped = true; for (const child of children) child.kill(signal); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
function start(command, args, childEnv = env) {
  const child = spawn(command, args, { cwd: root, env: childEnv, stdio: "inherit" });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function run(command, args) {
  if (stopped) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = start(command, args);
    child.once("error", reject);
    child.once("exit", code => code === 0 || stopped ? resolve() : reject(new Error(`Startup step failed (exit ${code ?? "signal"}).`)));
  });
}
async function requirePort(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is already in use. Stop the existing app or mailbox before running email:capture.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
  });
}
try {
  for (const port of [3001, 1025, 8025, 8026]) await requirePort(port);
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  console.log("Starting a separate local mailbox demo. External email, texts and calls are disabled; .env is unchanged.");
  // Pass no MP_* settings, SMTP credentials, forwarding, relay or webhook settings to Mailpit.
  const mailpitEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "TZ"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const mailbox = start(process.env.MAILPIT_BINARY || "mailpit", ["--listen", "127.0.0.1:8025", "--smtp", "127.0.0.1:1025", "--database", "data/capture-mailbox.db", "--label", "Local demo inbox — no external delivery", "--disable-version-check", "--smtp-disable-rdns", "--allowed-hosts", "localhost,127.0.0.1", "--smtp-allowed-recipients", "(?i)^[^@]+@demo\\.test$", "--block-remote-css-and-fonts", "--max-message-size", "5"], mailpitEnv);
  mailbox.once("error", () => { mailpitFailure = new Error("Mailpit could not start. Install Mailpit or set MAILPIT_BINARY to its executable path."); stop(); });
  mailbox.once("exit", code => { if (!stopped) { mailpitFailure = new Error(`Mailpit stopped (exit ${code ?? "signal"}). App stopped to avoid ambiguous delivery.`); stop(); } });
  let ready = false;
  for (let attempt = 0; attempt < 40 && !stopped; attempt++) {
    try { const response = await globalThis.fetch("http://127.0.0.1:8025/readyz", { signal: globalThis.AbortSignal.timeout(500) }); ready = response.ok; } catch { /* Wait for the child to bind its local sockets. */ }
    if (ready) break;
    await wait(100);
  }
  if (!ready) throw mailpitFailure ?? new Error("Mailpit did not become ready.");
  const inbox = start(process.execPath, ["scripts/local-mailbox.mjs"]);
  inbox.once("error", () => { mailpitFailure = new Error("The local email inbox could not start."); stop(); });
  inbox.once("exit", code => { if (!stopped) { mailpitFailure = new Error(`The local email inbox stopped (exit ${code ?? "signal"}).`); stop(); } });
  await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/check-email.ts"]);
  await run(process.execPath, ["scripts/build.mjs"]);
  if (!stopped) console.log(`App: ${origin}/mobile-preview\nLocal inbox: http://localhost:8026 (Mailpit inspector: http://localhost:8025)\nCreate accounts such as alex@demo.test and jordan@demo.test. Their sign-in codes and casts appear in the separate local inbox. Stop both processes with Control+C.`);
  await run("npm", ["run", "dev", "-w", "@fp/api"]);
  if (mailpitFailure) throw mailpitFailure;
} catch (error) {
  if (!stopped || mailpitFailure) { console.error(error instanceof Error ? error.message : "Capture demo could not start."); process.exitCode = 1; }
} finally { stop(); }
