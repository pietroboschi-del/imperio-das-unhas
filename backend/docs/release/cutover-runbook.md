# BLOCO 3 - Cutover Runbook

Commands run from `backend/` unless a repository path is stated. This runbook prepares future authorized production work; it does not authorize it. Migrations are forward-only.

## FASE A - PRECHECK

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Freeze release and record `git rev-parse HEAD` on `official-three-units-integration` | SHA matches approved target | SHA differs from release record | Stop; do not deploy |
| Confirm final CI run for target SHA | CI is completed and successful | CI missing, failing, or stale | Stop; fix code or rerun CI |
| Confirm Railway services read-only | Backend, frontend, and database are online; no material staged changes | Failed service or unexpected staged work | Stop; investigate owner-side state |
| `npm run release:delta` | Backend live SHA, frontend live SHA, commit delta, and migration delta match manifest | Delta mismatch | Stop; regenerate manifest or investigate |
| `DATABASE_URL='<authorized-readonly-url>' npm run release:preflight` | Target-artifact report has exactly 13 applied / 24 local / the named 11 pending (historical baseline only; reconcile current live ledger first); all baseline hashes match; no unknown/incomplete/rolled-back/missing checksum/SQL/unit. Expected exit 2 only for this exact pending delta (see manifest) | Credential unavailable, ledger mismatch, incomplete migration, or unexpected migration | Stop; classify as live read-only blocker |
| Verify flags | Operational write and WhatsApp flags are known and recorded | Redacted or unsafe values | Stop for owner decision if risk is unacceptable |

## FASE B - BACKUP

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Create fresh logical backup | Backup file produced with non-zero size | Backup job fails | Stop; no database change |
| Validate dump header and size | `PGDMP` custom dump or approved SQL format verified | Invalid format or empty file | Stop; create new backup |
| `pg_restore --list <backup>` | Object listing succeeds | Listing fails | Stop; create new backup |
| `sha256sum <backup>` | Hash recorded in release record | Hash command fails | Stop; fix backup evidence |
| Restore backup into isolated database | Restore completes cleanly | Restore error | Stop; create new backup |
| Run preflight against restore | Restored ledger matches the exact 13 baseline and hashes; target report exit 2 only for the exact 11 pending when starting from the historical 13 baseline | Restore ledger differs from live or manifest | Stop; investigate |

## FASE B2 - UPGRADE THE RESTORED CLONE

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Identify isolated restored clone and record target SHA | Clone is separate from live; validated fresh backup is its source; no provider/messages enabled | Identity uncertain or URL points to live | Stop; do not run migration |
| Against that clone only, `DATABASE_URL='<isolated-clone-url>' npm run prisma:migrate` | Applies exactly 11 expected migrations from a historical 13-migration baseline to 24 | Migration failure or unexpected delta | Stop; preserve clone evidence, no live migration |
| Against clone, `DATABASE_URL='<isolated-clone-readonly-url>' npm run release:preflight` and `npm run diagnostic:three-units` with same clone URL | Exit 0; 24 hashes match; units, BookingItem backfill, client links, finance and stock integrity checked against restored baseline | Incomplete ledger or unexplained data/count changes | Stop; resolve before live authorization |

CI #603's historical synthetic 13→22 rehearsal is preserved as background evidence only. The current target adds an isolated 23rd migration and A3 introduces a 24th ledger migration and needs its own 13→24 rehearsal. Neither synthetic rehearsal replaces a fresh restored live dataset. Never point the synthetic rehearsal reset script at the restored live-data clone or live database.

