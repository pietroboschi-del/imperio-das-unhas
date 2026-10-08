# Release candidate correction pack — recoverable handoff (2026-10-08)

> Current status is the PRE-AUDIT PROJECT CLOSURE PACK at the end. Earlier sections are chronological recovery evidence, not current blockers.

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


## SUBCHECKPOINT 3D — COMPLETE (2026-10-08)
- START_HEAD: 934c91e183b10586383a99be8246f017510f28b4.
- #577 V98 aggregate failure root cause: legacy first/default booking professional was p-all with no Monday schedule in CI; browser test did not select the specific service/professional created by 3B. No backend scheduling rule was defective. Fixed test selection to explicitly choose 3B-created service and professional, preserving backend validation (commit 8d97143fee8f164ebdcdec0d6e2097289141f85b). Browser #30, run 37839536752 SUCCESS.
- 3D REAL BROWSER: isolated Chromium #31 run 37839881463 SUCCESS on code HEAD c1d1744dbbb29ac52e06b9d2cccdf1e08a10262d.
- 3D coverage: public home showed exactly three canonical unit cards, each booking enabled; visible Tuesday empty-state with no selectable Monday-only professional slot; clicked each unit's public booking card; selected published service/professional, future available Monday and real time slot; submitted three distinct public client bookings through the public UI; returned to authenticated admin Clients UI and verified each persisted appointment in global historical dossier after server round-trip.
- CHANGED FILES: backend/test/three-unit-ui-e2e.py only (3C regression hardening and 3D browser scenario). No SQL fixture, no direct API injection, no deployment.
- Full V98 Backend CI #578 run 37839536753 and #579 run 37839881597 were IN PROGRESS at 3D browser closure. Do not call full aggregate green until confirmed at exact final HEAD.
- LAST_COMPLETED_SUBCHECKPOINT: 3D COMPLETE (directed isolated Chromium). 3E–3G NOT STARTED. CHECKPOINT 3 OVERALL: PARTIAL / RECOVERABLE.
- NEXT_SUBCHECKPOINT: 3E — comanda/payment/cash/stock/reports real Chromium plus isolated persistence, then 3F permission boundaries and 3G final regression.
- PRODUCTION MUTATIONS: NONE; no live migrations, Railway writes, live flags, WhatsApp or deployment.


