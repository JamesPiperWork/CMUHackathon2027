# 🏈 Fantasy Phishing

A closed-league, **consent-based phishing-awareness TRAINING game**, styled after head-to-head
fantasy football. Eight friends, ten weeks, one scheduled opponent per week. You send
training-simulation lures; your opponent scores by spotting them. Every link leads to a
**teaching page** that reveals the simulation and lists the red flags.

This is the friend-group version of the security-awareness training companies run
(KnowBe4, Hoxhunt). It is a **defensive / educational tool**. Its architecture makes the
attack version impossible by construction:

- **Closed loop.** A cast's target is *always* the sender's scheduled opponent, resolved
  server-side from the schedule. There is no free-text recipient field anywhere in the UI
  or the API. A client that names any other target is rejected with `403`.
- **Nothing leaves the app.** Training emails are delivered to an **in-app Inbox** only.
  There is no SMTP, no mail provider, no external mailbox — not by policy, by absence.
- **Landing pages teach and collect nothing.** No forms, no fields, no credentials.
- **Out of scope by design:** sender/domain spoofing, impersonating real organizations,
  credential capture, real-inbox delivery.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Gemini via `@google/generative-ai`.
That's it. Deploys to Vercel with one env var. No database service, no mail service.

State lives in an in-process store that **auto-seeds** on first touch (and can be reset
with `POST /api/seed`). It mirrors the original MongoDB-shaped data model one-for-one, so
a persistent adapter (e.g. Vercel KV) can be dropped in behind the same interface later.
On Vercel, state persists for the life of a warm function instance — plenty for a demo.

## Install

```bash
git clone https://github.com/JamesPiperWork/CMUHackathon2027.git
cd CMUHackathon2027
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY
```

### Env

| Var | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | for Gemini lures | Without it the app still runs — lures fall back to a template. |
| `GEMINI_MODEL` | no | Default `gemini-1.5-flash`. **The only place the model name lives.** One-line swap. |
| `NEXT_PUBLIC_APP_URL` | no | Leave unset; tracking links use each request's own origin (works on localhost and any Vercel URL). |

## Run

```bash
npm run dev          # http://localhost:3000
npm run seed         # optional — the app auto-seeds; this resets to a fresh Demo League
npm run test:e2e     # boots the app on :3999 and runs the full acceptance path below
```

Deploy to Vercel: import the repo, set `GEMINI_API_KEY`, deploy. Nothing else to provision.

## The demo click-path (acceptance)

1. **Home `/`** → click **Seed demo league** (or skip — it auto-seeds). Note the log line:
   `round-robin OK: 8 players, 7 unique rounds, each player once per week & 7 distinct opponents`
   and `Week-1 Alice vs Bob present: true`.
2. Click **Alice** (default). **`/play`** shows *Alice vs Bob*, and
   **"2 casts left · spear available"**.
3. **New Cast → `/cast`**. The attribute form is prefilled from Bob's stored recon
   (hobbies / team / hometown / employer), editable, plus an optional pretext.
   **Generate lure with Gemini** → editable preview. The body contains the literal
   `{{TRACKING_LINK}}`; the server owns link generation.
4. **Send.** The server re-checks the weekly cap and the opponent match, assigns
   `weekSlot 1`, mints a tracking token, and delivers to Bob's in-app Inbox.
5. Send a second cast (`weekSlot 2`). Then try a third — **the server rejects it**
   (`409 CAST_CAP`), not just the disabled button. `/play` now reads *0 casts left*.
6. Home → pick **Bob** → **`/inbox`**. Open the message. Either **🚩 Report as phish**
   (Bob +50, that cast scores Alice 0) or click the link…
7. **`/c/<token>`** — the teaching page: *"This was a Fantasy Phishing training simulation.
   Here's what should have tipped you off:"* + red-flag list. Alice +100.
8. **`/week`** polls `GET /api/matchups` every 2 s. The Alice–Bob card (highlighted for the
   acting player) shows **100 – 0** within 2 s.
