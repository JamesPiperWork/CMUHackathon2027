# Email delivery receipts

SMTP acceptance proves that submission was accepted. It does not prove delivery to the recipient's mail server or placement in their inbox. The app keeps that distinction in its delivery status and weekly scoring.

`POST /webhooks/email/receipts` accepts a **provider-neutral signed relay contract**. It is not a native Gmail, SES, Postmark, SendGrid, or other provider webhook. No external adapter or receipt source is configured by default. SMTP credentials alone do not enable delivery confirmation.

An operator-controlled relay must first verify the chosen provider's native webhook signature, or reconcile a trusted delivery report/export, then translate that evidence into this contract. A future native adapter can perform that verification and translation directly. Do not treat an email-open pixel, link preview, SMTP `250` response, user-supplied JSON, or an unverified forwarded bounce as delivery evidence. A `delivered` receipt confirms recipient-mail-server delivery, which still does not guarantee inbox placement.

## Configure the relay

Set `EMAIL_RECEIPT_RELAY_SECRET` to an independent random secret of at least 32 characters in the API and trusted relay. Keep it out of the mobile app, browser, mail body, and repository. Until it is set, the endpoint returns `503`. Serve the endpoint over the configured public HTTPS API origin.

Each SMTP submission includes a stable RFC `Message-ID`, plus `X-Fantasy-Phishing-Attempt` and `X-Fantasy-Phishing-Recipient` headers. The API snapshots the submitted address hash and message ID before dispatch, so early receipts and uncertain SMTP acknowledgements can be reconciled. The relay must supply all four correlations: attempt ID, message ID, player ID, and destination email address. Changing the account's address later cannot retarget the old attempt. Older attempts without a saved address hash require separate reconciliation; this endpoint will not guess their destination.

## Request contract

Send a JSON object with exactly these fields:

```json
{
  "version": 1,
  "eventId": "relay-source:unique-native-event-id",
  "attemptId": "delivery-attempt-uuid",
  "providerMessageId": "<delivery-attempt-uuid@sender.example>",
  "recipientId": "player-uuid",
  "recipientAddress": "player@example.com",
  "status": "delivered",
  "occurredAt": 1789214400000
}
```

`status` is `delivered` or `bounced`. `bounced` means a confirmed permanent failure, not a temporary deferral. `occurredAt` is the provider event time in Unix milliseconds; preserve it when retrying. `eventId` must be globally unique across the relay's sources/accounts. Preserve it when retrying an event, and never reuse it for different evidence.

The signature covers an exact JSON array in this field order:

```text
[version,eventId,attemptId,providerMessageId,recipientId,recipientAddress,status,occurredAt]
```

Generate a current Unix-seconds timestamp string. Calculate HMAC-SHA256 over UTF-8 bytes of `timestamp + "." + JSON.stringify(array)` using the relay secret. Send these headers:

```text
x-fp-receipt-timestamp: <Unix seconds>
x-fp-receipt-signature: v1=<lowercase hexadecimal HMAC>
content-type: application/json
```

The API accepts a signing timestamp within five minutes of its wall clock. The event occurrence may be older because provider reports can arrive late; occurrences more than one minute in the future or more than one minute before the saved attempt are rejected. Sign each retry with a fresh signing timestamp while keeping the event's original data. `canonicalEmailReceipt` and `signEmailReceipt` in `apps/api/src/email-receipts.ts` implement the contract for a TypeScript relay.

## Processing and scoring

- Exact duplicate events return `204` without duplicate status or score effects. A reused event ID with different evidence returns `409`.
- Invalid signatures return `403`; unknown/mismatched attempts return `404`; invalid payload/times return `400`. Retry temporary `5xx` failures with a fresh signature. Do not keep retrying invalid correlation without reconciling the source data.
- Events, payload digests, occurrence times, arrival times, and dispositions persist in `emailReceipts`. Destination addresses are hashed in this ledger. Older events cannot reverse newer evidence; a permanent bounce cannot be reversed by a later delivery assertion for the same attempt.
- A receipt that arrives before the SMTP acknowledgement takes precedence over a later accepted/unknown submission result.
- At the weekly deadline, authenticated delivery before the deadline can earn an unclicked recipient one avoidance point. Delivery at or after the deadline and confirmed bounces do not earn that point. A recipient's own valid flag decision remains direct interaction evidence.
- A receipt arriving after the deadline automatically retries settlement for an incomplete match. Its occurrence time determines whether delivery was in time. Receipt ingress never dispatches pending mail.
- Completed matches keep their published scores. Contradictory later evidence is recorded with `terminal` disposition for review; it does not silently rewrite standings. The application does not yet offer an adjudication UI for those exceptional cases.

The labeled SMTP demo uses these same delivery-evidence rules. Without a verified relay/report source, an accepted but unanswered email remains unresolved; the app does not invent delivery confirmation. Authenticated player interactions can establish the corresponding challenge outcome independently.