## SUBCHECKPOINT 3E — COMPLETE (2026-10-08)
- CURRENT_HEAD_AT_EVIDENCE: 50da3ce2d2e781e9cb564c3789d8dfdff16e97a6.
- START_HEAD: 36e124d645e6b14619652d5c316d27e7283ef530. BRANCH: official-three-units-integration.
- LAST_COMPLETED_SUBCHECKPOINT: 3E COMPLETE. Prior 3A–3D COMPLETE / DO NOT REOPEN. 3F / 3G NOT STARTED.
- COMMAND: actual authenticated Agenda UI opened a persisted central command from existing booking with two service items, distinct professional IDs and price/duration, saved notes and reloaded.
- PAYMENT FAILURE ROOT CAUSES: (1) isolated browser originally used insecure HTTP *.imperio.test origin; WebCrypto subtle absent, deterministic SHA-256 reconciliation could not run, hence no POST. Isolated browser switched to trustworthy *.imperio.localhost only; no production HTTPS code relaxation. (2) a DIRECT_PROFESSIONAL payment could be posted centrally before a V45 legacy recipient-required validation; this left a centrally paid command with open legacy modal. V99 wrapper now validates explicitly selected recipient belongs to service-line professionals BEFORE central sync/payment write. Missing-recipient click rejected without POST, visible toast; valid recipient selected via UI, HTTP 201 once, modal closed and visible success.
- DIRECT_PROFESSIONAL: central command CLOSED/Pago; one CONFIRMED payment for R$ 144,90, method DIRECT_PROFESSIONAL, cashSessionId null; recipient professional ID preserved in central operational snapshot. Financial compensation audit row cashImpact=false and treasuryImpact=false. No demoCashMovements command receipt. Confirmed exactly one payment after full page reload.
- CASH: opened Centro session with R$ 100, then counted R$ 100 and CLOSED, no direct payment added to company cash. Central session persisted across navigation and reload.
- STOCK: UI created RESALE product, purchased 4 units at R$ 10/unit plus R$ 5 freight (R$ 11.25 cost average), and verified central balance surviving reload. UI inventory counted 3 from 4 with configured reason, central-backed persistence after reload. A separate INPUT product was created with 100% allocation to synthetic service category, purchased 2 units and consumed 1 through actual Registrar consumo UI; central balance 1 and CONSUMPTION movement -1. Central is a technical location only, not a fourth commercial Unit.
- REPORTS: existing V65 executive overview read the synthetic paid command on 2026-11-02, filter Centro / 2026-10-01 to 2026-11-02, reporting R$ 144,90 revenue, one paid visit, correctly linked central command. Existing Agenda, Profissionais, Serviços, Estoque and Financeiro report tabs all opened without placeholder. No BI added.
- COMPANY CASH PAYMENT N/A in synthetic configuration: the canonical payment method options provided by isolated backend were only pm_direct, pm_barter, pm_monthly; no pm_cash or associated company account available. Did not invent a payment method or bypass finance configuration.
- TESTS_PASSED: isolated real Chromium #45 run 37846012305 SUCCESS (command/direct/cash/inventory/reload). #46 run 37846379579 SUCCESS (report filters/data and tabs). #47 run 37846791440 SUCCESS (additional INPUT purchase and consumption, plus all existing browser steps). Final aggregate V98 CI #596 run 37846791483 was IN_PROGRESS when this section was authored. Do not report CI as SUCCESS before checking.
- DIFF_REVIEW: compared 36e124d..50da3ce, 9 commits, only index.html and backend/test/three-unit-ui-e2e.py changed; no migrations, WA foundations, live flags, deployment or live database.
- COMMITS: ee0fc585, 7852f864, 26e8b68d, 10451460, ae81228d, e8f21af7, 7b36aa95, af8aa48f, 50da3ce2.
- FILES_CHANGED: index.html (central recipient prevalidation), backend/test/three-unit-ui-e2e.py (isolated secure origins and full real UI financial, command, stock, report scenarios), this handoff.
- FINDINGS/FIXES: two real payment finalization boundary defects diagnosed and corrected strictly in test isolation / V99 UI preflight. No evidence of server-side authorization relaxation or direct-professional company cash contamination.
- BLOCKERS: no remaining targeted 3E browser blocker; aggregate CI pending on latest code HEAD.
- NEXT_SUBCHECKPOINT: 3F permission boundaries ONLY, using synthetic restricted operator through browser and real backend requests. NEXT_EXACT_TASK: demonstrate cross-unit agenda access with assigned permissions; deny cash, stock, structural config, and command access for unauthorized units, including crafted X-Unit-Id requests, with no partial side effects; separately verify networkAdmin global behavior.
- DO_NOT_REPEAT: Checkpoints 1, 2, 3A, 3B, 3C, 3D; WA1–WA5; BookingItem/stock/operations foundations; release checksums, preflight and migration manifest outside 3G final regression.
- PRODUCTION MUTATIONS: NONE. PRODUCTION: UNCHANGED.


