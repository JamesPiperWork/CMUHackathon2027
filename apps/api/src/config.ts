import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loopbackEmailDemo } from "./email-demo-config.js";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
dotenv({ path: resolve(repositoryRoot, ".env"), quiet: true });
export interface Config {
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
  const emailDemo = env.EMAIL_DELIVERY_MODE === "smtp-demo";
  const phoneDemo = env.PHONE_DELIVERY_MODE === "twilio-demo";
  if (env.PHONE_DELIVERY_MODE && !["simulated", "twilio-demo"].includes(env.PHONE_DELIVERY_MODE)) throw new Error("PHONE_DELIVERY_MODE must be simulated or twilio-demo");
  if (phoneDemo && (mode !== "demo" || !emailDemo)) throw new Error("twilio-demo requires the private smtp-demo with verified email accounts");
  const emailDemoLocalOnly = loopbackEmailDemo(env);
  if (env.EMAIL_DEMO_LOCAL_ONLY === "true" && emailDemo && !emailDemoLocalOnly) throw new Error("Local email demo requires matching HTTP loopback origins on the configured API port");
  if (env.EMAIL_DELIVERY_MODE && !["simulated", "smtp-demo"].includes(env.EMAIL_DELIVERY_MODE)) throw new Error("EMAIL_DELIVERY_MODE must be simulated or smtp-demo");
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
  return {
    phoneDemo,
    emailDemo,
    emailDemoLocalOnly,
    emailDemoImmediate: emailDemo && env.EMAIL_DEMO_IMMEDIATE === "true",
    ruleSet: "email-casts-v2",
    mode,
    port,
    apiOrigin,
    appOrigin,
    dataFile: resolve(
      repositoryRoot,
      env.DEMO_DATA_FILE ?? env.DATA_FILE ?? (emailDemo ? "data/email-demo.json" : "data/demo.json"),
    ),
    mongodbUri: env.MONGODB_URI ?? "",
    matchDurationMinutes: Number(env.MATCH_DURATION_MINUTES ?? 10080),
    jobIntervalMs: 500,
  };
}
