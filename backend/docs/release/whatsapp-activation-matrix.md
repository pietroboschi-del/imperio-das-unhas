# WhatsApp activation matrix — rehearsal only

**Not an authorization to activate WhatsApp.** Execute against an approved non-production test environment first. No live number, webhook, message, Railway/DB write or feature-flag change is authorized by this file.

The code uses three channel IDs (CENTRAL, BIG_CENTRO, SHOPPING_CONTAGEM); the two units `big` and `centro` share channel BIG_CENTRO. Do not interpret channel as a unit. All business mutations remain server-authoritative and unit-scoped.

| Scenario | PRECONDITION | ACTION (future approved rehearsal) | EXPECTED RESULT | DB EFFECT | LOG EXPECTATION | STOP CONDITION |
|---|---|---|---|---|---|---|
| CONNECTION | Provider test instance and token separately approved | Check provider connectivity in an isolated test environment | Connected instance maps to configured channel | None from connection probe | Provider health with redacted details | Unconfigured instance, unsafe URL, provider unavailable |
| INBOUND | Test webhook secret and test instance mapped | Deliver valid webhook, replay same provider ID | Single inbound record; replay reported | One MessagingInbound, one received audit | Replay information with IDs only | Invalid secret, replay conflict, unexpected duplicate |
| AVAILABILITY | Test unit/staff/resource data available | Query one/many service availability | Only backend-confirmed slots | Read-only | Channel, unit and result count | Cross-unit leakage or invented slot |
| BOOKING | Test customer and still-free slot | Attempt concurrent confirmation twice | One authoritative booking | One booking; atomic/idempotent write | Booking/action correlation | Double booking or unauthorized write |
| MULTI-SERVICE | Test service durations, client areas, workstations | Confirm hands/feet overlap and dependencies | Backend validates each BookingItem, physical capacity | One booking with valid item records | Service count and unit only | Overlap not permitted or phantom availability |
| WAITLIST | Test matching vacancy and candidate | Deliver duplicate opportunity signal | At most one logical offer/event | Idempotent waitlist and Outbox writes | Opportunity/trace IDs | Duplicate offers or cross-unit matching |
| AUTOMATION | Test automation flags permitted only in isolated rehearsal | Materialize same business event twice | One logical automation/Outbox key | Unique idempotencyKey, no duplicate sends | Automation ID and status | Duplicate outbox or scheduling drift |
| OUTBOUND | Fake/test provider with deterministic response | Dispatch one PENDING item, run two workers | Exactly one send attempt and SENT | SENDING then SENT; providerMessageId, audit | Message ID and attempt count, never body/API key | Two provider calls or missing provider ID |
| HTTP 4xx rejection | Explicit provider rejection proven | Submit invalid test request | FAILED terminal; no retry | nextAttemptAt null; sanitized reason | Code only, no PII | Automatic retry of rejected request |
| Provider offline / DNS / connection refused | Simulated failure after fetch was invoked | Dispatch once | RECONCILIATION_REQUIRED conservatively | attempts retained; no nextAttemptAt | reconciliation_required audit | Any blind resend |
| HTTP 500 / 408 / 429 | Simulated response without proof of non-acceptance | Dispatch once | RECONCILIATION_REQUIRED | No retry due date | Safe provider status category | Any blind resend |
| Ambiguous timeout | Provider accepted request but HTTP response is lost | Abort/timeout after attempted request | RECONCILIATION_REQUIRED, not FAILED retryable | Last attempt and safe error preserved | Correlated audit without secret | Second send call |
| Invalid 2xx / missing ID | Provider accepted then returned malformed response | Simulate malformed JSON or 2xx lacking key.id | RECONCILIATION_REQUIRED | No providerMessageId assumed | Unknown response category | Auto-resend |
| Stale SENDING | Worker crash after external send request began | Advance lastAttemptAt beyond stale threshold; scan | RECONCILIATION_REQUIRED | attempts and lastAttemptAt preserved; nextAttemptAt null | reconciliation_required with staleMs | Scan schedules retry |
| RECONCILIATION_REQUIRED | Operator has networkAdmin and externally verified provider history | Compare recipient/time/instance and provider records | No action unless evidence supports disposition | No mutation during inspection | Operator notes outside sensitive logs | Provider status cannot be established |
| CONFIRM_SENT | Provider confirms exact outbound id | POST admin outbox/:id/reconcile CONFIRM_SENT + providerMessageId | SENT, never resent | sentAt and providerMessageId; audited operator | communication.reconciled with action | No exact ID, conflict, already reconciled |
| CONFIRM_NOT_SENT | Strong evidence provider did not accept original request | POST .../reconcile CONFIRM_NOT_SENT | FAILED with one explicitly released retry | nextAttemptAt due; audited operator | communication.reconciled | Weak evidence or ambiguous status |
| CANCEL | Authorized operator decides no delivery should be attempted | POST .../reconcile CANCEL | CANCELLED terminal | cancelledAt; audited operator | communication.reconciled | Item no longer awaiting reconciliation |
| Double reconciliation | First privileged operator already changed state | Second operator repeats request | Reject as conflict; no new side effects | One transition and audit | Conflict status, no PII | Two accepted dispositions |
| Provider status duplicate | Known providerMessageId exists | Replay DELIVERY_ACK/READ | Monotonic state; no audit duplication | DELIVERED/READ once | Safe provider ID | State regression or duplicate audit |
| WHATSAPP OFF | Flags OFF and central system healthy | Exercise primary agenda, cashier, front desk | Business continues without WhatsApp | Normal business writes only under existing operational gate | No provider send | Core operations depend on messaging |

## Reconciliation decision order (strict)

1. Identify channel, Outbox ID, lastAttemptAt and attempt number; inspect **provider** history in the right **instance**, without manually resending.
2. If an exact provider message ID proves accepted: `CONFIRM_SENT` with that ID.
3. Only if trustworthy evidence establishes it **was not accepted**: `CONFIRM_NOT_SENT`, which releases **one ordinary retry opportunity** through normal dispatch.
4. If cancelled operationally, use `CANCEL`; if still uncertain, **leave in RECONCILIATION_REQUIRED** and escalate.
5. The endpoint is protected by `NetworkAdmin`, uses a conditional state update in a transaction, and records an operator audit event. A non-admin/receptionist must never attempt the disposition.

## Gates before real activation

- Confirm code SHA, full CI, schema migration status, backup/restore, production diff and approved release manifest separately.
- Validate test-provider E2E and real Evolution version capabilities through their official docs before relying on a provider-specific behavior. This implementation **does not claim Evolution deduplicates** requests.
- Configure credentials/instance/webhook/phone only in a separately authorized release; turn flags on only after explicit approval.
- Roll back activation **by disabling integration flags**, not by replaying uncertain outbound messages. Runtime recovery requires a reconciliation process, not raw SQL.
