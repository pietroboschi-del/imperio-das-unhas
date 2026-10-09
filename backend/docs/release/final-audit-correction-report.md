# FINAL AUDIT + CORRECTION REPORT — IMPÉRIO DAS UNHAS

Repository: `pietroboschi-del/imperio-das-unhas` • branch: `official-three-units-integration`.
START HEAD: `4cc95ce5d4e0e1a87559d44ec151241bc8c04db7`.
CODE RELEASE HEAD: `ae2f478b6925ff4b4251aea72b7ff6daae4cafd0`.
FINAL TARGET HEAD: commit containing this release report; resolve with Git. Exact final SHA and final workflow run IDs are provided in the accompanying delivery, avoiding a fabricated self-referential SHA.
PRODUCTION MUTATIONS: NONE.

## Audit coverage and evidence

Risk-directed audit covered auth/session/activation, backend permission enforcement and unit segregation, owner configuration flows, global clients/dossiers, agenda/BookingItem and public booking, command/payment/cash/credits, stock purchase/consumption/inventory/transfer, reports/timezone, frontend PostgreSQL bridges and retry/re-entry, CI/browser quality, migration parity/preflight/rehearsal, backup and WA1–WA5. Documentation was corroborated against source, migration SQL, assertions and actual workflow steps.

Initial backend #605 / 37852314527 and code #603 / 37850290620 were SUCCESS; real browser #53 / 37850290632 SUCCESS on `b6f452c21583faebd260a614e1dad7634606de58`. Intervening initial commits changed documentation only. Unchanged evidence was reused; changed paths received directed regressions and the required aggregate CI.

During execution the branch advanced to `2e4c85bfb4058cade41e64fd74c5b831ec747043`. Its corrections and regressions were compared and preserved through forward commits; no reset, rebase or force push occurred. The supplemental finding list was frozen before implementation. New issues subsequently addressed arose directly from those corrections/regressions.

CONFIRMED: server-side authorization, active database principal/session, unit/domain separation, CSRF, owner assignment boundaries, global client identity, PostgreSQL persistence and critical transactional flows, and release checksum tooling within the asserted tests. Canonical configuration in database JSON is compatibility storage; browser state is a projection. Cross-unit agenda rights do not grant finance/stock/admin rights.

Evidence limits: browser tests use visible login/activation and UI operations, plus authenticated readback/negative endpoint probes for persistence and boundaries. They do not certify every company-payment or transfer UI permutation. Synthetic integration setup uses isolated SQL/API fixtures; it is not represented as UI authoring. Stock test session injection establishes service authorization, not UI login. New boundary tests reproduce races/denials using real compiled classes and narrow persistence doubles; actual PostgreSQL HTTP integration independently covers affected boundaries. Historical green is not used to certify changed code.

Commercial units are only `centro`, `big`, `shopping-contagem`. `central` is a technical StockLocation. Empty Client/Professional/Booking/Stock is not a software blocker where owner configuration and operation are available.

## Findings, corrections and disposition

The table consolidates overlapping FA-/S- findings from the two audit packs rather than counting the same defect twice. All except the cosmetic P3 are fixed. No correction requires a schema migration, historic data rewrite, secret or new commercial/architecture decision. Production effect occurs only after a future authorized deployment.

| ID | Severity/domain/component | Confirmed reproduction/impact | Correction and required regression | Migration / owner decision |
|---|---|---|---|---|
| A01 | P1 auth; auth.service.ts | Concurrent activation/reset could both change a password using one token. | Conditional atomic token claim before password/session writes; one winner in behavior and PostgreSQL activation tests. | No / No |
| A02 | P1 payments; controller/DTO/index bridge | DIRECT_PROFESSIONAL accepted missing service-line recipient; bridge discarded recipient. | Active unit professional on persisted service line; fingerprint and recipient snapshot; cash/treasury false; authoritative reload/retry. Invalid/replayed/changed recipient integration. | No / No |
| A03 | P1 finance concurrency | Distinct locks allowed snapshot/item/payment or close/adjust/reopen/payment races; credit reads not locked. | Shared aggregate locks, cash-open date lock, credit row locks and settlement replay comparison. Real queued cash-close/payment regression and aggregate finance tests. | No / No |
| A04 | P1 client integrity; core write/public resolver | Duplicate search outside transaction or without shared cross-unit identity lock; client-area races. | Shared identity lock and transactional recheck, global links and client/day lock; concurrent three-unit creation converges. Public ambiguous identity denied; unauthenticated dossier enrichment removed. | No / No |
| A05 | P1 stock | Gate bypass, unbound replay payload/location and unserialized operations/status transitions. | Permission-before-gate checks, fingerprints, shared operation/transfer locks; concurrent purchase/inventory/send/receive and invalid replay tests. Historic replay without fingerprint fails closed for review. | No / No |
| A06 | P1 booking/resources/public | Direct public past/off-grid input and changed-payload replay accepted; configured shared resources bypassed. | Grid/past/date checks, public fingerprint, serialized physical capacity and resource-aware slots; one-station concurrent public race has one winner. Internal configured-resource validation retained from branch advancement; unconfigured convention retained. | No / No |
| A07 | P1 permissions; client history | Global clients.read exposed other-unit commands/payments. | Global treatment history retained; financial command projection filtered by authorized finance.read units. Real restricted dossier regression. | No / No |
| A08 | P1 validation; command DTO | Nested negative price/commission or unrecognized fields accepted. | Typed nested validation and bounds; invalid payload rejected before writes. Behavior/HTTP 400 regression. | No / No |
| A09 | P2 stock reads | GET paths lazily upserted locations, sometimes before location denial. | Read paths no longer initialize data; initialization only in authorized gated mutations. NON-BLOCKING; fixed. | No / No |
| A10 | P2 reports | UTC timestamp day filter disagreed with unit local business date. | Unit timezone midnight boundaries; Sao Paulo range regression. NON-BLOCKING; fixed. | No / No |
| A11 | P1 correction consequence; empty-state stock | Removing GET initialization left purchase destination selector empty after first product. | Canonical locations initialized in the authorized product transaction; PostgreSQL assertion and real Chromium purchase flow. | No / No |
| A12 | P3 UI text | Existing mojibake in some Portuguese auth errors. | Deferred cosmetic normalization. NON-BLOCKING: no authorization/persistence/operation failure. | No / No |