## FASE C - MIGRATIONS

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Re-run live ledger read-only | Baseline still exactly 13 migrations, with SHA-256 checksums verified | Any mismatch, checksum mismatch, incomplete or rolled-back row | Stop; no migration |
| Compare live ledger with manifest (target read-only release:preflight; exit 2 only for the exact pending delta derived from the actual live ledger); abort on any unknown, missing, reverted or hash-mismatched migration | Names and computed SHA-256 checksums of each migration.sql agree with the stored Prisma ledger; no unknown, incomplete or rolled-back migration | Unknown migration or checksum mismatch | Stop; owner/auditor review |
| Owner authorizes migration | Written approval captured | Approval missing | Stop |
| `npm run prisma:migrate` | Applies the exact pending delta toward 24, including 20261010_phase5_client_source_network_config if not already applied | Command fails | Stop; inspect ledger, prepare restore decision |
| `DATABASE_URL='<authorized-readonly-url>' npm run release:preflight` | 24 migrations, no pending, no incomplete, no rolled back | Any failed or partial state | Stop; database restore may be required |

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

## FASE E2 - FINAL CLIENT RECONCILIATION

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Confirm approved CLIENTS_ONLY strategy and fresh final exports | Owner records waves, files, unit provenance and FINAL batch IDs; see `backend/CLIENTS_ONLY_BATCHES.md` | Strategy/exports unavailable or business conflict | Stop client promotion; request owner decision |
| Separately authorize staging/dry-run, review and final promotion | Every REVIEW_REQUIRED resolved explicitly; current reportHash approved; immutable wave and idempotency rules preserved | Missing approval, mixed imported/pending batch or changed reportHash | Stop; new dry-run/approval, never append a wave to imported batch |
| Separately authorized final commit/reconciliation | One network client per proven identity; correct unit links; existing central fields preserved | Duplicate, wrong linkage or conflicting data | Stop affected writes; owner-approved forward remediation/restore assessment |

No real import, staging, flag enabling or promotion is executed by this preparation. If final reconciliation cannot be completed, record the explicit owner decision before operational cutover; do not silently waive it.

## FASE F - THREE-UNIT SMOKE

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Centro read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Big read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Shopping Contagem read-only smoke | Unit catalog, agenda read, and public profile load | Any read failure | Pause release record; assess backend/frontend rollback |
| Global agenda/client and unit boundaries | Same approved client identity/history across units; agenda cross-unit grant works; unauthorized finance/stock access denied; central stock is technical location, not fourth unit | Identity mismatch, permission leak or unit financial/stock inconsistency | Stop affected writes; use rollback matrix |
| Optional write smoke with owner approval | Synthetic records are traceable and closed safely | Approval missing or write failure | Abort write smoke; do not hard delete audit/finance traces |

Monitor backend/frontend health, sanitized errors, agenda/client consistency, unit finance/stock and WhatsApp-off state after deployment. Record owner, observation window and abort thresholds in the release record before cutover. Never code-rollback blindly after migrations: verify schema compatibility and data integrity; otherwise use an authorized forward fix or restore decision under `rollback-matrix.md`.

## FASE G - FINAL

| COMMAND / ACTION | SUCCESS CRITERIA | STOP CONDITION | ROLLBACK ACTION |
|---|---|---|---|
| Record final SHAs, CI, backup hash, ledger | Evidence pack complete | Missing evidence | Keep release in observation |
| Check errors/logs/database/flags | No unexpected errors and flags recorded | New anomaly | Trigger rollback matrix |
| Confirm WhatsApp-off decision | WhatsApp flags remain approved state | Any unintended activation | Disable via owner-approved change path |
| Publish release record | Audit trail complete | Open blocker | Mark release blocked |


**Phase 5 delta:** this runbook's 13-migration baseline is historical. The live backend/PostgreSQL may already have advanced; never assume 10 pending in production. Determine the pending list by live read-only ledger, compare hashes with the 23-migration manifest, restore an encrypted fresh backup in isolation, and obtain separate approval before any database migration.


## A3-FIN-REP financial migration release restriction

The 24th migration `20261010_a3_fin_rep_authoritative_ledger` is prepared for isolated CI only. No live migration is authorized by this runbook. Existing purchases are not modified or inferred from technical central stock location; their financial ownership requires audited reconciliation and explicit authorization before go-live.
