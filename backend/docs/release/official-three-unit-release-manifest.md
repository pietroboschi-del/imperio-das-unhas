# BLOCO 3 - Official Three-Unit Release Manifest

## TARGET_RELEASE_SHA

Resolve with `git rev-parse HEAD` on `official-three-units-integration` immediately before the authorized cutover and record the value in the release record. The reproducible source for this value is `npm run release:delta`.

## LIVE_BACKEND_SHA

`920d74cbb5856ab3bdb1c63c1c0c762c82346cba`.

## LIVE_FRONTEND_SHA

`a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`.

## EXPECTED_BASELINE_MIGRATIONS

Baseline count: `13`.

1. `20260929_v96_shadow_homologation`
2. `20260929_v98a_business_timezone`
3. `20260929_v98a_cutover_state`
4. `20260929_v98a_cutover_verification`
5. `20260929_v98a_import_integrity`
6. `20260929_v98b_security_contract`
7. `20260930_v99_booking_items`
8. `20260930_v99_cash_command_payment`
9. `20260930_v99_command_service_commission`
10. `20260930_v99_operational_booking_writes`
11. `20260930_v99_professional_obligations`
12. `20261002_v99_client_duplicate_review`
13. `20261003_v99_structural_categories_workstations`

## TARGET_MIGRATIONS

Target count: `24`. Baseline migrations above plus:

1. `20261004_v99_client_duplicate_review_target_client`
2. `20261004_v99_command_service_quantity`
3. `20261005_wa1_messaging_foundation`
4. `20261006_v99_booking_item_source_of_truth`
5. `20261006_v99_stock_foundation`
6. `20261006_wa2_evolution_inbound`
7. `20261006_wa4_management_tasks`
8. `20261006_wa5_1_messaging_automation`
9. `20261008_wa2_outbox_reconciliation_required`
10. `20261010_phase5_client_source_network_config`
11. `20261010_a3_fin_rep_authoritative_ledger`

## PENDING_MIGRATIONS

Expected pending from historical 13-migration baseline to target: `11` migrations (subject to **current** live ledger verification; never assume production still has 13).

1. `20261004_v99_client_duplicate_review_target_client`
2. `20261004_v99_command_service_quantity`
3. `20261005_wa1_messaging_foundation`
4. `20261006_v99_booking_item_source_of_truth`
5. `20261006_v99_stock_foundation`
6. `20261006_wa2_evolution_inbound`
7. `20261006_wa4_management_tasks`
8. `20261006_wa5_1_messaging_automation`
9. `20261008_wa2_outbox_reconciliation_required`
10. `20261010_phase5_client_source_network_config`
11. `20261010_a3_fin_rep_authoritative_ledger`

## BACKUP REQUIREMENT

Before any database change: create a fresh logical backup, verify file size is non-zero, verify `PGDMP` format for custom dumps, run `pg_restore --list`, record SHA256, restore into an isolated database, and run the preflight ledger against the restored database.

## PRE-MIGRATION CHECKS

Run the following read-only checks with authorized credentials only:

```bash
git rev-parse HEAD
LIVE_BACKEND_SHA=920d74cbb5856ab3bdb1c63c1c0c762c82346cba LIVE_FRONTEND_SHA=a5e43d114dd34cac2231a96cbc3d5d46f0d44f59 npm run release:delta
DATABASE_URL='<authorized-readonly-url>' npm run release:preflight
```

All commands above run from `backend/`. On the target artifact, `release:preflight` deliberately returns exit 2 / `ok=false` before upgrade if migrations are pending; their precise count MUST be derived from the live ledger. This is acceptable for a historical 13-migration baseline ONLY when `databaseCount=13`, `filesystemCount=24`, the applied names exactly match EXPECTED_BASELINE_MIGRATIONS, pending names exactly match PENDING_MIGRATIONS, all baseline checksum comparisons match, and every unexpected/incomplete/rolled-back/missing-checksum/missing-local-SQL/missing-unit collection is empty. Exit 1 or any other discrepancy aborts; exit 2 alone is never approval. After upgrade require exit 0 / `ok=true` and 24 applied. Compare the baseline at the *live backend SHA* separately from target 24, including checksum SHA-256 for each applied migration. Abort if live contains an unexpected migration. Live ledger remains NOT VERIFIED until queried with authorized read-only credentials. Historical baseline condition (13 migrations) applies only if live still equals `EXPECTED_BASELINE_MIGRATIONS`, no incomplete rows, no rolled back rows, no unexpected database-only migrations, and canonical units `centro`, `big`, `shopping-contagem` exist.

## MIGRATION COMMAND

After explicit owner approval and verified backup:

```bash
npm run prisma:migrate
```

The command must run with the target release artifact and the authorized database URL. Do not run ad hoc SQL.

## POST-MIGRATION CHECKS

```bash
DATABASE_URL='<authorized-readonly-url>' npm run release:preflight
npm run diagnostic:three-units
```

Required result: target migration count `24`, no pending migrations, no incomplete migrations, no rolled back migrations, and no missing canonical units.

## BACKEND DEPLOY CHECKS

Deploy target backend SHA only after migrations complete. Verify health, runtime logs, release metadata, and API read smokes.

## FRONTEND DEPLOY CHECKS

Deploy target frontend SHA after backend checks pass. Verify HTTP load, admin navigation, public booking pages, and no client-side errors in smoke paths.

## SMOKE CHECKS

Use `backend/docs/release/smoke-matrix.md`. Write smokes require owner approval and clearly identifiable synthetic names.

## ABORT CONDITIONS

Abort before migration if backup validation fails, live ledger differs from manifest, any checksum mismatch, missing checksum, unknown migration, incomplete or rolled-back entry exists, flags are not verified, or CI for target is not green.

Abort after migration if any migration is failed, incomplete, rolled back, missing, or unexpected.

## ROLLBACK CONDITIONS

Use code rollback only for code-only failures after database integrity is verified. Use database restore only when the database has been changed and integrity cannot be proven. Never improvise a reverse migration.

## PHASE_5_CLIENT_SOURCE_CONFIG_DELTA

The additional isolated A3 migration `20261010_a3_fin_rep_authoritative_ledger` adds financial ledger/account tables and stock purchase finance ownership; NO historical UPDATE. Both require separate production authorization. The additive migration `20261010_phase5_client_source_network_config` creates only the network-wide acquisition-source configuration table. The historical 13→22 rehearsal is not evidence of this new migration. Before any production apply, reconcile the *current* production Prisma ledger and hashes against this 24-migration target, restore a fresh verified backup in isolation, and obtain separate explicit production migration authorization. Never replay already-applied migrations.
