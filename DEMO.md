# A 2:55 Fantasy Phishing demo

This is a live multiplayer demonstration with **simulated delivery**, prepared fictional content, and server-scored responses. The voice moment uses the clearly labeled call simulator and its transcript. No real audio or carrier delivery is claimed.

## Before the timer

1. Run `npm ci`, `npm run seed`, `npm run dev` from the repository root.
2. Open `http://localhost:8081` in two independent browser profiles/devices. Sign in as fictional Alex on one and Jordan on the other. Each personally completes demo enrollment: enable email, SMS, and voice; explicitly confirm timezone; accept the adult invitation. Keep the default three interests and read the activity card.
3. On a third tab choose **Presentation tools · enter as demo operator**. This session exposes **Demo console**. It is local presentation tooling, not an ordinary organizer privilege.
4. Prepare and lock Jordan's three drafts and Alex's email/SMS. Use The delivery detour for email, The ticket drop for SMS, and The guest-list shuffle for voice. Leave Alex's voice draft uncreated for the on-stage generation moment.
5. Keep the API terminal accessible. For the strict time limit, have `npm run demo:finish` ready in a second terminal. It prints each scripted fictional response and uses the same authenticated decision endpoints. Disclose that these remaining responses are prepared presentation actions.

For two physical devices, configure the LAN origins as described in README. A phone needs the computer's LAN IP, not localhost. Ensure both show live updates, and disable unrelated personal notifications before presenting yourself.

## On stage

| Time | Action and narration |
| --- | --- |
| 0:00–0:20 | Show Alex's matchup. “A private group opts in to surprise simulations, but doesn't know the message or timing. You decide which channels can contact you, and can pause.” |
| 0:20–0:45 | Alex opens Draft, selects Voice → Outdoor adventures → The guest-list shuffle, generates, previews the teaching cue, and locks. Point to **Curated fixture**: “Prepared content keeps today's demo reliable; Gemini can personalize it when configured.” Start match after all drafts are locked. |
| 0:45–1:20 | Operator chooses **Release all simulated challenges**. Switch to Jordan's separate device. Open voice challenge 4 (the unexpected guest-list change with the fixed seed and setup above), then **Answer call**. Point to **Simulated delivery** and **Transcript · audio not available**. Read the short script aloud without claiming generated audio. |
| 1:20–1:50 | Jordan chooses **1 · Trust**, then **Submit decision**. Show −3 for Jordan and Alex's +2 author bonus on the other device. Reveal: the requested walk reminder became a surprise guest-list change with a ten-minute deadline. “A familiar name doesn't make an unexpected demand trustworthy.” |
| 1:50–2:20 | Show the email and SMS simulator presentations. Inspect the application-owned response destination. Compare the expected Mooncrate order and Juniper ticket confirmation against the activity card. No link preview changes the score. |
| 2:20–2:45 | Say “The remaining fictional responses are prepared for the recap,” then run `npm run demo:finish`. It preserves prior decisions, submits the remaining demo choices, and finalizes through the normal scoring service. Open **The league** on both devices. |
| 2:45–2:55 | Show Alex 20, Jordan 12, one successful authored phish, and Jordan's practical tip. “Friendly rivalry brings people back; every reveal gives them one useful cue.” |

The full game is also playable manually: complete each of the six responses on both devices. The shortcut never edits scores, calls providers, accesses private answers, or operates against live mode. It recognizes only the approved visible urgency cue; use the curated fixtures for the timed script.

## Expected facts

For the prescribed run, Alex answers six correctly; Jordan trusts exactly one human-authored phish and answers five correctly:

- Alex: 18 defense points +2 author points = **20**.
- Jordan: 15 defense points −3 = **12**.
- Alex wins and receives three league points (12 →15). Jordan remains on 10.
- Alex's recap: 3 detected phish, 3 correctly trusted expected messages, 1 author success.
- Jordan's recap: 2 detected phish, 3 correctly trusted expected messages, 1 took-bait decision, 0 false alarms.
- Sam leads on 18 historical league points. Alex moves from rank3 to rank2 under the documented alphabetical tie-break with Riley on15; Jordan stays rank4.

Prepared historical rows are visibly labeled. They are not results generated during the presentation. Different earlier decisions change the computed result; the shortcut deliberately preserves them. Platform-filled phishing drafts award no human author bonus, so create Alex's showcase draft if you want 20–12.

## Reset and fallback

- While running, operator → **Reset fictional match** → explicit confirmation. Both player sessions remain signed in but must personally enroll again. This resets only the named fictional demo and is unavailable in live mode.
- From a stopped server: `npm run reset:demo`, then `npm run dev`. Do not run the CLI writer concurrently with the JSON-backed server.
- No Gemini key: reviewed fixtures are the intended deterministic path. Timeout, refusal, malformed content, or invalid edits produce an explicit fallback or validation error.
- No audio credentials: use the call transcript. Do not play silence or describe it as ElevenLabs output.
- API restart: keep `data/demo.json`; saved decisions and standings survive. Clients reconnect and refresh. Reload the tab if an Expo source hot reload changes its route during development.
- Expired match: reset and repeat; do not change persisted scores. Operator clock advancement demonstrates forfeit/no-contest rules and never triggers real contact.
- Real provider blocked: show readiness briefly and return to the **explicit** simulator demonstration. A live scenario is never silently converted into a simulated one.

## Verified rehearsal

The implementation was exercised with separate Alex/Jordan sessions, all three drafted channels, twelve simulated deliveries, explicit trust/flag submissions, recipient reveals, synchronized author bonus, and recap. A 390px layout was inspected. See README for check commands and INTEGRATIONS for unrun native/provider checks.
