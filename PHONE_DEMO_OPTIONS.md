# Phone channels: a practical plan for today's demo

Reviewed September 12, 2026 against the repository and current official Twilio documentation. These are options and implementation estimates; no phone provider was configured and no real message or call was sent during this review.

**Finish real email first.** Verified enrollment, scheduled sending, authenticated delivery events, duplicate protection, scanner-neutral response links, and correct weekly settlement already make a technically substantial project. Demonstrating a real email followed by a duplicated or delayed callback that still awards exactly one score is stronger than adding several unreliable channels. A standard phone call is the best optional stretch after email works.

## What can work today?

| Option | Same-day assessment | Remaining work |
| --- | --- | --- |
| Real SMS through an existing approved sender | Plausible if the team already has the account, sender registration and eligible recipients | Configure the existing adapter, enroll verified phone contacts, expose callbacks, rehearse; current email-only match rules need a separate phone pilot |
| Real custom SMS from a new US account | Do not make this a dependency for today's demo | Paid account and approved 10DLC campaign or verified toll-free sender; onboarding can outlast the hackathon |
| A standard call to an opted-in participant | Best phone stretch; account-dependent | Configure the existing call adapter and public HTTPS media/callbacks, verify the recipient, choose an approved audio source, rehearse keypad responses |
| A voicemail left after a normal ringing call | Feasible as a later extension, not implemented | Add answering-machine detection and a separate message-after-greeting path; test actual voicemail systems |
| Ringless voicemail | Exclude from this plan | Twilio explicitly does not support it |
| WhatsApp sandbox | Conditional alternative to SMS, visibly WhatsApp | Account/Console access, participant joins sandbox, new adapter; confirm that the account permits custom replies |
| Browser audio or a staged manual phone interaction | Reliable presentation fallback | Clearly label the transport as simulated/manual; preserve the real email demo as the implemented core |

## SMS: the account is the limiting factor

Twilio's current trial documentation limits SMS to predefined templates, up to five verified recipients, and the sign-up country. A trial therefore cannot be assumed to send our generated bait even after a recipient verifies their number. Some legacy accounts have a different trial experience; inspect the actual account before planning around it. [Twilio trial restrictions](https://www.twilio.com/docs/usage/trials).

For US local-number application traffic, the current registration quickstart requires a paid account and warns of **10–15 days** for campaign review. This is a planning estimate, not a guaranteed deadline. Toll-free is another sender type, but Twilio requires its verification to be approved before US/Canada SMS can be sent; it is not an instant bypass. [10DLC registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart), [toll-free onboarding](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding).

The repo already has SMS submission, signed status callbacks, recipient matching, and STOP handling in `apps/api/src/providers.ts`. It does **not** have phone ownership verification during signup or SMS casts under the current two-email rule set. A Twilio Verify enrollment flow and a defined phone-game rule would be new work. Do not treat entering a phone number as proof that it belongs to the player.

## Calls: a smaller and more visible stretch

The existing adapter calls an enrolled number, plays an approved audio file, and collects **1 = trust, 2 = flag, 9 = pause**. It validates callback signatures and the assigned CallSid/recipient, deduplicates transport events, and does not record recipients. It requires ElevenLabs audio configuration today; it has no fallback that silently substitutes another voice.

A small alternative would add Twilio `<Say>` as an explicit stock text-to-speech mode, keeping the same keypad and scoring callbacks. This removes the separate ElevenLabs dependency. Estimate **half a day to one day** for that focused mode and a controlled rehearsal after account/public-host setup; phone enrollment and full integration into weekly rules add scope. [Twilio text-to-speech](https://www.twilio.com/docs/voice/twiml/say).

Current voice trials support restricted custom TwiML, including `<Say>`, `<Play>`, and `<Gather>`, with up to five verified numbers in the same country. The documented trial call-creation flow also limits parameters, so verify whether this account accepts the repo's inline TwiML request; a console proof of concept is not proof that the existing adapter will work unchanged. A paid account with an owned voice-enabled number is the cleaner integration path. [Twilio voice trial details](https://www.twilio.com/docs/usage/trials/try-out-voice).

Use an identified Fantasy Phishing training call with a fictional scenario and participants expecting this test. Twilio's AUP prohibits misleading sender identity/origin; consent alone does not establish that a surprise impersonation format is supported. The existing `INTEGRATIONS.md` describes the configured permission, contact-window and opt-out gates. This assessment has not obtained a provider determination for the game's exact templates. [Twilio acceptable-use policy](https://www.twilio.com/en-us/legal/aup).

## Voicemail means two different things

A normal call can ring, reach voicemail, wait for the greeting, and then play a message. Twilio supports `MachineDetection=DetectMessageEnd` for this purpose. Detection can return unknown or misclassify a greeting, so the implementation needs separate human, machine and unknown paths. The current immediate playback can be cut off by a greeting; it must not be described as reliable voicemail delivery. A completed call also does not prove the person listened. [Answering-machine detection](https://www.twilio.com/docs/voice/answering-machine-detection).

Going directly to voicemail without ringing is a separate feature. Twilio explicitly says ringless voicemail and voicemail drops are unsupported. Do not plan a ringless demo on this adapter. [Twilio ringless voicemail guidance](https://help.twilio.com/articles/15911135028891-Is-it-Possible-to-Leave-Ringless-Voicemails-or-Voicemail-Drops-with-Twilio-).

## Credible workarounds

- **WhatsApp:** the legacy Console sandbox lets participants join explicitly and supports free-form replies during a 24-hour window opened by their message. It is visibly a shared Twilio sandbox sender and requires no registered WhatsApp sender for testing. The new trial experience restricts outbound content to provided templates, so custom bait needs an account experience that supports it. This repo has no WhatsApp adapter. [Sandbox](https://www.twilio.com/docs/whatsapp/sandbox), [current WhatsApp trial](https://www.twilio.com/docs/usage/trials/try-out-whatsapp).
- **Browser audio on a real phone:** let an enrolled presenter open a demo response page and play the approved scenario. Label it “simulated call.” This demonstrates the content and interaction without claiming a telephone-network call or voicemail. It would need a small presentation view; it should not reintroduce an app inbox.
- **Manual rehearsal:** a team member can make an agreed, identified training call or send a disclosed sample to another presenter. Describe it as manual transport, not an integrated API send; do not insert fabricated provider delivery events. This tests the concept but adds little engineering depth.

## Recommended next milestone

Ship and rehearse **signup email → league setup → bait → real inbox → response → weekly settlement**. Capture three failure cases alongside the happy path: duplicate callback, delayed callback, and failed delivery with no undeserved avoidance point. Then add one short, identified call to one verified presenter if a usable account exists. Keep SMS registration, voicemail detection and a phone-based weekly ruleset as subsequent work. The player app can remain three pages throughout.
