# Voice and phone demo setup

The app now lets each regular cast use Email, Text or Voice, sharing the same two weekly slots and seasonal Spear. Voice has an editable script and a separate **Create audio → Play → Use this audio** step. Real calls require additional Twilio setup. A browser audio preview works without a Twilio account or public hosting.

## Get ElevenLabs audio working first

1. In ElevenLabs, open **Developers → API Keys** and create a key with text-to-speech access and an appropriate usage limit. Copy the secret value into the existing local `.env` as `ELEVENLABS_API_KEY`. Keep it on the API server; it must never be an `EXPO_PUBLIC_` variable. [Official key guidance](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys), [API quickstart](https://elevenlabs.io/docs/eleven-api/quickstart).
2. Select a stock voice available to that account and copy its voice ID into `ELEVENLABS_VOICE_ID`. Set `ELEVENLABS_STOCK_VOICE_CONFIRMED=true` after choosing a stock voice. The server selects the voice; players cannot request a cloned or arbitrary voice. The speech endpoint takes a voice ID and returns audio for the supplied text. [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
3. Restart the API to load the changed environment. Keep the existing Gmail settings. For this configured checkout, run `npm run dev` and open [the mobile preview](http://localhost:3001/mobile-preview).
4. The recipient enables Voice in their player settings, and the league enables Voice. In Bait, select Voice, enter the sender's idea, generate a script and edit it as needed. Click **Create audio**, play the recording, then **Use this audio**. This synthesizes real audio only after the button is pressed. Missing configuration produces setup details; there is no substitute or fabricated preview.

Only these settings are needed for audio preview:

```dotenv
ELEVENLABS_API_KEY=your-secret-key
ELEVENLABS_VOICE_ID=your-stock-voice-id
ELEVENLABS_STOCK_VOICE_CONFIRMED=true
AUDIO_CACHE_DIR=data/audio
```

See [.env.voice.example](.env.voice.example) for all optional settings. Do not paste its placeholders over a working `.env`.

If Create audio reports **“This voice requires a paid ElevenLabs plan,”** choose an included built-in voice and update `ELEVENLABS_VOICE_ID`, or upgrade the account before retrying. A library voice can return `402 payment_required` even with a valid API key. Voice availability in the website does not establish access through that account's API plan. A key restricted to text-to-speech is sufficient when you supply the voice ID yourself; this app does not require the additional Read Voices permission.

The server uses `eleven_multilingual_v2` and `pcm_16000`, validates 15–25 seconds of non-silent audio and stores a private WAV. A roughly 40–60 word script is a useful starting point; actual measured duration controls acceptance. If the recording is too short or long, edit the script and create audio again. The cache binds the exact script, voice, model and settings. Edits, regeneration or a medium change clear approval. Sending reads the reviewed cache and never calls ElevenLabs again.

The configured built-in George voice successfully generated a 16-second recording on 2026-09-12. The earlier Voice Library selection required a paid plan. Your key remains in the ignored `.env`; no Twilio account was needed for this audio check.

## Add Twilio when ready for phones

1. Create a Twilio account and complete its Console onboarding. For a trial, add each consenting test phone as a verified recipient **in Twilio Console**. App verification does not add a phone to Twilio's trial list. Twilio Verify's trial also requires verified recipients. [Verify quickstarts](https://www.twilio.com/docs/verify/quickstarts), [trial restrictions](https://help.twilio.com/articles/360036052753-Twilio-Free-Trial-Limitations).
2. Create a **Verify service** with SMS verification enabled and a recognizable Fantasy Phishing friendly name. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` in `.env`. The service SID begins with `VA`. Verification codes go through Twilio Verify, and an approved check establishes ownership of that participant's phone. [Start verification](https://www.twilio.com/docs/verify/api/verification), [check verification](https://www.twilio.com/docs/verify/api/verification-check).
3. Keep `APP_MODE=demo` and `EMAIL_DELIVERY_MODE=smtp-demo`; set `PHONE_DELIVERY_MODE=twilio-demo`, `PHONE_DEMO_SEND_ENABLED=true` and `PHONE_DEMO_VERIFY_ENABLED=true`. A participant signed into their verified email account can then request a code for their own US `+1...` number in Settings and submit it. Phone verification does not automatically enable Text or Voice; the participant chooses those separately.
4. For calls, configure the account's owned voice-capable sender as `TWILIO_VOICE_FROM`. Set `TWILIO_TRIAL_MODE=true` for a trial and list Console-verified destinations in `TWILIO_TRIAL_RECIPIENTS`, comma separated. Use `false` for an upgraded account. Set `ENABLE_PHONE_DEMO_VOICE=true` when ready. Trial capability varies: confirm the account allows custom `<Play>` and `<Gather>` calls, not only a guided preset request. [Voice trial setup](https://www.twilio.com/docs/usage/trials/try-out-voice).
5. Real phone transport requires public HTTPS for `API_ORIGIN`, `APP_ORIGIN`, `EXPO_PUBLIC_API_ORIGIN` and `TWILIO_CALLBACK_BASE`. For the single-server app, these should use the same stable public origin. Set `EMAIL_DEMO_LOCAL_ONLY=false` when switching to public HTTPS, then restart with `npm run dev`, which rebuilds using the saved origin. The `email:demo` shortcut forces local loopback URLs and is not the launcher for this public phone setup. See [EMAIL_DEMO_SETUP.md](EMAIL_DEMO_SETUP.md) for the existing hosting/tunnel flow. `localhost` can play audio on this computer, but Twilio cannot fetch local audio or deliver callbacks there.
6. Keep calls/texts inside the recipient's contact window. The current real-phone pilot retains one attempted contact per channel per recipient per day. Email's immediate-test flag does not bypass those phone limits. Sending checks the exact approved audio, verified recipient, channel opt-in, pause state, league settings, quota and deadline before submission.

For Text, also set `TWILIO_SMS_FROM`, complete the sender's applicable carrier registration and record its reference in `SMS_REGISTRATION_REFERENCE`, then enable `ENABLE_PHONE_DEMO_SMS=true`. US long-code application messaging uses A2P 10DLC; toll-free texting has a separate verification process. Using Verify for ownership codes does not approve unrelated game texts. This can prevent an account created today from sending bait SMS today. [Twilio registration overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc), [toll-free trial requirements](https://help.twilio.com/articles/11853148778523-Trial-Limits-and-US-Toll-Free-Number-Restrictions).

Twilio's incoming-message webhook for the SMS number must point to `https://YOUR-ORIGIN/webhooks/twilio/sms` using POST, so STOP can pause contact. Call status and keypad callback URLs are supplied by the server. All requests are checked against Twilio signatures, the account and the corresponding attempt. Calls identify the game, play the approved message and collect keypad input: 1 take the bait, 2 flag, 9 pause. They do not record or transcribe the participant. [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather).

Taking the bait gives the sender +3 and recipient −1. A flagged cast earns the recipient +1 when the week ends. Delivered, unclicked email or text can also earn end-of-week avoidance; voice requires an explicit flag. An unanswered call, voicemail or generic completed-call receipt earns no voice avoidance point.

## What remains outside this slice

- **Today without Twilio:** demonstrate a real generated script, real ElevenLabs browser playback, edit invalidation and the phone readiness checklist. Sending stays blocked; no fake ring or delivery receipt is shown.
- **Native phone playback:** use the web preview on this computer for the first demo; the API's audio endpoint requires the author session. A native audio package and authenticated playback integration are a follow-up.
- **Voicemail:** an ordinary outbound call may reach voicemail, but this adapter does not wait for the greeting to finish. Answering-machine detection is a later improvement, not guaranteed voicemail delivery or ringless voicemail. [Answering-machine detection](https://www.twilio.com/docs/voice/answering-machine-detection).
- **Live conversation:** this slice is prerecorded audio with keypad responses. An ElevenLabs conversational agent would need a separate consent, turn-limit, latency, opt-out and result-attribution design.

API references: `GET /api/voice/config`, `POST /api/drafts/:id/audio`, `GET /api/drafts/:id/audio`, private `GET /api/drafts/:id/audio/preview?revision=...`, `POST /api/drafts/:id/audio/approve {revision}`; phone setup uses `GET /api/phone`, `POST /api/phone/start {phoneNumber,consent:true}`, `POST /api/phone/verify {requestId,code}`, and `POST /api/phone/remove {}`. Every personal endpoint requires an authenticated account, with CSRF protection for browser mutations.
