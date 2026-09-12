# Present Fantasy Phishing from fresh setup

The app has three main pages: **Home, Bait, League**. A fresh installation has no accounts, leagues or drafts.

## Local interface rehearsal

```sh
EMAIL_DELIVERY_MODE=simulated PHONE_DELIVERY_MODE=simulated EMAIL_DEMO_LOCAL_ONLY=false API_ORIGIN=http://localhost:3001 APP_ORIGIN=http://localhost:8081 EXPO_PUBLIC_API_ORIGIN=http://localhost:3001 DEMO_DATA_FILE=./data/demo.json npm run dev
```

Open [desktop](http://localhost:8081) or [Large/Compact phone preview](http://localhost:3001/mobile-preview). Delivery is simulated in this mode.

1. Choose **Create account** and enter a name, email and password. Set email hours, topics to avoid and family-friendly preferences.
2. Create a league, try its difficulty/settings, and copy its invite code.
3. In a separate browser profile, create another account and join with the code. Both players start Week 1 with zero scores and no bait.
4. Open **Bait**, choose Email, Text or Voice for the slot, describe your opponent and the angle you want, then generate one message. Edit it or ask for a revision. Move back and forward to check that your edits stay intact. With immediate delivery, choose **Send email now**. Scheduled mode instead saves the cast before **Start fishing**.
5. Review outgoing status in Bait and the matchup in League. Local delivery stays labeled simulated; there is no inbox page or three-choice message picker.

To repeat from account creation, use **Settings → Reset demo**, review the scope and confirm. This clears every local account and league. **Cancel** keeps progress. Alternatively stop the server and run `npm run reset:demo` before restarting.

## Real-inbox presentation on this computer

Complete [EMAIL_DEMO_SETUP.md](EMAIL_DEMO_SETUP.md), stop the development server, then run:

```sh
npm run email:demo
```

The launcher checks SMTP without sending, builds, and opens the app/API at [localhost:3001](http://localhost:3001), with separate real-email storage. Use [the phone preview](http://localhost:3001/mobile-preview) for the presentation layouts. It stays bound to this computer; emailed links must be opened here. Public HTTPS hosting is optional for testing on other devices.

Have two consenting participants verify their email addresses with signup codes, choose player preferences, and create/join a league. A blank `EMAIL_DEMO_RECIPIENTS` list uses verified signup addresses; a populated list restricts participants.

Show signup → league → one editable bait email → actual inbox → authenticated response → score. The sender and message clearly identify the game. Merely opening or scanning the link never scores.

The labeled immediate-email mode skips contact-hour and daily pacing delays, so both casts can be tested in one sitting. Actual phone sends retain their own documented readiness and contact limits. The organizer verified as `SMTP_USER` can use **Settings → Reset active leagues** between rehearsals. This archives leagues and preserves accounts, transport history and quotas; it cannot retract mail or replenish sending limits.

Weekly untouched-email points require genuine receipt evidence. Gmail acceptance alone is insufficient, and the provider adapter upstream of the signed receipt relay remains separate work. Use the automated tests to explain duplicate protection, bounces and late settlement, identifying them as tests. See [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) and [PHONE_DEMO_OPTIONS.md](PHONE_DEMO_OPTIONS.md).

## Voice and text

Follow [VOICE_SETUP.md](VOICE_SETUP.md). Each weekly slot can use Email, Text or Voice. With an ElevenLabs key and stock voice, generate and edit a voice script, create its audio, play it, then approve that revision. Editing requires fresh audio. The browser audio milestone needs no Twilio account. Real calls and custom texts require phone verification, provider eligibility and public HTTPS; missing setup is shown without pretending a call was sent.
