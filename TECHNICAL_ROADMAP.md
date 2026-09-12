# Technical depth after the merge

Assessment of integration commit **4674a38**, 2026-09-12. These are proposals, not additional implemented features. Effort estimates assume one experienced engineer working on a scoped version; provider onboarding, credentials, and deployment setup add time.

**Recommendation: complete reliable real-email settlement first, then add a measured AI evaluation pipeline.** A narrated, reproducible Weekly Wrapped is the strongest visual follow-up. Keep those capabilities behind the existing four tabs.

## What is already technically substantial

The merged app has more engineering depth than its quiet UI exposes:

- Recipient authentication, private sender notes, session-bound response links, CSRF checks, and score-neutral previews.
- Atomic scoring, persistent decisions, and seasonal Spear reservation with rollback and duplicate-request protection.
- A durable job loop with deadlines, generation retries sharing one time budget, stale-result protection, and explicit uncertain delivery states.
- Round-robin scheduling with tested opponent coverage, fair byes, and preserved midweek assignments.
- Backward-compatible migration of old matches and an event-based recap that distinguishes clicks from untouched bait.
- **73 passing tests**, including concurrency, deadline crossings, restart, late delivery evidence, and invalid recipient requests. API/web builds and native JavaScript exports pass. Real provider execution and a fresh browser visual pass remain unverified.

Show one failure-and-recovery example in the presentation. A duplicated callback producing exactly one score, or a stale worker being unable to overwrite a completed match, is concrete evidence of technical difficulty.

## Priority and scope

| Priority | Improvement | Engineering depth | Visible demo payoff | Scoped effort |
| --- | --- | --- | --- | --- |
| 1 | Real-email delivery evidence and automatic weekly settlement | High: asynchronous evidence, verification, reconciliation, idempotency | Real inbox → confirmed delivery → fair end-of-week score | 1.5–3 days, after provider setup |
| 2 | AI quality benchmark, then measured adaptation | High: evaluation design, regression detection, uncertainty | Compare two prompt versions on the same held-out cases | 1–2 days for the benchmark; adaptation separate |
| 3 | Reproducible, narrated Weekly Wrapped | High: event provenance, media jobs, caching, synchronized playback | A personal video with exact emails, reactions, and scores | 2–4 days |
| 4 | Multiple workers and transactional outbox | Very high: concurrency, recovery, data migration, external side effects | Kill a worker and show recovery without duplicate scoring or blind resends | 3–5 days |
| Supporting slice | Trace one cast across the system | Medium: context propagation and useful instrumentation | Explain one cast from generation through settlement on a timeline | 0.5–1 day |

The ordering weighs product usefulness and demo clarity as well as complexity. With a short hackathon window and no email-provider setup, the evaluation benchmark is the most self-contained next slice; prepare delivery-event fixtures while external setup proceeds.

## 1. Close the real-email delivery loop

**Current gap.** The SMTP adapter records acceptance, failure, or uncertainty. Acceptance is not delivery evidence. The current backend can settle a flagged accepted email because the authenticated participant proved receipt, but an untouched accepted email remains unresolved. That prevents a false avoidance award, while leaving unattended real-email weeks incomplete.

**Build.** Add a provider-event adapter and durable evidence ledger. Verify the selected provider's event authentication; correlate each event with the cast, attempt ID, provider message ID, and enrolled recipient. Persist provider event IDs to deduplicate callbacks. Record event time and arrival time separately so a late callback can establish that delivery occurred before the deadline. Reconcile uncertain sends before any retry. Trigger settlement again when sufficient evidence arrives.

The evidence model should distinguish submission acceptance, destination-mail-server delivery, a participant action, and reading. For example, SES delivery events identify delivery to the recipient's mail server; they do not establish human reading. Its click-event metadata also includes a bot-likelihood signal, reinforcing why a raw tracking event is not an authenticated game decision. This is an example of event semantics, not a provider selection or permission determination. [AWS event-data documentation](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html).

**Implementation touchpoints:** `apps/api/src/providers.ts`, `service.ts::unresolvedDeliveries/finalizeDb`, `email-casts.ts::awardAvoidance`, `repository.ts`, and shared `DeliveryAttempt` types. Add a small organizer reconciliation view for genuinely unresolved events; ordinary players need only the existing status label.

**Acceptance evidence:** forged event rejected; duplicate event changes nothing; callback-before-submit-response reconciles; a bounce earns no avoidance point; a late event can settle once; scanner GETs change no score. Exercise a permitted provider against verified consenting test accounts before calling real delivery complete.

**Thirty-second demo:** send a cast, show accepted then confirmed delivery, replay the delivery event twice, advance the demo week, and show exactly one avoidance point. Keep the authenticated confirmation for bait actions; reducing its friction is a separate identity/attribution design decision.

## 2. Make AI quality measurable

**Current gap.** The generator is bounded and tested for contracts, but those tests do not establish that real model outputs are consistently natural, personalized, or educationally correct. Current difficulty changes generation attempt limits, not measured scenario difficulty.

**Build.** Create a held-out corpus of 50–100 synthetic cases covering hobbies, concise notes, contradictory details, attempted instruction injection, and each supported fictional story. Compare the original prompt and candidate prompts on the same cases. Save model and prompt version, latency, fallback reason, output size, and per-case results.

