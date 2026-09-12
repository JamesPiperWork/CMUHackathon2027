# Fantasy Phishing

A private fantasy league for phishing simulations: create bait for a friend, play a weekly head-to-head, and watch the league’s best moments in Weekly Wrapped. Leagues, memberships, private notes, chat, match decisions, and standings persist across restarts.

The included season uses eight synthetic accounts. Local delivery is simulated inside the app; no real email, text, call, or recipient recording is required. Configurable live adapters and their prerequisites are documented in [INTEGRATIONS.md](INTEGRATIONS.md).

## Run locally

Use Node.js **22.13 or later** and npm. No credentials, database server, or paid services are needed for local play.

```sh
npm ci
npm run seed
npm run dev
```

- [Open the app](http://localhost:8081)
- [Open the interactive phone preview](http://localhost:3001/mobile-preview)
- [Check API health](http://localhost:3001/health)

Choose **Alex** or **Jordan**, or **Choose another player** for Sam, Riley, Casey, Morgan, Jamie, and Taylor. These are server-issued practice accounts. Alex and Jordan complete their contact preferences on first entry; the other synthetic accounts include prepared enrollment. Seeded match history and chat are identified in the app.

Each ordinary browser tab keeps a separate session. For two players, open two fresh tabs and sign in separately; duplicating a signed-in tab can copy its session storage.

Optional configuration belongs in a root `.env` copied from `.env.example`. Keep provider secrets out of `EXPO_PUBLIC_*` variables. `MATCH_DURATION_MINUTES` defaults to **10080**—one week. Set a shorter value explicitly for a local rehearsal.

## Use the app

1. **Choose a league.** The league picker opens My leagues. Create a league or join with an invite code. A new league waits for a second player before assigning a matchup.
2. **Choose your bait.** Select Cast 1 or Cast 2, a hobby, and optional private notes about your opponent. These details belong to the sender, never the target. Generate with Gemini or use the prepared fallback, review, edit, and lock.
3. **Use a Spear if you want.** One extra email cast per player per league season. Handwrite from a valid starting point or draft with Gemini. Locking the Spear consumes the chip atomically; it never takes one of the two regular slots. A failed send-time scheduling check rolls the reservation back.
4. **Play the week.** Start with at least one locked email. Unfinished drafts stay private; either player can create and send remaining casts during the active week. Only authored, locked casts are scheduled. There is no ordinary mail or automatic filler. In demo mode, read the simulator; the live SMTP adapter sends to verified participant email addresses when configured.
5. **Follow the season.** League contains standings, weekly pairings, chat, and Wrapped. The organizer advances after every current match is final. Round-robin cycles preserve saved assignments, rotate opponents, and give odd-sized leagues byes. A roster change starts a new cycle.
6. **Watch Weekly Wrapped.** Play a short story from the saved casts, confirmed actions, untouched emails, final scores, and league chat. Desktop browsers can export a portrait WebM video. This is an animated recap, not a recording of participants.

### Weekly email scoring

| Event | Recipient | Sender |
| --- | ---: | ---: |
| Authenticated participant opens the bait action | −1 | +3 |
| Each received phishing email left unclicked at the weekly deadline | +1 | 0 |
| Flagging before the deadline | 0 immediately; +1 at week end | 0 |
| Missing/unsent cast or cancelled delivery | 0 | 0 |

Ignoring received bait counts as avoiding it. There are no scored ordinary messages and no minimum-response/forfeit rule in new matches. Higher weekly total wins; equal totals draw. League points remain win 3, draw 1, loss 0.

A raw email-link GET, HEAD, scanner, or preview never scores. The external landing page preserves the link through sign-in and requires an authenticated recipient POST to open the bait action. This deliberate confirmation protects scores from email scanners; it is not raw email-link click tracking. Failed or unresolved live delivery leaves settlement incomplete rather than inventing receipt. SMTP acceptance alone does not prove delivery; an authenticated flag supplies participant receipt evidence without changing the transport status.

Completed and active matches saved under the old multi-channel rules retain their original scores and views. Only unplayed drafting matches upgrade; unused text/call drafts are archived in storage. New matches use email casts. See [MERGE_NOTES.md](MERGE_NOTES.md) for what came from each branch.

## Mobile from your computer

The quickest option is the [phone preview](http://localhost:3001/mobile-preview), also available under Account & preferences. It puts the same interactive React Native web app inside a phone frame. Sign in, draft, chat, and make decisions with your mouse and keyboard; it uses the same API and saved data. **This preview is a phone-sized web view, not a native iOS binary.**

For native iOS on a Mac:

1. Install full Xcode, select its command-line tools, and install an iOS Simulator runtime in Xcode settings, following the [official Expo iOS Simulator guide](https://docs.expo.dev/workflow/ios-simulator/).
2. Keep the API running, then build and launch the app:

```sh
cd apps/mobile
npx expo run:ios
```

The Mac used for this handoff has only Xcode Command Line Tools; `simctl` is unavailable, so a native simulator build has not been run. Android requires the Android SDK and an emulator or connected device, then `npx expo run:android` from the same directory. Auth0’s native integration requires a development build rather than Expo Go.

For a physical device on the same trusted network, set `API_ORIGIN=http://YOUR_LAN_IP:3001`, `APP_ORIGIN=http://YOUR_LAN_IP:8081`, and `EXPO_PUBLIC_API_ORIGIN=http://YOUR_LAN_IP:3001`, then restart. A phone’s `localhost` refers to the phone. The practice account selector is intended for trusted local use.

## Feature scope

| Feature | Current implementation |
| --- | --- |
| Private leagues and head-to-head | Create/join, persistent memberships, weekly schedules, multiple playable pairs, next-week progression |
| Personalized challenges | Sender-owned interests and private Markdown notes; target controls consent and exclusions |
| AI drafting | Gemini adapter with validated output and labeled prepared fallback |
| Standings and league chat | Records, league points, rank movement, member-only persistent messages |
| Weekly Wrapped | Event-based animated episodes and supported desktop WebM export |
| Channels and customization | New matches use email; difficulty and family-friendly settings. Legacy SMS/voice adapters and saved matches remain available |
| Phished reveal | Decision and teaching-cue reveal; Rick-roll and opponent-selected images are not implemented |
| Spear Email chip | One extra handwritten or AI-assisted email per player per league season; persisted transactional usage |
| Crowdsourced playoffs | Drafting/voting and playoff progression are not implemented |
| Tiebreaker minigames | Identify the Phish and deepfake swiping are not implemented; equal scores currently draw |
| Social and masked domains | Social simulations and custom masked sending domains are not implemented; response links are application-owned |

This is a functional local app foundation, not a production deployment. Live enrollment remains invitation-only: provision real Auth0 membership and verified contact evidence separately. The synthetic account selector is disabled in live mode.

## Development and persistence

```sh
npm run seed          # create synthetic state if absent; preserve existing state
npm run reset:demo    # reset local synthetic data; stop the dev server first
npm run dev           # API + Expo web
npm run typecheck
npm run lint
npm test
npm run build         # bundled Node API + Expo static web export
```

See [DEMO.md](DEMO.md) for a presentation using the product and its synthetic season. An optional local operator shortcut can accelerate a rehearsal; ordinary play does not depend on it.

```text
apps/mobile/       Expo Router screens, shared React Native UI, session client
apps/api/          Fastify, authenticated Socket.IO, persistent leagues and jobs
packages/shared/   Domain types, validation, synthetic fixtures, scoring rules
```

JSON storage writes atomically and supports **one API process**. Do not run a CLI reset concurrently with the JSON-backed server. MongoDB storage uses transactions and requires a replica set. Its aggregate-document approach suits small leagues, not a large production service.

Decisions, score events, and finalization commit together; duplicate submissions return the saved result. Socket notifications follow commits. Private notes and unrevealed answers stay scoped to their owner. Pausing cancels pending deliveries; a message already accepted by a real carrier may not be retractable. Challenge GET links never score; decisions require the intended recipient’s authentication and CSRF protection for cookie-based responses.

Build output is `apps/api/dist/index.js` and `apps/mobile/dist/`. Start the built API with `npm run start -w @fp/api`; the static web export needs a host with SPA fallback. Nothing is published by these commands.

## Integrations and verification

Live sending requires verified contacts, consent, recipient-local contact windows and quota, public HTTPS, Auth0, MongoDB, and the provider-specific setup in [INTEGRATIONS.md](INTEGRATIONS.md). The default quota allows one challenge per channel per local day; live scheduling spans eligible days and rejects deadlines that are too short. Failed or unresolved delivery can leave a match incomplete. SMTP acceptance does not prove inbox receipt, and external submissions with uncertain status are not blindly retried.

Automated checks cover scoring, authorization, private profiles, league isolation and progression, persistence, sockets, job recovery, generation fallback, and provider callbacks. Run the commands above for current results. Native binary builds and real Auth0, MongoDB, Gemini, ElevenLabs, carrier, or email delivery still require environments and credentials not supplied here.
