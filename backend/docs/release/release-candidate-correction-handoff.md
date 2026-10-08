# Release candidate correction pack — recoverable handoff (2026-10-08)

## Baseline
Repository pietroboschi-del/imperio-das-unhas, branch official-three-units-integration.
Start HEAD 9bf7d45db2bb03e75520b2ea1b32d7df0f4e9891; prior CI #525 FAILED at Static and projector tests because release-hardening asserted a stale 13-to-21 label.

## LAST_COMPLETED_CHECKPOINT
2 — COMPLETE (exact manifest and real checksum preflight).

## VERIFIED GREEN CI
V98 Backend CI #535, run 37786601733, HEAD e63b42161788198f516c5660486d724b6b1d3a3c: SUCCESS. Includes Build, Typecheck, WA1–WA5, Release hardening contracts, Release migration checksum preflight isolated CI, Release migration manifest parity, Synthetic 13-to-22 migration rehearsal, other central security/operational tests.

## CHECKPOINT 1 COMPLETE
- Manifest and runbook: baseline 13, target 22, delta 9; includes 20261008_wa2_outbox_reconciliation_required.
- CI display name changed 13-to-22.
- v99-release-hardening.contract updated; new test v99-release-migration-manifest.contract checks exactly directories versus manifest and rehearsal constant. CI #527 SUCCESS, run 37785014126, HEAD d710bac519e3188b712f12265055ba36a9fcac16.

## CHECKPOINT 2 COMPLETE
- backend/tools/release-preflight.mjs now computes SHA-256 of raw migration.sql bytes and compares with Prisma _prisma_migrations.checksum. Failed/unknown/incomplete/rolled-back/pending rows remain gate failures, now also missing local migration.sql, missing database checksum, checksum mismatch.
- No runtime SQL mutation was added. Observed Prisma SHA-256 equality against CI-applied migrations; local SQL tampering, CI ledger checksum mismatch/missing and unknown/pending names tested by backend/test/v99-release-checksum-preflight.integration.mjs.
- CI #535 completed SUCCESS, including new checksum isolated CI gate.
- Reconciled static read-only contract: allow only the explicit Node crypto Hash.update call; still deny Prisma data writes.

## CHECKPOINT 3 — NOT STARTED / BROWSER E2E REQUIRED
- A true browser E2E on isolated backend/PostgreSQL and real frontend must demonstrate admin login, three units, UI configuration, global clients/history, cross-unit agenda, public booking and permission boundaries. Static contracts/API integration are insufficient.
- No Playwright package/configuration was found in the repository tree at this checkpoint; inspect CI's browser/runtime availability and choose a tested automation method without altering production. Do not claim UI E2E passed until tested.
- NEXT TASK: implement a real headless browser CI suite with actual navigation/action/assertions on isolated data, then fix only UI bridges actually shown broken and prove CI green.

## CHECKPOINT 4 — PENDING
- Restore original documented P2 input, if available. Do not invent new findings or reopen unrelated audits.

## LIVE READ-ONLY
Railway backend deploy reported 920d74cbb5856ab3bdb1c63c1c0c762c82346cba, frontend a5e43d114dd34cac2231a96cbc3d5d46f0d44f59 at initial check. Live _prisma_migrations, checksums, effective flags and current backup NOT VERIFIED. Never infer from CI.

## PRODUCTION MUTATIONS
NONE. No Railway mutation, no live DB connection write, no deploy, no migration or WhatsApp activation.
## VERDICT
NOT YET RELEASE CANDIDATE. Await browser E2E, remaining P2 and final CI.
