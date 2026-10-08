import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const EXPECTED_UNITS = ['centro', 'big', 'shopping-contagem'];

export const localMigrationChecksums = (dir = path.resolve(__dirname, '../prisma/migrations')) => {
  const result = new Map();
  const missingLocalMigrationSql = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const file = path.join(dir, entry.name, 'migration.sql');
    if (!fs.existsSync(file)) { missingLocalMigrationSql.push(entry.name); continue; }
    result.set(entry.name, createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  }
  return {checksums: result, missingLocalMigrationSql};
};

const localMigrationNames = () => {
  const dir = path.resolve(__dirname, '../prisma/migrations');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

const migrationRows = async () => prisma.$queryRaw`
  SELECT
    migration_name,
    checksum,
    finished_at,
    rolled_back_at,
    applied_steps_count,
    logs
  FROM "_prisma_migrations"
  ORDER BY started_at ASC, migration_name ASC
`;

const databaseIdentity = async () => {
  const [row] = await prisma.$queryRaw`
    SELECT current_database() AS database_name, current_schema() AS schema_name, version() AS server_version
  `;
  return row;
};

const canonicalUnitRows = async () => prisma.unit.findMany({
  where: { id: { in: EXPECTED_UNITS } },
  orderBy: { id: 'asc' },
  select: { id: true, name: true, active: true, timezone: true },
});

export async function buildReleasePreflightReport() {
  const [identity, dbMigrations, units] = await Promise.all([
    databaseIdentity(),
    migrationRows(),
    canonicalUnitRows(),
  ]);
  const localNames = localMigrationNames();
  const {checksums: localHashes, missingLocalMigrationSql} = localMigrationChecksums();
  const dbNames = dbMigrations.map((row) => row.migration_name);
  const dbSet = new Set(dbNames);
  const localSet = new Set(localNames);
  const pendingMigrations = localNames.filter((name) => !dbSet.has(name));
  const unexpectedDbMigrations = dbNames.filter((name) => !localSet.has(name));
  const incompleteMigrations = dbMigrations
    .filter((row) => !row.finished_at)
    .map((row) => row.migration_name);
  const rolledBackMigrations = dbMigrations
    .filter((row) => row.rolled_back_at)
    .map((row) => row.migration_name);
  const checksumMismatches = dbMigrations.filter(row => localHashes.has(row.migration_name) && row.checksum && localHashes.get(row.migration_name) !== row.checksum).map(row => row.migration_name);
  const missingDatabaseChecksum = dbMigrations.filter(row => !row.checksum).map(row => row.migration_name);
  const checksumEvidence = dbMigrations.map((row) => ({
    localChecksum: localHashes.get(row.migration_name) || null,
    databaseChecksum: row.checksum || null,
    checksumMatches: Boolean(row.checksum && localHashes.has(row.migration_name) && row.checksum === localHashes.get(row.migration_name)),
    migrationName: row.migration_name,
    checksum: row.checksum,
    finishedAt: row.finished_at,
    rolledBackAt: row.rolled_back_at,
    appliedStepsCount: Number(row.applied_steps_count ?? 0),
    logPresent: Boolean(row.logs),
  }));
  const unitIds = new Set(units.map((unit) => unit.id));
  const canonicalUnits = {
    expected: EXPECTED_UNITS,
    observed: units,
    missing: EXPECTED_UNITS.filter((id) => !unitIds.has(id)),
  };
  return {
    ok: pendingMigrations.length === 0
      && unexpectedDbMigrations.length === 0
      && incompleteMigrations.length === 0
      && rolledBackMigrations.length === 0
      && canonicalUnits.missing.length === 0
      && checksumMismatches.length === 0
      && missingDatabaseChecksum.length === 0
      && missingLocalMigrationSql.length === 0,
    opMode: 'READ_ONLY',
    generatedAt: new Date().toISOString(),
    database: identity,
    migrations: {
      filesystemCount: localNames.length,
      databaseCount: dbNames.length,
      filesystemMigrations: localNames,
      databaseMigrations: dbNames,
      pendingMigrations,
      unexpectedDbMigrations,
      incompleteMigrations,
      rolledBackMigrations,
      checksumEvidence,
      checksumMismatches,
      missingLocalMigrationSql,
      missingDatabaseChecksum,
    },
    canonicalUnits,
    flagsToVerifyExternally: [
      'OPERATIONAL_WRITES_ENABLED',
      'OPERATIONAL_WRITES_UNITS',
      'WHATSAPP_AUTOMATION_ENABLED',
      'WHATSAPP_AGENT_API_ENABLED',
      'EVOLUTION_WEBHOOK_ENABLED',
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildReleasePreflightReport()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.ok ? 0 : 2;
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, opMode: 'READ_ONLY', error: error.message }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
