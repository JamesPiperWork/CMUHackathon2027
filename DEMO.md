# Presenting Fantasy Phishing

Use the app’s synthetic season to show a functioning league: matches, personalized bait, league conversation, and a Weekly Wrapped episode. The practice accounts and prepared match history are fictional; email, text, and voice delivery stay in the app unless live integrations are separately configured.

## Prepare

```sh
npm ci
npm run seed
npm run dev
```

Open the [desktop app](http://localhost:8081) and [interactive phone preview](http://localhost:3001/mobile-preview). Use two fresh browser tabs for independent sessions. Sign in as Alex on one and Jordan on the other; **Choose another player** reveals six more playable accounts.

If Alex or Jordan is new, complete each account’s contact preferences and adult enrollment. Interests are not part of target enrollment: the sender supplies them in Bait. The phone frame is the same interactive web app, not an iOS simulator.

Before presenting, check:

- My leagues shows The Usual Suspects; League → Matches has the current week and completed synthetic history.
- A completed Week 3 matchup opens **Watch Wrapped** with actual stored challenge text and prepared chat interactions.
- Alex’s Bait contains the private notes about Jordan. Any configured Gemini result is labeled accurately; prepared content works without credentials.
- For a downloadable video, use a desktop browser that enables **Download video**, then allow the full render to finish. Playback alone also works on mobile layouts.

If you have old local data, `npm run seed` preserves it. To return to the supplied season, stop the server, run `npm run reset:demo`, then restart. A reset discards local league changes and match progress.

## A product-led walkthrough

| Time | Action |
| --- | --- |
| 0:00–0:30 | Show the home scoreboard, record, and league rank. Open Matchups and switch between current and previous weeks. Explain that this is a weekly head-to-head season. |
| 0:30–1:10 | Open Bait. Choose a topic for Jordan and add private notes if helpful. Save, generate a challenge, inspect the copy and cue, then save the bait. The target controls contact preferences but cannot inspect or choose the sender’s private notes. |
| 1:10–1:40 | Switch to Jordan’s phone-sized view. Show the same league, different player, and saved bait. Open an available incoming challenge, compare it with match context, and submit a decision. If the matchup has not started, show bait preparation instead. |
| 1:40–2:10 | Open League chat and post a short league message from one account. Show it appearing in the other session. Open League to see the leaderboard, then expand League settings for invitations and rules. |
| 2:10–3:00 | Open a completed matchup’s **Watch Wrapped**. Play the episode, jump to an attack or conversation, then replay it. Identify synthetic history as prepared league data. On a supported browser, show the video-download action. |
| Optional | Create a small new league as Alex, copy its invite code, and join as Jordan. Its first matchup, chat, and standings are separate from The Usual Suspects. |

The new-league flow is useful for demonstrating persistence: reload either account and return to the selected league. To show a later week, finalize all that league’s current matchups and use **Start week …** from the organizer’s League settings.

## Playing a new match

1. Both players accept their contact preferences.
2. Each player creates and saves a message for each enabled channel. Missing slots can be filled by platform scenarios; these do not earn a human author bonus.
3. Start the matchup. Local simulated challenges release on the app’s schedule; delivery status stays visible in Inbox. Voice uses a call interface and transcript when generated audio is unavailable.
4. Each player makes six Trust/Flag decisions. Correct decisions earn +3, incorrect decisions −3, and a successful human-authored phish earns its author +2.
5. The completed match updates standings once and unlocks a new Wrapped using that match’s saved events. Post match-related league chat to give the recap a personal interaction to include.

The default competition lasts one week (`MATCH_DURATION_MINUTES=10080`), but a match can finish as soon as all required decisions are submitted.

## Optional accelerated rehearsal

The walkthrough can use completed synthetic history without altering time or scores. For a strict live-match presentation, the local-only operator endpoints and `npm run demo:finish` remain available as explicit presentation tools.

The shortcut explicitly selects the original Alex/Jordan matchup in The Usual Suspects. Enroll both, prepare the bait, and start that matchup before running:

```sh
npm run demo:finish
```

It releases simulated challenges and submits disclosed scripted responses through normal authenticated APIs. It preserves prior decisions, never writes scores directly, only supports loopback demo mode, and does not call real providers. A fresh all-authored run with six correct Alex decisions and one missed Jordan phish produces Alex **20** to Jordan **12**; earlier decisions or platform-filled slots can change the result. Open Weekly Wrapped afterward.

For a shorter deadline during a separate local rehearsal, set `MATCH_DURATION_MINUTES=30` in the root `.env` before starting a new match. Do not present accelerated timing as a week-long run.

## Recovery

- **API restart:** keep `data/demo.json`; saved leagues, reports, chat, and decisions survive. Clients reconnect and refresh.
- **No Gemini credentials:** use the labeled prepared-content path. Invalid generation or edits surface a fallback or validation error.
- **No audio credentials:** use the visible call transcript; do not describe it as an ElevenLabs recording.
- **Video export unavailable:** play the in-app episode, or use a desktop browser supporting WebM canvas recording. Export does not require an AI video service.
- **Reset required:** stop the server, run `npm run reset:demo`, restart, and reenroll Alex/Jordan as needed. Do not run the CLI writer alongside the JSON-backed API.
- **Live-provider configuration missing:** continue with the simulation. Live scenarios are never silently relabeled as successful simulated delivery.

For installation, native iOS setup, current scope, and check commands, see [README.md](README.md). For real delivery prerequisites, see [INTEGRATIONS.md](INTEGRATIONS.md).
