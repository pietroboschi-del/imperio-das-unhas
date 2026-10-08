# WhatsApp activation readiness — Bloco 4

> Scope: WA1–WA5, no production activation. This is a recoverable checkpoint ledger; CI proves only its tested scope.

## CURRENT_HEAD
92ceaca3db40d6571e3f0bb9e49570424e3c5e53 (fully green code HEAD, V98 Backend CI #518; this document commit will advance the branch, verify its CI separately)

## LAST_COMPLETED_CHECKPOINT
F — COMPLETE (full V98 Backend CI #518 SUCCESS, run 37741879212, head 92ceaca3db40d6571e3f0bb9e49570424e3c5e53)

## COMMITS
- Baseline b882c9aeb18e1672f1505558e95454e3f5a816a1: fix(release): locate built backend entrypoint in rehearsal
- Checkpoint A: the commit creating this document (resolve via git history); next checkpoint must record this new SHA.

## TESTS
- Verified GitHub Actions V98 Backend CI #478, run 37736182065: **SUCCESS**, head b882c9aeb18e1672f1505558e95454e3f5a816a1.
- Individually verified successful job steps: build, typecheck, WA1, WA2, WA2.1, WA3A, WA3B, WA3C.1–.4, WA4.1–.7, WA4 E2E, WA5.2–.8, V98b security integration.
- No local test rerun was possible from this connector-only environment. CI evidence predates this documentation-only commit; no runtime code changed.

## FINDINGS
- No commits after baseline at entry (GitHub compare identical, ahead 0).
- Required readiness document previously absent.
- WhatsApp source exists at backend/src/messaging, including Evolution guard/controller/parser/provider, inbox, dispatch, automation, lifecycle, outbox, booking/post-service/waitlist materialization.
- Existing migrations: 20261005_wa1_messaging_foundation, 20261006_wa2_evolution_inbound, 20261006_wa4_management_tasks, 20261006_wa5_1_messaging_automation.
- package.json defines explicit scripts for all WA1–WA5 checks. backend-ci.yml executes these and had success on baseline.
- Evolution configuration names: EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_CENTRAL, EVOLUTION_INSTANCE_BIG_CENTRO, EVOLUTION_INSTANCE_SHOPPING_CONTAGEM, EVOLUTION_WEBHOOK_ENABLED, EVOLUTION_WEBHOOK_SECRET, EVOLUTION_HTTP_TIMEOUT_MS.
- Existing webhook guard rejects disabled integration, requires secret, compares SHA-256 digests in constant time. Full security failure audit remains Checkpoint B.
- Existing stale threshold MESSAGING_SENDING_STALE_MS defaults to 300000 ms with validation.

### Feature inventory
Status **IMPLEMENTED; TESTED (CI #478)** means code/test artifacts exist and the named GitHub CI step passed; not real-provider certification.

| Block | Deliverable | Code/test status |
|---|---|---|
| WA1 | Messaging foundation | IMPLEMENTED; TESTED (CI #478) |
| WA2 | Evolution integration | IMPLEMENTED; TESTED (CI #478) |
| WA2.1 | stale SENDING recovery | IMPLEMENTED; TESTED (CI #478) |
| WA3A | server-side availability | IMPLEMENTED; TESTED (CI #478) |
| WA3B | authoritative agent booking | IMPLEMENTED; TESTED (CI #478) |
| WA3C.1 | multi-service availability | IMPLEMENTED; TESTED (CI #478) |
| WA3C.2 | secure multi-service query | IMPLEMENTED; TESTED (CI #478) |
| WA3C.3 | multi-service booking creation | IMPLEMENTED; TESTED (CI #478) |
| WA3C.4 | parity/regressions | IMPLEMENTED; TESTED (CI #478) |
| WA4.1 | waitlist audit | IMPLEMENTED; TESTED (CI #478) |
| WA4.2 | agent waitlist | IMPLEMENTED; TESTED (CI #478) |
| WA4.3 | reception notification | IMPLEMENTED; TESTED (CI #478) |
| WA4.4 | opportunity matching | IMPLEMENTED; TESTED (CI #478) |
| WA4.5 | offer candidate | IMPLEMENTED; TESTED (CI #478) |
| WA4.6 | states/traceability | IMPLEMENTED; TESTED (CI #478) |
| WA4.7 | queue UI | IMPLEMENTED; TESTED (CI #478) |
| WA4 E2E | end-to-end | IMPLEMENTED; TESTED (CI #478) |
| WA5.2 | booking materialization | IMPLEMENTED; TESTED (CI #478) |
| WA5.3 | booking lifecycle | IMPLEMENTED; TESTED (CI #478) |
| WA5.4 | temporal rules | IMPLEMENTED; TESTED (CI #478) |
| WA5.5 | waitlist offer | IMPLEMENTED; TESTED (CI #478) |
| WA5.6 | post-service | IMPLEMENTED; TESTED (CI #478) |
| WA5.7 | automation Outbox | IMPLEMENTED; TESTED (CI #478) |
| WA5.8 | E2E/security | IMPLEMENTED; TESTED (CI #478) |

### Subsystems
| Area | Evidence | Status |
|---|---|---|
| Migrations | WA1, WA2, WA4, WA5.1 SQL directories | IMPLEMENTED; CI migrations step SUCCESS |
| Messaging controllers/services | backend/src/messaging/*.ts | IMPLEMENTED; TESTED within CI scopes |
| Jobs/materialization | lifecycle, booking, waitlist, post-service services | IMPLEMENTED; TESTED within CI scopes |
| Outbox/dispatch | messaging-dispatch.service.ts and messaging-automation-outbox.service.ts | IMPLEMENTED; TESTED within CI scopes |
| Evolution webhook | controller, guard, parser | IMPLEMENTED; TESTED within CI scopes |
| Frontend/admin queue bridge | WA4.7 frontend contract and read integration | IMPLEMENTED; TESTED within CI scopes |
| Flags | WHATSAPP_AUTOMATION_ENABLED, WHATSAPP_AGENT_API_ENABLED, EVOLUTION_WEBHOOK_ENABLED | Code/CI configured; live values NOT VERIFIED |
| CI | .github/workflows/backend-ci.yml WA gates | TESTED on #478 |
| Real provider connection and number | Not activated here | ACTIVATION-ONLY |

## FIXES
- Checkpoint A: documentation only; no runtime changes.

## KNOWN_BLOCKERS
- Actual production flags/provider status **NOT VERIFIED**; must not infer from CI defaults.
- Provider/number/secret/connectivity require separate authorized future activation.
- All code/document checkpoints completed; independent final audit and external activation dependencies remain.

## EXTERNAL_REQUIREMENTS
- Evolution provider URL, API credential, instances per channel, verified inbound secret, phone number setup and operator approval. No secrets should be committed or printed.

## NEXT_CHECKPOINT
INDEPENDENT FINAL AUDIT — no additional code changes authorized.

## NEXT_EXACT_ACTION
1. Confirm this ledger-only final commit's own CI is SUCCESS and record final branch SHA in the audit capsule.
2. Independent auditor checks outbound ambiguity, stale quarantine, manual reconciliation and migration. Real Evolution, number, webhook and secrets remain unconfigured and OFF.
3. Do not deploy, activate WhatsApp or touch live Railway/PostgreSQL.

## DO_NOT_REPEAT
- Do not redo Checkpoint A inventory unless actual relevant source changes.
- Do not assume a successful CI validates live Evolution.
- Do not deploy, mutate Railway/PostgreSQL, enable flags, configure real webhooks/numbers, send messages, reset, rebase or force push.

## NORMAL_CHAT_CONTINUATION_INSTRUCTIONS
Continue the Block 4 sequence B → C → D → E → F, one recoverable checkpoint at a time. Read GitHub HEAD, latest CI and this ledger before writing. On unexpected movement stop; on safety/data/prod conflict stop. Persist every checkpoint as commit and push, update fields (CURRENT_HEAD, LAST_COMPLETED_CHECKPOINT, COMMITS, TESTS, FINDINGS, FIXES, KNOWN_BLOCKERS, EXTERNAL_REQUIREMENTS, NEXT_CHECKPOINT, NEXT_EXACT_ACTION, DO_NOT_REPEAT, NORMAL_CHAT_CONTINUATION_INSTRUCTIONS). Release remains OFF; production mutations NONE.


## CHECKPOINTS B–E COMPLETION EVIDENCE (2026-10-08)

### CHECKPOINT B: COMPLETE — OUTBOUND SAFETY (targeted gates passed)
- Added `MessagingOutboxStatus.RECONCILIATION_REQUIRED` and additive migration `20261008_wa2_outbox_reconciliation_required`; no migration changed in place.
- Evolution errors now distinguish DEFINITE_FAILURE from DELIVERY_UNKNOWN. HTTP 5xx/408/429, timeout, connection failures, invalid 2xx and missing provider ID are conservatively ambiguous; no assumption about Evolution deduplication.
- Dispatch moves unknown results and stale SENDING to RECONCILIATION_REQUIRED without scheduled retry. FAILED with nextAttemptAt null is terminal. PENDING and proven retry-due FAILED only are automatically eligible.
- Privileged POST `/api/v1/admin/messaging/outbox/:id/reconcile`: CONFIRM_SENT (requires providerMessageId), CONFIRM_NOT_SENT (single controlled retry opportunity), CANCEL; NetworkAdmin guard, atomic state gate and operator audit.
- Provider delivery status failure is quarantined instead of blindly retried. Inbound deduplication remains as previously implemented.
- Tests include simulated provider HTTP/network ambiguity, stale SENDING, no auto replay, double worker claim, terminal failure, confirmed sent/not sent and admin authorization. CI #505 WA2/WA2.1/WA2.2/preflight steps passed; final aggregate validation is Checkpoint F.

### CHECKPOINT C: COMPLETE — PREFLIGHT
- `npm run whatsapp:preflight` -> `backend/tools/whatsapp-preflight.mjs`. Config presence/redacted secret checks, WA migrations, flags, instance requirements, job scripts, optional read-only Outbox summaries including RECONCILIATION_REQUIRED and stale SENDING count.
- `npm run test:whatsapp-preflight` enforces no mutation or provider access and checks that secrets are not printed. CI #505 targeted step passed.

### CHECKPOINT D: COMPLETE — ACTIVATION MATRIX
- `backend/docs/release/whatsapp-activation-matrix.md` covers connection, inbound, availability, booking, multi-service, waitlist, automation, outbound, failures and controlled reconciliation with precondition, action, expected state, DB/log expectations, stop condition.

### CHECKPOINT E: COMPLETE — OPERATIONAL HANDOVER
- `backend/docs/release/whatsapp-operational-handover.md` gives instructions for connection/offline status, Outbox, stale SENDING, ambiguous delivery, network-admin reconciliation, safe shutdown, logs, escalation and reception fallback with WhatsApp OFF.

## COMMITS (B–E)
29 commits between starting A HEAD e9dcb55239b164439b8d045d42424aebbfbb399b and pre-ledger e802df674b3444e104d377ef42e68a6737263ceb; inspect GitHub compare for full logical list. Additional ledger commit follows.

## TESTS (B–E)
- CI #505 directed WA1, WA2, WA2.1, WA2.2, and WhatsApp read-only preflight contract: SUCCESS at their respective steps; full CI result still pending at ledger writing.
- CI #498 failed only at synthetic migration rehearsal hardcoded target count=21; code now asserts 22 (actual migration directories counted as 22); revalidate on newer CI.

## FINDINGS / FIXES / KNOWN_BLOCKERS
- Safety risks (unknown timeout and stale retries) corrected at code level with tests, not certified against a live Evolution instance.
- Full green CI for final HEAD and independent audit remain outstanding. Do not activate real WhatsApp.

## EXTERNAL_REQUIREMENTS
Provider URL, API key, instances, number, inbound secret, webhook URL and external operator approval are **EXTERNAL ACTIVATION DEPENDENCIES**, not code-readiness evidence.

## PRODUCTION MUTATIONS
NONE. No live Railway, PostgreSQL, deployment, migration, flag, webhook, number or message touched.

## NORMAL_CHAT_CONTINUATION_INSTRUCTIONS
All Checkpoints A–F are implemented and validated through CI #518 for code HEAD 92ceaca3. Verify the newest documentation-only ledger commit CI before final READY FOR FINAL AUDIT. Independent audit required; no activation authorized.


## CHECKPOINT F: COMPLETE — FULL REGRESSION EVIDENCE
- V98 Backend CI #518, run 37741879212, exact HEAD 92ceaca3db40d6571e3f0bb9e49570424e3c5e53: **SUCCESS**.
- Full gates: Prisma generate+migrations, build, typecheck, WA1, WA2, WA2.1, WA2.2, preflight, WA3A/B/C.1–C.4, WA4.1–4.7, WA4 E2E, WA5.2–5.8, static/projector, frontend bridge, security integration, synthetic migration rehearsal, stock, agenda, financial and public booking tests.
- Safe HTTP/provider failure simulation: 400 terminal, 408/429/500 uncertain, malformed/ID-less 2xx uncertain, abort/network failure uncertain. Real Evolution was never contacted.
- Late provider success after stale quarantine cannot falsely report durable SENT; specific behavioral regression added.
- Reconciliation GET admin queue returns IDs/metadata without message body or client contact; POST privileged conditional transition and audit.
- New migration verified among 22 migrations in rehearsal, without modifying historical migration SQL.
- Final code HEAD recorded above; the commit updating this ledger contains no runtime changes, and has a separate CI run.

## AUDIT CAPSULE
- Starting HEAD: e9dcb55239b164439b8d045d42424aebbfbb399b (Checkpoint A).
- Fully green code HEAD: 92ceaca3db40d6571e3f0bb9e49570424e3c5e53 (#518 SUCCESS).
- Migration: backend/prisma/migrations/20261008_wa2_outbox_reconciliation_required/migration.sql (additive enum state).
- Files: backend/src/messaging/{messaging-dispatch.service.ts,messaging-inbound.service.ts,evolution-messaging.provider.ts,evolution-config.ts,messaging.provider.ts,messaging-reconciliation.service.ts,messaging-reconciliation.controller.ts,messaging.module.ts}, backend/prisma/schema.prisma, backend/test/wa2*, backend/test/v98b-security.integration.mjs, backend/tools/whatsapp-preflight.mjs, backend/test/wa4-preflight-read-only.contract.mjs, backend/docs/release/whatsapp-{activation-matrix,operational-handover}.md, backend/package.json, .github/workflows/backend-ci.yml, synthetic migration rehearsal and release contract.
- Residual: provider version-specific real integration, live number, credentials, instance/webhook setup and independent final audit. No live activation performed.
- PRODUCTION MUTATIONS: NONE.
