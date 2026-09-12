# Backend integration

The integration branch combines `codex/fantasy-phishing-demo` at `062582b` with `origin/main` at `9901d38`. Both histories are retained by the merge. The runnable application remains the Expo/React Native frontend with Fastify, shared TypeScript schemas, durable storage, and authenticated sockets.

## Imported and adapted

| Main mechanism | Integrated location | Adaptation |
| --- | --- | --- |
| Single-story Gemini prompt, one or two attributes, strict subject/body, malformed-output retry | `apps/api/src/email-lure.ts` | Sender-private notes, bounded REST request, shared timeout, validated marker, natural offline copy, server-owned teaching facts |
| Red-flag feedback | `packages/shared/src/email-content.ts` | Explanations follow the actual fictional claim; urgency is mentioned only when present |
| Two casts and a seasonal Spear | `apps/api/src/email-casts.ts`, `service.ts` | Slots and chip reservation use repository transactions; sender and opponent come from authenticated match membership |
| Circle-method round robin and assertions | `packages/shared/src/schedule.ts`, `apps/api/src/leagues.ts` | Supports 2–16 players, byes, persisted cycles, midweek joins without reassigning saved matches |
| Email-centered game loop | Existing Bait, Home, Inbox, League and Wrapped screens | Keeps our four-tab layout, fishing style, and desktop/Large/Compact preview |

Main's Next.js frontend, duplicate package configuration, in-memory singleton, and unauthenticated player-ID routes were resolved out of the combined runtime. Their source remains in main's history. Two competing databases or UI runtimes would not form one coherent app.

## User-resolved game rules

- Two regular email casts per player per weekly match; one extra Spear per player per league season.
- Successful phishing: sender +3, recipient −1.
- Each received cast left unclicked by the deadline: recipient +1. Flags wait until the deadline; ignored email qualifies too.
- No ordinary emails, minimum-response rule, or automatic missing-slot messages in new matches.
- No score for unsent/cancelled messages. Failed or unresolved carrier delivery requires evidence before settlement.
- High score wins the match; equal scores draw. League points remain 3/1/0.
- Raw GET/HEAD and link previews stay neutral. The participant's authenticated POST constitutes the bait action; the app does not claim raw email-link-click detection.

Spear usage is keyed by league ID, season ID, and player, and survives restart and week advancement. The season identifier is inherited from the league (seeded with the calendar year); this merge does not add a season rollover UI.

## Compatibility and data

A startup migration upgrades only unplayed drafting matches. Existing email drafts occupy regular slots; unused SMS/voice drafts are kept in `archivedDrafts`, with their pending work cancelled. Active and completed historical games retain their original multi-channel rules, decisions, and scores. New league matches use the configured email rules. Reset clears synthetic chip usage alongside match data.

The current schema remains backward-compatible through optional rule and metadata fields. File writes are atomic; Mongo transactions and unique event keys protect score and chip idempotency. Results are committed before socket notifications.

## Verification scope

The suites cover quota/authentication failures, concurrent requests, during-week drafting, chip reservation rollback, no ordinary-mail autofill, end-of-week avoidance, duplicate decisions/finalization, restart, score-neutral previews, old-state migration, round-robin/byes, Gemini fallback and retry behavior, deadline-crossing workers, and late delivery evidence.

Real SMTP, Auth0, MongoDB infrastructure, and Gemini credentials have not been supplied for this integration. Tests use mocks, the simulator, and isolated synthetic state. The generic SMTP adapter still needs provider receipt/reconciliation support for unattended settlement of accepted-but-unclicked live email.

Integration verification on 2026-09-12: 73 tests passed; full workspace typecheck/lint, API/web build, and iOS/Android JavaScript bundle exports passed. The published `npm run demo:finish` command ran against a temporary local API dataset and produced Alex 3 / Jordan 0 for two Alex casts with one Jordan click. Native binaries and real provider calls were not run. Browser automation had no available browser; Safari access was denied by its permission check, so a fresh visual smoke test remains outstanding. The temporary QA servers were stopped after testing.
