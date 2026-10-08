# Final audit and correction report — 2026-10-08

Repository: pietroboschi-del/imperio-das-unhas. Branch: official-three-units-integration.
START HEAD: 4cc95ce5d4e0e1a87559d44ec151241bc8c04db7 (remote verified).
FINAL HEAD: resolve the commit containing this pack from Git; exact SHA and final workflow results are recorded in the executor's delivery. This document does not fabricate a self-referential hash.

## Evidence and coverage

The initial HEAD matches the requested candidate. GitHub API independently confirms backend #605 / 37852314527 SUCCESS, code #603 / 37850290620 SUCCESS, and isolated browser #53 / 37850290632 SUCCESS on b6f452c21583faebd260a614e1dad7634606de58. The intervening diff is documentation only. Reviewed backend #605 job/step results, not only the summary.

Primary inspection concentrated on access/session/CSRF and permission policy, activation, user assignment, global client create/update/history, internal/public booking transactions and configured resources, finance DTO/controller and central payment projection/retry, stock service/controller, release preflight and migration delta, backup workflow, messaging delivery quarantine and webhook authentication. Existing broad test/CI evidence is reused for unaffected WA1–WA5, catalog/workstation configuration, multi-service mapping, public recommendations, imports and empty-state operational journeys. This is risk-directed evidence coverage, not proof of every possible UI state or exhaustive absence of defects.

- CONFIRMED: deny-by-default backend authorization; current principal resolved from active database session/user; owner-only endpoints; unit/domain grant distinction; CSRF for authenticated mutations; hashed session/credential tokens; explicit DTO whitelist. Existing integration/browser evidence covers forged units and side-effect-free denials.
- CONFIRMED (code/tests): PostgreSQL-backed critical writes; BookingItem snapshots; company cash exclusion for direct/barter methods; stock row locks and movement uniqueness; transaction rollback of failed financial/stock writes; migration checksum read-only tooling; unknown/incomplete/rolled-back/pending distinctions.
- CONFIRMED (code): ambiguous messaging results and stale SENDING become RECONCILIATION_REQUIRED, never automatic retry; terminal FAILED with no retry date excluded; webhook shared-secret digest comparison; privileged reconciliation and inbound deduplication. Provider live behavior NOT VERIFIED.
- INFERRED until final changed-HEAD CI: corrected concurrent paths satisfy the new requirements. Existing green cannot validate changed code.
- NOT VERIFIED: live migration rows/checksums/canonical data/counts, effective production flags, actual provider, every report/UI permutation. No live SQL or authenticated production request was made. SessionGuard can update lastSeenAt during authenticated GET; stock GET previously upserted locations, so authenticated GET is not assumed side-effect-free.

## Frozen findings and corrections

No P0 was identified. No new schema or historical migration edit is needed.

| ID | Severity | Domain/component | Evidence/reproduction and impact | Required correction / regression | Migration / owner decision |
|---|---|---|---|---|---|
| FA-01 | P1 | auth/auth.service.ts | Two simultaneous activation/reset requests both passed the pre-transaction usedAt check and both changed password. Local reproduction returned two winners. | Atomic conditional token claim within password/session transaction; one concurrent winner. Local behavior and PostgreSQL security integration. | No / No |
| FA-02 | P1 | finance-write controller/DTO; index central payment bridge | DIRECT_PROFESSIONAL accepted without recipient or service line; frontend discarded professionalId and central reload did not rebuild persisted payment records. Existing product-only fixture incorrectly certified direct payment. | Validate active unit professional on an actual command service line; bind recipient into idempotency hash; persist audit recipient and cash/treasury false; send and rehydrate authoritative payment records. Integration negative/valid/replay/changed-recipient checks; browser/retry regression. Product-only stock settlement fixture uses BARTER. | No / No |
| FA-03 | P1 | finance-write controller | Snapshot mutation locked command-sync while payment locked command; cash adjustment/close/reopen used distinct locks; payment did not share close lock. Concurrent stale reads could overwrite balance/state or accept payment against closing cash. | Common command lock for sync/item/payment and common cash-session lock for adjustment/close/reopen/payment. Aggregate finance/browser integration plus transactional review. | No / No |
| FA-04 | P1 | core-write and booking-creation client resolution | Global duplicate search occurred outside create/update transaction; concurrent different-unit registrations could create two identities. Public resolver also lacked a shared identity lock. | Common database identity advisory lock around search/write in operational create/update and public/agent resolver; cross-unit concurrent integration converges to one ID. | No / No |
| FA-05 | P1 | stock service/controller | Operational stock mutations bypassed OPERATIONAL_WRITES gate; global per-domain idempotency keys could return a prior different-location result after checking only requested location; concurrent replay could race prior read. | Enforce write gates after authorization, authorize persisted replay scopes and compare request fingerprints, serialize operation and transfer lifecycle. Local disabled-gate negative test, stock integration and three-unit boundaries. | No / No |
| FA-06 | P1 | internal/public booking capacity | Internal booking and single public booking bypassed configured shared-resource capacity; independent professionals could overbook one configured workstation. Local reproduction accepted occupied sole station. | Shared resource capacity validation under physical-day advisory lock across channels; preserve existing professional-only mode where no stations are configured. Existing stricter multi-service engine remains. Local negative reproduction plus aggregate booking/browser regression. | No / No |
| FA-07 | P2 | stock reads | locations/balances/movements/transfers and location lookup upserted canonical locations during GET, including before requested-location authorization. | Remove lazy writes from read paths; initialize only after authorized gated mutation. Stock integration regression. | No / No |
| FA-08 | P3 | auth user-facing error strings | Existing mojibake in some Portuguese error messages. Does not bypass security or prevent operation. | Deferred cosmetic normalization; NON-BLOCKING. | No / No |