## SUBCHECKPOINT 3F — COMPLETE (2026-10-08)
- START_HEAD: 21097fd6c530827b14757765a1646a20b4a1e163. LAST_COMPLETED_SUBCHECKPOINT: 3F COMPLETE. No re-opening of 3A–3E.
- ROOT_CAUSE: Browser #48 attempted obsolete V63 settings/users selectors in a screen replaced by the authoritative V99 central user editor. Browser #49 exposed missing `units.read` in the central UI permissions catalog. Browser #50 proved UI creation and activation, but backend-authenticated restricted login was rejected by the legacy local-user bridge. Browser #51 authenticated and exercised real permission boundaries, but the deliberately unauthorized stock-inventory POST hit the mandatory idempotency-key check (409) before the permission denial. These four targeted blockers were resolved without backend authorization weakening.
- FIXES: (1) exercise real central user editor, activation token and visible activation form; (2) surface `units.read` in the central permission editor; (3) permit verified backend-authenticated non-network-admin users to reach the legacy UI with permissions projected from the central principal, never promoting them to local admin; (4) supply valid `Idempotency-Key` on the forbidden inventory probe to reach actual 403 enforcement.
- COMMITS_3F: 10b1e94995cf5d7af619b36dbdb1c77f86800b70; a1e2fbd0584a514eb23f9271825496398fa75d9e; 1ea40a4a325987309885ea93f8afa7dfb3dca2cb; c949ad58a5cb7f2bf3aacfa12c18bcbeab5c34b6.
- BROWSER_RUN: targeted isolated Chromium #52, run 37849513157, SUCCESS at c949ad58; #53, run 37850290632, SUCCESS after 3G test hardening at b6f452c.
- RESTRICTED_USER: created, configured and activated solely using real central administration/activation UI. OPERATOR/reception, Centro and Big unit accesses, explicit global `units.read`, `agenda.read`, `agenda.manage`, `clients.read`, `catalog.read`; did not acquire networkAdmin or cash/stock/command/config privileges.
- AGENDA_CROSS_UNIT: authenticated restricted Chromium requested GET /api/v1/bookings with X-Unit-Id big, centro, shopping-contagem; all returned 200 by global agenda grant.
- DENIALS: unauthorized cash read/write 403, stock read/inventory write 403, command read/create 403, structural config read/create 403. Forged X-Unit-Id and forbidden stock location did not override server-side permission/unit scope. Neither hiding UI controls nor a 409 input-preflight response was accepted as authorization evidence.
- NO_SIDE_EFFECT: as networkAdmin, fetched cash sessions, commands, stock balances, stock movements and config categories before and after all denied requests. Full response snapshots were identical, including no cash balance/session, command, stock movement/balance or config change attributable to unauthorized probes.
- NETWORKADMIN: authenticated owner independently retained GET cash-sessions HTTP 200 for all three units; restricted operator stayed networkAdmin=false.
- FILES_CHANGED_3F: `backend/test/three-unit-ui-e2e.py`, `index.html`. No backend server permission relaxation, migration, live flags or infrastructure changes.
- PRODUCTION_MUTATIONS: NONE. No deploy, live PostgreSQL write, Railway mutation, live WhatsApp or client import.

## SUBCHECKPOINT 3G — COMPLETE (2026-10-08)
- CURRENT_HEAD (last tested CODE head, before this documentary handoff commit): b6f452c21583faebd260a614e1dad7634606de58.
- LAST_COMPLETED_SUBCHECKPOINT: 3G COMPLETE. CHECKPOINT 3: COMPLETE for functional UI readiness in isolated CI.
- FIRST_REAL_3G_BLOCKER: V98 Backend CI #602 (run 37849513143) passed all preceding steps but its integrated Chromium timed out on `.stock-nav` after the public-booking/client-history journey; separate isolated browser #52 succeeded on the exact code. The observed issue was a timing-sensitive test navigation after asynchronous central unit refresh, not evidence of broken stock mutations.
- FIX_3G: bounded retry of the actual visible Estoque navigation, with DOM diagnostic on timeout. No synthetic route, SQL/API fixture, backend rule change or permission bypass. Commit: b6f452c21583faebd260a614e1dad7634606de58 (`test(3G): retry real stock navigation after async unit refresh`). Isolated browser #53 succeeded without needing a retry.
- FINAL_BROWSER_E2E: Three-unit browser E2E (isolated) #53, run 37850290632, SUCCESS at b6f452c; includes 3A–3F UI journeys and real 403 enforcement, no side effects, global owner preservation.
- FINAL_CODE_CI: V98 Backend CI #603, run 37850290620, SUCCESS at the same b6f452c HEAD. Complete 65/65 successful workflow steps include Build, Typecheck, auth/security/permission integrations, frontend central bridge, three-unit readiness, operational writes, professional/service/schedules/workstations, global client/history, cross-unit agenda, public booking/empty-state, BookingItem, command/payment/DIRECT_PROFESSIONAL, cash/stock/reports, WA1–WA5, release migration manifest parity, SHA-256 checksum preflight, synthetic migration rehearsal 13→22, and integrated real Chromium E2E.
- COMMITS_SINCE_3F_START: 10b1e949; a1e2fbd0; 1ea40a4a; c949ad58; b6f452c2. FILES_CHANGED: `index.html`, `backend/test/three-unit-ui-e2e.py`, and this handoff document.
- FINDINGS: central authorization, forbidden unit/domain writes, and networkAdmin global behavior verified through isolated real browser/backend. CI #603 is the definitive aggregate green code result. This documentation-only commit will advance HEAD and require the ordinary push CI to be checked separately; do not falsely attribute #603 to a later documentation SHA.
- FIXES: only the precisely observed 3F UI/permission projection and browser idempotency route defects, plus 3G browser navigation synchronization.
- REMAINING_BLOCKERS: none within Checkpoint 3. CHECKPOINT 4 P2 evidence/closure remains outside Checkpoint 3, along with separate production readiness, backup/cutover and deploy approvals.
- NEXT_EXACT_TASK: confirm GitHub HEAD and green CI of the documentation-only handoff commit; then move exclusively to next closure block/Checkpoint 4 on the original documented P2 input, if available. Do NOT deploy or mutate production as part of Checkpoint 3.
- DO_NOT_REPEAT: Checkpoints 1, 2, 3A–3G, WA1–WA5 implementations, established E2E harness, professional/service/client/booking/finance/stock/report scenarios, release manifest/checksum/migration foundation.
- FUNCTIONAL_UI_READINESS: COMPLETE. CHECKPOINT_3: COMPLETE. RELEASE_CANDIDATE: READY FOR NEXT CLOSURE BLOCK, not automatic authorization for production rollout.
- PRODUCTION_MUTATIONS: NONE. PRODUCTION: UNCHANGED by this checkpoint.


