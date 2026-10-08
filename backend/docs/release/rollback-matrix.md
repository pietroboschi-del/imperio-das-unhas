# BLOCO 3 - Rollback And Abort Matrix

Never use improvised `migrate down`. Prefer abort before mutation. After a database mutation, code rollback is safe only when data integrity is verified and target schema remains compatible with the older code path.

| Scenario | WHEN TO ABORT | WHAT TO ROLLBACK | CODE ROLLBACK SAFE? | DB RESTORE REQUIRED? |
|---|---|---|---|---|
| backup inválido | Backup file missing, empty, invalid format, `pg_restore --list` fails, or restore smoke fails | Nothing if before migration | Yes, if no deploy happened | No if no database change happened |
| ledger inesperado | Live ledger differs from expected 13 baseline migrations | Nothing if before migration | Yes | No if no database change happened |
| migration checksum mismatch | `_prisma_migrations.checksum` differs from approved evidence | Nothing if before migration | Yes | No if no database change happened |
| migration failure | `prisma migrate deploy` exits non-zero | Backend/frontend deploy must not proceed | Only after database state is assessed | Maybe; restore if partial state or integrity cannot be proven |
| migration incomplete | Any migration has null `finished_at` | Backend/frontend deploy must not proceed | Only after database state is assessed | Usually yes unless Prisma repair path is explicitly approved |
| backend não inicia | Target backend crashes or cannot connect after successful migration | Backend deployment | Usually yes if older backend tolerates target schema; otherwise forward fix | No unless data anomaly is present |
| backend health falha | Health endpoint non-200 or wrong release metadata | Backend deployment | Usually yes if schema compatibility is verified | No unless data anomaly is present |
| frontend falha | Frontend fails HTTP/admin/public smoke | Frontend deployment | Yes | No |
| permission regression | Owner/admin/operator access or unit isolation is wrong | Backend and possibly frontend deployment | Yes if database checks are healthy | No unless data was written incorrectly |
| booking regression | Public or admin booking read/write flow breaks | Backend/frontend deployment | Maybe; validate BookingItem source-of-truth compatibility first | Required only if bad writes occurred |
| data integrity anomaly | Counts, constraints, or transformed BookingItem data do not match expected results | Backend/frontend deployment; stop writes | No, not by code alone | Yes if changed data cannot be repaired by approved forward fix |
| stock inconsistency | Stock locations, balances, or movements inconsistent | Backend/frontend deployment; stop stock writes | Maybe for code-only display bug | Yes if persisted stock data is wrong |
| finance inconsistency | Commands, payments, cash, or receivables mismatch | Backend/frontend deployment; stop finance writes | Maybe for code-only display bug | Yes if persisted finance data is wrong |
| WhatsApp unintended activation | Any WhatsApp flag/channel enables messaging unexpectedly | Messaging runtime/config by approved path | Code rollback may not stop queued side effects | Maybe, only if queued/persisted records need owner-approved remediation |