Production impact of all corrections: repository candidate only; no production data change. Findings FA-01..FA-07 are implemented, but closure requires successful changed-HEAD CI/browser. FA-08 remains NON-BLOCKING. Unit scopes are centro, big, shopping-contagem; central remains a technical StockLocation.

## Validation

Local: build, typecheck, npm test, frontend bridge/retry contracts, stock contract and migration manifest parity. New local behavior tests run real compiled services/controllers with fake persistence only to reproduce atomic claim/negative write/resource conditions; they are not substituted for PostgreSQL integration. Security, operational client, finance and stock integration tests are extended and run by final aggregate CI. Local PostgreSQL integration could not execute because no DATABASE_URL/server was available; one attempted stock invocation failed before DB connection. Final GitHub isolated PostgreSQL CI is the integration authority.

Final release requires V98 Backend CI SUCCESS and real Chromium/browser SUCCESS on the changed code. No readiness assertion before observing those terminal results. Existing browser harness uses real login/activation and UI operational actions; direct authenticated readback/forged-endpoint calls establish persistence/permission boundaries, not UI authoring claims. It does not establish every company-payment or transfer UI combination.

## Migrations and backup

CONFIRMED repository target 22, baseline 13, delta 9; local manifest parity green. Historical SQL unchanged; no new migration. Preflight computes local SHA-256 and compares ledger checksums read-only. Pre-upgrade exit 2 is acceptable only for exact expected nine pending plus matching baseline and empty unexpected/error collections; post-upgrade requires exit 0 and all 22. Reuse synthetic rehearsal for code, repeat fresh-restored-live-data rehearsal during authorized cutover.

Historical backup: previous pack records schedule #7 / 37736120838, artifact imperio-logical-backup-2026-10-08T03-10-10. Workflow review confirms PGDMP/list/hash, isolated PostgreSQL restore/ledger smoke, age encryption, encrypted-artifact-only upload, cleanup and failure exit. Independently verified run #7 SUCCESS and its nonexpired artifact (2,653,961 bytes): isolated restore validated 34 public tables, three units and 13 resolved migrations. Archive digest sha256:9044c0a77c40e595614aa94b1b9759cf1edcfda5d679a7b108b4af87dadc6170 is the artifact archive digest, not the plaintext dump hash. FRESH CUTOVER BACKUP REQUIRED; historical restore smoke is not a substitute.

## Live read-only preflight and authorization gate

Railway health: backend/frontend/Postgres online, one running replica each, no issues/recent failures in returned window. Backend live SHA 920d74cbb5856ab3bdb1c63c1c0c762c82346cba; frontend a5e43d114dd34cac2231a96cbc3d5d46f0d44f59 (deployment metadata confirmed). Dedicated staged-diff says no staged changes; health still lists old empty patch 1ea95b42-13df-4157-9bef-f32aa8da695b, inferred stale entry. Backend source references official branch, but live remains older SHA; do not assume a push deploys or certifies production.

