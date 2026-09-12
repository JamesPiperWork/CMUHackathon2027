# Technical depth after the merge

Assessment updated 2026-09-12 after confirmed Gmail delivery and the Email/Text/Voice composer implementation. The status below distinguishes completed engineering from remaining provider work. Effort estimates assume one experienced engineer working on a scoped version; provider onboarding, credentials, and deployment setup add time.

**Recommendation: complete reliable real-email settlement first, then add a measured AI evaluation pipeline.** The prerecorded ElevenLabs voice workflow is implemented; real phone transport now needs Twilio onboarding and a public HTTPS origin. Keep those capabilities behind the three pages: Home, Bait, and League.

## What to do next now

**Focus on the email loop. It is enough technical scope for this demo.** The current changes implement zero-account startup, local name/email/password registration, email-code ownership verification for real delivery, separate real-email storage, clearly labeled Gmail SMTP transport, one-origin web hosting, scanner-neutral response links, and a signed receipt/reconciliation contract. Recipient lists are optional: blank uses verified participant signup; configured lists restrict it. Settings can reset the local demo or let the verified SMTP organizer archive active leagues while retaining accounts, authentication and consumed transport quotas. Tests exercise duplicates, late receipts, bounces, concurrent sign-ins and submission races. A real diagnostic from the configured Gmail sender reached the participant’s Temp Mail inbox and the participant confirmed arrival. Automated tests still use isolated, mocked providers.

1. **Rehearse the complete email path:** use [EMAIL_DEMO_SETUP.md](EMAIL_DEMO_SETUP.md) and `npm run email:demo`. The launcher loads local secrets, checks SMTP without sending, builds, and serves the app/API at `http://localhost:3001` with separate `data/email-demo.json`. Have two consenting participants verify their inboxes and demonstrate signup → league → context → editable email → actual inbox → authenticated response → score. Emailed links must open on this computer; public HTTPS is optional when other devices are needed.
2. **Connect genuine delivery evidence:** Gmail has no native delivery callback. The [receipt relay contract](docs/EMAIL_RECEIPTS.md) already handles authenticated events, duplicate/out-of-order evidence, immutable recipient/message matching and occurrence-vs-arrival timestamps. Implement an adapter to a real evidence source before claiming automatic unclicked-email settlement; never count a test event as a real receipt.
3. **Show the failure tests:** demonstrate that a scanner cannot score, a duplicate response awards points once, and a bounced or unconfirmed message gives no avoidance point. This makes the engineering visible without adding screens.

Rehearse that loop alongside the new browser audio preview before enabling real phone transport. [VOICE_PLAN.md](VOICE_PLAN.md) scopes a prerecorded call using ElevenLabs and Twilio, with browser audio as the first milestone. Real calls depend on verified phone setup, account capabilities and public HTTPS; the current email launcher does not enable them.

## What is already technically substantial

The merged app has more engineering depth than its quiet UI exposes:

- Salted password accounts for local play, email-code ownership for real email, private sender context, session-bound response links, CSRF checks, and score-neutral previews.
- Atomic scoring, persistent decisions, and seasonal Spear reservation with rollback and duplicate-request protection.
- One sender context produces one editable email, with current edits included in requested AI revisions. The new-email model defaults to `gemini-3.6-flash` with an environment override; there is no three-choice bait picker. A durable job loop bounds generation time, protects against stale results and records uncertain delivery states.
- Round-robin scheduling with tested opponent coverage, fair byes, and preserved midweek assignments.
- Backward-compatible migration of old matches, retained final scores and league standings.
- Reset semantics preserve the difference between reversible local data and external side effects: local reset removes accounts, while real-email reset archives leagues without erasing delivery history or replenishing quotas.
- Automated coverage includes concurrency, deadline crossings, restart, late evidence, invalid recipients, account setup, email-code identity and hosting. Tests use mocked providers and unset real keys. Run a fresh browser and actual-provider rehearsal before claiming the changed flow is verified end to end.

Show one failure-and-recovery example in the presentation. A duplicated callback producing exactly one score, or a stale worker being unable to overwrite a completed match, is concrete evidence of technical difficulty.

## Priority and scope

