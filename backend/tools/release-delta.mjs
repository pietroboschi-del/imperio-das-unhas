import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const DEFAULT_BACKEND_SHA = '920d74cbb5856ab3bdb1c63c1c0c762c82346cba';
const DEFAULT_FRONTEND_SHA = 'a5e43d114dd34cac2231a96cbc3d5d46f0d44f59';

const runCapture = (cmd, args, cwd = repoRoot) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.error && result.status !== 0) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr}`);
  return String(result.stdout || '').trim();
};
const git = (args) => runCapture('git', args);
const migrationNameFromPath = (filePath) => filePath.split('/').at(-2);
const currentMigrations = () => fs.readdirSync(path.resolve(__dirname, '../prisma/migrations'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migrationsAt = (sha) => git(['ls-tree', '-r', '--name-only', sha, 'backend/prisma/migrations'])
  .split('\n')
  .filter((line) => line.endsWith('/migration.sql'))
  .map(migrationNameFromPath)
  .sort();

export function buildReleaseDeltaReport({
  liveBackendSha = process.env.LIVE_BACKEND_SHA || DEFAULT_BACKEND_SHA,
  liveFrontendSha = process.env.LIVE_FRONTEND_SHA || DEFAULT_FRONTEND_SHA,
  targetSha = process.env.TARGET_RELEASE_SHA || git(['rev-parse', 'HEAD']),
} = {}) {
  const targetMigrations = currentMigrations();
  const backendLiveMigrations = migrationsAt(liveBackendSha);
  const liveSet = new Set(backendLiveMigrations);
  const targetSet = new Set(targetMigrations);
  const changedFiles = git(['diff', '--name-only', `${liveBackendSha}..${targetSha}`])
    .split('\n')
    .filter(Boolean);
  const criticalChangedFiles = changedFiles.filter((file) => /(^backend\/prisma\/|^backend\/src\/|^backend\/tools\/|^backend\/test\/|^\.github\/workflows\/|^frontend\/|^src\/|^index\.html$)/.test(file));
  return {
    generatedAt: new Date().toISOString(),
    targetHead: targetSha,
    LIVE_BACKEND_SHA: liveBackendSha,
    LIVE_FRONTEND_SHA: liveFrontendSha,
    commitDelta: git(['log', '--oneline', `${liveBackendSha}..${targetSha}`]).split('\n').filter(Boolean),
    migrationDelta: {
      baselineCount: backendLiveMigrations.length,
      targetCount: targetMigrations.length,
      baselineMigrations: backendLiveMigrations,
      targetMigrations,
      pendingMigrations: targetMigrations.filter((name) => !liveSet.has(name)),
      removedMigrations: backendLiveMigrations.filter((name) => !targetSet.has(name)),
    },
    schemaChanges: git(['diff', '--stat', `${liveBackendSha}..${targetSha}`, '--', 'backend/prisma/schema.prisma', 'backend/prisma/migrations']).split('\n').filter(Boolean),
    criticalChangedFiles,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(buildReleaseDeltaReport(), null, 2));
}