LIVE MIGRATION LEDGER / effective operational flags / effective WhatsApp flags: NOT VERIFIED. Connector exposes variable names, not effective values. No secrets requested or database access created. Policy: WhatsApp remains OFF; real provider activation, webhook and messages excluded.

External dependencies: authorized live ledger/flags observation; fresh validated backup and restored-data clone rehearsal; final client export/reconciliation decision where importing is desired; separately gated WhatsApp provider certification. Empty commercial tables do not prevent software readiness.

Owner decisions: explicit future production mutation authorization; approve real import/data strategy where applicable; decide effective operational flags at cutover. No new business rule, architecture or destructive migration decision is required for these code corrections.

Cutover sequence: freeze/revalidate target and CI → fresh production backup → PGDMP/hash/list → isolated restore → migrate restored-live-data clone → final live ledger/checksums → apply exactly expected migrations → validate post-ledger → backend deploy/health/API smoke → frontend deploy/UI smoke → Centro/Big/Shopping smoke → global client/history/cross-unit agenda → cash/stock segregation → monitoring. Existing cutover-runbook.md and rollback-matrix.md remain authoritative detailed procedures.

Abort on invalid backup/restore, mismatched or unexpected/incomplete migrations, migration/boot/health/frontend failure, duplicated client or permission segregation failure. Code rollback: previous backend/frontend SHAs only after schema compatibility validation. Database forward-only; no migrate-down. Restore/contingency needs explicit authorization and validated backup.

PRODUCTION MUTATIONS: NONE.

## Supplemental audit and correction pack

Concurrent branch advancement `2e4c85bfb4058cade41e64fd74c5b831ec747043` was preserved. Supplemental finding IDs below use S- to distinguish the prior pack.

# Final audit and correction — 2026-10-08

START HEAD: `4cc95ce5d4e0e1a87559d44ec151241bc8c04db7`.
Branch: `official-three-units-integration`. Production mutations: NONE.

## Frozen findings (before implementation)

All entries below are CONFIRMED by source review; boundary regressions additionally reproduced S-01/02/04/05 locally against the unmodified compiled backend. No historical migration changes or new migrations are required for these corrections. All fixes use already defined rules and need no commercial/architecture decision.

| ID | Severity/domain | Evidence and reproduction | Impact / required correction / required regression | Production impact |
|---|---|---|---|---|
| S-01 | P1 auth | `auth.service.ts`: credential token checked before Argon2/transaction, then unconditional update. Two simultaneous activation/reset calls both succeed. | Atomic token claim inside transaction before password write; concurrent consumption must yield one success, one denial, one password change. | Code after authorized deploy only. |
| S-02 | P1 finance | `finance-write.controller.ts` accepts DIRECT_PROFESSIONAL without recipient; DTO and payment hash omit recipient. Stock test incorrectly uses direct payment on product-only command. | Enforce persisted service-line recipient, include in payment/audit/idempotency; invalid recipient produces no writes, replay preserves recipient and flags. | No historical rewrite. |
| S-03 | P1 finance concurrency | Snapshot/payment/item operations lock different keys; cash close/adjust/reopen/payment likewise; client credits read before row lock. | Shared locks per aggregate, payment/cash close serialization, credit rows locked; concurrent structural/financial writes cannot corrupt totals or mutate a paid command. | Transaction logic only. |
| S-04 | P1 permissions | `core-read.controller.ts` history loads every client's command/payment with only clients.read. | Keep treatment history global; return financial commands only for units authorized for finance.read. Test cross-unit financial denial through dossier. | Restricted read projection. |
| S-05 | P1 stock | `stock.service.ts` writes never consult operational gate. Global operation key returns previous purchase/transfer without checking payload/location; consumption/inventory replay not serialized; transfer statuses read before locks. | Respect global/unit gates; authorize persisted replay locations, compare payload fingerprint, serialize operations and transfer lifecycle; invalid replays and closed gates have no business effects. | Code only; additive fingerprints in existing audit JSON. |
| S-06 | P1 client/agenda | Internal create checks duplicates before transaction; public resolve checks under per-professional/unit locks only. Same identity can be created in different units concurrently. Client-area collision uses no shared client lock. | Shared global identity lock across internal/public creation, duplicate recheck inside transaction; shared client/day lock for same-area booking. Concurrent requests preserve global identity. | No automatic merge of historic duplicates. |
| S-07 | P1 public booking | Public create does not require canonical grid, past-time denial or configured workstation capacity; public key replay skips payload verification. | Reject past/off-grid submissions, enforce configured resources in transaction, fingerprint public payload; race/replay regression. | Existing unconfigured-resource convention preserved; no new commercial rule. |
| S-08 | P1 input validation | `SyncCommandDto.items` is only IsArray, nested negative price/commission and extra fields accepted. | Nested DTO validation, finite/nonnegative item values, invalid body returns 400 before writes. | HTTP contract hardening. |
| S-09 | P2 reports | Operational summary applies UTC midnight to receivedAt/createdAt, although units use America/Sao_Paulo. | Use unit timezone boundaries for timestamp filtering; include 23:xx local and exclude previous day. NON-BLOCKING once fixed. | Read-only query correction. |

