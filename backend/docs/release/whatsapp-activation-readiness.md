# WhatsApp activation readiness — Bloco 4

> Scope: WA1–WA5, no production activation. This is a recoverable checkpoint ledger; CI proves only its tested scope.

## CURRENT_HEAD
b882c9aeb18e1672f1505558e95454e3f5a816a1 (baseline before Checkpoint A). **After Checkpoint A commit, replace with resulting commit SHA in next checkpoint; do not treat this baseline as branch HEAD.**

## LAST_COMPLETED_CHECKPOINT
A — COMPLETE (inventory evidence and CI verification)

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
- Detailed security/failure audit, read-only preflight, activation matrix, operational handover and final regression remain.

## EXTERNAL_REQUIREMENTS
- Evolution provider URL, API credential, instances per channel, verified inbound secret, phone number setup and operator approval. No secrets should be committed or printed.

## NEXT_CHECKPOINT
B — SECURITY + FAILURES

## NEXT_EXACT_ACTION
1. Re-fetch official branch HEAD and this document from GitHub. Confirm no unrecognized concurrent commits.
2. Inspect webhook auth, inbound replay/idempotency, outbound idempotency, retry/stale SENDING and failure handling in source and tests. Make only evidenced fixes.
3. Run affected tests in a runnable checkout/CI, review diff, commit/push the correction, update this ledger with SHA and B status. Do not alter production.

## DO_NOT_REPEAT
- Do not redo Checkpoint A inventory unless actual relevant source changes.
- Do not assume a successful CI validates live Evolution.
- Do not deploy, mutate Railway/PostgreSQL, enable flags, configure real webhooks/numbers, send messages, reset, rebase or force push.

## NORMAL_CHAT_CONTINUATION_INSTRUCTIONS
Continue the Block 4 sequence B → C → D → E → F, one recoverable checkpoint at a time. Read GitHub HEAD, latest CI and this ledger before writing. On unexpected movement stop; on safety/data/prod conflict stop. Persist every checkpoint as commit and push, update fields (CURRENT_HEAD, LAST_COMPLETED_CHECKPOINT, COMMITS, TESTS, FINDINGS, FIXES, KNOWN_BLOCKERS, EXTERNAL_REQUIREMENTS, NEXT_CHECKPOINT, NEXT_EXACT_ACTION, DO_NOT_REPEAT, NORMAL_CHAT_CONTINUATION_INSTRUCTIONS). Release remains OFF; production mutations NONE.
