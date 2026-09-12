/** Optional presentation shortcut: submit disclosed scripted fictional responses through normal authenticated API endpoints. */
import type { PlayerState, ScenarioPublic } from "@fp/shared";
const origin = process.env.DEMO_API_ORIGIN ?? "http://localhost:3001";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
  throw new Error("Presentation shortcut only supports a loopback demo API.");
async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
const config = await request<{ mode: string }>("/api/config");
if (config.mode !== "demo")
  throw new Error("Prepared responses are disabled in live mode.");
const operator = await request<{ token: string }>(
  "/api/demo/session",
  undefined,
  { player: "operator" },
);
const state = await request<PlayerState>("/api/state", operator.token);
if (state.match.state !== "active")
  throw new Error(
    "First enroll both players, lock the drafts, and start the match in the app.",
  );
console.log(
  "PRESENTATION TOOL: submitting prepared responses as fictional Alex and Jordan. These are scripted demo decisions.",
);
await request("/api/operator/release", operator.token, { all: true });
// Inspect the visible approved cue, never fetch hidden truth or mutate scores.
const hasUrgency = (scenario: ScenarioPublic) =>
  /ten minutes/i.test(scenario.content.bodyText);
for (const player of ["jordan", "alex"] as const) {
  const session = await request<{ token: string }>(
    "/api/demo/session",
    undefined,
    { player },
  );
  let current = await request<PlayerState>("/api/state", session.token);
  let tookBait = current.incoming.some(
    (s) => s.decision && !s.decision.correct && s.decision.choice === "trust",
  );
  for (const scenario of current.incoming) {
    if (scenario.decision) continue;
    const phishCue = hasUrgency(scenario);
    const showcaseMistake = player === "jordan" && !tookBait && phishCue;
    const choice = showcaseMistake ? "trust" : phishCue ? "flag" : "trust";
    if (showcaseMistake) tookBait = true;
    await request(`/api/scenarios/${scenario.id}/decision`, session.token, {
      choice,
    });
    console.log(
      `${player}: ${scenario.channel}, ${choice}${showcaseMistake ? " (scripted missed cue)" : ""}`,
    );
  }
  current = await request<PlayerState>("/api/state", session.token);
  console.log(`${player}: ${current.match.scores[player]} match points`);
}
const final = await request<PlayerState>("/api/state", operator.token);
console.log(
  `Saved result: ${final.match.result}; Alex ${final.match.scores.alex}, Jordan ${final.match.scores.jordan}. Open The league for the recap.`,
);