| Priority | Improvement | Engineering depth | Visible demo payoff | Scoped effort |
| --- | --- | --- | --- | --- |
| 1 | Real-email delivery evidence and automatic weekly settlement | High: asynchronous evidence, verification, reconciliation, idempotency | Real inbox → confirmed delivery → fair end-of-week score | 1.5–3 days, after provider setup |
| 2 | AI quality benchmark, then measured adaptation | High: evaluation design, regression detection, uncertainty | Compare two prompt versions on the same held-out cases | 1–2 days for the benchmark; adaptation separate |
| 3 | Prerecorded ElevenLabs voice pilot | High: media jobs, private audio, carrier callbacks, consent and scoring | A participant's phone rings with reviewed generated audio and a keypad response | 1–2 days after provider and deployment setup |
| 4 | Multiple workers and transactional outbox | Very high: concurrency, recovery, data migration, external side effects | Kill a worker and show recovery without duplicate scoring or blind resends | 3–5 days |
| Supporting slice | Trace one cast across the system | Medium: context propagation and useful instrumentation | Explain one cast from generation through settlement on a timeline | 0.5–1 day |

The ordering weighs product usefulness and demo clarity as well as complexity. For this iteration, focus on the actual email rehearsal and genuine delivery evidence. The remaining rows are follow-ups after the core path works reliably.

## 1. Close the real-email delivery loop

**Current gap.** The SMTP adapter records acceptance, failure, or uncertainty. Acceptance is not delivery evidence. The current backend can settle a flagged accepted email because the authenticated participant proved receipt, but an untouched accepted email remains unresolved. That prevents a false avoidance award, while leaving unattended real-email weeks incomplete.

**Remaining build.** Add a provider-native event adapter upstream of the implemented signed relay and durable evidence ledger. Verify the selected provider's event authentication; correlate each event with the cast, attempt ID, provider message ID, and enrolled recipient. Persist provider event IDs to deduplicate callbacks. Record event time and arrival time separately so a late callback can establish that delivery occurred before the deadline. Reconcile uncertain sends before any retry. Trigger settlement again when sufficient evidence arrives.

The evidence model should distinguish submission acceptance, destination-mail-server delivery, a participant action, and reading. For example, SES delivery events identify delivery to the recipient's mail server; they do not establish human reading. Its click-event metadata also includes a bot-likelihood signal, reinforcing why a raw tracking event is not an authenticated game decision. This is an example of event semantics, not a provider selection or permission determination. [AWS event-data documentation](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html).

**Implementation touchpoints:** `apps/api/src/providers.ts`, `service.ts::unresolvedDeliveries/finalizeDb`, `email-casts.ts::awardAvoidance`, `repository.ts`, and shared `DeliveryAttempt` types. Add a small organizer reconciliation view for genuinely unresolved events; ordinary players need only the existing status label.

**Acceptance evidence:** forged event rejected; duplicate event changes nothing; callback-before-submit-response reconciles; a bounce earns no avoidance point; a late event can settle once; scanner GETs change no score. Exercise a permitted provider against verified consenting test accounts before calling real delivery complete.

**Thirty-second demo:** show a real cast reaching an inbox, then separately run the isolated receipt test that replays a delivery event and advances a simulated deadline to produce one avoidance point. Identify the replay as a test; real-email clock advancement stays disabled. Keep the authenticated bait confirmation so scanners cannot change scores.

## 2. Make AI quality measurable

**Current gap.** The context-to-email and refinement contracts are bounded and tested, but those tests do not establish that real model outputs are consistently natural, personalized, or educationally correct. The configured model identifier also needs verification against the actual provider account. Current difficulty changes generation attempt limits, not measured scenario difficulty.

**Build.** Create a held-out corpus of 50–100 synthetic cases covering hobbies, concise notes, contradictory details, attempted instruction injection, and each supported fictional story. Compare the original prompt and candidate prompts on the same cases. Save model and prompt version, latency, fallback reason, output size, and per-case results.

