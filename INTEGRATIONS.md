# Integration status and operator setup

The working default is **simulated delivery** with fictional players. No real recipient, account, sender, deployment, registration, approval, or provider secret was supplied. Nothing in this repository has contacted a real recipient. A channel marked **ready** means the configured prerequisites passed; it is neither independent confirmation of permission nor proof of delivery.

## Implemented / configured / verified matrix

| Integration | Implemented | Configured in this handoff | Verification performed |
|---|---|---|---|
| File repository + simulator | Durable events, approved payloads, common decisions/scoring | Yes, default local setup | Local application/domain and provider tests |
| Gemini | Structured REST generation, 8-second timeout, bounded output, validated fixture fallback | No key supplied; fixture mode is configured | Mock valid, malformed, refused, unavailable, unsafe, and fallback cases; no real model request |
| SMTP gameplay email | Generic authenticated SMTP, controlled text template, submission outcome handling | Disabled; no permitted provider/sender supplied | Mock acceptance, rejection, and ambiguous failure; no real email |
| Twilio SMS | Owned sender, status callback, signature validation, STOP handling | Disabled; no account/sender/registration/permission | Local signed webhook and mocked submission tests; no real SMS |
| ElevenLabs | Approved script to cached WAV; measured 15–25-second duration; licensed stock voice gate | Disabled; no key/voice/permission | Mock PCM conversion and cache tests; no real ElevenLabs recording |
| Twilio voice | Play approved audio, DTMF 1/2/9, scoped media, status callbacks | Disabled; no configured account/number/public callbacks | Mock call request, no-recording, signature, recipient, empty-input, pause and media-token tests; no real call |
| Auth0 API | RS256 JWT issuer/audience/expiry verification; membership binding by Auth0 subject | No tenant or application supplied | Typechecked; negative state/PKCE cookie tests; real login/JWKS untested |
| Auth0 Expo native | Platform SDK with secure credential manager, shared login/logout interface | No tenant/native app/development build supplied | Typechecked when project checks run; native compilation and login unrun |
| Auth0 Expo web | Auth0 SPA SDK popup + API audience, memory token cache | No SPA client supplied | Web compilation when project checks run; real login unrun |
| External-browser response login | Authorization code + PKCE, state, nonce, encrypted HttpOnly transaction cookie, secure session, preserved challenge | No regular web Auth0 application supplied | Transaction tamper/expiry tests; real code exchange unrun |
| MongoDB | Backend repository with transaction requirements | No MongoDB URI supplied | File-path behavior tested; real replica-set transactions unrun |

## Before enabling any real channel

Keep `APP_MODE=demo`, `LIVE_SEND_AUTHORIZED=false`, and all `ENABLE_LIVE_*` flags false for presentation. Operator time controls only affect this simulated mode. Never turn them on merely to see a green readiness row.

To stage live operation, configure a public HTTPS `API_ORIGIN` (Fastify response pages and callbacks) and `APP_ORIGIN` (Expo web), a transactional MongoDB replica set, Auth0, and independent random `SESSION_SECRET` / `TOKEN_SECRET` values of at least 32 characters. The live server does not create a replica set, tenant, sender, or hosting service. The readiness table checks supplied configuration; successful startup and provider-specific checks are still needed.

Each channel requires all of the following recorded conditions:

- `LIVE_SEND_AUTHORIZED=true` and `ENABLE_LIVE_EMAIL`, `ENABLE_LIVE_SMS`, or `ENABLE_LIVE_VOICE=true`, only after the operator is authorized to contact those participants.
- `EMAIL_PERMISSION_REFERENCE`, `SMS_PERMISSION_REFERENCE`, or `VOICE_PERMISSION_REFERENCE`: a reference to actual provider permission for these exact surprise simulation templates, including fictional sender presentation. This is operator-entered evidence, not verification by the app.
- The matching `*_REGISTRATION_REFERENCE`: required account, sender, and carrier registrations for the US destination and sender type; include trial-recipient restrictions where relevant.
- The matching `*_FORMAT_SUPPORTED=true`: an operator assertion that provider-required identification and disclosures are compatible. Put required copy in `EMAIL_DISCLOSURE_TEXT`, `SMS_DISCLOSURE_TEXT`, or `VOICE_DISCLOSURE_TEXT`. An unsupported format stays blocked; do not remove required copy to retain the surprise.
- An accepted adult league member, personally granted versioned channel consent, no pause/withdrawal, a verified owned contact, a recipient-selected valid timezone and contact window, and available quota.

