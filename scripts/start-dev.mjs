import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";

const root = fileURLToPath(new URL("../", import.meta.url));
let active;
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true; active?.kill(signal); });
function run(command, args) {
  if (stopped) return Promise.resolve();
  return new Promise((resolve, reject) => {
    active = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
    active.once("error", reject);
    active.once("exit", code => code === 0 || stopped ? resolve() : reject(new Error(`Startup step failed (exit ${code ?? "signal"}).`)));
  });
}
try {
  if (process.env.EMAIL_DELIVERY_MODE === "mailpit") {
    await run(process.execPath, ["scripts/start-capture.mjs"]);
  } else if (process.env.EMAIL_DELIVERY_MODE === "smtp-demo") {
    console.log("Using the real-email configuration saved in .env. Checking SMTP without sending mail, then building the app.");
    await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/check-email.ts"]);
    await run(process.execPath, ["scripts/build.mjs"]);
    if (!stopped) console.log(`Open ${process.env.APP_ORIGIN}/mobile-preview. Email sending is ${process.env.EMAIL_DEMO_SEND_ENABLED === "true" ? "enabled" : "disabled"}.`);
    await run("npm", ["run", "dev", "-w", "@fp/api"]);
  } else {
    console.log("Using local simulation. External messages are not sent.");
    await run(process.execPath, ["node_modules/concurrently/dist/bin/concurrently.js", "-k", "-n", "api,mobile", "npm run dev -w @fp/api", "npm run dev -w @fp/mobile"]);
  }
} catch (error) {
  if (!stopped) { console.error(error instanceof Error ? error.message : "Could not start the app."); process.exitCode = 1; }
}