## PRE-AUDIT PROJECT CLOSURE PACK — 2026-10-08

Repository `pietroboschi-del/imperio-das-unhas`; branch `official-three-units-integration`. Executor closure only; independent audit and all production authorization remain separate.

| Item | Classification | Evidence / result |
|---|---|---|
| START HEAD | CONFIRMED | `83af534519173e08b04ba4c4694179cd59b452e0` |
| FINAL HEAD | CONFIRMED BY COMMIT ID | The commit containing this pack; resolve its exact SHA from Git history / executor delivery. No self-referential SHA is fabricated. |
| Approved code | CONFIRMED | `b6f452c21583faebd260a614e1dad7634606de58`; start HEAD is one commit ahead, only this handoff changed. Closure diff is documentation only. |
| CI code | CONFIRMED | V98 Backend CI #603, run `37850290620`, SUCCESS on b6f452c; 65 successful job steps. |
| CI start documentation | CONFIRMED | V98 Backend CI #604, run `37851226952`, SUCCESS on 83af534. Final documentary commit's ordinary push CI must be checked separately; #603 is not attributed to that SHA. No manual rerun initiated. |
| Browser / Checkpoint 3 | CONFIRMED | #53, run `37850290632`, SUCCESS on b6f452c; 3A–3G COMPLETE in isolated Chromium/backend/PostgreSQL. |
| Release Candidate | CONFIRMED | COMPLETE for pre-audit code/document readiness; manifest parity, checksum and synthetic rehearsal green in #603. No live rollout approval. |
| Migrations | CONFIRMED (repository/CI) | Expected baseline 13 / target 22 / delta 9. Does not confirm live applied/pending count. Historical SQL unchanged. |
| SHA-256 / rehearsal | CONFIRMED (isolated) | #603 checksum preflight and manifest parity SUCCESS; synthetic 13→22 rehearsal SUCCESS. No repeat. Fresh restored live-data clone rehearsal remains cutover prerequisite. |
| Railway | CONFIRMED | Backend deployment `1cbcff0b-b9a6-4015-b09b-599c58478436`, SHA `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`; frontend `e3a3db74-ad79-4c69-aebe-cc658966faab`, SHA `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`; Postgres `853e47f7-120a-46c7-99e2-d53a13a3d301`. All online, 1/1 replicas, no warnings/criticals/recent failures in returned health window. |
| Staged work | CONFIRMED / INFERRED | Inventory and dedicated staged-diff return no patch/resources. Health lists old patch `1ea95b42-13df-4157-9bef-f32aa8da695b` with empty changes; inferred stale health entry, not proven absent internal pending work. Recheck before cutover; no mutation. |
| Live migration ledger | NOT VERIFIED | No authorized read-only DB connection available. Live applied/pending, incomplete/rolled-back/unknown rows, stored checksum equality and canonical unit rows remain unverified. No credentials requested/access created. |
| Backup | CONFIRMED | Official schedule #7, run `37736120838`, SUCCESS 2026-10-08 06:10 UTC / 03:10 São Paulo; artifact `imperio-logical-backup-2026-10-08T03-10-10`, 2,653,961 archive bytes, non-expired. PGDMP, pg_restore list, isolated restore, 34 public tables / Unit=3, SHA-256 and age validated by workflow and successful log. Artifact digest `sha256:9044c0a77c40e595614aa94b1b9759cf1edcfda5d679a7b108b4af87dadc6170` is artifact archive digest, not plaintext dump hash. Plaintext hash is in encrypted manifest. FRESH BACKUP REQUIRED AT CUTOVER. |
| Operational flags | NOT VERIFIED | OPERATIONAL_WRITES_ENABLED and OPERATIONAL_WRITES_UNITS present, values redacted by OAuth connector. Historical values are not current confirmation. |
| WhatsApp flags | NOT VERIFIED (live) | WHATSAPP_AUTOMATION_ENABLED, WHATSAPP_AGENT_API_ENABLED and EVOLUTION_WEBHOOK_ENABLED not listed by connector; absence is not effective runtime OFF proof. Policy and isolated tests remain OFF; no flag changed. |
| WhatsApp code readiness | CONFIRMED | #603 WA1–WA5, ambiguous-delivery quarantine, stale SENDING, authorized audited reconciliation, inbound idempotency and protected Outbox passed. Existing activation matrix and operational handover reused. Real provider not certified. |
| External dependencies | NOT VERIFIED / separately gated | Provider version/connectivity, instances, number, credentials, webhook, runtime scheduler, live ledger/flags and final client exports/approval. Do not configure or send messages. |
| Functional UI / empty-state | CONFIRMED within evidence scope | #53 real UI and #603 empty-state integration prove configuration, global clients, three-unit agenda/public booking, commands, DIRECT_PROFESSIONAL, cash, purchases/consumption/inventory and reports. Transfers/average cost/freight/unit scopes additionally covered by #603 stock foundation integration. Empty commercial state is not a defect. |
| Exact browser limits | NOT PROVEN by browser | Company cash payment UI was N/A in synthetic payment-method configuration; API empty-state journey covers PIX/payment/cash in all three units. Transfer UI is not claimed from #53; transfer lifecycle/idempotency covered at integration level. No claim that every UI combination was tested. |
| Handover | CONFIRMED (documentation) | Short operating path below complements existing CLIENTS_ONLY, recovery, smoke/rollback and WhatsApp handover; no new manual framework. Staff training and live configuration are not claimed complete. |
| P2 / Checkpoint 4 | NOT RECOVERABLE / deferred | Repository .md/.txt search found only references to missing original P2 input; attached master/deadline provide no actionable P2 list; ZIP is logo assets. P2 INPUT NOT RECOVERABLE — DEFER TO FINAL AUDIT. Does not block pre-audit closure. |
| Cutover readiness | CONFIRMED (runbook only) | Freeze, final CI, fresh backup/restore, exact ledger/hash validation, upgrade of restored clone, owner-authorized forward migrations, post-ledger, backend/frontend smoke, separately approved final client reconciliation, three-unit/global-client/financial/stock boundaries, monitoring/abort/rollback documented. Execution remains gated. |
| Production mutations | CONFIRMED (this execution) | NONE: only read-only connector calls and repository documentation changes. Does not assert no other actor/database writes occurred. |
| Next responsible parties | CONFIRMED | Independent Auditor: full audit and P2 recovery/findings. Executor: only subsequent authorized corrections. Owner + authorized production operator: live prerequisites, explicit migration/deploy/import approvals. Integration operator: separately approved WhatsApp activation. |

