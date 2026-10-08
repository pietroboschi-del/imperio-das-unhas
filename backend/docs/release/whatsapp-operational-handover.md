# WhatsApp operations handover — OFF until independently authorized

Audience: network administrator, support and salon reception. This runbook does **not** authorize real activation. Main booking/checkout/customer management must work while WhatsApp is OFF.

## 1. Safe daily status checks

Run `cd backend && npm run whatsapp:preflight` against the correctly approved environment. The tool is read-only and prints configuration **presence** only, not credentials. An unset `DATABASE_URL` yields an explicit NOT APPLICABLE Outbox summary.

Interpret `WHATSAPP_AUTOMATION_ENABLED`, `WHATSAPP_AGENT_API_ENABLED`, `EVOLUTION_WEBHOOK_ENABLED`: OFF is expected until activation is separately approved. A configured API key or instance does **not** mean a WhatsApp number is connected; use the authorized provider dashboard to confirm the instance/number.

For provider outage: compare authorized provider health/dashboard, outbound Outbox progress and sanitized backend logs. Do not test an outage by sending a real message without authorization.

## 2. Outbox and stalled attempts

Inspect status counts: PENDING, SENDING, SENT, DELIVERED, READ, FAILED, CANCELLED and **RECONCILIATION_REQUIRED**. Preflight reports both reconciliation-required count and SENDING older than `MESSAGING_SENDING_STALE_MS` (default five minutes). Outbox logs use `communication.sent`, `communication.failed`, `communication.reconciliation_required`, and `communication.reconciled`; only IDs, attempt metadata and safe reason codes should be logged.

- PENDING: awaiting eligible dispatch, only when future activation permits.
- FAILED with a non-null due `nextAttemptAt`: proven definite transient rejection and normal retry policy.
- FAILED with `nextAttemptAt=null`: terminal failure, **not** automatically retried.
- SENDING: in-flight. An aged SENDING is **ambiguous**, not proven failed. Recovery quarantines it for reconciliation.
- RECONCILIATION_REQUIRED: provider may already have delivered. **No automatic retry.**
- SENT/DELIVERED/READ: never manually retry.

**A message in RECONCILIATION_REQUIRED must NEVER be manually resent before the provider has been checked for its actual delivery outcome.** Timeout, network error, HTTP 5xx, invalid 2xx and process death after attempted send are not proof that delivery did not happen.

## 3. Privileged reconciliation

A logged-in network administrator can first list ambiguous IDs using read-only `GET /api/v1/admin/messaging/outbox/reconciliation`; it returns safe metadata, not phone numbers or message text. Ordinary reception users cannot access this queue.

Only a logged-in network administrator can use `POST /api/v1/admin/messaging/outbox/:id/reconcile` through the normal authenticated + CSRF-protected API. Body shape:
```json
{"action":"CONFIRM_SENT","providerMessageId":"verified-provider-message-id"}
```
or `{"action":"CONFIRM_NOT_SENT"}` or `{"action":"CANCEL"}`.

Before selecting any action, verify the exact Outbox, channel/instance, recipient and attempted time in the provider dashboard. Write an operational incident note with evidence (do **not** paste secrets or customer message bodies into logs). Select `CONFIRM_SENT` only with an independently verified provider ID; `CONFIRM_NOT_SENT` only with trustworthy evidence the original request was **not accepted**; `CANCEL` for a cancelled message. If uncertain, leave the item untouched and escalate.

Each successful disposition is a conditional transactional transition with operator ID audit. A second attempt will be rejected; never change status with manual SQL, never alter `attempts` or `nextAttemptAt` directly. Network admins have cross-unit access by design; ordinary unit staff cannot reconcile.

## 4. Reception: permitted fallback and prohibitions

While WhatsApp is OFF or unavailable, use **normal central business operations**: appointments, customer check-in, waitlist, checkout and reporting remain independent. Tell a client that automated notifications may be delayed and use only approved alternative communication policy where needed.

Reception must **never**:
- Manually resend an Outbox message, click retry on ambiguous items, or use a different channel/number to reproduce the same automation.
- Mark an uncertain message as undelivered based only on lack of a response or a timeout.
- Modify database rows, disable auditing, share API keys, copy sensitive payloads into tickets or switch provider configuration.
- Attempt privileged reconciliation, change live flags, create webhook or configure the real number.

## 5. Monitoring and escalation

Escalate to technical support/network admin when any reconciliation item appears, a SENDING row is stale, provider health cannot be established, repeated 5xx/408/429 occurs, the channel disconnects, inbound event replay conflicts appear, automation queue length grows without processing, or the dashboard differs from the database.

For a stopped automation/job, confirm feature flags, channel enabled state, background-runner/job availability, pending automation statuses and CI/deployment runtime as appropriate. CI tests prove code, **not** that jobs are scheduled in a particular production environment.

Review sanitized backend logs and `AuditEvent` by Outbox ID, time window, unit and action. Never log Authorization/apikey, webhook secret, full webhook payload, phone numbers unnecessarily or customer text.

## 6. Shutdown and recovery

An authorized operator may disable `WHATSAPP_AUTOMATION_ENABLED`, `WHATSAPP_AGENT_API_ENABLED` and `EVOLUTION_WEBHOOK_ENABLED` **only as part of a separately approved production change**. This runbook itself does not apply flag changes. Shutdown must not impact bookings, sales, checkout, payments or reception operations.

After provider recovery, first reconcile every RECONCILIATION_REQUIRED item. Do not blindly process the whole Outbox or reset status en masse. Resume normal dispatch only after incident review, authorization and appropriate CI/release gates.

## 7. External activation prerequisites

Provider URL and supported Evolution version, private API key, three instance mappings (CENTRAL, BIG_CENTRO, SHOPPING_CONTAGEM), webhook authentication secret, real number connection, live callback URL, verified migration deployment, backup/restore, owner sign-off, test-provider E2E and a rollback plan remain separately gated. Missing credentials are external activation dependencies, **not** reasons to bypass safe retry behavior.
