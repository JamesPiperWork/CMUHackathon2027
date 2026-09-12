# Submission demo after the Gmail suspension

Google disabled the dedicated Gmail account. Gmail sending is paused in the local `.env`; changing the display name or removing a subject label will not restore that account. Keep its credentials local while you pursue Google's appeal. Do not rely on a replacement Gmail account for the submission.

## Fastest working presentation: a separate local email inbox

Mailpit accepts real SMTP messages and displays them in its own mailbox, outside the app. It does not deliver to Temp Mail, Gmail, or a participant's phone. Both sign-in codes and challenge emails can be demonstrated on this computer without a sending account. [Mailpit documentation](https://mailpit.axllent.org/docs/).

From the repository root:

```sh
npm run email:capture
```

The launcher starts the app and the local inbox together. Stop both with Control+C. On another Mac, first install Mailpit with `brew install mailpit`. [Official installation instructions](https://mailpit.axllent.org/docs/install/).

Open:

- App: http://localhost:3001/
- Large/Compact phone preview: http://localhost:3001/mobile-preview
- Harbor Mail inbox and composer: http://localhost:8026/
- Optional raw Mailpit inspector: http://localhost:8025/

Harbor Mail includes three preconfigured mailboxes: Alex, Jordan and Casey, plus a few sample messages. Use two of their addresses in the app, for example `alex@demo.test` and `jordan@demo.test`. Sign-in codes arrive in the local inbox; these are disposable presentation identities, not verified external addresses. Use separate browser profiles or tabs for the two app sessions, and select each mailbox with the account menu when presenting. Use Compose or Reply to send local emails between them. The app uses its separate `data/capture-demo.json` store; existing real-email accounts and sends stay in `data/email-demo.json`.

1. Create the first account, select its address in Harbor Mail and retrieve its code from the inbox, and finish player setup.
2. Create a league. Create the second account and join using the invite code.
3. In Bait, choose Email, enter the target's interest, and generate one email.
4. Review the fictional sender display name, subject and body. Choose a Rickroll, fishing/duck reveal, or upload your own harmless photo.
5. Send the cast. Select the receiving account in Harbor Mail and open the new message. Its visible sender name and subject use the selected training presentation without announcing the game in the subject.
6. Open the response link as the assigned recipient and take the bait. The chosen reveal appears and the sender gains 3 points while the recipient loses 1.

A link preview alone does not score. Photos appear only after an authenticated response; the sender cannot supply an arbitrary destination URL. Rickroll opens the fixed music video when the recipient chooses to play it. Browser autoplay is not promised.

The sender address in this local demonstration is `notifications@demo.test`. The editable name is a display name, not a change to the authenticated sending domain. The mailbox and app identify this as local capture. No real SMS or calls are enabled by this launcher; ElevenLabs audio previews remain available.

## If submission requires an external inbox

| Option | What it offers | What must be ready |
| --- | --- | --- |
| Existing authorized training SMTP service | Actual mail to enrolled participants using this app's SMTP adapter | Working service credentials, verified sender/domain, and permission for the intended simulation format |
| Restore the dedicated Google account | Reuse the previously tested Gmail path if Google restores access | Sign into the account, read the stated reason, and submit **Start Appeal**; recovery is not guaranteed before the deadline |
| Local Mailpit presentation | Immediate SMTP, signup, message and reveal demonstration | Mailpit running on the presenter's computer; it is not external delivery |

For Google, use the official [disabled-account appeal instructions](https://support.google.com/accounts/answer/40695?hl=en). The app cannot determine or clear Google's enforcement decision.

A newly opened transactional-email account is not a guaranteed substitute for a surprise-training service. For example, Resend's [acceptable-use policy](https://resend.com/legal/acceptable-use) prohibits phishing and deceptive sending. Its availability should not be treated as permission for this format. New domain verification, account review and sender reputation also make a brand-new internet SMTP server a poor deadline fallback.

For an approved external training service, retain the operator-owned authenticated From address. The training presentation uses the cast's fictional display name and ordinary subject; required provider disclosures remain supported. Configure `EMAIL_PRESENTATION=training`, the genuine permission reference in `EMAIL_PERMISSION_REFERENCE`, and `EMAIL_FORMAT_SUPPORTED=true` only for a service that supports this format. Ordinary signup-code messages remain clearly identifiable account messages. The default Gmail-style demo remains labeled until that external format is configured.
