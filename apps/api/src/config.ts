import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
dotenv({ path: resolve(repositoryRoot, ".env"), quiet: true });
export interface Config {
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
    if (mode === "live" && url.protocol !== "https:")
      throw new Error("Live origins must use HTTPS");
  }
  if (mode === "live" && !env.MONGODB_URI)
    throw new Error("Live mode requires MONGODB_URI with a replica set");
  if (mode === "live" && (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE))
    throw new Error("Live mode requires Auth0 domain and audience");
  return {
    mode,
    port,
    apiOrigin,
    appOrigin,
    dataFile: resolve(
      repositoryRoot,
      env.DEMO_DATA_FILE ?? env.DATA_FILE ?? "data/demo.json",
    ),
    mongodbUri: env.MONGODB_URI ?? "",
    matchDurationMinutes: Number(env.MATCH_DURATION_MINUTES ?? 30),
    jobIntervalMs: 500,
  };
}
