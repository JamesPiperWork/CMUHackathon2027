import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

/** A separate, local mailbox demo. Nothing in this mode is relayed to the internet. */
export const mailCaptureMode = (env: NodeJS.ProcessEnv) => env.APP_MODE === "demo" && env.EMAIL_DELIVERY_MODE === "mailpit";
export const captureAddress = (value: string) => /^[^\s@<>]+@demo\.test$/i.test(value);
export const captureFrom = "notifications@demo.test";
export function captureConfiguration(env: NodeJS.ProcessEnv): boolean {
  if (!mailCaptureMode(env) || env.EMAIL_DEMO_LOCAL_ONLY !== "true") return false;
  try {
    const api = new URL(env.API_ORIGIN ?? ""), app = new URL(env.APP_ORIGIN ?? "");
    return api.origin === app.origin && api.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) &&
      Number(api.port || 80) === Number(env.PORT ?? 3001) &&
      [api, app].every(url => !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) &&
      env.PHONE_DELIVERY_MODE !== "twilio-demo" && !env.MONGODB_URI &&
      ["LIVE_SEND_AUTHORIZED", "ENABLE_LIVE_EMAIL", "ENABLE_LIVE_SMS", "ENABLE_LIVE_VOICE", "PHONE_DEMO_SEND_ENABLED", "PHONE_DEMO_VERIFY_ENABLED"].every(key => env[key] !== "true");
  } catch { return false; }
}
export function captureTransportOptions(env: NodeJS.ProcessEnv): SMTPTransport.Options {
  if (!captureConfiguration(env)) throw new Error("Local capture requires matching loopback origins and disabled external transports.");
  // Deliberately ignore SMTP_HOST, credentials, ports, proxies and other relay configuration.
  return { host: "127.0.0.1", port: 1025, secure: false, ignoreTLS: true, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, logger: false, debug: false };
}