Default live quota is one challenge per recipient/channel/local day. Accepted, delivered, unknown, and unanswered attempts consume it. The live scheduler places each recipient's two same-channel opportunities on separate local contact days. Activation rejects a deadline that would expire before the scheduled opportunities plus a one-hour response margin; use `MATCH_DURATION_MINUTES=4320` for a three-day live trial, subject to the selected windows. The short presentation uses explicit simulated timing. Windows default to 10:00–20:00. Generation of audio can take time, so live voice rechecks current eligibility after preparing audio and immediately before submitting the call.

The server resolves contacts from membership records, never a destination in a challenge-creation request. Live records need operator provisioning: there is intentionally no endpoint to bind an arbitrary requested user ID to Auth0. Provision the private league/profile/match records and each intended member's `auth0Sub` through a trusted administrative process before enrollment; this handoff includes no live invitation/provisioning console. A phone contact must use `method: "operator"` with independent ownership-verification evidence and `verifiedAt`, or an implemented supported verification process with `method: "verify"`. **There is no Twilio Verify onboarding flow in this demo.** Demo UI selections cannot establish live ownership. A matching Auth0 verified email establishes email ownership on sign-in; unmatched addresses remain unverified.

## Auth0: three clients, one API identity

Follow the official [Expo setup](https://auth0.com/docs/quickstart/native/react-native-expo), [SPA SDK documentation](https://auth0.com/docs/libraries/auth0-single-page-app-sdk), and [authorization code with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce). The native SDK needs an Expo development build; Expo Go cannot run the native Auth0 module.

Configure an Auth0 API with RS256 and set `AUTH0_DOMAIN` to the bare tenant hostname and `AUTH0_AUDIENCE` to its identifier. The backend validates these claims with the tenant JWKS, then matches `sub` to an existing private membership. Email ownership requires a matching verified email from Auth0 userinfo.

For the native application, set `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, and `EXPO_PUBLIC_AUTH0_AUDIENCE`. The Expo plugin uses `fantasyphishing` and `com.fantasyphishing.demo`. Add these exact allowed callback and logout URLs, replacing `TENANT`:

```text
fantasyphishing://TENANT/ios/com.fantasyphishing.demo/callback
fantasyphishing://TENANT/android/com.fantasyphishing.demo/callback
```

For the SPA application, set `EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID`; configure the Expo web origin as its allowed callback, web origin, and logout URL. Browser sign-in uses a popup and tokens cached in memory. Both platform files implement `loginLive()` and `logoutLive()`; native saves credentials through the SDK credential manager. Only public client identifiers belong in `EXPO_PUBLIC_*` variables.

For the external-browser response page, configure a separate **Regular Web Application** with `AUTH0_CLIENT_ID` and backend-only `AUTH0_CLIENT_SECRET`. Its callback is `API_ORIGIN/auth/callback`. An unauthenticated `GET /r/:token` can lead to `/auth/login?challenge=:token`. Login accepts only an opaque existing unexpired challenge token, never a redirect URL. It stores an encrypted 10-minute transaction cookie containing state/PKCE/nonce and the challenge. Callback verifies state, code, nonce, JWT identity, and private membership; then issues an HttpOnly Secure SameSite=Lax session and returns to that exact response page. Pending login transactions expire on server restart; reopen the original challenge if interrupted.

The response page GET is inspection only. A scored response requires the assigned authenticated recipient's POST and session CSRF token. A signed phone keypad callback is bound to the verified destination and assigned CallSid; it does **not** establish biometric identity.

## Gemini

Set backend-only `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (default `gemini-2.5-flash`, listed in the [official model catalog](https://ai.google.dev/gemini-api/docs/models) at review). The adapter uses the [generateContent REST contract](https://ai.google.dev/api/generate-content) with a JSON schema and validates the returned object locally. [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) constrains shape, not truth or safety; fixed template consistency and the bounded review still apply.

Only approved interest tags and fictional fixture content enter generation. There are no browsing/tools/contact scraping capabilities. The request has a 1,500-token output cap and 8-second timeout; the service allows three attempts per draft. Sender name, explanation, and cue annotations stay fixture-owned. Failed, refused, incomplete, unsafe, or inconsistent generations return approved fixtures with private `source`, `model`, `promptVersion`, and reason. The recipient API hides these fields until its normal reveal rules permit answers.

The [Gemini API terms](https://ai.google.dev/gemini-api/terms) include adult access requirements. Review account/data terms before introducing any live data. This demo sends fictional inputs only.

## Generic SMTP gameplay email

Supply `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (true for implicit TLS), `SMTP_USER`, `SMTP_PASS`, and a plain operator-owned `SMTP_FROM` address. TLS is required. Use a provider whose permission covers the exact gameplay format and fictional display names; authenticated sender/domain setup remains the operator's responsibility.

The adapter uses plain text, immutable approved copy, and only the server's `/r/:token` link. It disables template URL/file access. SMTP acceptance is recorded as `accepted`, not delivered-to-inbox. Definitive rejection is `failed`; ambiguous errors/timeouts are `unknown`. There are no provider-specific SMTP delivery callbacks or automatic resends. Operator reconciliation is needed for unknown outcomes.

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

Supply `ELEVENLABS_API_KEY`, a licensed fictional stock `ELEVENLABS_VOICE_ID`, `ELEVENLABS_PERMISSION_REFERENCE`, and `ELEVENLABS_STOCK_VOICE_CONFIRMED=true`. These are operator assertions. Never substitute a cloned real person's voice. Review the [ElevenLabs use policy](https://elevenlabs.io/use-policy), which restricts harmful deception, unauthorized robocalling, and unauthorized impersonation.

The [text-to-speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) is called only for an approved script, with `eleven_multilingual_v2` and `pcm_16000`. The adapter measures PCM byte duration, rejects output shorter than 15 or longer than 25 seconds, wraps it as a WAV, and atomically caches it under a script/model/voice hash in `AUDIO_CACHE_DIR` (default `data/audio`). A failed audio request or invalid duration blocks the call; it never substitutes silence or a different voice. Cache files need private persistent storage on the API host; expired URLs cannot fetch them. Do not expose this directory as public static content.

The simulator displays an honest script fallback if audio is absent. This handoff contains no generated ElevenLabs recording. The audio test creates synthetic PCM solely inside temporary test storage, never as a product audio asset.

## Local contract verification

From the repository root:

```sh
npm test
npm run typecheck
```

The provider suite in `apps/api/test/providers.test.ts` uses mocks and in-process Fastify requests; it needs no provider keys or paid services. Thirteen provider/auth contract tests were run successfully during implementation. They cover generation validation/fallback/timeout, missing readiness and demo-verification rejection, SMTP outcomes, fixed Twilio request fields, invalid signatures, callback dedupe/order, assigned recipient checks, no-input behavior, post-match opt-out, encrypted login state, expiring audio scope, measured duration, cached audio, and pausing during audio preparation before carrier submission. Native build, real Auth0 login, real Mongo replica-set behavior, carrier delivery, SMTP delivery, actual Gemini generation, actual ElevenLabs synthesis, and external callback reachability remain unrun until their actual environments and authorization are supplied.