9. Optional: back as Alice, **Use Spear → `/spear`**. Hand-draft (or **Draft with Gemini**),
   throw it as a *third shot* — it does not consume a cast slot. Bob clicks it → **200 – 0**.
   A second spear is rejected (`409 SPEAR_CAP`).
10. On `/week` click **Close week & advance** (`POST /api/week/close`). **`/standings`** shows
    **Alice 1-0-0**. `/play` now shows Week 2 and a new opponent with 2 fresh casts.

`npm run test:e2e` runs exactly this path (plus the negative cases) against a live server
and prints ✓ per check.

## Scoring

- Your lure clicked by your opponent → **you +100** that week.
- Spear clicked → **you +100** (third shot; does not use a cast slot).
- Opponent reports your lure before clicking → **reporter +50**, your cast scores **0**.
- No negatives. Weekly score = offense + defense in the current week, derived live from casts.
- Week close: higher weekly score = W, opponent = L, equal = T. Scores snapshot onto the
  matchup only at close. Standings = W-L-T from final matchups, tiebreak = season points.
- **TODO stubs (intentionally not implemented):** playoffs / arcade postseason after week 10;
  time-decay bonus.

## Hard limits (enforced server-side)

| Rule | Where |
|---|---|
| Target must equal scheduled opponent | `POST /api/casts/send` resolves it from `matchups`; any client-supplied mismatch → `403` |
| ≤ 2 casts per sender per week | counted from `casts` at send time, before insert → `409 CAST_CAP` |
| ≤ 1 spear per sender per season | counter **and** `players.spearUsedThisSeason` → `409 SPEAR_CAP` |
| Only the recipient can report; not after a click | `POST /api/casts/[id]/report` → `403` / `409` |
| Link generation | server mints `/c/<32-hex>`; model only ever emits `{{TRACKING_LINK}}` |

## API

| Route | Purpose |
|---|---|
| `POST /api/seed` | Reset to Demo League: 8 players, 10-week schedule (Week 1 = Alice v Bob). Idempotent. |
| `GET  /api/league` | League + roster. |
| `GET  /api/state?playerId=` | Week, scheduled opponent, shots remaining. |
| `POST /api/casts/generate` | `{senderId, attributes}` → `{subject, body}` with `{{TRACKING_LINK}}`. |
| `POST /api/casts/send` | `{senderId, subject, body, type}` → re-checks caps + opponent, delivers to inbox. |
| `GET  /api/inbox?playerId=` | The defender's in-app inbox for the current week. |
| `POST /api/casts/[id]/report` | `{playerId}` → mark reported, reporter +50, sender 0. |
| `GET  /c/[token]` | Record click, score sender, render teaching page. |
| `GET  /api/matchups?leagueId=&week=` | Pairings with live derived scores. |
| `GET  /api/standings?leagueId=` | W-L-T from final matchups. |
| `POST /api/week/close?leagueId=` | Finalize current week, advance. |

## Screens

`/` pick player · `/play` opponent + shots · `/cast` attributes → generate → preview → send ·
`/spear` hand-draft + optional Gemini assist · `/inbox` defense (open / report / click) ·
`/week` live head-to-head cards (the demo screen) · `/standings` · `/wrapped` ·
`/c/[token]` teaching landing.

## Schedule

Single round-robin for 8 players via the circle method → 7 unique rounds of 4 matchups.
Weeks 8–10 replay rounds 1–3. After generation the seed **asserts** every player appears
exactly once per week and has 7 distinct opponents across weeks 1–7, and logs the result.
Week 1 is forced to Alice vs Bob by seat assignment.

## Gemini prompt

Server-side, verbatim, consented-training framing intact:

> You generate emails for a CONSENTED phishing-awareness TRAINING game. Recipients are
> enrolled players in a friend-group league who opted in. Write a realistic
> training-simulation email tailored to the target's interests. Return ONLY JSON:
> `{"subject": string, "body": string}`. The body must contain exactly one call-to-action
> link written as the literal string `{{TRACKING_LINK}}`. Do not add any other links.

Parsed strictly; one retry on parse failure; then a templated fallback.
