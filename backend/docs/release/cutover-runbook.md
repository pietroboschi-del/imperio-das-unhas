# BLOCO 3 - Cutover Runbook

## FASE A - PRECHECK

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| `git rev-parse HEAD` on `official-three-units-integration` | SHA matches approved target | SHA differs from release record | Stop; do not deploy |
| Confirm final CI run for target SHA | CI is completed and successful | CI missing, failing, or stale | Stop; fix code or rerun CI |
| Confirm Railway services read-only | Backend, frontend, and database are online; no material staged changes | Failed service or unexpected staged work | Stop; investigate owner-side state |
| `npm run release:delta` | Backend live SHA, frontend live SHA, commit delta, and migration delta match manifest | Delta mismatch | Stop; regenerate manifest or investigate |
| `DATABASE_URL='<authorized-readonly-url>' npm run release:preflight` | Live ledger matches 13 baseline migrations | Credential unavailable, ledger mismatch, incomplete migration, or unexpected migration | Stop; classify as live read-only blocker |
| Verify flags | Operational write and WhatsApp flags are known and recorded | Redacted or unsafe values | Stop for owner decision if risk is unacceptable |

## FASE B - BACKUP

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Create fresh logical backup | Backup file produced with non-zero size | Backup job fails | Stop; no database change |
| Validate dump header and size | `PGDMP` custom dump or approved SQL format verified | Invalid format or empty file | Stop; create new backup |
| `pg_restore --list <backup>` | Object listing succeeds | Listing fails | Stop; create new backup |
| `sha256sum <backup>` | Hash recorded in release record | Hash command fails | Stop; fix backup evidence |
| Restore backup into isolated database | Restore completes cleanly | Restore error | Stop; create new backup |
| Run preflight against restore | Restored ledger and schema match expected baseline | Restore ledger differs from live or manifest | Stop; investigate |

## FASE C - MIGRATIONS

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Re-run live ledger read-only | Baseline still exactly 13 migrations, with SHA-256 checksums verified | Any mismatch, checksum mismatch, incomplete or rolled-back row | Stop; no migration |
| Compare live ledger with manifest (read-only release:preflight); abort on any unknown, missing, reverted or hash-mismatched migration | Names and computed SHA-256 checksums of each migration.sql agree with the stored Prisma ledger; no unknown, incomplete or rolled-back migration | Unknown migration or checksum mismatch | Stop; owner/auditor review |
| Owner authorizes migration | Written approval captured | Approval missing | Stop |
| `npm run prisma:migrate` | Applies 9 expected pending migrations, including 20261008_wa2_outbox_reconciliation_required | Command fails | Stop; inspect ledger, prepare restore decision |
| `DATABASE_URL='<authorized-readonly-url>' npm run release:preflight` | 22 migrations, no pending, no incomplete, no rolled back | Any failed or partial state | Stop; database restore may be required |

## FASE D - BACKEND

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Deploy approved backend target SHA | Deployment succeeds and metadata matches target | Wrong SHA or deploy failure | Roll back backend deploy if database checks remain healthy |
| Health endpoint | HTTP 200 and expected release payload | Non-200 or crash loop | Roll back backend deploy; database restore only if data anomaly exists |
| Runtime logs | No startup exception, auth error flood, or migration error | Persistent errors | Roll back backend deploy |
| API read smoke | Auth, units, catalog, public read paths pass | Permission or booking read regression | Roll back backend deploy |

## FASE E - FRONTEND

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Deploy approved frontend target SHA | Deployment succeeds and metadata matches target | Wrong SHA or deploy failure | Roll back frontend deploy |
| HTTP smoke | App shell loads | Non-200 or broken assets | Roll back frontend deploy |
| Admin smoke | Admin login/navigation loads | Auth/UI regression | Roll back frontend deploy |
| Public smoke | Public booking pages load read-only paths | Public booking broken | Roll back frontend deploy |

## FASE F - THREE-UNIT SMOKE

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Centro read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Big read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Shopping Contagem read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Optional write smoke with owner approval | Synthetic records are traceable and closed safely | Approval missing or write failure | Abort write smoke; do not hard delete audit/finance traces |

## FASE G - FINAL

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Record final SHAs, CI, backup hash, ledger | Evidence pack complete | Missing evidence | Keep release in observation |
| Check errors/logs/database/flags | No unexpected errors and flags recorded | New anomaly | Trigger rollback matrix |
| Confirm WhatsApp-off decision | WhatsApp flags remain approved state | Any unintended activation | Disable via owner-approved change path |
| Publish release record | Audit trail complete | Open blocker | Mark release blocked |
