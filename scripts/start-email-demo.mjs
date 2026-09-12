import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://localhost:3001";
const env = { ...process.env, APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", EMAIL_DEMO_SEND_ENABLED: "true", EMAIL_DEMO_LOCAL_ONLY: "true", EMAIL_DEMO_IMMEDIATE: "true", PORT: "3001", API_ORIGIN: origin, APP_ORIGIN: origin, EXPO_PUBLIC_API_ORIGIN: origin, EXPO_PUBLIC_MODE: "demo", DEMO_DATA_FILE: "./data/email-demo.json", LIVE_SEND_AUTHORIZED: "false", ENABLE_LIVE_EMAIL: "false", ENABLE_LIVE_SMS: "false", ENABLE_LIVE_VOICE: "false" };
let active;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { interrupted = true; active?.kill(signal); });
function run(command, args) {
  if (interrupted) throw new Error("Stopped.");
  return new Promise((resolve, reject) => {
    active = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    active.once("error", reject);
    active.once("exit", code => code === 0 || interrupted ? resolve() : reject(new Error(`Step failed (exit ${code ?? "signal"}).`)));
  });
}
try {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Port 3001 is unavailable. Stop the existing npm run dev server before starting the email demo.")));
    probe.listen(3001, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
  });
  console.log("Preparing the real-email demo on this computer. Emailed links must be opened here.");
  console.log("Checking SMTP without sending mail, then building the app. Signup codes and game mail are enabled when the app starts.");
  await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/check-email.ts"]);
  await run(process.execPath, ["scripts/build.mjs"]);
  if (!interrupted) console.log(`Open ${origin} or ${origin}/mobile-preview. Stop with Control+C.`);
  await run("npm", ["run", "dev", "-w", "@fp/api"]);
} catch (error) {
  if (!interrupted) { console.error(error instanceof Error ? error.message : "Email demo could not start."); process.exitCode = 1; }
}
