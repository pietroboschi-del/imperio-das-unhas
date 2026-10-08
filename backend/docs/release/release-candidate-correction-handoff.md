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

## CHECKPOINT 3 — IN PROGRESS / REAL BROWSER REQUIRED
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


## SUBCHECKPOINT 3A — COMPLETE (2026-10-08)
- Real Chromium via Python Playwright already installed in CI. Harness `backend/test/three-unit-ui-e2e.py`, npm script `test:three-unit-ui-e2e`; GitHub Actions step after isolated Prisma/admin setup.
- Browser actually navigated to `http://127.0.0.1:3101/index.html`, frontend title `Império das Unhas — V97 Read-through Controlado`, visible public booking and `Área da equipe` controls. CI #539, run 37790254402, exact HEAD fe9faa6d75cb8250338e0c4efc9caf4e9e1ad20c: SUCCESS.
- Runtime guards refuse non-loopback/non-`imperio_ci` database; services start in isolated CI, terminated on exit. WA flags OFF, no real external APIs, no live writes.
- **This proves only harness and page rendering, not authenticated admin/business journeys.** Do not mistake static/page smoke for Checkpoint 3 completion.
- LAST_COMPLETED_SUBCHECKPOINT: 3A
- CURRENT_HEAD: fe9faa6d75cb8250338e0c4efc9caf4e9e1ad20c (prior to this ledger commit).
- NEXT_SUBCHECKPOINT: 3B — browser-click `Área da equipe`, authenticate real CI admin through visible form and then inspect admin configuration screens; no cookie injection or direct API bootstrap for UI actions.
- NEXT_EXACT_TASK: Extend Playwright script with real login flow and durable post-login rendered assertions; run in CI, fix only observed failure, update this ledger after green.
- DO_NOT_REPEAT: Checkpoints 1 and 2, 3A browser harness/environment, all WA1–WA5 implementation.


