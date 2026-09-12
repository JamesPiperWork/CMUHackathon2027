# Fantasy Phishing

A private rivalry for friends who opted in to surprise scam simulations. Design the bait, read the room, and learn the tell. This weekend demo uses eight fictional adults in **The Usual Suspects**, with Alex and Jordan playing one match.

**The local experience uses explicitly simulated delivery. No real email, SMS, call, or ElevenLabs recording has been sent or tested against a real recipient.** Live adapters require the prerequisites in [INTEGRATIONS.md](INTEGRATIONS.md).

## Start

Use Node.js **22.13 or later** and npm. No Docker, database server, credentials, or paid services are needed.

```sh
npm ci
npm run seed
npm run dev
```

- App: [http://localhost:8081](http://localhost:8081)
- API health: [http://localhost:3001/health](http://localhost:3001/health)
- Choose **Alex**, **Jordan**, or **Demo operator** on the welcome screen. Each is a predefined fictional session issued by the server. Alex and Jordan each accept their own invitation and channel consent.
- Two ordinary browser tabs have independent session storage; use separate profiles or devices for the clearest presentation. Do not duplicate a signed-in tab (some browsers copy its storage). The operator has its own visibly labeled presentation console.

Configuration is optional in demo mode. Copy `.env.example` to `.env` in the repository root when needed. Never put provider keys in `EXPO_PUBLIC_*` settings.

For two devices on the same trusted network, set `API_ORIGIN=http://YOUR_LAN_IP:3001`, `APP_ORIGIN=http://YOUR_LAN_IP:8081`, and `EXPO_PUBLIC_API_ORIGIN=http://YOUR_LAN_IP:3001`; restart and open the app URL on each device. Mobile `localhost` refers to the mobile device, not the development computer. The API listens on local network interfaces for this workflow; demo identities and presentation controls are for trusted local use only.

## Play

1. Enroll both fictional players. Select timezone, hours, interests, and each channel independently. Read the fictional activity card.
2. Each player can draft one email, SMS, and voice challenge for their opponent. Generate, inspect/edit bounded text, and lock. Content without a Gemini key is labeled as prepared content in the author's view. Opponents cannot inspect private drafts or teaching cues.
3. Start the match. Missing authored drafts are filled by approved platform scenarios and earn no author bonus. The platform adds three expected fictional messages for each player.
4. Use the operator console to release the next simulated challenge or all queued challenges. Email, text-message, and call presentations use the approved payload. The call simulator offers a visible transcript because no synthetic recording is configured.
5. Trust or flag once to commit a decision and reveal the cue. Inspection and ignored calls score zero. Other sessions refresh through Socket.IO, with periodic authoritative refresh as a reconnection fallback.
6. The server completes after all decisions or at its deadline. The operator can finalize early to demonstrate thresholds or advance simulated time. Recap facts and standings are computed from saved decisions/events.

Correct trust/flag: **+3**. Incorrect trust/flag: **−3**. Trusting a human-authored phish also gives its author **+2**. Four of six decisions qualify a player: one qualifier wins by forfeit; neither yields no contest; two qualify for highest score, with a draw on equal scores. Win/draw/loss/no contest award 3/1/0/0 league points exactly once.

See [DEMO.md](DEMO.md) for the timed presentation and deterministic fallback.

## Commands

```sh
npm run seed          # create fictional state if absent; preserve existing state
npm run reset:demo    # reset fictional data; STOP the dev server first
npm run dev           # API + Expo web preview
npm run typecheck
npm run lint
npm test
npm run build         # Node API bundle + Expo static web export
```

While the server is running, use the authenticated demo operator **Reset** control instead of the CLI. JSON storage supports one process only.

Build output is `apps/api/dist/index.js` and `apps/mobile/dist/`. `npm run start -w @fp/api` runs the built API. The API bundle includes the shared domain package; it does not require a TypeScript loader. The Expo static export needs a web host with SPA fallback for nested routes. This repository does not deploy publicly.

## Native development

The Expo app uses standard React Native components and Router. Dependency versions follow Expo SDK 57's compatibility matrix (React 19.2.3, React Native 0.86.3). [Official SDK table](https://docs.expo.dev/versions/latest/).

```sh
cd apps/mobile
npx expo run:ios
# or, with Android SDK + emulator/device configured:
npx expo run:android
```

These commands require Xcode/macOS or the Android SDK and generate a development build. They were not run in this implementation environment. Auth0 native integration requires that build; it cannot run in Expo Go. Web uses the Auth0 SPA SDK, while external response links use the API's Auth0 authorization-code flow. [Auth0 Expo guide](https://auth0.com/docs/quickstart/native/react-native-expo).

## Structure and guarantees

```text
apps/mobile/       Expo Router screens, reusable RN design system, session client
apps/api/          Fastify, authenticated Socket.IO, durable job loop, provider adapters
packages/shared/   Zod schemas, reviewed fixtures, domain types, scoring and recap rules
```

- File storage serializes changes, writes a temporary file, then atomically renames it. Saved sessions, decisions, scores, jobs, and finalization survive restarts. It supports one demo process, not distributed execution.
- With `MONGODB_URI`, the API uses MongoDB transactions with a state revision and separate unique decision, score-event, and callback indexes. MongoDB must support transactions (replica set, including a local single-node replica set). The single aggregate document is deliberately limited to this small league; it is not a season-scale data model.
- Decisions, score events, totals, and finalization commit together. Duplicate decisions return the original result. Notifications follow commits; no whole database documents or unrevealed answers are broadcast.
- Durable jobs have leases, attempt counts, and idempotency keys. A potentially accepted external submission becomes **unknown** and requires reconciliation. It is never blindly retried. Pausing cancels pending deliveries; a carrier-accepted send may not be retractable.
- Opaque challenge links preview without scoring on GET. A POST requires the intended player's authentication. Cookie-based landing-page responses use CSRF protection. No passwords, payment forms, real OTPs, secret collection, arbitrary destinations, redirects, or recipient recordings exist.
- Live sending requires Auth0, MongoDB, verified participant contacts, adult enrollment, active channel consent, recipient-local hours and quota, public HTTPS, authenticated senders, registrations, and operator-recorded permission for the exact format. Recorded configuration is not independent verification of approval.

## Limits and verification

This is a local hackathon demo, not a production-ready service. It intentionally has no public matchmaking, payments, chat, playoffs, social integrations, powerups, scraping, or voice cloning. Live enrollment is invitation-only: operators provision actual membership/Auth0 subject and independently verified contact evidence in MongoDB; the demo selector never creates a live identity or verification.

The default real quota permits one challenge per channel per recipient local day, while the six-decision demonstration explicitly accelerates two per channel in simulation. Live jobs are scheduled across recipient-local contact days; set `MATCH_DURATION_MINUTES=4320` (too-short deadlines are rejected). Unresolved/failed delivery leaves the match incomplete for operator resolution. SMTP submission acceptance does not establish inbox receipt. There is no provider-specific SMTP receipt integration or automated reconciliation console.

Automated tests cover scoring, thresholds, fixture review, authorization/privacy, persistence, duplicate decisions/finalization, neutral GET previews, pause/worker recovery, sockets, malformed/refused generation, provider callbacks, and fail-closed readiness. See `npm test` for individual cases. Web and iOS/Android JavaScript exports were checked; native binary compilation was not. Native device builds, a real MongoDB replica set, real Auth0 tenants, real Gemini/ElevenLabs responses, and actual carrier/email delivery require environments and credentials not supplied here.

Verified during handoff: clean `npm ci`, seed/reset, typecheck, ESLint, 32 passing tests, production API startup, web export, two independent browser sessions completing a 20–12 match, a 390px layout with no horizontal overflow or overlapping activity sections, and a built-server restart preserving the result. `npm run demo:finish` was also rehearsed against an isolated fictional server. npm reports 13 moderate transitive advisories in the Expo dependency tree; no high/critical advisories remained after updating the SMTP dependency. Do not apply npm's suggested downgrade to an incompatible Expo major.
