# Integration status and operator setup

The default app uses **simulated delivery** and starts with zero accounts. Players register with name, email and password; passwords are salted and hashed. This local identity does not verify ownership for real email. [EMAIL_DEMO_SETUP.md](EMAIL_DEMO_SETUP.md) covers the separate, clearly labeled Gmail demo with email-code signup and separate storage.

`npm run email:demo` loads the private root `.env`, checks SMTP without sending, builds the web app, then serves it and the API on `http://127.0.0.1:3001`. The launcher enables `smtp-demo` with `EMAIL_DEMO_LOCAL_ONLY=true` and `data/email-demo.json`. Response links work only on this computer. Public HTTPS is an optional next step for other devices; full live mode below still requires it.

The private email demo uses a truthful Fantasy Phishing sender and game labeling. `EMAIL_DEMO_RECIPIENTS` is optional: blank permits participant signup, while a populated list restricts signup and delivery. Email ownership, player consent, league membership, contact windows and quotas remain required. Sign-in codes expire, are stored only as keyed hashes, are browser-bound and single-use, and have attempt/send limits.

Credentials stay in uncommitted local configuration. Verification uses provider mocks with real keys unset; keep those keys unset when running the automated suite. A **ready** status means configured prerequisites passed; SMTP acceptance or a no-send connection check does not establish inbox delivery. The [signed email receipt relay](docs/EMAIL_RECEIPTS.md) needs a genuine upstream evidence source for automatic untouched-email settlement.

## Implementation and verification

| Integration | Current implementation | Verification boundary |
|---|---|---|
| Local accounts + file repository | Name/email/password signup, hashed passwords, persistent state, no sample accounts by default | Local auth, setup, privacy and persistence tests |
| Private email-code accounts | Verified signup, expiring codes, rate limits, authenticated response sessions | Mock code submission and replay/concurrency tests |
| Gemini email drafting | One context → one editable email; revision includes the current draft; bounded structured output and fallback | Mock contracts/refusals/errors; real model output requires rehearsal |
| SMTP gameplay email | Authenticated TLS submission, clearly labeled private-demo format, accepted/failed/unknown outcomes | Mock submission and receipt tests; connection check sends nothing |
| Twilio SMS | Sender integration, signed status callbacks and STOP handling | Mock submission/webhook tests; real sender setup remains separate |
| ElevenLabs + Twilio voice | Cached approved audio, scoped media, DTMF and signed callbacks | Mock audio/carrier tests; no native or real-call guarantee |
| Auth0 web/native/external response | JWT validation, account binding, SDK login, external code+PKCE flow | Type/build and negative transaction tests; actual tenant login separate |
| MongoDB | Transactional repository requiring a replica set | Real replica-set behavior needs its own environment |

## Reset behavior

**Settings → Reset demo** in simulated mode clears all accounts, leagues, sessions and progress after confirmation. It returns to account creation. The CLI equivalent requires the JSON-backed server to be stopped.

**Settings → Reset active leagues** is available in `smtp-demo` only to the account whose verified email matches `SMTP_USER`. It archives leagues, cancels unfinished work and preserves accounts, authentication, transport history and consumed quotas. Submitted mail cannot be recalled; ambiguous in-flight sends remain recorded for reconciliation. Reset does not grant extra daily sends or erase delivery evidence.

## Full live-mode adapters

The configuration below is for `APP_MODE=live` and the original surprise-format adapters. The labeled private email demo has its own `EMAIL_DEMO_SEND_ENABLED` switch and keeps `LIVE_SEND_AUTHORIZED` and `ENABLE_LIVE_*` false. Operator clock controls are limited to simulated delivery.

To stage live operation, configure a public HTTPS `API_ORIGIN` (Fastify response pages and callbacks) and `APP_ORIGIN` (Expo web), a transactional MongoDB replica set, Auth0, and independent random `SESSION_SECRET` / `TOKEN_SECRET` values of at least 32 characters. The live server does not create a replica set, tenant, sender, or hosting service. A verified Auth0 identity can now create its player account and then create or join a private league; arbitrary user-ID binding is still rejected. The readiness table checks supplied configuration; successful startup and provider-specific checks are still needed.