## CONTROLLED STOP — CHECKPOINT 3B (2026-10-08)
- CURRENT_HEAD (before this handoff commit): 8448057789d97c4eede160fb0bb6010cf048e54f
- LAST_COMPLETED_SUBCHECKPOINT: 3A — COMPLETE (real Chromium frontend/backend isolated, CI #539 SUCCESS).
- CURRENT_SUBCHECKPOINT_STATUS: 3B PARTIAL / BLOCKED. Authenticated networkAdmin through real browser, three canonical unit options and actual switching now pass. Professional configuration screen save/reload not verified.
- COMMITS: 86d1020 (headless browser harness), 20c26ef (npm script), fe9faa6 (main CI), d356af1 (3A handoff), ac307fe (login form), 1607fa9 (login action), 6b528ca (routing diagnostic), 7e2dbf3 (fast browser workflow), 7c4aa31 (request diagnostic), 6894746 and a228021 (isolated official central host and network isolation), fdb3ba5 (bridge diagnostic), 74174f0 (frontend CI trigger), e983ecf (networkAdmin without legacy user), 1d1be84 (canonical selector navigation test), 3b4026c (move main UI test after other integration gates), 56b2f79 and ec47c01 (selection diagnostic), 8448057 (central unit selector fix).
- FILES_CHANGED: index.html; backend/test/three-unit-ui-e2e.py; backend/package.json; .github/workflows/backend-ci.yml; .github/workflows/three-unit-browser-e2e.yml; this handoff.
- TESTS_PASSED: V98 Backend CI #539 SUCCESS on fe9faa6; browser isolated #7 SUCCESS on e983ecf verified authenticated central admin; targeted browser #11 on 8448057 explicitly passed login and all three unit selector switches (u1 Big, u2 Shopping Contagem, u3 Centro) before its next failing assertion.
- CI_STATUS: targeted Three-unit browser E2E #11, run 37795385134, FAILURE at first professional UI navigation assertion (not the unit selector). V98 Backend CI #555 for 8448057 was running at stop, must check before next change. No green full aggregate CI on final code HEAD claimed.
- FINDINGS: localhost activates legacy login, isolated .test domain activates central route; central networkAdmin lacking legacy local record was rejected despite successful API login; legacy unit picker would empty canonical choices on change; both minimal bridges fixed and browser-proven.
- FIXES_APPLIED: allow authenticated networkAdmin without local legacy mapping (do not relax non-admin rule); restore canonical unit choices after legacy selector change handler, retaining selection; isolated Chromium CI with no production network and synthetic CI database.
- KNOWN_BLOCKERS: after clicking real 'Profissionais' navigation, assertion 'Professionals configuration is not navigable' fails because '+ Nova profissional' button is not visible. Determine whether async load or UI/permission bridge failure, fix minimally, then verify actual professional creation and persistence. All other substantive Checkpoint 3 flows unverified.
- REMAINING_SUBCHECKPOINTS: 3B incomplete; 3C, 3D, 3E, 3F, 3G NOT STARTED. Checkpoint 4 not started, P2 inputs not re-audited.
- NEXT_SUBCHECKPOINT: 3B ONLY.
- NEXT_EXACT_TASK: verify latest branch HEAD and related full CI; examine Playwright #11 log/screenshot after clicking Profissionais; diagnose visible page/route/permissions; correct only confirmed UI bridge; run fast browser CI and main CI; then save checkpoint handoff. Do not broaden into 3C until 3B has functional evidence and green CI.
- DO_NOT_REPEAT: Checkpoints 1 and 2, 3A harness, WA1–WA5 foundations, original conceptual audit, baseline manifest/migration work.
- PRODUCTION_MUTATIONS: NONE. Live ledger/checksums/flags/backup NOT VERIFIED.

## CHECKPOINT 3B RECOVERY PROGRESS — PERMISSION BRIDGE FIX READY FOR CI (2026-10-08)
- CURRENT_HEAD (before this progress commit): e89dbfc81c526fa4f81fce6718b5f6ad68016836.
- LAST_COMPLETED_SUBCHECKPOINT: 3A — COMPLETE. 3B remains IN PROGRESS until isolated browser CI proves create/edit/reload persistence.
- CI_READ: V98 Backend CI #556, run 37795693600, HEAD e89dbfc81c526fa4f81fce6718b5f6ad68016836, completed FAILURE at step `Three-unit real Chromium UI bootstrap`. Three-unit browser E2E #11, run 37795385134, HEAD 8448057789d97c4eede160fb0bb6010cf048e54f, completed FAILURE at `Real browser scenario`.
- FINDING: the real root cause for missing `+ Nova profissional` is the V67 legacy permission guard. Browser login allowed backend-authenticated central `networkAdmin` without a local legacy user record, but `window.__imperioV63.currentUser()` stayed null; V67 `setPage('pros')` denied navigation before `renderPros()` could render the button.
- FIX: `index.html` now projects only an authenticated central `networkAdmin` principal from `sessionStorage['imperio-v99-central-principal']` into a synthetic active admin user for the V67 guard. Non-network-admin central users are not promoted.
- TESTS: red/green contract added to `backend/test/v99-frontend-central-bridge.contract.mjs`; local targeted commands passed:
  - `node test/v99-frontend-central-bridge.contract.mjs` → PASS, 89 checks.
  - `npm run test:frontend-central-bridge` → PASS.
  - `node test/v99-professional-units-schedule-ui.contract.mjs` → PASS, 19 checks.
  - `python3 -m py_compile backend/test/three-unit-ui-e2e.py` → PASS.
- E2E CHANGE: `backend/test/three-unit-ui-e2e.py` now continues beyond button visibility and exercises 3B UI paths in the isolated browser: category creation, service creation with category/price/duration/online publication, professional creation with three-unit links, schedule rows, service eligibility, edit/reload persistence, workstation creation and reload persistence.
- FILES_CHANGED: `index.html`; `backend/test/v99-frontend-central-bridge.contract.mjs`; `backend/test/three-unit-ui-e2e.py`; this handoff.
- NEXT_SUBCHECKPOINT: 3B.
- NEXT_EXACT_TASK: commit and push this recovery progress, wait for `Three-unit browser E2E (isolated)` and main `V98 Backend CI`; if the first real browser failure is in the newly expanded 3B flow, inspect the failure log/screenshot and correct only that confirmed UI/bridge issue. Do not start 3C until 3B browser CI is green.
- DO_NOT_REPEAT: login proof, session proof, three-unit selector proof, canonical IDs proof, and the V67 `networkAdmin` permission root-cause diagnosis.
- PRODUCTION_MUTATIONS: NONE.

## CHECKPOINT 3B CI #12 FOLLOW-UP — SETTINGS ROUTE FOR STRUCTURAL UI (2026-10-08)
- REMOTE_HEAD_TESTED: 91b06d71d2fc6ef3b24674e30654ea2838414257.
- CI_RESULT: Three-unit browser E2E #12, run 37797951526, FAILURE at `Real browser scenario`.
- EVIDENCE: browser #12 proved the V67 central `networkAdmin` permission bridge fixed the original blocker: `+ Nova profissional` became visible and the professional modal rendered `#pfName`, unit checkboxes for Centro/Big/Shopping Contagem, schedule/services tabs and `Salvar profissional`.
- FIRST_NEW_FAILURE: test attempted to click a `Categorias` button from the Serviços page; CI timed out because that shortcut was not rendered there in this state. This is a test route issue, not the original professional-navigation blocker.
- FIX: browser E2E now reaches structural category and workstation screens through the existing real UI route `Configurações` → `Categorias de Serviços` / `Estações de trabalho`, keeping category/workstation creation as browser actions.
- NEXT_EXACT_TASK: push this E2E route correction on top of remote HEAD 91b06d71d2fc6ef3b24674e30654ea2838414257; rerun browser #13 and inspect the first remaining real failure.
- PRODUCTION_MUTATIONS: NONE.

## CHECKPOINT 3B CI #13 FOLLOW-UP — CENTRAL SERVICES RERENDER FIX (2026-10-08)
- REMOTE_HEAD_TESTED: eba018ed838dd8b2121d514aa8f27d5230b2943f.
- CI_RESULT: Three-unit browser E2E #13, run 37798358994, FAILURE at `Real browser scenario`.
- EVIDENCE: #13 again proved `+ Nova profissional` and modal render work. Failure occurred before data creation while trying to reach structural categories.
- FIRST_NEW_FAILURE: after central services async refresh, the central wrapper called the legacy services renderer directly. That bypassed the later V99 structural wrapper and removed/not-added the `Categorias` and `Estações` shortcuts.
- FIX: central service refresh callback now re-applies `window.__imperioStructuralCentral.patchServiceStructuralActions()` after async `legacyRenderServices()`. Contract added in `v99-frontend-central-bridge.contract.mjs`; E2E returns to the direct Serviços → Categorias/Estações route.
- TESTS: `node test/v99-frontend-central-bridge.contract.mjs` was red before the fix.
- NEXT_EXACT_TASK: run targeted contracts/py compile, publish on top of remote eba018ed838dd8b2121d514aa8f27d5230b2943f, then wait for browser #14.
- PRODUCTION_MUTATIONS: NONE.
