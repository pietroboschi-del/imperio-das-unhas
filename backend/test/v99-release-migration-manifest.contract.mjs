import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const manifest=read('../docs/release/official-three-unit-release-manifest.md');
const runbook=read('../docs/release/cutover-runbook.md');
const rehearsal=read('../tools/synthetic-migration-upgrade-rehearsal.mjs');
const workflow=read('../../.github/workflows/backend-ci.yml');
const names=readdirSync(new URL('../prisma/migrations/',import.meta.url),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
function section(name,next){const a=manifest.indexOf('## '+name);assert.ok(a>=0);const b=manifest.indexOf('\n## ',a+3);return manifest.slice(a,b<0?undefined:b)}
function listed(part){return [...part.matchAll(/^\d+\. `([^\x60]+)`/gm)].map(x=>x[1]);}
const baseline=listed(section('EXPECTED_BASELINE_MIGRATIONS'));
const target=listed(section('TARGET_MIGRATIONS'));
const pending=listed(section('PENDING_MIGRATIONS'));
assert.equal(baseline.length,13);
assert.equal(target.length,11);
assert.equal(pending.length,11);
assert.deepEqual([...baseline,...target].sort(),names,'manifest must exactly match SQL migration folders');
assert.deepEqual(target,pending,'pending delta must be exact');
assert.ok(target.includes('20261008_wa2_outbox_reconciliation_required'));
assert.match(manifest,/Target count: `24`/);
assert.match(rehearsal,/EXPECTED_TARGET_MIGRATION_COUNT = 24/);
assert.match(runbook,/Applies the exact pending delta toward 24/);
assert.match(runbook,/23 migrations, no pending/);
assert.match(workflow,/Synthetic 13-to-24 migration rehearsal/);
console.log(JSON.stringify({ok:true,feature:'release_manifest_migration_parity',migrations:names.length,baseline:13,pending:11}));
