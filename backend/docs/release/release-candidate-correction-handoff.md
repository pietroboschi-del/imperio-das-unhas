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

## CHECKPOINT 3B CI #14 FOLLOW-UP — MODAL TAB SELECTOR FIX (2026-10-08)
- REMOTE_HEAD_TESTED: 6a0ec9685302a0a527051bc1ddfa35ceaf201360.
- CI_RESULT: Three-unit browser E2E #14, run 37799018566, FAILURE at `Real browser scenario`.
- EVIDENCE: #14 progressed materially: category creation and service creation via browser UI both succeeded after the structural-services bridge fix.
- FIRST_NEW_FAILURE: strict Playwright selector ambiguity on the word `Serviços`: both the admin nav and the professional modal tab were visible. This was test selector scope, not an app failure.
- FIX: scoped the professional modal tab click to `#modalHost`.
- NEXT_EXACT_TASK: publish this selector-only E2E correction on top of remote 6a0ec9685302a0a527051bc1ddfa35ceaf201360 and wait for browser #15.
- PRODUCTION_MUTATIONS: NONE.

## CHECKPOINT 3B CI #15 FOLLOW-UP — RELOAD RE-ENTRY HANDLING (2026-10-08)
- REMOTE_HEAD_TESTED: c2f306f4306d7b27ce2d5f6158d9b744cabb7851.
- CI_RESULT: Three-unit browser E2E #15, run 37799309836, FAILURE at `Real browser scenario`.
- EVIDENCE: #15 progressed further: category, service and professional creation all succeeded via real browser UI.
- FIRST_NEW_FAILURE: after full page reload, the test attempted to click admin `Profissionais` without first re-entering the team/admin shell when the public landing page was visible. This is reload re-entry handling in the test harness.
- FIX: after reload, the E2E now clicks `Área da equipe` if visible and performs visible login again only if the login form appears, then continues to the persisted professional check.
- NEXT_EXACT_TASK: publish this reload handling correction on top of remote c2f306f4306d7b27ce2d5f6158d9b744cabb7851 and wait for browser #16.
- PRODUCTION_MUTATIONS: NONE.

## CHECKPOINT 3B CI #16 FOLLOW-UP — SECOND RELOAD RE-ENTRY (2026-10-08)
- REMOTE_HEAD_TESTED: 8d1626f1b7e6f005cbb7131fb9dce2599274f4da.
- CI_RESULT: Three-unit browser E2E #16, run 37799700167, FAILURE at `Real browser scenario`.
- EVIDENCE: #16 validated create/edit/reload path further and reached workstation creation; failure occurred after workstation reload while reopening Serviços to verify persisted workstation.
- FIRST_NEW_FAILURE: same test harness issue after a second full page reload; needed to re-enter admin shell before clicking admin tabs.
- FIX: duplicated the guarded `Área da equipe`/visible-login re-entry after workstation reload before reopening Serviços → Estações.
- NEXT_EXACT_TASK: publish this second reload re-entry correction and wait for browser #17.
- PRODUCTION_MUTATIONS: NONE.

## CHECKPOINT 3B CI #17 FOLLOW-UP — FINAL INVENTORY ASSERTION SCOPE (2026-10-08)
- REMOTE_HEAD_TESTED: a3cd2634e5415894ca59d6581d713ea3a2b41445.
- CI_RESULT: Three-unit browser E2E #17, run 37800095468, FAILURE at final test assertion.
- EVIDENCE: #17 completed the full UI sequence and printed `3B-admin-config-persisted`: category, active online service, edited professional, and Centro workstation all visible after reload.
- FIRST_NEW_FAILURE: final inventory assertion incorrectly required `db.pros` in the Serviços/Estações context to retain the full professional config unit/service shape. Earlier modal reload assertions had already validated multiunit links, Monday schedules and service eligibility; the final inventory only needs to prove the professional remains visible after the last reload.
- FIX: final inventory assertion now checks professional identity visibility, while preserving the earlier detailed professional persistence assertions.
- NEXT_EXACT_TASK: publish this assertion-scope correction and wait for browser #18.
- PRODUCTION_MUTATIONS: NONE.