P0 identified/remaining: 0/0. P1 remaining: 0 after final green validation. P2 remaining: 0. P3 remaining: A12, NON-BLOCKING.

## Commits and validation

- `2e4c85b...`: concurrent branch correction pack, preserved.
- `6e89abb057a564f0cb5bf6879a0ac4efc655cca0`: reconciled integrity/concurrency/security and PostgreSQL regressions.
- `9ceb5294e90aba1586c51d66f48d767a6b91ce90`: empty-state stock initialization on authorized writes.
- `e24a87fa0783c09fc465309675f25077c72c8111`: valid active recipients/snapshot and realistic resource substitution fixture.
- `d4c42cd7ebf27aa1a33fec44fd4cdae9c183a84b`: stock GET side-effect assertion and authorized initialization order.
- `78a7e4758710bb855e4fdcf5324f34621612cc73`: concurrent documentary consolidation, preserved.
- `ae2f478b6925ff4b4251aea72b7ff6daae4cafd0`: validate/authorize resolved stock locations before unit gate, with reproduced negative regression.
- `c286db5e29c2a94adfbe9176171bc8ddee626686`: future public-booking fixture, explicit past/off-grid denial and canonical seconds positive case.
- `4f7b4a3...`: concurrent documentary regression reconciliation, preserved.
- `35d9c0893b3f66a09a0516e8b6b8327890a8b2f3`: recoverable checkpoint preserved in the handoff.
- Report consolidation: containing commit, documentation only.

Local build/typecheck, npm test, nine new behavior cases, frontend bridge/retry contracts, migration manifest and diff checks passed. Four supplemental negative/race behavior tests failed against original code and passed after fixes. Local PostgreSQL was unavailable; actual isolated PostgreSQL GitHub CI is the integration evidence, not a claimed local result.

Regression first failures were treated at their causes: resource-lock string contract adjusted to the equivalent new expression; the waitlist fixture expecting substitution on an already occupied sole workstation received a second compatible workstation. It now tests professional substitution in a physically possible fixture; independent one-station tests still require denial. The stock browser failure led to A11, not an increased retry or hidden API shortcut. The stock integration then exposed invalid-location gate precedence (503 instead of 404); a fifth supplemental behavior test reproduced it and passed after resolving/authorizing location before gate evaluation. Public booking integration fixtures were moved from already-past October 6 to a dynamically future Tuesday; assertions now reject off-grid seconds and separately accept canonical :00 seconds, retaining persistence/race/global-history/audit assertions.

Validated candidate CI: V98 Backend CI #613, [37862802791](https://github.com/pietroboschi-del/imperio-das-unhas/actions/runs/37862802791), SUCCESS on `c286db5e29c2a94adfbe9176171bc8ddee626686`, including aggregate Chromium.
Final code real Chromium: isolated browser #59, [37862176632](https://github.com/pietroboschi-del/imperio-das-unhas/actions/runs/37862176632), SUCCESS on `ae2f478b6925ff4b4251aea72b7ff6daae4cafd0`. Later changes before consolidation are tests/documentation only.
Final containing-document HEAD also requires terminal SUCCESS for Backend CI and Browser; exact IDs/status are recorded in the delivery. Aggregate gates include auth/security/permissions, readiness/configuration, writes/global client/history/agenda/public/BookingItem, command/payment/cash/stock/reports, WA1–WA5, migration parity/checksum/preflight/rehearsal, build/typecheck/container and real Chromium.

## Migration and backup

CONFIRMED repository baseline 13, target 22, delta nine. Historical migrations unchanged; no new migration. Preflight is read-only, computes local SHA-256, compares ledger checksums and distinguishes unknown/missing/pending/incomplete/rolled-back/mismatch. Exact expected pre-upgrade pending set is required; post-upgrade must show all expected 22 and no anomalous entries.