Use deterministic checks for structure, destination ownership, claim consistency, and explanation provenance. Use a small human-reviewed rubric for naturalness and meaningful use of one or two details. Keep evaluator disagreement visible. An LLM judge can assist review, but should not be the only correctness oracle. Gemini supports schema-constrained output; our additional semantic evaluation would test the story and teaching claims beyond that structural contract. [Gemini structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

Later, introduce a cue-category skill estimate with uncertainty and recommend an approved story in Bait. **An unclicked email earns game points but does not prove the player recognized phishing.** Treat silence as unknown evidence for learning; rely on explicit flags, explanations, or optional after-match cue questions. Avoid claiming improved real-world literacy from a few weekly outcomes. Keep difficulty comparable within a head-to-head.

**Implementation touchpoints:** `email-lure.ts`, shared `email-content.ts`, `scouting.ts`, a new evaluation script and synthetic dataset, and versioned result artifacts. No new player screen is needed for the first slice.

**Acceptance evidence:** prompt changes must pass the same held-out cases; no destination or false teaching fact accepted; bounded fallback under a complete outage; subjective examples linked to reviewer ratings. Report measured rates and sample sizes, not invented improvement percentages.

**Thirty-second demo:** show the same inputs through two prompt versions, their evaluation results, one improved example, and one rejected case with a precise reason.

## 3. Add a bounded voice pilot

**Current gap.** Voice scripts, ElevenLabs audio caching, Twilio calls and signed keypad callbacks exist in the legacy backend. The current game now connects these pieces: two weekly casts shared across Email/Text/Voice, sender-led Gemini drafts, an editable voice script, asynchronous private audio, playback approval tied to the exact script revision, verified phone enrollment, and configured Twilio adapters. A real 16-second ElevenLabs recording was generated using the built-in George voice. No real calls or SMS have been placed; Twilio is not configured.

**Remaining setup and rehearsal.** Follow [VOICE_SETUP.md](VOICE_SETUP.md) to configure Twilio Verify, an eligible calling number, trial recipient permissions and public HTTPS callbacks. Then rehearse a labeled call with an opted-in participant. The implementation validates signed callbacks, correlates early receipts with immutable attempts, deduplicates decisions and keeps no-answer outcomes score-neutral. Live ElevenLabs Agents conversations remain a separate stretch.

**Acceptance evidence:** changed scripts invalidate audio; a generation failure places no call; opt-out during synthesis prevents submission; duplicate or forged callbacks cannot alter a score; a lost submission response never triggers a blind redial. The plan separates answered calls, keypad decisions, voicemail and no answer so transport cannot invent a successful attack.

**Thirty-second demo:** review a personalized script and play its audio, call the consenting participant, press a game response key, and show the corresponding score event. If provider setup is unavailable, present browser audio and a clearly identified callback test separately.

## 4. Prove recovery across multiple workers

**Current gap.** File storage supports one API process. Mongo storage currently rewrites one aggregate state document, so independent leagues contend on the same document. Existing leases and stale-generation checks are useful foundations, but they are not a demonstrated distributed deployment.

**Build.** Split matches, jobs, and events into scoped collections. Commit a cast or Spear reservation and an outbox event in one transaction. Claim due work atomically using indexed queries, leases and fencing tokens. Reserve per-recipient daily quotas transactionally across leagues. Persist an event cursor for socket updates and scoreboard projections. Use provider idempotency where supported; ambiguous external submission still requires reconciliation.

MongoDB change streams offer resumable observation of committed changes, but persisted resume tokens must stay within retained history. Consumers still need idempotency and a resynchronization path. [MongoDB change-stream documentation](https://www.mongodb.com/docs/manual/changestreams/).

**Implementation touchpoints:** `repository.ts`, service job methods, `email-casts.ts`, shared job/attempt types, and a separate worker entry point. A small pure score reducer can also rebuild match totals from immutable scoring events and verify the stored projection.

**Acceptance evidence:** competing workers claim once; a worker dies before and after provider submission; a lease expires during generation; simultaneous leagues cannot exceed one recipient's quota; reconnect/replay restores authoritative state; migration preserves old scores and Spear usage. Do not claim exactly-once external delivery.

**Thirty-second demo:** run two workers, interrupt one, and demonstrate recovery, a consistent scoreboard, and no blind duplicate email. Use fault injection and a local provider stub before running the same scenario with a real provider.

## Supporting instrumentation

Carry a trace ID across the request, generation job, delivery attempt, callback, participant action and settlement. Show latency, retries, fallback reasons and rejected stale work on an organizer-only timeline. OpenTelemetry's context propagation is designed to correlate work across process boundaries; its guidance also cautions against placing credentials or personal data in propagated baggage. [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/).

Record opaque IDs and timing, not raw response tokens, email addresses, or private sender notes. This slice makes the existing engineering visible to judges and helps debug each larger proposal.

## Suggested next milestone

Complete **verified signup, actual inbox delivery and genuine receipt-based settlement** first. Then add **AI evaluation** against the one-email editor and its revision flow. The implemented [ElevenLabs voice workflow](VOICE_SETUP.md) adds a visible technical demonstration now; completing a real Twilio call is the next provider-dependent step. Keep distributed-worker work as a focused subsequent milestone with measurable recovery tests. Season rollover, playoffs and minigames can follow a stable email loop; each needs a separate product scope.