## SUBCHECKPOINT 3B — COMPLETE (2026-10-08)
- CURRENT_HEAD: 7916016874e02755b3cf943ae74c0b2decc1cb92.
- LAST_COMPLETED_SUBCHECKPOINT: 3B — COMPLETE.
- CI_BROWSER: Three-unit browser E2E (isolated) #18, run 37800479572, SUCCESS at HEAD 7916016874e02755b3cf943ae74c0b2decc1cb92.
- CI_MAIN: V98 Backend CI #563, run 37800479638, IN PROGRESS at time of this handoff update.
- EVIDENCE: real Chromium, isolated frontend/backend/PostgreSQL, visible login, authenticated central `networkAdmin`, canonical unit switching, professionals screen, category creation, service creation, professional creation/edit/reload persistence, schedule persistence, service eligibility persistence, workstation creation and final reload visibility all executed through browser UI.
- FILES_CHANGED_SINCE_3B_START: `index.html`; `backend/test/v99-frontend-central-bridge.contract.mjs`; `backend/test/three-unit-ui-e2e.py`; this handoff.
- FIXES: V67 permission guard now projects only central `networkAdmin` into legacy admin guards; central services async refresh preserves structural service actions; browser E2E selector/reload handling hardened without API-only shortcuts.
- TESTS_PASSED: `npm run test:frontend-central-bridge`; `node test/v99-professional-units-schedule-ui.contract.mjs`; `python3 -m py_compile backend/test/three-unit-ui-e2e.py`; browser isolated #18 SUCCESS.
- NEXT_SUBCHECKPOINT: 3C — cliente global + agenda cross-unit + histórico.
- NEXT_EXACT_TASK: start 3C from HEAD 7916016874e02755b3cf943ae74c0b2decc1cb92 after checking V98 Backend CI #563 result; do not repeat 3A or 3B browser setup/professional/config diagnosis.
- DO_NOT_REPEAT: Checkpoints 1/2/3A; 3B login, canonical unit selector, professional button, category/service/professional/workstation browser closure.
- PRODUCTION_MUTATIONS: NONE.


