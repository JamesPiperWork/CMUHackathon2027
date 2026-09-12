# Presenting Fantasy Phishing

Use two fresh browser tabs with the desktop app and the Large/Compact phone preview. All sample accounts are synthetic. The simulator sends no real email.

## Start

```sh
npm ci
npm run seed
npm run dev
```

Open [desktop](http://localhost:8081) and [phone preview](http://localhost:3001/mobile-preview). Sign in as Alex and Jordan separately and accept email participation on both. Existing state is preserved by `seed`; an old active/completed match keeps its original rules. For a clean rehearsal, stop the server, run `npm run reset:demo`, and restart. Reset discards local synthetic league progress.

## Three-minute walkthrough

| Time | Action |
| --- | --- |
| 0:00–0:25 | Show Alex vs Jordan on Home. Explain two email casts per week and an optional seasonal Spear. |
| 0:25–0:55 | Alex opens Bait → Cast 1, chooses an interest and optional private note, creates and reviews the email, then locks it. Without a Gemini key, its details identify prepared content. |
| 0:55–1:15 | Start fishing. Alex can still prepare Cast 2 during the week. There are no automatically generated ordinary emails or missing-slot fillers. |
| 1:15–1:40 | Release the simulated email in Demo tools, then Jordan opens Inbox and confirms Open link. Jordan loses 1; Alex gains 3. A reveal explains the cast. |
| 1:40–2:10 | Show the Spear option and handwritten editor. Locking it uses one extra email for this league season. Release another cast, and let Jordan leave it untouched. |
| 2:10–2:40 | Demo tools → Finish demo week advances simulated time to the deadline. Jordan earns +1 for each received cast left unclicked. Show final standings and Weekly Wrapped with saved email text. |
| 2:40–3:00 | Explain real delivery: SMTP and verified participant identity are implemented behind configuration gates; this rehearsal used the simulator. |

A normal week lasts 10080 minutes. The operator shortcut exists only in demo mode. The operator view can be accessed through the original local demo session endpoint or a practice account using `/operator`; its sign-in action obtains the scoped operator session. It cannot be used in live mode.

## Optional finish shortcut

After enrolling both players, preparing at least one Alex cast, and starting the original seeded Week 4 match:

```sh
npm run demo:finish
```

This local-only script signs in as fictional players through the normal API, releases queued casts, makes Jordan open one cast, and leaves other new-rule emails untouched. It then explicitly advances demo time to the weekly deadline and prints the saved result. It does not inspect hidden truth, fabricate points, or send real mail.

With exactly two Alex-to-Jordan casts and no Jordan casts, the expected final score is **Alex 3, Jordan 0**: Jordan takes one (−1) and avoids the other (+1). Additional casts change totals according to their saved decisions. A Spear uses exactly the same scoring.

## Reliable fallback

- No Gemini credentials: generate still returns a labeled, personalized prepared message.
- No SMTP configuration: use the explicitly labeled simulator, never claim real inbox delivery.
- Weekly Wrapped can replay and seek immediately; supported browsers can export a WebM through Save video.
- Raw email links and previews never score. A signed-in participant must confirm the bait action. This avoids counting email scanners as players.
- Incomplete live delivery cannot silently award avoidance points. SMTP acceptance alone requires later delivery evidence or participant action; see [INTEGRATIONS.md](INTEGRATIONS.md).