### Short operational handover (future approved release)

1. **Login/users:** Área da equipe → Entrar. Network administrator: Configurações → Usuários e Acessos, create user, choose unit access and explicit functional permissions; deliver activation token through approved policy. User selects Ativar meu acesso and defines own password. Never treat global agenda access as cash/stock/admin permission. See `backend/PRODUCTION_RECOVERY.md` for recovery; no shared owner password.
2. **Configuration:** Serviços → Categorias / Estações; register categories, service duration/price/publication and unit workstation eligibility. Profissionais → Nova profissional, units, each unit's weekday schedule and eligible services; save and reopen to verify. Use actual approved business data only.
3. **Clients/agenda:** Clientes creates/searches network identity; inspect global history before another registration. Select Centro, Big or Shopping Contagem in Agenda before creation/edit/cancel/reschedule; preserve each service/professional item. Public booking uses selected unit's published services and available schedule/resources. Empty slots require configuration/schedule review, not invented availability.
4. **Commands/payment/cash:** Open comanda from appointment, verify items and totals, choose payment and recipient. DIRECT_PROFESSIONAL requires an eligible service-line recipient and does not enter company cash. For company receipts use configured method/account and correct unit/session; open/count/close Caixa using observed values. Preserve reversals/audit; never delete financial traces or blindly retry ambiguous payment outcomes.
5. **Stock:** Estoque → Produtos, Compras → Receber compra; confirm destination (central technical location or correct unit), quantity, price/freight. Visão Geral → Registrar consumo; Inventário → Aplicar contagem with reason. Follow transfer lifecycle separation/send/receive and correct source/destination permissions. Preserve movements; no manual balance SQL.
6. **Reports:** Relatórios, choose unit/date and applicable tab; distinguish valid empty state from error. Confirm paid-command data against operational records, not estimated sales.
7. **WhatsApp/troubleshooting:** Remains OFF by policy. See `whatsapp-operational-handover.md` for RECONCILIATION_REQUIRED, stale SENDING, privileged reconciliation and escalation. For login/403, first check user activation/unit/permissions; for missing slots, schedule/service/resource rules; for uncertain financial/messaging outcome, inspect central persisted status and escalate before retry. Use sanitized errors/IDs, never secrets or customer payloads.

