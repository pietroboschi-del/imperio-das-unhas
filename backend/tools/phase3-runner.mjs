import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const appliedBaseline = [
  '20260929_v96_shadow_homologation',
  '20260929_v98a_business_timezone',
  '20260929_v98a_cutover_state',
  '20260929_v98a_cutover_verification',
  '20260929_v98a_import_integrity',
  '20260929_v98b_security_contract',
  '20260930_v99_booking_items',
  '20260930_v99_cash_command_payment',
  '20260930_v99_command_service_commission',
  '20260930_v99_operational_booking_writes',
  '20260930_v99_professional_obligations',
  '20261002_v99_client_duplicate_review',
  '20261003_v99_structural_categories_workstations'
];
const authorizedPending = [
  '20261004_v99_client_duplicate_review_target_client',
  '20261004_v99_command_service_quantity',
  '20261005_wa1_messaging_foundation',
  '20261006_v99_booking_item_source_of_truth',
  '20261006_v99_stock_foundation',
  '20261006_wa2_evolution_inbound',
  '20261006_wa4_management_tasks',
  '20261006_wa5_1_messaging_automation',
  '20261008_wa2_outbox_reconciliation_required'
];
const canonical = ['big', 'centro', 'shopping-contagem'];
const assert = (condition, message) => { if (!condition) throw Error(message); };
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length &&
  new Set(a).size === b.length && b.every(value => a.includes(value));
function execute(command, args) {
  const result = spawnSync(command, args, { cwd: '/app', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 1800000 });
  if (result.error) throw Error('Command launch failed: ' + result.error.code);
  return result;
}
function checkReport(report, after = false) {
  const migrations = report?.migrations;
  const expectedDatabase = after ? [...appliedBaseline, ...authorizedPending] : appliedBaseline;
  assert(report?.opMode === 'READ_ONLY' && migrations, 'Invalid preflight report');
  assert(migrations.filesystemCount === 22, 'Filesystem count mismatch');
  assert(migrations.databaseCount === expectedDatabase.length, 'Database count mismatch');
  assert(sameSet(migrations.filesystemMigrations, [...appliedBaseline, ...authorizedPending]), 'Filesystem migration names mismatch');
  assert(sameSet(migrations.databaseMigrations, expectedDatabase), 'Database migration names mismatch');
  assert(sameSet(migrations.pendingMigrations, after ? [] : authorizedPending), 'Pending set mismatch');
  for (const key of ['unexpectedDbMigrations', 'incompleteMigrations', 'rolledBackMigrations',
    'checksumMismatches', 'missingDatabaseChecksum', 'missingLocalMigrationSql']) {
    assert(Array.isArray(migrations[key]) && migrations[key].length === 0, key + ' is not empty');
  }
  assert(Array.isArray(migrations.checksumEvidence) &&
    migrations.checksumEvidence.length === expectedDatabase.length &&
    sameSet(migrations.checksumEvidence.map(x => x.migrationName), expectedDatabase) &&
    migrations.checksumEvidence.every(x => x.checksumMatches === true && x.finishedAt && !x.rolledBackAt),
    'Applied migration checksum or completion mismatch');
  assert(Array.isArray(report.canonicalUnits?.missing) && report.canonicalUnits.missing.length === 0 &&
    sameSet(report.canonicalUnits.observed?.map(x => x.id), canonical), 'Canonical units mismatch');
  assert(report.ok === after, 'Preflight overall state mismatch');
}
function preflight(after = false) {
  const result = execute('npm', ['run', '--silent', 'release:preflight']);
  const expectedCode = after ? 0 : 2;
  assert(result.status === expectedCode, 'Preflight exit code: ' + result.status);
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw Error('Preflight output is not JSON'); }
  checkReport(report, after);
  console.log(JSON.stringify({event: after ? 'POST_PREFLIGHT_PASS' : 'PRECHECK_PASS',
    exitCode:result.status,filesystem:22,database:after ? 22 : 13,
    pending:after ? [] : authorizedPending,checksums:'MATCH',units:canonical}));
}
async function verifyTotalUnits() {
  const prisma = new PrismaClient();
  try {
    const ids = (await prisma.unit.findMany({ select: { id: true } })).map(row => row.id);
    assert(sameSet(ids, canonical), 'Total commercial Unit set mismatch');
    console.log(JSON.stringify({event:'CANONICAL_UNITS_PASS',count:ids.length,ids:ids.sort()}));
  } finally { await prisma.$disconnect(); }
}
function diagnostic() {
  const result = execute('npm', ['run', '--silent', 'diagnostic:three-units']);
  assert(result.status === 0, 'Diagnostic exit code: ' + result.status);
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw Error('Diagnostic output is not JSON'); }
  const t = report.technicalReadiness;
  assert(report.readOnly === true && t?.result === 'STRUCTURAL_READY' &&
    t.canonicalUnitsReady === true && t.migrationsReady === true &&
    t.stockSchemaReady === true && t.identityReady === true &&
    Array.isArray(t.blockers) && t.blockers.length === 0, 'Structural diagnostic blocked');
  console.log(JSON.stringify({event:'DIAGNOSTIC_PASS',technicalReadiness:t,businessDataReadiness:report.businessDataReadiness?.result}));
}
async function main() {
  const mode = process.argv[2] ?? '--check';
  assert(mode === '--check' || mode === '--apply', 'Unsupported mode');
  assert(Boolean(process.env.DATABASE_URL), 'DATABASE_URL missing');
  console.log(JSON.stringify({event:'RUNNER_START',mode}));
  preflight(false);
  await verifyTotalUnits();
  if (mode === '--check') { console.log(JSON.stringify({event:'CHECK_PASS'})); return; }
  console.log(JSON.stringify({event:'MIGRATION_BEGIN',authorizedPending}));
  const migration = execute('npm', ['run', '--silent', 'prisma:migrate']);
  const matches = [...migration.stdout.matchAll(/Applying migration \x60([^\x60]+)\x60/g)].map(x => x[1]);
  console.log(JSON.stringify({event:'MIGRATION_RESULT',exitCode:migration.status,applied:matches,
    output:migration.status === 0 ? 'SUCCESS' : 'FAILED'}));
  assert(migration.status === 0, 'Prisma migration failed; no retry');
  assert(sameSet(matches, authorizedPending), 'Prisma applied migration list mismatch');
  preflight(true);
  await verifyTotalUnits();
  diagnostic();
  console.log(JSON.stringify({event:'PHASE3_PASS',ledger:'22/22'}));
}
main().catch(error => {
  console.error(JSON.stringify({event:'PHASE3_BLOCKED',reason:error.message}));
  process.exitCode = 1;
});
