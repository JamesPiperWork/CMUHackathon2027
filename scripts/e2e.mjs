// Zero-dependency end-to-end ACCEPTANCE test. Boots the app on a spare port and drives
// the exact demo click-path through the HTTP API. Node built-ins only.
//
//   npm run test:e2e
//
// Uses the templated-lure fallback unless GEMINI_API_KEY is set, so it runs offline.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.E2E_PORT || 3999);
const BASE = `http://localhost:${PORT}`;
const VERBOSE = !!process.env.E2E_VERBOSE;

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function j(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}
async function html(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, text: await r.text() };
}

async function waitReady(proc, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (proc.exitCode !== null) throw new Error(`next dev exited early (code ${proc.exitCode})`);
    try {
      const r = await fetch(`${BASE}/api/league`);
      if (r.status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("server did not become ready in time");
}

const env = { ...process.env, NEXT_PUBLIC_APP_URL: "", GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" };
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
server.stdout.on("data", (d) => VERBOSE && process.stdout.write(d));
server.stderr.on("data", (d) => process.stdout.write(d));

function shutdown() {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

try {
  console.log(`\n▶ booting next dev on :${PORT}`);
  await waitReady(server);

  console.log("\n▶ 1. seed");
  const seed = await j("/api/seed", { method: "POST" });
  ok(seed.status === 200 && seed.body.ok, "POST /api/seed ok");
  ok(seed.body.players.length === 8, "8 players");
  ok(seed.body.schedule.matchups === 40, "10 weeks × 4 matchups = 40 pairings persisted");
  ok(seed.body.week1AliceVsBob === true, "Week-1 includes Alice vs Bob");
  ok(/round-robin OK/.test(seed.body.assertion), `schedule assertion logged: ${seed.body.assertion}`);
  const seed2 = await j("/api/seed", { method: "POST" });
  ok(seed2.body.players.length === 8, "seed is idempotent (re-seed → still 8 players)");

  const byName = Object.fromEntries(seed2.body.players.map((p) => [p.name, p]));
  const alice = byName.Alice, bob = byName.Bob, carol = byName.Carol;
  const leagueId = seed2.body.league.id;

  console.log("\n▶ 2. state: Alice's opponent + shots");
  const st = await j(`/api/state?playerId=${alice.id}`);
  ok(st.body.ok && st.body.opponent.name === "Bob", "Alice's scheduled Week-1 opponent is Bob");
  ok(st.body.shots.castsLeft === 2 && st.body.shots.spearAvailable === true, "2 casts left · spear available");

  console.log("\n▶ 3. generate lure");
  const gen = await j("/api/casts/generate", { method: "POST", body: JSON.stringify({ senderId: alice.id, attributes: bob.attributes }) });
  ok(gen.status === 200 && gen.body.ok, `generate ok (source=${gen.body.source})`);
  ok(gen.body.body.includes("{{TRACKING_LINK}}"), "generated body carries literal {{TRACKING_LINK}}");
  ok(gen.body.opponent.name === "Bob", "generate resolves target to Bob");

  console.log("\n▶ 4. closed-loop enforcement");
  const bad = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: gen.body.subject, body: gen.body.body, type: "cast", targetId: carol.id }) });
  ok(bad.status === 403 && bad.body.code === "CLOSED_LOOP", "SERVER rejects a target that is not the scheduled opponent (403)");

  console.log("\n▶ 5. send cast #1 and #2, then the 3rd is rejected by the server");
  const send1 = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: gen.body.subject, body: gen.body.body, type: "cast" }) });
  ok(send1.status === 200 && send1.body.weekSlot === 1, "cast #1 sent → weekSlot 1");
  ok(send1.body.to.name === "Bob", "cast #1 delivered to Bob");
  ok(!send1.body.cast.body.includes("{{TRACKING_LINK}}") && /\/c\/[a-f0-9]{32}/.test(send1.body.cast.body), "server replaced placeholder with /c/<token>");
  const send2 = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: "Second lure", body: "hi {{TRACKING_LINK}}", type: "cast" }) });
  ok(send2.status === 200 && send2.body.weekSlot === 2, "cast #2 sent → weekSlot 2");
  const send3 = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: "Third", body: "x {{TRACKING_LINK}}", type: "cast" }) });
  ok(send3.status === 409 && send3.body.code === "CAST_CAP", "3rd weekly cast REJECTED by server (409 CAST_CAP)");
  const st2 = await j(`/api/state?playerId=${alice.id}`);
  ok(st2.body.shots.castsLeft === 0, "shots indicator shows 0 casts left");

  console.log("\n▶ 6. Bob's inbox has the messages (in-app delivery)");
  const inbox = await j(`/api/inbox?playerId=${bob.id}`);
  ok(inbox.body.messages.length === 2, "Bob's inbox has 2 training emails");
  const token1 = send1.body.cast.trackingToken;
  ok(inbox.body.messages.some((m) => m.trackingToken === token1), "cast #1 is in Bob's inbox");

  console.log("\n▶ 7. click cast #1 → teaching page → Alice scores");
  const before = await j(`/api/matchups?leagueId=${leagueId}`);
  const card = (r) => r.body.matchups.find((m) => [m.homeId, m.awayId].includes(alice.id));
  const scoreOf = (r, id) => { const c = card(r); return c.homeId === id ? c.homeScore : c.awayScore; };
  ok(scoreOf(before, alice.id) === 0 && scoreOf(before, bob.id) === 0, "before click: Alice 0 – Bob 0");
  const page = await html(`/c/${token1}`);
  ok(page.status === 200 && /training simulation/i.test(page.text), "teaching page renders 'training simulation'");
  ok(/tipped you off/i.test(page.text) && /hover before you click/i.test(page.text), "teaching page lists red flags");
  ok(!/<form|<input/i.test(page.text), "teaching page has no form/inputs (collects nothing)");
  const after = await j(`/api/matchups?leagueId=${leagueId}`);
  ok(scoreOf(after, alice.id) === 100 && scoreOf(after, bob.id) === 0, "after click: /week shows Alice 100 – Bob 0");
  await html(`/c/${token1}`);
  const again = await j(`/api/matchups?leagueId=${leagueId}`);
  ok(scoreOf(again, alice.id) === 100, "second click is idempotent (still 100)");

  console.log("\n▶ 8. defense: Bob reports cast #2 before clicking");
  const rep = await j(`/api/casts/${send2.body.cast.id}/report`, { method: "POST", body: JSON.stringify({ playerId: bob.id }) });
  ok(rep.status === 200 && rep.body.reporterPoints === 50, "report ok → reporter +50");
  const repLate = await j(`/api/casts/${send1.body.cast.id}/report`, { method: "POST", body: JSON.stringify({ playerId: bob.id }) });
  ok(repLate.status === 409 && repLate.body.code === "ALREADY_CLICKED", "reporting an already-clicked lure is rejected");
  const repWrong = await j(`/api/casts/${send2.body.cast.id}/report`, { method: "POST", body: JSON.stringify({ playerId: carol.id }) });
  ok(repWrong.status === 403, "non-recipient cannot report");
  const afterRep = await j(`/api/matchups?leagueId=${leagueId}`);
  ok(scoreOf(afterRep, alice.id) === 100 && scoreOf(afterRep, bob.id) === 50, "scoreboard: Alice 100 – Bob 50");
  const clickReported = await html(`/c/${send2.body.cast.trackingToken}`);
  ok(/already reported/i.test(clickReported.text), "clicking a reported lure: teaching page, no points");
  const afterRepClick = await j(`/api/matchups?leagueId=${leagueId}`);
  ok(scoreOf(afterRepClick, alice.id) === 100, "neutralized cast still scores sender 0");

  console.log("\n▶ 9. spear as a third shot (does not consume a cast slot)");
  const spear = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: "Spear", body: "hand-drafted {{TRACKING_LINK}}", type: "spear" }) });
  ok(spear.status === 200 && spear.body.weekSlot === "spear", "spear sent with weekSlot 'spear' despite cast cap");
  const stSpear = await j(`/api/state?playerId=${alice.id}`);
  ok(stSpear.body.shots.spearAvailable === false, "spearUsedThisSeason now true");
  const spear2 = await j("/api/casts/send", { method: "POST", body: JSON.stringify({ senderId: alice.id, subject: "Spear2", body: "x {{TRACKING_LINK}}", type: "spear" }) });
  ok(spear2.status === 409 && spear2.body.code === "SPEAR_CAP", "second spear REJECTED by server (409 SPEAR_CAP)");
  await html(`/c/${spear.body.cast.trackingToken}`);
  const afterSpear = await j(`/api/matchups?leagueId=${leagueId}`);
  ok(scoreOf(afterSpear, alice.id) === 200, "spear click → Alice 200");

  console.log("\n▶ 10. close week → standings");
  const close = await j(`/api/week/close?leagueId=${leagueId}`, { method: "POST" });
  ok(close.status === 200 && close.body.closedWeek === 1 && close.body.currentWeek === 2, "week 1 closed, now week 2");
  const wk1 = await j(`/api/matchups?leagueId=${leagueId}&week=1`);
  const c1 = card(wk1);
  ok(c1.status === "final" && c1.winnerId === alice.id, "week-1 matchup final, Alice winner");
  const stand = await j(`/api/standings?leagueId=${leagueId}`);
  const rowA = stand.body.standings.find((r) => r.name === "Alice");
  const rowB = stand.body.standings.find((r) => r.name === "Bob");
  ok(rowA.wins === 1 && rowA.losses === 0 && rowA.ties === 0 && rowA.points === 200, "standings: Alice 1-0-0 (200 pts)");
  ok(rowB.wins === 0 && rowB.losses === 1 && rowB.points === 50, "standings: Bob 0-1-0 (50 pts)");
  ok(stand.body.standings[0].name === "Alice", "Alice tops the table");
  const st3 = await j(`/api/state?playerId=${alice.id}`);
  ok(st3.body.week === 2 && st3.body.opponent.name !== "Bob" && st3.body.shots.castsLeft === 2, `week 2: new opponent (${st3.body.opponent.name}), casts reset to 2`);

  console.log(`\n✅ ALL ${passed} ACCEPTANCE CHECKS PASSED\n`);
  shutdown();
  process.exit(0);
} catch (err) {
  console.error(`\n❌ ${err.message}\n`);
  shutdown();
  process.exit(1);
}
