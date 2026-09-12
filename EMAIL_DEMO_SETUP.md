# External email setup and the current submission fallback

**Current status:** Google disabled the configured Gmail sender. External sending is paused in `.env`; the earlier successful delivery check no longer establishes that this account can send.

For the submission, run **`npm run email:capture`** and follow [SUBMISSION_DEMO.md](SUBMISSION_DEMO.md). The app remains at [localhost:3001](http://localhost:3001), and a separate email service at [localhost:8026](http://localhost:8026) offers preset `@demo.test` inboxes and a composer. Account codes and challenges travel through actual local SMTP; nothing goes to Gmail or Temp Mail. This mode has separate storage and local-only account verification, and leaves the saved credentials unchanged.

The instructions below apply only after the external sender is restored or an appropriate provider is configured. Do not use `email:demo` to work around the disabled account; that command explicitly enables external sending.

The app sends all account codes and clearly labeled game emails through one configured Gmail sender. Players enter their own receiving email during signup, verify it with a code, then set their preferences and create or join a league. Recipient addresses belong to their accounts, not the environment file.

The prior Gmail SMTP check and Temp Mail delivery succeeded before the account was disabled. Recover the account through Google or use a provider that permits the intended training format, then perform a fresh authentication and inbox delivery check. Local capture is the submission path while that work remains unresolved.

## 1. Add the two credentials locally

Open the repository-root `.env` (Git ignores it):

- **`SMTP_PASS`**: a Gmail **app password**, not the normal Google account password. Sign into the dedicated sending account, enable 2-Step Verification, and create an app password named “Fantasy Phishing demo.” Paste its 16 characters here without display spaces. Google may not offer app passwords for certain organization accounts, security-key-only 2-Step Verification, or Advanced Protection. [Google app-password instructions](https://support.google.com/accounts/answer/185833?hl=en).
- **`GEMINI_API_KEY`**: the existing parallel project's Gemini API key. The generator uses main's `gemini-3.6-flash` model, adjustable with `GEMINI_MODEL`. Until a key works, the app identifies prepared drafts honestly. [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash).

For a restored Gmail account, keep `SMTP_USER` and `SMTP_FROM` set to the same dedicated account. Players may choose a fictional sender display name in the bait editor, but cannot change the authenticated From address. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, and `SMTP_SECURE=false` select mandatory STARTTLS, not an unencrypted SMTP connection. [Google SMTP settings](https://support.google.com/mail/answer/7104828?hl=en).

`SESSION_SECRET` and `TOKEN_SECRET` have been generated locally. For a different checkout, copy `.env.email-demo.example` and generate two distinct secrets with `openssl rand -hex 32`. Keep all credentials in `.env`, never chat, source control, or `EXPO_PUBLIC_*` settings.

## 2. Start the email demo on this computer

Only after the sender is usable again, check it with `npm run email:check`, then set `EMAIL_DEMO_SEND_ENABLED=true`. Stop the existing server with **Control+C** and run:

```sh
npm run dev
```

This command:

1. Reads the saved real-email settings and checks Gmail SMTP connectivity, TLS, and authentication **without sending email**.
2. Builds the web app and starts the API with real-email signup and immediate game sending enabled (`EMAIL_DEMO_IMMEDIATE=true`).
3. Uses separate `data/email-demo.json` storage and binds to this computer's loopback interface.

Open [the app](http://localhost:3001) or [the Large/Compact phone preview](http://localhost:3001/mobile-preview). No tunnel is needed for a rehearsal conducted entirely on this computer. **Open the emailed game links on this computer too**; another phone or laptop cannot reach its loopback address.

`npm run dev` now honors the saved real-email mode and serves the built app on the API origin. `npm run email:demo` is an explicit shortcut that selects local, immediate email testing even in another checkout. Closing either launcher with Control+C stops its server; it does not retract messages already sent.

The real-email store starts separately from the old password-based simulation. Create each account with its inbox verification code, then set up the league. Previous simulated casts are preserved in `data/demo.json`; they are never replayed as real mail.

A successful SMTP check proves authentication, not inbox placement or delivery. The app never turns an uncertain SMTP result into a fabricated receipt. [Nodemailer verification contract](https://nodemailer.com/smtp#verifying-the-configuration).

## 3. Create players and send a cast

1. Open the app in separate browser profiles for two players. Choose **Create account**, enter each receiving email, and copy its emailed verification code into the app.
2. Complete player setup, enable game email, create a league, and let the second player join with its invite code.
3. On **Bait**, choose a cast slot and **Email**, then enter context about your opponent and your message idea. Generate one email, edit its subject/body directly, or ask for a revision. Choose Cast 1, Cast 2, or the optional seasonal Spear.
4. Click **Send email now**. This sends that cast immediately and starts the week if needed. The button waits for the provider response; “Accepted by mail provider” means Gmail accepted it, not that it reached the inbox. You can send the second cast and seasonal Spear immediately too. Weekly cast limits, verified enrollment and pause preferences still apply.
5. Open the recipient's real inbox. The default external profile uses the configured sender and labels the subject `[Game simulation]`. An approved training profile can use the fictional display name and unprefixed subject with `EMAIL_PRESENTATION=training`, a documented `EMAIL_PERMISSION_REFERENCE`, and `EMAIL_FORMAT_SUPPORTED=true`. Required provider disclosure text still applies; these settings do not independently obtain provider permission.
6. Open the link, sign in as its assigned recipient if asked, then choose the explicit response. A preview/scanner GET alone never changes the score.

**Receiving inbox options:** a disposable Temp Mail address can test a disposable synthetic account, but it cannot be the SMTP sender. Its public-service terms provide no expectation of email privacy, free messages may last only 1–2 hours, and domains may change. A sign-in code grants access to the game account, so use only fictional profiles there. [Temp Mail FAQ](https://temp-mail.org/faq), [terms](https://temp-mail.org/terms-of-service).

For a stable one-presenter test, Gmail aliases such as `yourname+alex@gmail.com` and `yourname+jordan@gmail.com` both reach one inbox. The app preserves `+` tags and treats these as separate game accounts controlled by you. Use separate browser profiles. [Google's alias instructions](https://support.google.com/mail/answer/22370?hl=en).

Leave `EMAIL_DEMO_RECIPIENTS` blank. It is an optional invitation restriction for organizers who deliberately want to limit signup to a list; it is not required for participant enrollment.

## What “queued” means

A durable queue records a cast before the provider attempt so a refresh or duplicate click cannot send it twice. In immediate testing, clicking **Send email now** claims that single queued job and waits for its result. There is no one-minute delay, contact-hour delay or daily pacing in this explicitly enabled labeled demo. “Queued” may briefly remain while an existing attempt is running; “Delivery unconfirmed” requires checking the original attempt rather than automatically retrying it.

The previous behavior delayed the first cast by at least one minute and applied contact windows plus one email per recipient's local day. Those scheduling rules remain available with `EMAIL_DEMO_IMMEDIATE=false`, and remain in full live mode. `npm run dev` follows `.env`; this checkout retains its external configuration with sending paused. Use `npm run email:capture` explicitly for the current local submission. A status of “Simulated delivery” always means no external send happened, regardless of whether credentials are present.

## If a receiving inbox stops working

First check the exact signup address, spam folder, and any Gmail bounce notification. A successful SMTP acceptance is not a delivery receipt. Temp Mail inboxes can expire; create a new account with its current address and verify the new inbox. For a stable rehearsal, use two `+` aliases of a Gmail inbox you control. Do not retry a cast whose submission is unknown: it may already have been sent. The disabled Gmail account must be restored before that route is usable. A Temp Mail receiving address does not replace the sending service; local capture avoids this dependency for the submission.

## Reset from the app

Open **Account & preferences**:

- In local simulation or local mailbox capture, **Reset demo** removes accounts, leagues, sessions, and game progress and returns to account creation. Captured mailbox messages remain in the separate email service; use the newest verification code after starting again.
- In real-email mode, sign in with the verified email matching `SMTP_USER`. The organizer's **Reset active leagues** archives games and cancels queued work while retaining player accounts, email evidence and daily send limits. New leagues start fresh. Already-sent messages cannot be recalled.

Both buttons show a confirmation and a Cancel option. Do not use the legacy scripted scoring shortcut for actual email participants. For a completely separate rehearsal data file, use manual configuration below; do not delete delivery evidence merely to bypass limits.

## Optional: use other devices

Other phones and laptops need one public HTTPS address forwarding to API port 3001. An authenticated ngrok installation can provide it with `ngrok http 3001`; its current free plan uses an assigned development domain and a browser interstitial. The computer and tunnel must remain running. [ngrok free-plan behavior](https://ngrok.com/docs/pricing-limits/free-plan-limits).

For this path, stop the local launcher and configure `.env`:

```dotenv
APP_MODE=demo
EMAIL_DELIVERY_MODE=smtp-demo
EMAIL_DEMO_LOCAL_ONLY=false
EMAIL_DEMO_IMMEDIATE=true
EMAIL_DEMO_SEND_ENABLED=false
API_ORIGIN=https://your-public-host
APP_ORIGIN=https://your-public-host
EXPO_PUBLIC_API_ORIGIN=https://your-public-host
EXPO_PUBLIC_MODE=demo
DEMO_DATA_FILE=./data/email-demo.json
```

Run `npm run email:check`. After it succeeds, set `EMAIL_DEMO_SEND_ENABLED=true`, run `npm run build`, then `npm run dev -w @fp/api`. Use this manual path for public hosting; `npm run email:demo` intentionally selects loopback instead. Test the public app from the participant's device before requesting codes. Rebuild and restart if the public URL changes. Keep `LIVE_SEND_AUTHORIZED` and all `ENABLE_LIVE_*` flags false; this labeled email mode has its own sending gate.

## Remaining delivery milestone

Gmail SMTP does not provide native delivery callbacks. An untouched message that Gmail only accepted cannot automatically earn the weekly +1 as proven delivered. An authenticated recipient action supplies receipt evidence; unattended weekly settlement needs a real delivery-evidence source and reconciliation.

The signed [receipt endpoint](docs/EMAIL_RECEIPTS.md) handles correlated, authenticated evidence, duplicate events, bounces, and late arrival. Connecting a genuine source remains work. Setting `EMAIL_RECEIPT_RELAY_SECRET` or posting a made-up event is not proof of delivery.
