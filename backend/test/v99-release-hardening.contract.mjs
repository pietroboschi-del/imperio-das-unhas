import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

let tests = 0;
const ok = (value, message) => {
  tests += 1;
  assert.ok(value, message);
};
const equal = (actual, expected, message) => {
  tests += 1;
  assert.equal(actual, expected, message);
};

const pkg = JSON.parse(read('../package.json'));
for (const scriptName of [
  'release:preflight',
  'release:delta',
  'test:release-hardening',
  'test:migration-upgrade-rehearsal',
]) {
  ok(pkg.scripts[scriptName], `package.json exposes ${scriptName}`);
}

for (const path of [
  '../tools/release-preflight.mjs',
  '../tools/release-delta.mjs',
  '../tools/synthetic-migration-upgrade-rehearsal.mjs',
  '../docs/release/official-three-unit-release-manifest.md',
  '../docs/release/cutover-runbook.md',
  '../docs/release/smoke-matrix.md',
  '../docs/release/rollback-matrix.md',
]) {
  ok(exists(path), `release hardening artifact exists: ${path}`);
}

const preflight = read('../tools/release-preflight.mjs');
for (const needle of [
  '_prisma_migrations',
  'current_database()',
  'current_schema()',
  'version()',
  'pendingMigrations',
  'unexpectedDbMigrations',
  'incompleteMigrations',
  'rolledBackMigrations',
  'canonicalUnits',
  'READ_ONLY',
]) {
  ok(preflight.includes(needle), `preflight includes ${needle}`);
}

for (const forbidden of [
  'prisma migrate',
  'prisma db seed',
  '$executeRaw',
  '$executeRawUnsafe',
  '.create(',
  '.createMany(',
  '.updateMany(',
  '.upsert(',
  '.delete(',
  '.deleteMany(',
]) {
  ok(!preflight.includes(forbidden), `preflight remains read-only: ${forbidden}`);
}
ok(!/\b(?:prisma|tx)\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(preflight), 'preflight never performs Prisma model writes');
ok(preflight.includes("createHash('sha256').update(fs.readFileSync(file))"), 'cryptographic hash update allowed without DB writes');
ok(!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(preflight.replace("createHash('sha256').update(fs.readFileSync(file))", 'SHA256_DIGEST_ONLY')), 'preflight source contains no DDL/DML keywords');

const delta = read('../tools/release-delta.mjs');
for (const needle of [
  'LIVE_BACKEND_SHA',
  'LIVE_FRONTEND_SHA',
  '920d74cbb5856ab3bdb1c63c1c0c762c82346cba',
  'a5e43d114dd34cac2231a96cbc3d5d46f0d44f59',
  'criticalChangedFiles',
  'migrationDelta',
  'schemaChanges',
]) {
  ok(delta.includes(needle), `delta report includes ${needle}`);
}

const rehearsal = read('../tools/synthetic-migration-upgrade-rehearsal.mjs');
for (const needle of [
  'SYNTHETIC_REHEARSAL',
  '920d74cbb5856ab3bdb1c63c1c0c762c82346cba',
  'EXPECTED_BASELINE_MIGRATION_COUNT = 13',
  'EXPECTED_TARGET_MIGRATION_COUNT = 22',
  'pg_dump',
  'pg_restore',
  '--list',
  'imperio_release_rehearsal_baseline',
  'imperio_release_rehearsal_restored',
  'booking_header_backfill',
  'CommandServiceItem',
  'ClientDuplicateReview',
  'MessagingChannel',
  'StockLocation',
  'dist/main.js',
  'dist/src/main.js',
]) {
  ok(rehearsal.includes(needle), `synthetic rehearsal covers ${needle}`);
}
ok(!/railway|proxy|production/i.test(rehearsal), 'synthetic rehearsal does not target production/Railway/proxy');

const workflow = read('../../.github/workflows/backend-ci.yml');
ok(workflow.includes('Synthetic 13-to-22 migration rehearsal'), 'CI includes synthetic migration rehearsal step');
ok(workflow.includes('npm run test:migration-upgrade-rehearsal'), 'CI runs migration upgrade rehearsal');
ok(workflow.includes('npm run test:release-hardening'), 'CI runs release hardening contracts');

const manifest = read('../docs/release/official-three-unit-release-manifest.md');
for (const heading of [
  'TARGET_RELEASE_SHA',
  'LIVE_BACKEND_SHA',
  'LIVE_FRONTEND_SHA',
  'EXPECTED_BASELINE_MIGRATIONS',
  'TARGET_MIGRATIONS',
  'PENDING_MIGRATIONS',
  'BACKUP REQUIREMENT',
  'PRE-MIGRATION CHECKS',
  'MIGRATION COMMAND',
  'POST-MIGRATION CHECKS',
  'ABORT CONDITIONS',
  'ROLLBACK CONDITIONS',
]) {
  ok(manifest.includes(heading), `manifest includes ${heading}`);
}
equal((manifest.match(/2026100/g) || []).length >= 8, true, 'manifest lists pending migration names');

const runbook = read('../docs/release/cutover-runbook.md');
for (const phase of [
  'FASE A - PRECHECK',
  'FASE B - BACKUP',
  'FASE C - MIGRATIONS',
  'FASE D - BACKEND',
  'FASE E - FRONTEND',
  'FASE F - THREE-UNIT SMOKE',
  'FASE G - FINAL',
  'COMMAND / ACTION',
  'SUCCESS CRITERIA',
  'STOP CONDITION',
  'ROLLBACK ACTION',
]) {
  ok(runbook.includes(phase), `runbook includes ${phase}`);
}

const smoke = read('../docs/release/smoke-matrix.md');
ok(smoke.includes('READ-ONLY SMOKE'), 'smoke matrix separates read-only smoke');
ok(smoke.includes('WRITE SMOKE - OWNER AUTHORIZATION REQUIRED'), 'smoke matrix separates authorized write smoke');
for (const area of ['AUTH', 'Centro', 'Big', 'Shopping Contagem', 'cliente global', 'Agenda cross-unit', 'public booking', 'comanda', 'pagamento', 'caixa', 'estoque', 'relatórios']) {
  ok(smoke.includes(area), `smoke matrix covers ${area}`);
}

const rollback = read('../docs/release/rollback-matrix.md');
for (const scenario of [
  'backup inválido',
  'ledger inesperado',
  'migration checksum mismatch',
  'migration failure',
  'migration incomplete',
  'backend não inicia',
  'frontend falha',
  'permission regression',
  'booking regression',
  'data integrity anomaly',
  'stock inconsistency',
  'finance inconsistency',
  'migrate down',
]) {
  ok(rollback.includes(scenario), `rollback matrix covers ${scenario}`);
}

console.log(JSON.stringify({ ok: true, tests, feature: 'release_hardening_block_3_contract' }));