## Audit coverage and evidence policy

Reviewed session/access/CSRF and assignment policy, user configuration, global clients/history, BookingItem creation/update and availability, financial lifecycle, stock movements/transfers/openings, public endpoints, frontend central hydration/payment bridge, migration delta/preflight/rehearsal, backup workflow, and WhatsApp dispatch/inbound/reconciliation. Reused unchanged green integration/browser evidence only where source and assertions support the stated claim. CI #605 and #603 SUCCESS; isolated Chromium #53 SUCCESS on `b6f452c...`; subsequent commits before START are documentation only.

Test limits: browser #53 does not certify company cash payment UI or transfer UI; existing integration tests exercise those server lifecycles. Stock integration uses injected synthetic sessions as a service authorization test, not as proof of UI login. Public and admin browser data are created via visible UI. Canonical config JSON persisted in PostgreSQL is compatibility storage, not browser authority. Reports can expose cached UI projections during asynchronous hydration; backend remains authorization boundary.

Internal force-fit continues to bypass professional occupancy; configured workstation capacity is enforced independently. No-configured-workstation mode remains professional-only. No WhatsApp provider activation, new WA gate, customer import, live write, deployment or flag change is authorized.

## Final evidence

Final evidence is recorded below; chronological findings and provisional claims above are superseded by the measured final closure.


### Consolidation and regression follow-up

Preserved remote commits 2e4c85b (initial corrections), 6e89abb (supplemental integrity pack), 9ceb529 (authorized product creation initializes locations), e24a87f (active recipient snapshot and realistic WA resource fixture). No reset/rebase/force push. An unpublished local merge was superseded by the equivalent/stronger remote implementation; no startup stock write was published.

Backend #609 / 37861068997 passed new PostgreSQL regressions, WA1–WA5, auth/config/readiness, migration checksum/parity and 13→22 rehearsal, then exposed an obsolete stock assertion: GET was expected to initialize rows. Corrected the stock integration to prove GET has no persistence effect, then prove authorized product creation provides all four stock locations. The four-location/canonical-unit assertions remain. Chromium #57 / 37861068970 SUCCESS on e24a87fa0783c09fc465309675f25077c72c8111; log independently checked UI configuration, global client, booking, direct recipient, persisted reload, cash exclusion, stock and denied writes. This corrective pack changes test/documentation only; final terminal backend/browser evidence and the exact containing HEAD are recorded in the final delivery.

Remaining implemented findings: FA-01..FA-07 and S-01..S-09 closed in code subject to final aggregate success. P0 known: 0. P1 known outstanding code corrections: 0. P2 outstanding: 0. FA-08 is the single deferred P3 (NON-BLOCKING message encoding). S findings overlap FA findings and must not be double-counted as distinct defects. No migration required for any finding; no new owner business decision required.

Final read-only refresh: same backend/frontend deployments and SHAs; Postgres online; all three services 1/1 running, zero issues/recent failures. Dedicated staged diff empty; health's old zero-change patch remains INFERRED stale. Live ledger, live canonical counts and effective flags NOT VERIFIED. Historical backup independently confirmed; fresh validated production backup remains required. WhatsApp code gates validated with real provider excluded; effective live OFF state is not asserted.

Owner gate: authorize future production cutover only after freeze of the delivered target, fresh backup/restore/rehearsal, exact live ledger/checksum and effective flag validation. These are execution prerequisites, not fabricated live evidence. Follow the cutover/abort/rollback sequence above. PRODUCTION MUTATIONS: NONE.