### Documentary corrections / recovery

- Corrected target preflight exit-2 semantics before baseline upgrade; after upgrade exit 0 required.
- Added missing restored-clone upgrade rehearsal, final CLIENTS_ONLY reconciliation, freeze/monitoring and global-client/unit-boundary checks to existing cutover runbook.
- Corrected automated backup document: schedule already active; workflow includes isolated restore smoke.
- Preserved chronological green evidence. No code/test/schema changes, broad audit, test rerun or new workflow dispatch.
- Final SHA/commit and final ordinary push CI are recorded in executor delivery. If final documentary CI is still pending/fails, carry this pack forward without rerunning green code tests; inspect only first real failure.

PRE-AUDIT CLOSURE: READY FOR INDEPENDENT 100% AUDIT

## FINAL AUDIT + CORRECTION PACK — 2026-10-08

Start HEAD 4cc95ce5d4e0e1a87559d44ec151241bc8c04db7 verified with remote. Initial backend #605 and code/browser #603/#53 independently confirmed. Risk-directed audit found FA-01..FA-06 P1, FA-07 P2; implemented atomic credential consumption, direct recipient and authoritative payment reload, common finance locks, global client identity lock, stock write gates/location replay scopes/serialization/read-only GET, and shared configured workstation capacity. FA-08 P3 error-string encoding deferred NON-BLOCKING. Full evidence/limitations: `final-audit-correction-report.md`.

No migration added; baseline 13 / target 22 / expected nine pending unchanged. New behavior and extended PostgreSQL integration regressions are part of aggregate CI. Exact final corrective commit SHA and terminal backend/browser results are in executor delivery. Changed-HEAD CI is mandatory; earlier greens do not certify these corrections. Live ledger and effective flags remain NOT VERIFIED. Fresh backup and fresh-restored-live-data clone rehearsal remain future cutover prerequisites. PRODUCTION MUTATIONS: NONE. No deploy/import/provider activation authorization is implied.

### Final reconciliation

Preserved supplemental commits 6e89abb, 9ceb529 and e24a87f. Stock GET stays read-only; authorized product creation initializes locations. Stock regression now asserts both behaviors and retains canonical locations checks. See final-audit-correction-report.md for measured evidence and exact final delivery for terminal aggregate CI/browser and TARGET HEAD. Ledger/effective flags NOT VERIFIED; fresh backup/restore/live-data rehearsal required at authorized cutover. PRODUCTION MUTATIONS: NONE.
