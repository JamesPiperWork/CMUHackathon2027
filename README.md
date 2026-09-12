# Fantasy Phishing

A private game between friends: create phishing bait and compete in weekly head-to-head matches. The app has three main pages: **Home, Bait, League**. Leagues, accounts, private notes, chat and scores persist across restarts.

A fresh installation has **zero accounts, leagues or drafts**. Create an account and choose your player preferences before joining a league. Email challenges belong in participants’ email inboxes; there is no in-app inbox.

## Run the app

Use Node.js **22.13 or later** and npm.

```sh
npm ci
npm run dev
```

`npm run dev` follows `.env`: `EMAIL_DELIVERY_MODE=smtp-demo` checks SMTP, builds, and serves the real-email app at [localhost:3001](http://localhost:3001). This checkout is configured that way. The checked-in `.env.example` instead selects simulation for new installations, with these URLs:

- [Desktop app](http://localhost:8081)
- [Large/Compact phone preview](http://localhost:3001/mobile-preview)
- [API health](http://localhost:3001/health)

In simulation, choose **Create account**, enter your name, email and a password of 10–128 characters, then complete player preferences. Real-email signup sends a verification code instead. Returning players use **Sign in**. Local passwords are salted and hashed; local signup does not verify email ownership or enable real delivery. Existing saved data is preserved.

For two players, use separate browser profiles or private windows, especially when opening email response links. Each normal app tab stores its own bearer session, but browser cookies are shared between tabs in the same profile.

## Send real email from this computer

Put SMTP credentials and session/token secrets in the uncommitted root `.env`, following [EMAIL_DEMO_SETUP.md](EMAIL_DEMO_SETUP.md). Then stop the development server and run:

```sh
npm run email:demo
```

The launcher loads `.env`, checks SMTP without sending email, builds the app, and serves the API and web app together at [localhost:3001](http://localhost:3001). The [phone preview](http://localhost:3001/mobile-preview) keeps the desktop/Large/Compact options. This mode uses separate `data/email-demo.json` storage and binds the server to loopback.

Participants create an account or sign in using a code sent to their email, then choose their name and delivery preferences. `EMAIL_DEMO_RECIPIENTS` is optional: a populated list restricts signup and delivery; blank uses participants’ verified signup addresses. Challenges use a truthful Fantasy Phishing sender and are clearly labeled as game simulations.

**Emailed links from this launcher work only on this computer.** Open them here. For phones or other computers, configure a reachable public HTTPS origin as described in the email guide. A successful SMTP connection check does not prove a gameplay email was delivered.

## Deploy

Frontend to Vercel, backend to an always-on host. See [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Play a match

1. **Set up your player and league.** Choose email hours, topics to avoid and family-friendly preferences. Create a league, adjust its rules, and share the invite code. A second player joining creates the first matchup.
2. **Create your bait.** Choose Cast 1 or Cast 2, then Email, Text or Voice. Describe the context or angle for your opponent. The sender supplies these details. Generate one message, edit it directly, or request a revision. The editor matches the medium: email subject/body, text message, or voice script. Back/forward navigation preserves saved edits.
3. **Optionally use a Spear.** One extra cast per player per league season, using any enabled medium. Write it yourself or use AI. Making it ready reserves the chip without consuming a regular cast slot.
4. **Send your bait.** In immediate delivery mode, use the selected medium’s send button in Bait; no separate match activation is needed. Voice requires creating, playing and approving the exact audio first. A missing phone provider blocks real text/call submission without consuming the cast. Scheduled mode keeps **Start fishing** after saving at least one cast. Remaining casts can be added during the active week. Only authored casts are sent; no ordinary gameplay mail or automatic filler is added. Bait shows outgoing delivery status.
5. **Follow the league.** League contains standings, pairings, chat and past match results. New weeks rotate opponents, with byes for odd-sized leagues.

New email drafting follows main’s context → editable email flow. Its configured default model is `gemini-3.6-flash`, overridable with `GEMINI_MODEL`. If Gemini is unavailable, the app labels its prepared fallback; a failed revision keeps the existing draft. Model availability and real output quality require a provider rehearsal.

### Scoring

| Event | Recipient | Sender |
| --- | ---: | ---: |
| Authenticated participant confirms taking the bait | −1 | +3 |
| Each confirmed-received email/text left unclicked at the weekly deadline | +1 | 0 |
| Flagging before the deadline | 0 now; +1 at week end | 0 |
| Unsent or cancelled cast | 0 | 0 |

Voice earns avoidance only for an explicit flag, settled at the deadline. No answer, voicemail or a generic completed-call status alone earns 0.

Higher weekly total wins; equal totals draw. League points are win 3, draw 1, loss 0. Matches default to one week (`MATCH_DURATION_MINUTES=10080`).

Raw email-link GETs, scanners and previews never score. The response page requires the intended recipient’s authenticated confirmation. SMTP acceptance alone does not prove delivery: an untouched email needs genuine delivery evidence before avoidance points can settle. The [signed receipt relay](docs/EMAIL_RECEIPTS.md) is implemented; connecting a real evidence source remains separate work.

## Start fresh

Use **Settings → Reset demo** in simulated mode. Its confirmation explains that it clears **all accounts, leagues and progress**, then returns to Create account. Cancel keeps the current game.

In real-email mode, the organizer whose verified email matches `SMTP_USER` sees **Reset active leagues**. This archives current leagues and cancels unfinished work while retaining accounts, sessions, email history and consumed delivery quotas. Already sent email cannot be recalled. Other participants do not get this control.

For a stopped local simulator, `npm run reset:demo` also clears its data. Do not run a file-backed CLI reset alongside the server. `npm run seed` only initializes missing storage; it does not create sample users or erase existing progress.

## Mobile and development

The phone preview is the same interactive web app in a phone frame, not a native binary. Native iOS requires Xcode and a development build (`npx expo run:ios` from `apps/mobile`); Android requires its SDK/emulator and `npx expo run:android`. See the [Expo simulator guide](https://docs.expo.dev/workflow/ios-simulator/). Native binaries have not been verified in this handoff.

```sh
npm run typecheck
npm run lint
npm test
npm run build        # Node API + Expo static web export
npm run email:check  # SMTP/configuration check; sends no email
```

Provider secrets belong only in the root `.env`, never `EXPO_PUBLIC_*` variables. JSON storage supports one API process; MongoDB uses transactions and requires a replica set. Build output is `apps/api/dist/index.js` and `apps/mobile/dist/`; the email-demo API serves the built web app. These commands do not publish anything.

The test suite exercises auth, consent, scoring, private data, scheduling, generation contracts, job recovery and provider mocks. Keep real provider keys unset for automated checks; their results do not establish real delivery or model quality. Full Auth0/MongoDB and legacy SMS/voice setup are described in [INTEGRATIONS.md](INTEGRATIONS.md).

See [DEMO.md](DEMO.md) for the presentation, [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) for engineering priorities, and [VOICE_SETUP.md](VOICE_SETUP.md) for ElevenLabs audio and optional Twilio text/call setup. Playoffs, deepfake tiebreakers, masked domains, social channels, Rick-rolls and opponent-selected reveal images remain unimplemented. The current game shares two weekly cast slots across Email/Text/Voice, plus the seasonal Spear. Audio authoring and phone enrollment are implemented. External phone delivery needs the documented Twilio setup and explicit enablement; Gmail configuration alone does not enable calls.
