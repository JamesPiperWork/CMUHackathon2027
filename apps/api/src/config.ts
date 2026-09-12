import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loopbackEmailDemo } from "./email-demo-config.js";
import { captureConfiguration } from "./mail-capture.js";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
dotenv({ path: resolve(repositoryRoot, ".env"), quiet: true });
export interface Config {
  emailCapture?: boolean;
  phoneDemo?: boolean;
  emailDemo?: boolean;
  emailDemoLocalOnly?: boolean;
  emailDemoImmediate?: boolean;
  ruleSet?: "email-casts-v2";
  mode: "demo" | "live";
  port: number;
  apiOrigin: string;
  appOrigin: string;
  dataFile: string;
  mongodbUri: string;
  matchDurationMinutes: number;
  jobIntervalMs: number;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.APP_MODE && !["demo", "live"].includes(env.APP_MODE))
    throw new Error("APP_MODE must be demo or live");
  const mode = env.APP_MODE === "live" ? "live" : "demo";
  const emailCapture = env.EMAIL_DELIVERY_MODE === "mailpit";
  const emailDemo = env.EMAIL_DELIVERY_MODE === "smtp-demo" || emailCapture;
  const phoneDemo = env.PHONE_DELIVERY_MODE === "twilio-demo";
  if (env.PHONE_DELIVERY_MODE && !["simulated", "twilio-demo"].includes(env.PHONE_DELIVERY_MODE)) throw new Error("PHONE_DELIVERY_MODE must be simulated or twilio-demo");
  if (phoneDemo && (mode !== "demo" || !emailDemo || emailCapture)) throw new Error("twilio-demo requires the private smtp-demo with verified email accounts");
  if (emailCapture && !captureConfiguration(env)) throw new Error("mailpit requires matching HTTP loopback origins, APP_MODE=demo, no MongoDB and disabled external transports");
  const emailDemoLocalOnly = loopbackEmailDemo(env) || (emailCapture && captureConfiguration(env));
  if (env.EMAIL_DEMO_LOCAL_ONLY === "true" && emailDemo && !emailDemoLocalOnly) throw new Error("Local email demo requires matching HTTP loopback origins on the configured API port");
  if (env.EMAIL_DELIVERY_MODE && !["simulated", "smtp-demo", "mailpit"].includes(env.EMAIL_DELIVERY_MODE)) throw new Error("EMAIL_DELIVERY_MODE must be simulated, smtp-demo or mailpit");
  if (emailDemo && mode !== "demo") throw new Error("smtp-demo is a separate labeled demo; use APP_MODE=demo");
  const port = Number(env.PORT ?? 3001);
  const apiOrigin = (env.API_ORIGIN ?? `http://localhost:${port}`).replace(
    /\/$/,
    "",
  );
  const appOrigin = (env.APP_ORIGIN ?? "http://localhost:8081").replace(
    /\/$/,
    "",
  );
  for (const value of [apiOrigin, appOrigin]) {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("Origins must use HTTP or HTTPS");
    if ((mode === "live" || (emailDemo && !emailDemoLocalOnly)) && url.protocol !== "https:")
      throw new Error("Live origins must use HTTPS");
  }
  if (mode === "live" && !env.MONGODB_URI)
    throw new Error("Live mode requires MONGODB_URI with a replica set");
  if (mode === "live" && (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE))
    throw new Error("Live mode requires Auth0 domain and audience");
  const dataFile = resolve(repositoryRoot, env.DEMO_DATA_FILE ?? env.DATA_FILE ?? (emailCapture ? "data/capture-demo.json" : emailDemo ? "data/email-demo.json" : "data/demo.json"));
  if (emailCapture && dataFile !== resolve(repositoryRoot, "data/capture-demo.json")) throw new Error("mailpit requires its separate data/capture-demo.json store");
  if (!emailCapture && dataFile === resolve(repositoryRoot, "data/capture-demo.json")) throw new Error("The local capture store cannot be used for external delivery or simulation");
  return {
    emailCapture,
    phoneDemo,
    emailDemo,
    emailDemoLocalOnly,
    emailDemoImmediate: emailDemo && env.EMAIL_DEMO_IMMEDIATE === "true",
    ruleSet: "email-casts-v2",
    mode,
    port,
    apiOrigin,
    appOrigin,
    dataFile,
    mongodbUri: env.MONGODB_URI ?? "",
    matchDurationMinutes: Number(env.MATCH_DURATION_MINUTES ?? 10080),
    jobIntervalMs: 500,
  };
}