Each channel requires all of the following recorded conditions:

- `LIVE_SEND_AUTHORIZED=true` and `ENABLE_LIVE_EMAIL`, `ENABLE_LIVE_SMS`, or `ENABLE_LIVE_VOICE=true`, only after the operator is authorized to contact those participants.
- `EMAIL_PERMISSION_REFERENCE`, `SMS_PERMISSION_REFERENCE`, or `VOICE_PERMISSION_REFERENCE`: a reference to actual provider permission for these exact surprise simulation templates, including fictional sender presentation. This is operator-entered evidence, not verification by the app.
- The matching `*_REGISTRATION_REFERENCE`: required account, sender, and carrier registrations for the US destination and sender type; include trial-recipient restrictions where relevant.
- The matching `*_FORMAT_SUPPORTED=true`: an operator assertion that provider-required identification and disclosures are compatible. Put required copy in `EMAIL_DISCLOSURE_TEXT`, `SMS_DISCLOSURE_TEXT`, or `VOICE_DISCLOSURE_TEXT`. An unsupported format stays blocked; do not remove required copy to retain the surprise.
- An accepted adult league member, personally granted versioned channel consent, no pause/withdrawal, a verified owned contact, a recipient-selected valid timezone and contact window, and available quota.

Default live quota is one challenge per recipient/channel/local day. Accepted, delivered, unknown, and unanswered attempts consume it. The live scheduler places regular casts and the optional Spear on separate eligible recipient-local contact days. Activation rejects a deadline that would expire before the scheduled opportunities plus a one-hour response margin; use `MATCH_DURATION_MINUTES=4320` for a three-day live trial, subject to the selected windows. The short presentation uses explicit simulated timing. Windows default to 10:00–20:00. Generation of audio can take time, so live voice rechecks current eligibility after preparing audio and immediately before submitting the call.

The server resolves contacts from membership records, never a destination in a challenge-creation request. Verified Auth0 signup creates a new account without any league access. The player personally completes setup before creating or joining by private invite code. A phone contact must use `method: "operator"` with independent ownership-verification evidence and `verifiedAt`, or an implemented supported verification process with `method: "verify"`. **There is no Twilio Verify onboarding flow in this demo.** Demo UI selections cannot establish live ownership. A matching Auth0 verified email establishes email ownership on sign-in; unmatched addresses remain unverified.

## Auth0: three clients, one API identity