Synthetic 13→representative data→pg_dump -Fc→list→restore→22→Prisma/readiness/backend boot/health rehearsal is in aggregate CI. It does not replace a rehearsal on a clone restored from the fresh production backup.

VALID HISTORICAL BACKUP — CONFIRMED: Production Logical Backup #7, run `37736120838`, SUCCESS, 2026-10-08 06:10 UTC (03:10 Sao Paulo). Artifact `11530959676`, `imperio-logical-backup-2026-10-08T03-10-10`, 2,653,961 bytes, not expired at inspection. Artifact ZIP SHA-256: `9044c0a77c40e595614aa94b1b9759cf1edcfda5d679a7b108b4af87dadc6170`. This digest is the encrypted artifact ZIP digest, not the raw dump hash.

Workflow/log evidence confirms PGDMP/list validation, raw dump hash in encrypted manifest, age encryption, isolated PostgreSQL restore, 34 public tables, 13 applied migrations/zero unresolved and temporary container cleanup. Historical restored snapshot counts: Unit 3, User 2, Client 0, Service 30, Professional 0, Booking 0. These are backup-snapshot observations, not a current live SQL query. Run `37779134059` cited in an earlier handoff could not be retrieved (404); the verified run above is authoritative. No backup was triggered by this execution.

FRESH CUTOVER BACKUP REQUIRED: YES.

## Live read-only state

| Item | Classification | Observation |
|---|---|---|
| Target | CONFIRMED | Official branch; final SHA in delivery, code SHA above. |
| Live backend | CONFIRMED | `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`, deployment SUCCESS. |
| Live frontend | CONFIRMED | `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`, deployment SUCCESS. |
| Postgres | CONFIRMED control-plane / INFERRED SQL availability | PostgreSQL18 service deployment SUCCESS, mounted volume; no direct SQL query. |
| Public health | CONFIRMED | ok:true, release V98b. |
| Effective operational flags | CONFIRMED public health | operationalWritesEnabled=true; units centro,big,shopping-contagem. No flag change. |
| Live migration ledger/checksums/counts | NOT VERIFIED | No legitimate read-only SQL channel available; no secret requested. |
| WhatsApp effective flags/provider | NOT VERIFIED | No activation, webhook or real message attempted. |
| Railway staged changes | CONFIRMED | None in dedicated diff and inventory. |
| Historical backup | CONFIRMED | Verified run/artifact/restore evidence above; fresh backup still required. |

Authenticated production GET was avoided: SessionGuard can update lastSeenAt, and GET is not automatically side-effect-free. Read-only actions were connector inventory/deployments/staged diff and unauthenticated health. No deploy, live migration/SQL write, variable/flag change, client import, synthetic production data or provider operation occurred.

## WhatsApp, dependencies and owner gate

WA1–WA5 source and regression gates are retained. Ambiguous provider result or stale SENDING goes to RECONCILIATION_REQUIRED/quarantine, without automatic retry; terminal FAILED without retry date stays terminal. Manual reconciliation is privileged/audited/idempotent; inbound providerMessageId deduplication/concurrency is covered. No WA6 added. Actual provider behavior and effective live WhatsApp flags remain NOT VERIFIED and separate from this release.

External cutover prerequisites: authorized live ledger/checksum/flags observation, fresh validated backup, restored-live-data clone migration rehearsal and final deployment/smoke. Actual WhatsApp certification is a separate future scope. Real client import/export reconciliation is optional and requires its own data decision; empty commercial data does not block software readiness.

OWNER DECISIONS REQUIRED: explicit production-cutover authorization; desired effective operational flags at cutover; real import/data strategy only if an import is requested. No indispensable new business rule, architecture or destructive migration decision remains for this correction pack.

## Ready cutover / abort / rollback plan

1. Freeze/revalidate exact target SHA and green CI/browser.
2. Fresh production logical backup.
3. Validate PGDMP, raw SHA-256, encrypted artifact/hash and pg_restore --list.
4. Restore into an isolated database and validate.
5. Run target migration rehearsal on the restored-live-data clone.
6. Read final live ledger/checksums; require exact expected state.
7. Apply only expected migrations after explicit authorization.
8. Validate post-ledger/checksums (target22, no anomalies).
9. Deploy backend target.
10. Health/API smoke.
11. Deploy frontend target.
12. UI login/owner-configuration smoke.
13. Centro/Big/Shopping Contagem smoke.
14. Global client/dossier identity smoke.
15. Authorized cross-unit agenda/public booking smoke.
16. Cash/stock permission segregation and side-effect-free denial smoke.
17. Monitor health/errors/financial-stock coherence.

Abort for invalid backup, list/restore failure, checksum mismatch, unexpected/incomplete migration, migration failure, backend boot/health/frontend failure, duplicated client or permission segregation failure. Code rollback: redeploy previously recorded backend/frontend SHAs after schema compatibility validation. Database: forward-only, no migrate-down. Restore/contingency only under the validated plan and explicit authorization.

PRODUCTION MUTATIONS: NONE.

Software release verification closed after measured green candidate CI/browser. No known P0/P1 blocker remains. Final containing-document workflows and post-consolidation read-only refresh are verified in the accompanying delivery before the final verdict.