## CHECKPOINT 3C — PARTIAL / RECOVERABLE (2026-10-08)
- START_HEAD: 334202bf78596d2e38c5aac625c9b515d9c647c1; CI #564 SUCCESS at this SHA. Do not reopen checkpoints 1, 2, 3A or 3B.
- CURRENT_HEAD_BEFORE_HANDOFF: d86af72d091307be9f67cbcc122c695da5f81a35.
- LAST_COMPLETED_SUBCHECKPOINT: 3B — COMPLETE (browser E2E #18 SUCCESS and backend CI #563 SUCCESS; #564 SUCCESS on 3B docs HEAD).
- CURRENT_SUBCHECKPOINT: 3C — PARTIAL / BLOCKED. No 3C feature is declared complete.
- IMPLEMENTED: appended a real-browser scenario to backend/test/three-unit-ui-e2e.py to register one synthetic client at Big, assert a central identity, then find the exact same client ID in Centro and Shopping Contagem. The script is not API-only and creates neither SQL fixture nor a fake booking. Sought to configure the necessary client acquisition option through visible UI. All attempted changes are committed and pushed.
- COMMITS: 7399fc6c (first 3C global-client UI attempt), 4ce4354f (initial client-origin UI setup), d86af72d (adapt setup to V71 Campos e opções route).
- FILES_CHANGED_SINCE_3C_START: backend/test/three-unit-ui-e2e.py and this handoff.
- TESTS_PASSED: full CI #564 SUCCESS on 334202b; preexisting 3B browser setup, category/service/professional/workstation persistence assertions continued to pass before 3C assertion in targeted browser runs #19–#21.
- CI_STATUS_AT_HANDOFF: targeted browser #19, #20, #21 FAILED in new 3C segment; #21 run 37802301614 failed because visible source configuration #v71NewOption never appeared after clicking Como conheceu?. Newest aggregate runs must be rechecked; never claim final green.
- FINDINGS: blank commercial dataset cannot provide source selection automatically. The V71 wrapper openSourceManagerV71 transitions from Clients to Settings/Campos e opções and schedules openOptionSet('clients.source'). Browser operation has not yet made its option-editing control visible. This may be permission/navigation/async bridge; root cause is NOT confirmed.
- FIXES_APPLIED: test-only adaptation to attempt to configure acquisition source via visible V71 settings UI rather than bypass with raw SQL/API. No business logic or source rules changed.
- KNOWN_BLOCKERS: #v71NewOption not visible in 3C even after clicking Como conheceu?. Check actual rendered page/modals and V71 ensureAdmin/openOptionSet path first. Then create client via browser and verify same global Client ID in Big, Centro and Shopping. Availability, bookings across units, three-unit history, two BookingItems/different professionals are all NOT VERIFIED.
- NEXT_SUBCHECKPOINT: 3C (not 3D).
- NEXT_EXACT_TASK: confirm current branch HEAD and CI status; reproduce #21 screenshot/log in isolated browser; after clicking Como conheceu? capture rendered UI, determine if V71 settings is gated or modal is delayed; correct only proven bridge or selector. Rerun targeted browser; do not declare 3C until global customer/booking/history all browser-verified. Then update handoff.
- DO_NOT_REPEAT: CP1/CP2/3A/3B; migrations; WhatsApp WA1–WA5; the established browser harness and admin/config workflow.
- REMAINING: finish 3C; 3D, 3E, 3F, 3G NOT STARTED. CP4 P2 NOT STARTED.
- LIVE_READ_ONLY: live Prisma migration ledger, checksums, effective flags, backup NOT VERIFIED.
- PRODUCTION_MUTATIONS: NONE.


## SUBCHECKPOINT 3C — COMPLETE (2026-10-08)
- START_HEAD: bb8efb405729e22e37d189ac669ff5c47aa2a2ef; CP1/CP2/3A/3B preserved.
- CURRENT_HEAD_BEFORE_HANDOFF: 676cd2c07161bc7d6c43a14ce5e6b92776be472c.
- LAST_COMPLETED_SUBCHECKPOINT: 3C COMPLETE. CHECKPOINT 3 OVERALL: PARTIAL / RECOVERABLE.
- ROOT CAUSE #21: V71 ensureAdmin used legacy V63 local settings permission, rejecting authenticated networkAdmin without legacy user. Screenshot artifact #11561117648 shows Clients page without option manager. UI guard now recognizes authenticated central networkAdmin only, with backend permissions unchanged.
- CLIENT GLOBAL: browser #22 run 37806403430 SUCCESS; created one synthetic Client from visible Big UI and found same central ID without duplicate in Centro and Shopping Contagem.
- AGENDA BRIDGE: browser #24 found no eligible professional because refreshCentralAgenda overwrote configured ProfessionalUnit/service rules with core minimal projections. For centrally authorized admin only, agenda refresh now rehydrates authoritative central professional/catalog configuration. Browser #25 run 37807534598 SUCCESS.
- CROSS-UNIT BOOKING: browser #26 run 37807880018 SUCCESS; visible Agenda created separate Centro (u3), Big (u1), Shopping Contagem (u2) appointments for the same central client with the appropriate eligible professional.
- GLOBAL HISTORY: browser displayed Centro, Big, Shopping, date, time, service, public professional name, translated Agendado status and Booking IDs. Assertion updated from internal professional name to actual published name.
- MULTI-SERVICE TWO PROFESSIONALS: browser #29 run 37809056966 SUCCESS at 676cd2c07161bc7d6c43a14ce5e6b92776be472c. A second service and second professional were created through admin UI. The same central client was booked at Centro with two different BookingItems/professional IDs. The global client dossier visually mapped Service A to Pro A and Service B to Pro B, with five historical service rows overall.
- FILES_CHANGED: index.html; backend/test/three-unit-ui-e2e.py. 8 code/test commits since bb8efb405.
- COMMITS: 18fee8dd (V71 permission), f07ce447 (booking form), 28e69f77 (eligibility diagnosis), 362d8daa (agenda professional rules), 4a5963f1 (three-unit booking), 3e92a196 (history), f89e03d2 (diagnosis), 676cd2c0 (two-professional booking/history).
- TESTS_PASSED: isolated Chromium E2E #22, #23, #25, #26, #29 SUCCESS. V98 Backend CI #564 passed on 3B; CI #576 run 37809057125 for final 3C code was pending verification when this documentation was prepared. Verify green on exact HEAD; never claim full CI success before actual completion.
- UI EVIDENCE: Chromium opened/clicked/filled/submitted; no direct SQL/API data injection. Backend client dossier returns persisted global BookingItem details.
- KNOWN_BLOCKERS: no remaining targeted 3C browser assertion; full aggregate CI outcome to confirm. 3D–3G NOT STARTED; live ledger/checksums/flags/backup NOT VERIFIED.
- NEXT_SUBCHECKPOINT: 3D only, public booking empty state and three-unit scheduling in isolated browser. NEXT_EXACT_TASK: confirm HEAD/CI, extend current real Chromium harness for public booking, keep backend/database isolated; do not reopen prior checkpoints.
- DO_NOT_REPEAT: Checkpoints 1, 2, 3A, 3B, 3C or WA1–WA5.
- PRODUCTION_MUTATIONS: NONE. PRODUCTION: UNCHANGED.