Use deterministic checks for structure, destination ownership, claim consistency, and explanation provenance. Use a small human-reviewed rubric for naturalness and meaningful use of one or two details. Keep evaluator disagreement visible. An LLM judge can assist review, but should not be the only correctness oracle. Gemini supports schema-constrained output; our additional semantic evaluation would test the story and teaching claims beyond that structural contract. [Gemini structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

Later, introduce a cue-category skill estimate with uncertainty and recommend an approved story in Bait. **An unclicked email earns game points but does not prove the player recognized phishing.** Treat silence as unknown evidence for learning; rely on explicit flags, explanations, or optional after-match cue questions. Avoid claiming improved real-world literacy from a few weekly outcomes. Keep difficulty comparable within a head-to-head.

**Implementation touchpoints:** `email-lure.ts`, shared `email-content.ts`, `scouting.ts`, a new evaluation script and synthetic dataset, and versioned result artifacts. No new player screen is needed for the first slice.

**Acceptance evidence:** prompt changes must pass the same held-out cases; no destination or false teaching fact accepted; bounded fallback under a complete outage; subjective examples linked to reviewer ratings. Report measured rates and sample sizes, not invented improvement percentages.

**Thirty-second demo:** show the same inputs through two prompt versions, their evaluation results, one improved example, and one rejected case with a precise reason.

## 3. Turn Wrapped into a reproducible media pipeline

**Current gap.** Wrapped already has real saved moments and a browser WebM export. Its scene selection is assembled on request, timings are fixed, and export requires the browser to remain open while rendering. There is no narration pipeline.

**Build.** At settlement, create an immutable, versioned `StoryManifest` containing source event IDs, selected email text, eligible chat excerpts, actor/recipient identities, final scores, and scene timings. Generate a short narration script only from those facts. Validate every name, score, and quote against the manifest. Queue narration and video rendering, cache artifacts by manifest hash, and let both app playback and export read the same manifest.

Keep artifacts league-private. Support consent-aware redaction and regeneration if a quote or identity is removed. A failed narration job should leave the visual recap playable. The sender's private notes should never become narration or exported footage.

**Implementation touchpoints:** `leagues.ts::recap`, shared `MatchStory`, `apps/mobile/src/story.ts`, `wrapped.tsx`, export code, and new render-job/artifact storage.

**Acceptance evidence:** exact actor attribution for attacks, flags and ignored mail; no fabricated quotes; no out-of-window chat; restart-safe render jobs; matching facts in playback and export; reliable fallback when audio fails.

**Thirty-second demo:** a real game cast and a league chat reaction become a narrated recap. Re-render it and show the same source events and final score. This adds a memorable presentation moment while retaining the existing Play and Save controls.

## 4. Prove recovery across multiple workers

**Current gap.** File storage supports one API process. Mongo storage currently rewrites one aggregate state document, so independent leagues contend on the same document. Existing leases and stale-generation checks are useful foundations, but they are not a demonstrated distributed deployment.

**Build.** Split matches, jobs, and events into scoped collections. Commit a cast or Spear reservation and an outbox event in one transaction. Claim due work atomically using indexed queries, leases and fencing tokens. Reserve per-recipient daily quotas transactionally across leagues. Persist an event cursor for socket updates and recap generation. Use provider idempotency where supported; ambiguous external submission still requires reconciliation.

MongoDB change streams offer resumable observation of committed changes, but persisted resume tokens must stay within retained history. Consumers still need idempotency and a resynchronization path. [MongoDB change-stream documentation](https://www.mongodb.com/docs/manual/changestreams/).

**Implementation touchpoints:** `repository.ts`, service job methods, `email-casts.ts`, shared job/attempt types, and a separate worker entry point. A small pure score reducer can also rebuild match totals from immutable scoring events and verify the stored projection.

**Acceptance evidence:** competing workers claim once; a worker dies before and after provider submission; a lease expires during generation; simultaneous leagues cannot exceed one recipient's quota; reconnect/replay restores authoritative state; migration preserves old scores and Spear usage. Do not claim exactly-once external delivery.

**Thirty-second demo:** run two workers, interrupt one, and demonstrate recovery, a consistent scoreboard, and no blind duplicate email. Use fault injection and a local provider stub before running the same scenario with a real provider.

## Supporting instrumentation

Carry a trace ID across the request, generation job, delivery attempt, callback, participant action and settlement. Show latency, retries, fallback reasons and rejected stale work on an organizer-only timeline. OpenTelemetry's context propagation is designed to correlate work across process boundaries; its guidance also cautions against placing credentials or personal data in propagated baggage. [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/).

Record opaque IDs and timing, not raw response tokens, email addresses, or private sender notes. This slice makes the existing engineering visible to judges and helps debug each larger proposal.

## Suggested next milestone

Choose **delivery evidence plus AI evaluation** if real-email accounts are ready. Otherwise choose **AI evaluation plus a versioned Wrapped manifest**, then add narration. Keep distributed-worker work as a focused subsequent milestone with measurable recovery tests. Season rollover, playoffs, extra channels, and minigames can follow a stable email loop; each would need a separate product scope and adds less immediate evidence of reliability than the priorities above.
