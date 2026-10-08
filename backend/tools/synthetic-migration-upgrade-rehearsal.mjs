import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const BASELINE_SHA = '920d74cbb5856ab3bdb1c63c1c0c762c82346cba';
const EXPECTED_BASELINE_MIGRATION_COUNT = 13;
const EXPECTED_TARGET_MIGRATION_COUNT = 21;
const BASELINE_DB = 'imperio_release_rehearsal_baseline';
const RESTORED_DB = 'imperio_release_rehearsal_restored';

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || backendRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : 'pipe',
  });
  if (result.error && result.status !== 0) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '').trim();
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requireSyntheticGuard = (databaseUrl) => {
  assert(process.env.SYNTHETIC_REHEARSAL === '1', 'SYNTHETIC_REHEARSAL=1 is required');
  const parsed = new URL(databaseUrl);
  assert(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname), 'DATABASE_URL must point to a loopback host');
  assert(/ci|test|rehearsal/i.test(parsed.pathname), 'DATABASE_URL database name must be a CI/test/rehearsal database');
};

const dbUrl = (databaseUrl, dbName) => {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${dbName}`;
  parsed.searchParams.delete('schema');
  return parsed.toString();
};

const resetDb = (adminUrl, dbName) => {
  run('psql', [
    adminUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE);`,
    '-c',
    `CREATE DATABASE "${dbName}";`,
  ]);
};