Follow the official [Expo setup](https://auth0.com/docs/quickstart/native/react-native-expo), [SPA SDK documentation](https://auth0.com/docs/libraries/auth0-single-page-app-sdk), and [authorization code with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce). The native SDK needs an Expo development build; Expo Go cannot run the native Auth0 module.

Configure an Auth0 API with RS256 and set `AUTH0_DOMAIN` to the bare tenant hostname and `AUTH0_AUDIENCE` to its identifier. The backend validates these claims with the tenant JWKS, then binds `sub` to the account and verifies its email before new-account enrollment. Email ownership requires a matching verified email from Auth0 userinfo.

For the native application, set `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, and `EXPO_PUBLIC_AUTH0_AUDIENCE`. The Expo plugin uses `fantasyphishing` and `com.fantasyphishing.demo`. Add these exact allowed callback and logout URLs, replacing `TENANT`:

```text
fantasyphishing://TENANT/ios/com.fantasyphishing.demo/callback
fantasyphishing://TENANT/android/com.fantasyphishing.demo/callback
```

For the SPA application, set `EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID`; configure the Expo web origin as its allowed callback, web origin, and logout URL. Browser sign-in uses a popup and tokens cached in memory. Both platform files implement `loginLive()` and `logoutLive()`; native saves credentials through the SDK credential manager. Only public client identifiers belong in `EXPO_PUBLIC_*` variables.

For the external-browser response page, configure a separate **Regular Web Application** with `AUTH0_CLIENT_ID` and backend-only `AUTH0_CLIENT_SECRET`. Its callback is `API_ORIGIN/auth/callback`. An unauthenticated `GET /r/:token` can lead to `/auth/login?challenge=:token`. Login accepts only an opaque existing unexpired challenge token, never a redirect URL. It stores an encrypted 10-minute transaction cookie containing state/PKCE/nonce and the challenge. Callback verifies state, code, nonce, JWT identity, and private membership; then issues an HttpOnly Secure SameSite=Lax session and returns to that exact response page. Pending login transactions expire on server restart; reopen the original challenge if interrupted.

The response page GET is inspection only. A scored response requires the assigned authenticated recipient's POST and session CSRF token. A signed phone keypad callback is bound to the verified destination and assigned CallSid; it does **not** establish biometric identity.

## Gemini

New email casts follow main’s **sender context → one editable email** flow. The sender supplies their own target context and angle; there is no three-option message picker. The generator returns strict `{subject, body}` JSON, and the app exposes editable Subject/Message fields. A requested revision includes the current email and the requested change, so manual edits are not discarded merely to regenerate.

The backend default for new email casts is `gemini-3.6-flash`; override it with `GEMINI_MODEL` and keep `GEMINI_API_KEY` backend-only. This is the configured model identifier, not a claim that a real request has been verified. The adapter uses the [generateContent REST contract](https://ai.google.dev/api/generate-content) and [structured output](https://ai.google.dev/gemini-api/docs/structured-output), plus local semantic checks.

A new-email request has a 1,000-token cap and an 8-second shared deadline. One retry is allowed for malformed JSON/shape/marker output. The server owns sender identity, approved story facts, teaching explanations and the response URL; generated external destinations are rejected. Input context and revision instructions are treated as untrusted data. Private sender notes never become recipient metadata.

Without a key, initial generation offers a visibly labeled prepared draft. On an unavailable or rejected revision, the current email is retained for direct editing. Difficulty controls generation-attempt budgets. The separate legacy multi-channel adapter remains for saved old matches; its contract should not be confused with the new email editor.

## Generic SMTP gameplay email

Supply `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (true for implicit TLS), `SMTP_USER`, `SMTP_PASS`, and a plain operator-owned `SMTP_FROM` address. TLS is required. The private demo uses the truthful Fantasy Phishing display name and explicit game labeling. Full live-mode use of fictional display names requires provider support for that format. Authenticated sender/domain setup remains the operator's responsibility.

The adapter sends plain text from the saved, validated draft with the server's `/r/:token` link. New matches contain only sender-authored phishing casts; no ordinary gameplay filler is sent. Email sign-in codes are separate account-verification messages. It disables template URL/file access. SMTP acceptance is recorded as `accepted`, not delivered-to-inbox. Definitive rejection is `failed`; ambiguous errors/timeouts are `unknown`. There are no provider-native SMTP callbacks or automatic resends. The signed relay endpoint can ingest genuinely reconciled delivery/bounce evidence; its required external adapter is documented in `docs/EMAIL_RECEIPTS.md`. Consequently an accepted email with no authenticated recipient action remains unresolved at settlement; unclicked-email points require delivery evidence or an authenticated flag. A provider receipt integration is needed for unattended live weekly settlement. Operator reconciliation is needed for unknown outcomes.

No Resend or Mailtrap gameplay adapter is assumed permissible. [Resend's acceptable-use policy](https://resend.com/legal/acceptable-use) prohibits phishing; [Mailtrap's policy](https://mailtrap.io/acceptable-use-policy/) prohibits misleading information in headers/body. Those policies are not authorization for this product. Resend ordinary account/invitation notifications were not added because the first-match demo does not need them.

## Twilio SMS and voice

Supply `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, owned US `TWILIO_SMS_FROM` / `TWILIO_VOICE_FROM`, and `TWILIO_CALLBACK_BASE` as the exact public HTTPS API origin (no path). Configure these routes in Twilio where indicated:

| Route | Method | Setup and purpose |
|---|---|---|
| `/webhooks/twilio/status` | POST | Set automatically on outgoing SMS/calls; records transport evidence |
| `/webhooks/twilio/sms` | POST | Set as the sender's incoming messaging webhook; STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT/REVOKE/OPTOUT and Twilio `OptOutType=STOP` pause future contact |
| `/webhooks/twilio/voice-decision` | POST | Referenced by generated Gather TwiML; digits 1=trust, 2=flag, 9=pause |
| `/media/voice/:token` | GET | Scoped audio fetch, tied to an attempt/recipient/scenario, expires after 10 minutes |

Webhook signatures use the exact externally visible callback URL, all parsed form fields, and the Twilio auth token, following [Twilio request validation](https://www.twilio.com/docs/usage/security). Reverse proxies must preserve the request path/query and must not log raw response/media tokens. AccountSid, CallSid/MessageSid, and assigned destination are checked. Status callback hashes are persisted and deduplicated; terminal statuses cannot move backwards. Status does not score. STOP and keypad 9 are honored even after a match ends; empty input/unanswered calls earn nothing. The app neither records nor transcribes recipients.

The call uses [Play](https://www.twilio.com/docs/voice/twiml/play) followed by [Gather](https://www.twilio.com/docs/voice/twiml/gather) with DTMF input only. It plays required operator-supplied disclosure, the approved audio, then the game response instructions. Calls are submitted once with automatic SDK retries disabled. On an ambiguous submission outcome, the job is left unknown for reconciliation; the app does not redial. Known CallSid status events can reconcile uncertain transport. An outcome with no recoverable provider ID requires checking the provider console and an operator resolution workflow; this handoff has no live reconciliation console.

US application-originated messaging on 10DLC numbers requires [A2P registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc), including individual/hobby projects. Other number types have their own requirements. [Trial restrictions](https://www.twilio.com/docs/usage/trials) include verified recipients and product limits. The [Twilio AUP](https://www.twilio.com/en-us/legal/aup) restricts deceptive activity and false origin; opt-in alone is not permission from Twilio for this format. Seek a written determination for the proposed exact templates. If identification requirements invalidate the intended surprise format, keep the channel blocked.

## ElevenLabs audio

The current email game does not expose voice challenges. [VOICE_PLAN.md](VOICE_PLAN.md) describes the proposed sender-context → script → generated audio → phone-call integration, including what can realistically be demonstrated today. The adapters below are existing backend foundations, not a completed phone feature.

Supply `ELEVENLABS_API_KEY`, a licensed fictional stock `ELEVENLABS_VOICE_ID`, `ELEVENLABS_PERMISSION_REFERENCE`, and `ELEVENLABS_STOCK_VOICE_CONFIRMED=true`. These are operator assertions. Never substitute a cloned real person's voice. Review the [ElevenLabs use policy](https://elevenlabs.io/use-policy), which restricts harmful deception, unauthorized robocalling, and unauthorized impersonation.

The [text-to-speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) is called only for an approved script, with `eleven_multilingual_v2` and `pcm_16000`. The adapter measures PCM byte duration, rejects output shorter than 15 or longer than 25 seconds, wraps it as a WAV, and atomically caches it under a script/model/voice hash in `AUDIO_CACHE_DIR` (default `data/audio`). A failed audio request or invalid duration blocks the call; it never substitutes silence or a different voice. Cache files need private persistent storage on the API host; expired URLs cannot fetch them. Do not expose this directory as public static content.

The simulator displays an honest script fallback if audio is absent. This handoff contains no generated ElevenLabs recording. The audio test creates synthetic PCM solely inside temporary test storage, never as a product audio asset.

## Local contract verification

From the repository root:

```sh
npm test
npm run typecheck
```

The provider suite in `apps/api/test/providers.test.ts` uses mocks and in-process Fastify requests; it needs no provider keys or paid services. Run the current suite for results. Its coverage includes generation validation/fallback/timeout, missing readiness and demo-verification rejection, SMTP outcomes, fixed Twilio request fields, invalid signatures, callback dedupe/order, assigned recipient checks, no-input behavior, post-match opt-out, encrypted login state, expiring audio scope, measured duration, cached audio, and pausing during audio preparation before carrier submission. Native builds, actual Auth0 login, Mongo replica-set behavior, carrier or SMTP delivery, real Gemini output, ElevenLabs synthesis and external callback reachability require separate environment rehearsals. Mock-test success does not verify those providers.
