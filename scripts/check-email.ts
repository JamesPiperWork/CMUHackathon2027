/** Validate the private email demo and authenticate to SMTP. Never sends mail. */
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../apps/api/src/config.js";
import { loopbackEmailDemo } from "../apps/api/src/email-demo-config.js";
import { captureConfiguration, captureTransportOptions } from "../apps/api/src/mail-capture.js";

const env = process.env;
if (env.EMAIL_DELIVERY_MODE === "mailpit") {
  try {
    loadConfig();
    if (!captureConfiguration(env)) throw new Error("Invalid local capture configuration.");
    const transport = nodemailer.createTransport(captureTransportOptions(env));
    try { await transport.verify(); }
    finally { transport.close(); }
    console.log("Local Mailpit SMTP is ready on 127.0.0.1:1025. No message was sent. Captured messages stay on this computer; open http://localhost:8026.");
  } catch {
    console.error("Local mailbox check failed. Start with npm run email:capture; use matching loopback origins and the separate capture store. No external SMTP connection was attempted.");
    process.exitCode = 1;
  }
} else {
const problems: string[] = [];
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const placeholder = /replace|change.?me|your[-_ ]|example\.(com|org|net)|\.invalid/i;

function check(condition: boolean, instruction: string) {
  if (!condition) problems.push(instruction);
}

function publicOrigin(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      hostname.includes(".") &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) &&
      !/\.(localhost|local|test|invalid|example)$/.test(hostname) &&
      !placeholder.test(hostname)
    );
  } catch {
    return false;
  }
}

check(env.APP_MODE === "demo", "Set APP_MODE=demo.");
check(env.EMAIL_DELIVERY_MODE === "smtp-demo", "Set EMAIL_DELIVERY_MODE=smtp-demo.");
check(
  ["true", "false"].includes(env.EMAIL_DEMO_SEND_ENABLED ?? ""),
  "Set EMAIL_DEMO_SEND_ENABLED=false while checking, then true when ready to send.",
);
for (const flag of ["LIVE_SEND_AUTHORIZED", "ENABLE_LIVE_EMAIL", "ENABLE_LIVE_SMS", "ENABLE_LIVE_VOICE"]) {
  check(env[flag] !== "true", `Keep ${flag}=false for the private email demo.`);
}
const localOnly = loopbackEmailDemo(env);
check(localOnly || publicOrigin(env.API_ORIGIN), "Use matching loopback origins with EMAIL_DEMO_LOCAL_ONLY=true, or set a public HTTPS API_ORIGIN.");
check(localOnly || publicOrigin(env.APP_ORIGIN), "Use matching loopback origins with EMAIL_DEMO_LOCAL_ONLY=true, or set a public HTTPS APP_ORIGIN.");
check(
  env.APP_ORIGIN?.replace(/\/$/, "") === env.API_ORIGIN?.replace(/\/$/, ""),
  "Use the same APP_ORIGIN and API_ORIGIN for the private demo's sign-in cookies.",
);
check(
  env.EXPO_PUBLIC_API_ORIGIN?.replace(/\/$/, "") === env.API_ORIGIN?.replace(/\/$/, ""),
  "Set EXPO_PUBLIC_API_ORIGIN to exactly the same origin as API_ORIGIN.",
);
check(env.EXPO_PUBLIC_MODE === "demo", "Set EXPO_PUBLIC_MODE=demo.");
for (const key of ["SESSION_SECRET", "TOKEN_SECRET"]) {
  const value = env[key] ?? "";
  check(value.length >= 32 && new Set(value).size >= 10 && !placeholder.test(value), `Set ${key} to a fresh random secret of at least 32 characters.`);
}
check(env.SESSION_SECRET !== env.TOKEN_SECRET, "Use different SESSION_SECRET and TOKEN_SECRET values.");

const recipients = (env.EMAIL_DEMO_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
check(
  recipients.every((value) => emailPattern.test(value) && !placeholder.test(value)),
  "Leave EMAIL_DEMO_RECIPIENTS blank for signup, or supply valid invitation addresses separated by commas.",
);
check(env.SMTP_HOST === "smtp.gmail.com", "For this Gmail setup, set SMTP_HOST=smtp.gmail.com.");
check(env.SMTP_PORT === "587" && env.SMTP_SECURE === "false", "Set SMTP_PORT=587 and SMTP_SECURE=false; STARTTLS is required by the app.");
check(emailPattern.test(env.SMTP_USER ?? "") && !placeholder.test(env.SMTP_USER ?? ""), "Set SMTP_USER to the dedicated Gmail account's full email address.");
check(env.SMTP_FROM?.toLowerCase() === env.SMTP_USER?.toLowerCase() && emailPattern.test(env.SMTP_FROM ?? ""), "Set SMTP_FROM to the same plain email address as SMTP_USER.");
check(
  (env.SMTP_PASS ?? "").length === 16 && !/\s/.test(env.SMTP_PASS ?? "") && !placeholder.test(env.SMTP_PASS ?? ""),
  "Set SMTP_PASS to the Gmail app password's 16 characters, without display spaces. Do not use your Google password.",
);
try {
  const config = loadConfig();
  check(config.dataFile !== fileURLToPath(new URL("../data/demo.json", import.meta.url)), "Use a separate DEMO_DATA_FILE, such as ./data/email-demo.json, for real-email participants.");
} catch {
  problems.push("Application configuration is invalid; check the mode, origins and values in .env.");
}

if (problems.length) {
  console.error("Email setup needs attention. No SMTP connection or email was attempted:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(recipients.length ? `Configuration checks passed with ${new Set(recipients).size} invited address(es).` : "Configuration checks passed. Participants enter and verify their email during signup.");
  if (localOnly) console.log("Local email rehearsal: emailed links work only when opened on this computer.");
  console.log("Checking Gmail connection, STARTTLS and authentication only. No email will be sent.");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.verify();
    console.log("Gmail SMTP authentication succeeded. No email was sent.");
    console.log(env.EMAIL_DEMO_SEND_ENABLED === "true"
      ? "Email demo sending is enabled when the app runs. Bait goes only to verified, enrolled participants."
      : "Sending remains disabled. Set EMAIL_DEMO_SEND_ENABLED=true only when ready to run the email demo.");
    console.log("This does not verify public URL reachability or prove message acceptance, inbox delivery, or weekly settlement.");
  } catch (error) {
    const code = (error as { code?: string }).code;
    const advice = code === "EAUTH"
      ? "Check the dedicated account, 2-Step Verification and app password. Google account restrictions may prevent app passwords."
      : ["ESOCKET", "ETIMEDOUT", "ECONNECTION", "EDNS", "ECONNREFUSED"].includes(code ?? "")
        ? "Check network access to smtp.gmail.com:587 and retry; do not disable TLS verification."
        : "Check SMTP settings and the Gmail account's security notices, then retry.";
    console.error(`SMTP verification failed. ${advice} No email was sent.`);
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
}