const psql = (databaseUrl, sql) => run('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql]);

const psqlFile = (databaseUrl, filePath) => run('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath]);

const jsonQuery = (databaseUrl, sql) => {
  const output = psql(databaseUrl, sql);
  return JSON.parse(output || 'null');
};

const ledgerSql = `
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'migrationName', migration_name,
  'checksum', checksum,
  'finishedAt', finished_at,
  'rolledBackAt', rolled_back_at,
  'appliedStepsCount', applied_steps_count,
  'logPresent', logs IS NOT NULL
) ORDER BY started_at, migration_name), '[]'::jsonb)
FROM "_prisma_migrations";
`;

const tableExistsSql = (tableName) => `
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = current_schema() AND table_name = '${tableName}'
);
`;

const columnExistsSql = (tableName, columnName) => `
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = '${tableName}' AND column_name = '${columnName}'
);
`;

const countSql = (tableName) => `SELECT count(*)::int FROM "${tableName}";`;

const countMap = (databaseUrl, names) => Object.fromEntries(
  names.map((name) => [name, Number(psql(databaseUrl, countSql(name)))]),
);

const migrationNamesAt = (sha) => run('git', ['ls-tree', '-r', '--name-only', sha, 'backend/prisma/migrations'], { cwd: repoRoot })
  .split('\n')
  .filter((line) => line.endsWith('/migration.sql'))
  .map((line) => line.split('/').at(-2))
  .sort();

const currentMigrationNames = () => fs.readdirSync(path.join(backendRoot, 'prisma/migrations'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const applyMigrations = (databaseUrl, schemaPath) => {
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPath], {
    env: { DATABASE_URL: databaseUrl },
  });
};

const extractBaselinePrisma = (tmpDir) => {
  const archive = path.join(tmpDir, 'baseline.tar');
  run('git', ['archive', '--format=tar', '--output', archive, BASELINE_SHA, 'backend/prisma'], { cwd: repoRoot });
  run('tar', ['-xf', archive, '-C', tmpDir], { cwd: repoRoot });
  return path.join(tmpDir, 'backend/prisma/schema.prisma');
};

const seedBaselineFixtures = (databaseUrl, tmpDir) => {
  const seedPath = path.join(tmpDir, 'baseline-fixtures.sql');
  fs.writeFileSync(seedPath, `
INSERT INTO "Unit" ("id","name","timezone","active","legacyPayload","updatedAt") VALUES
('centro','Centro','America/Sao_Paulo',true,'{"fixture":"block3"}',CURRENT_TIMESTAMP),
('big','Big Shopping','America/Sao_Paulo',true,'{"fixture":"block3"}',CURRENT_TIMESTAMP),
('shopping-contagem','Shopping Contagem','America/Sao_Paulo',true,'{"fixture":"block3"}',CURRENT_TIMESTAMP);

INSERT INTO "User" ("id","username","displayName","passwordHash","passwordResetRequired","active","networkAdmin","systemRole","permissions","updatedAt")
VALUES ('block3-admin','block3.admin','Block 3 Admin','synthetic-hash',false,true,true,'OWNER','{"synthetic":true}',CURRENT_TIMESTAMP);

INSERT INTO "UserUnitAccess" ("id","userId","unitId","role","permissions","active","updatedAt") VALUES
('block3-access-centro','block3-admin','centro','ADMIN','{"manage":true}',true,CURRENT_TIMESTAMP),
('block3-access-big','block3-admin','big','ADMIN','{"manage":true}',true,CURRENT_TIMESTAMP),
('block3-access-shopping','block3-admin','shopping-contagem','ADMIN','{"manage":true}',true,CURRENT_TIMESTAMP);

INSERT INTO "ServiceCategory" ("id","name","description","sortOrder","active","legacyPayload","updatedAt")
VALUES ('block3-category','Unhas','Synthetic category',1,true,'{"fixture":"block3"}',CURRENT_TIMESTAMP);

INSERT INTO "Service" ("id","categoryId","name","price","durationMin","active","legacyPayload","updatedAt")
VALUES ('block3-service','block3-category','Manicure Synthetic',50.00,45,true,'{"clientArea":"hands"}',CURRENT_TIMESTAMP);

INSERT INTO "Professional" ("id","name","publicName","active","legacyPayload","updatedAt")
VALUES ('block3-professional','Block 3 Professional','Block 3 Pro',true,'{"services":["block3-service"],"schedule":{"weekdays":[1,2,3,4,5]}}',CURRENT_TIMESTAMP);

INSERT INTO "ProfessionalUnit" ("id","professionalId","unitId","active") VALUES
('block3-pu-centro','block3-professional','centro',true),
('block3-pu-big','block3-professional','big',true),
('block3-pu-shopping','block3-professional','shopping-contagem',true);

INSERT INTO "Workstation" ("id","unitId","name","allowedCategoryIds","active","legacyPayload","updatedAt")
VALUES ('block3-station','centro','Mesa Synthetic','["block3-category"]',true,'{"fixture":"block3"}',CURRENT_TIMESTAMP);

INSERT INTO "Client" ("id","name","active","phone","email","registrationUnitId","legacyPayload","updatedAt")
VALUES ('block3-client','Cliente Synthetic',true,'+5531999990000','cliente.synthetic@example.invalid','centro','{"fixture":"block3"}',CURRENT_TIMESTAMP);

INSERT INTO "ClientUnitLink" ("id","clientId","unitId","source","active","updatedAt") VALUES
('block3-link-centro','block3-client','centro','synthetic',true,CURRENT_TIMESTAMP),
('block3-link-big','block3-client','big','synthetic',true,CURRENT_TIMESTAMP);

INSERT INTO "Booking" ("id","unitId","clientId","serviceDate","startAt","serviceId","professionalId","notes","status","legacyPayload","updatedAt")
VALUES ('block3-booking','centro','block3-client','2030-01-15','2030-01-15T13:00:00.000Z','block3-service','block3-professional','Synthetic booking','Agendado','{"durationMin":45,"unitPrice":50,"price":50}',CURRENT_TIMESTAMP);

INSERT INTO "ClientDuplicateReview" ("id","batchId","clusterId","reportHash","decision","mergeTargetClusterId","note","reviewedByUserId","updatedAt")
VALUES ('block3-duplicate-review','block3-batch','block3-cluster','block3-hash','MERGE','block3-target','synthetic review','block3-admin',CURRENT_TIMESTAMP);

INSERT INTO "OpenCommand" ("id","unitId","clientId","serviceDate","status","grossAmount","discountAmount","appliedSignalAmount","appliedCreditAmount","customerFeeAmount","remainingAmount","legacyPayload","updatedAt")
VALUES ('block3-command','centro','block3-client','2030-01-15','OPEN',50.00,0.00,0.00,0.00,0.00,0.00,'{"fixture":"block3"}',CURRENT_TIMESTAMP);

INSERT INTO "CashSession" ("id","unitId","businessDate","status","openingAmount","closingAmount","openedByUserId","legacyPayload")
VALUES ('block3-cash','centro','2030-01-15','OPEN',100.00,NULL,'block3-admin','{"fixture":"block3"}');

INSERT INTO "CommandServiceItem" ("id","commandId","unitId","serviceId","professionalId","unitPrice","discountAmount","netServiceAmount","commissionPercent","commissionFixedAmount","commissionAmount")
VALUES ('block3-command-item','block3-command','centro','block3-service','block3-professional',50.00,0.00,50.00,50.0000,NULL,25.00);

INSERT INTO "CommandPayment" ("id","commandId","cashSessionId","unitId","method","amount","status","receivedByUserId","legacyPayload")
VALUES ('block3-payment','block3-command','block3-cash','centro','PIX',50.00,'CONFIRMED','block3-admin','{"fixture":"block3"}');

INSERT INTO "ClientCreditOpening" ("id","clientId","amount","currency","source")
VALUES ('block3-credit','block3-client',10.00,'BRL','synthetic');

INSERT INTO "ReceivableOpening" ("id","clientId","unitId","sourceDate","dueDate","originalAmount","balance","status","legacyPayload")
VALUES ('block3-receivable','block3-client','centro','2030-01-15','2030-01-20',50.00,0.00,'PAID','{"fixture":"block3"}');

INSERT INTO "StockBalanceOpening" ("id","productId","locationId","qty","avgCost","legacyPayload")
VALUES ('block3-stock-opening','block3-legacy-product','centro',7.0000,12.3400,'{"fixture":"block3"}');
`, 'utf8');
  psqlFile(databaseUrl, seedPath);
};

const verifyLedger = (ledger, expectedCount, expectedNames) => {
  const names = ledger.map((row) => row.migrationName);
  assert(names.length === expectedCount, `expected ${expectedCount} migrations, found ${names.length}`);
  assert(expectedNames.every((name) => names.includes(name)), 'missing expected migration in ledger');
  assert(ledger.every((row) => row.finishedAt), 'incomplete migration found');
  assert(ledger.every((row) => !row.rolledBackAt), 'rolled back migration found');
};

const verifyDataIntegrity = (databaseUrl, beforeCounts) => {
  const afterCounts = countMap(databaseUrl, Object.keys(beforeCounts));
  for (const [name, before] of Object.entries(beforeCounts)) {
    assert(afterCounts[name] === before, `row count changed for ${name}: ${before} -> ${afterCounts[name]}`);
  }
  assert(psql(databaseUrl, columnExistsSql('CommandServiceItem', 'quantity')) === 't', 'CommandServiceItem.quantity missing');
  assert(psql(databaseUrl, `SELECT "quantity"::text FROM "CommandServiceItem" WHERE "id"='block3-command-item';`) === '1.0000', 'quantity default not preserved');
  assert(psql(databaseUrl, columnExistsSql('ClientDuplicateReview', 'targetClientId')) === 't', 'ClientDuplicateReview.targetClientId missing');
  const bookingBackfill = jsonQuery(databaseUrl, `
SELECT jsonb_build_object(
  'count', count(*)::int,
  'source', max("legacyPayload"->>'source'),
  'durationMin', max("durationMin"),
  'unitPrice', max("unitPrice"::text)
)
FROM "BookingItem"
WHERE "bookingId"='block3-booking';
`);
  assert(bookingBackfill.count === 1, 'BookingItem backfill count mismatch');
  assert(bookingBackfill.source === 'booking_header_backfill', 'BookingItem backfill source mismatch');
  assert(Number(bookingBackfill.durationMin) === 45, 'BookingItem duration mismatch');
  assert(bookingBackfill.unitPrice === '50.00', 'BookingItem price mismatch');
  assert(psql(databaseUrl, tableExistsSql('Product')) === 't', 'Product table missing');
  assert(psql(databaseUrl, tableExistsSql('MessagingChannel')) === 't', 'MessagingChannel table missing');
  assert(Number(psql(databaseUrl, `SELECT count(*)::int FROM "MessagingChannel";`)) === 3, 'MessagingChannel seed mismatch');
  const stockLocations = jsonQuery(databaseUrl, `SELECT coalesce(jsonb_agg("id" ORDER BY "id"), '[]'::jsonb) FROM "StockLocation";`);
  for (const id of ['big', 'central', 'centro', 'shopping-contagem']) {
    assert(stockLocations.includes(id), `StockLocation missing ${id}`);
  }
  return afterCounts;
};

const smokeBackend = async (databaseUrl) => {
  const mainPath = [
    path.join(backendRoot, 'dist/main.js'),
    path.join(backendRoot, 'dist/src/main.js'),
  ].find((candidate) => fs.existsSync(candidate));
  assert(mainPath, 'dist/main.js or dist/src/main.js is required for backend smoke');
  const port = 3219;
  const child = spawn(process.execPath, [mainPath], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: `http://127.0.0.1:${port}`,
      MIGRATION_IMPORT_ENABLED: 'false',
      CLIENT_BATCH_COMMIT_ENABLED: 'false',
      OPERATIONAL_WRITES_ENABLED: 'false',
      WHATSAPP_AUTOMATION_ENABLED: 'false',
      EVOLUTION_WEBHOOK_ENABLED: 'false',
      WHATSAPP_AGENT_API_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  try {
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) throw new Error(`backend exited early: ${output}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
        if (response.ok) return { ok: true, status: response.status, body: await response.json() };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`backend health timeout: ${output}`);
  } finally {
    child.kill('SIGTERM');
  }
};

export async function runSyntheticMigrationUpgradeRehearsal() {
  const sourceUrl = process.env.DATABASE_URL;
  assert(sourceUrl, 'DATABASE_URL is required');
  requireSyntheticGuard(sourceUrl);
  const adminUrl = dbUrl(sourceUrl, new URL(sourceUrl).pathname.slice(1));
  const baselineUrl = dbUrl(sourceUrl, BASELINE_DB);
  const restoredUrl = dbUrl(sourceUrl, RESTORED_DB);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imperio-release-rehearsal-'));
  const baselineSchema = extractBaselinePrisma(tmpDir);
  const dumpPath = path.join(tmpDir, 'baseline.pgdmp');
  const baselineNames = migrationNamesAt(BASELINE_SHA);
  const targetNames = currentMigrationNames();
  assert(baselineNames.length === EXPECTED_BASELINE_MIGRATION_COUNT, 'baseline migration count mismatch');
  assert(targetNames.length === EXPECTED_TARGET_MIGRATION_COUNT, 'target migration count mismatch');

  resetDb(adminUrl, BASELINE_DB);
  resetDb(adminUrl, RESTORED_DB);
  applyMigrations(baselineUrl, baselineSchema);
  const preUpgradeLedger = jsonQuery(baselineUrl, ledgerSql);
  verifyLedger(preUpgradeLedger, EXPECTED_BASELINE_MIGRATION_COUNT, baselineNames);
  seedBaselineFixtures(baselineUrl, tmpDir);
  const fixtureTables = ['Unit', 'User', 'Service', 'Professional', 'Client', 'Booking', 'OpenCommand', 'CommandPayment', 'CommandServiceItem', 'ClientDuplicateReview', 'StockBalanceOpening'];
  const beforeCounts = countMap(baselineUrl, fixtureTables);

  run('pg_dump', ['-Fc', '--file', dumpPath, baselineUrl]);
  const restoreList = run('pg_restore', ['--list', dumpPath]);
  assert(restoreList.includes('TABLE DATA public Unit'), 'pg_restore --list missing Unit data');
  run('pg_restore', ['--no-owner', '--no-acl', '--dbname', restoredUrl, dumpPath]);

  applyMigrations(baselineUrl, path.join(backendRoot, 'prisma/schema.prisma'));
  applyMigrations(restoredUrl, path.join(backendRoot, 'prisma/schema.prisma'));
  const directPostLedger = jsonQuery(baselineUrl, ledgerSql);
  const restoredPostLedger = jsonQuery(restoredUrl, ledgerSql);
  verifyLedger(directPostLedger, EXPECTED_TARGET_MIGRATION_COUNT, targetNames);
  verifyLedger(restoredPostLedger, EXPECTED_TARGET_MIGRATION_COUNT, targetNames);
  const directCounts = verifyDataIntegrity(baselineUrl, beforeCounts);
  const restoredCounts = verifyDataIntegrity(restoredUrl, beforeCounts);

  run('npx', ['prisma', 'validate', '--schema', path.join(backendRoot, 'prisma/schema.prisma')], { env: { DATABASE_URL: restoredUrl } });
  const readinessOutput = run('node', ['tools/three-unit-readiness.mjs'], { env: { DATABASE_URL: restoredUrl } });
  const backendSmoke = await smokeBackend(restoredUrl);

  return {
    ok: true,
    type: 'SYNTHETIC REHEARSAL',
    baselineSha: BASELINE_SHA,
    targetSha: run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
    baselineMigrationCount: baselineNames.length,
    targetMigrationCount: targetNames.length,
    pendingAppliedCount: targetNames.filter((name) => !new Set(baselineNames).has(name)).length,
    baselineMigrations: baselineNames,
    targetMigrations: targetNames,
    preUpgradeLedger,
    directPostLedger,
    restoredPostLedger,
    baselineFixtures: beforeCounts,
    directCounts,
    restoredCounts,
    syntheticBackup: {
      file: dumpPath,
      bytes: fs.statSync(dumpPath).size,
      pgRestoreListLines: restoreList.split('\n').length,
    },
    checks: {
      prismaValidate: true,
      readinessDiagnostic: JSON.parse(readinessOutput).ok === true,
      backendHealth: backendSmoke,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSyntheticMigrationUpgradeRehearsal()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
