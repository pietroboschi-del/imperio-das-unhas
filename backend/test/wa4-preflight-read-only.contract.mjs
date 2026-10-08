import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync(new URL('../tools/whatsapp-preflight.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/\.(create|createMany|upsert|update|updateMany|delete|deleteMany|executeRaw|queryRawUnsafe)\s*\(/,'preflight has no mutation-capable Prisma calls');
assert.doesNotMatch(source,/\bfetch\s*\(|\baxios\b|https?\.request/,'preflight does not contact the provider');
const output=execFileSync(process.execPath,['tools/whatsapp-preflight.mjs'],{
 cwd:new URL('../',import.meta.url),encoding:'utf8',
 env:{...process.env,DATABASE_URL:'',EVOLUTION_API_KEY:'SECRET_SENTINEL_NEVER_PRINT',
 EVOLUTION_WEBHOOK_SECRET:'OTHER_SECRET_SENTINEL_NEVER_PRINT'}});
const report=JSON.parse(output);
assert.equal(report.mode,'READ_ONLY');assert.equal(report.dbMutations,0);assert.equal(report.providerRequests,0);
assert.equal(report.activationPerformed,false);assert.equal(report.outbox.status,'NOT APPLICABLE');
assert.ok(report.requirements.some(r=>r.name==='provider_api_key'&&r.status==='READY'));
assert.ok(report.requirements.some(r=>r.name==='real_number_connection'&&r.status==='OWNER ACTION REQUIRED'));
assert.ok(report.requirements.some(r=>r.name==='migration:20261008_wa2_outbox_reconciliation_required'&&r.status==='READY'));
assert.ok(!output.includes('SECRET_SENTINEL_NEVER_PRINT')&&!output.includes('OTHER_SECRET_SENTINEL_NEVER_PRINT'));
console.log(JSON.stringify({ok:true,feature:'whatsapp_preflight_read_only',checks:11,externalCalls:false}));
