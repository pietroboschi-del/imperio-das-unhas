import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {buildReleasePreflightReport,localMigrationChecksums} from '../tools/release-preflight.mjs';
const prisma=new PrismaClient();
let assertions=0;
const ok=(condition,message)=>{assertions++;assert.ok(condition,message)};
const eq=(actual,expected,message)=>{assertions++;assert.equal(actual,expected,message)};
const {checksums}=localMigrationChecksums();
const name='20261008_wa2_outbox_reconciliation_required';
const file=new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url);
const original=readFileSync(file);
try{
 const intact=await buildReleasePreflightReport();
 const evidence=intact.migrations.checksumEvidence.find(row=>row.migrationName===name);
 ok(evidence,'new migration present in CI ledger');
 eq(evidence.localChecksum,checksums.get(name),'SHA256 of raw file bytes is stable');
 eq(evidence.localChecksum,evidence.databaseChecksum,'Prisma checksum matches raw bytes');
 eq(evidence.checksumMatches,true,'intact migration checksum matches');
 eq(intact.migrations.checksumMismatches.length,0,'fresh ledger has no checksum mismatches');
 const altered=Buffer.concat([original,Buffer.from('\n-- tampered SQL fixture\n')]);
 writeFileSync(file,altered);
 const mismatch=await buildReleasePreflightReport();
 ok(mismatch.migrations.checksumMismatches.includes(name),'tampered migration found');
 eq(mismatch.ok,false,'tampered migration fails release gate');
 const mismatchEvidence=mismatch.migrations.checksumEvidence.find(row=>row.migrationName===name);
 eq(mismatchEvidence.checksumMatches,false,'per-migration mismatch visible');
}finally{writeFileSync(file,original)}
try{
 const row=await prisma.$queryRaw`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE migration_name=${name}`;
 ok(row.length===1,'isolated CI migration ledger row exists');
 await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum = 'invalid-checksum-fixture' WHERE migration_name=${name}`;
 const mismatch=await buildReleasePreflightReport();
 ok(mismatch.migrations.checksumMismatches.includes(name),'tampered ledger checksum found');
 eq(mismatch.ok,false,'bad database checksum fails release gate');
 await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum = NULL WHERE migration_name=${name}`.catch(()=>{});
 // Missing checksum is tested with a non-empty blank string to respect DB not-null constraints.
 await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum = '' WHERE migration_name=${name}`;
 const missing=await buildReleasePreflightReport();
 ok(missing.migrations.missingDatabaseChecksum.includes(name),'missing DB checksum found');
 eq(missing.ok,false,'missing DB checksum fails release gate');
 await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum = ${row[0].checksum} WHERE migration_name=${name}`;
}finally{
 // Restore from the local raw file even after assertion failures, but only in the disposable CI DB.
 await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum = ${checksums.get(name)} WHERE migration_name=${name}`.catch(()=>{});
 await prisma.$disconnect();
}
// Verify missing/pending local migrations and unexpected applied names in the disposable CI ledger.
const synthetic='__ci_unknown_migration_fixture__';
const auditDb=new PrismaClient();
try {
 await auditDb.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = ${synthetic} WHERE migration_name = ${name}`;
 const invalid=await buildReleasePreflightReport();
 ok(invalid.migrations.pendingMigrations.includes(name),'unapplied local migration flagged pending');
 ok(invalid.migrations.unexpectedDbMigrations.includes(synthetic),'unknown database migration flagged');
 eq(invalid.ok,false,'unknown plus pending migration fails gate');
} finally {
 await auditDb.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = ${name} WHERE migration_name = ${synthetic}`.catch(()=>{});
 await auditDb.$disconnect();
}
const source=readFileSync(new URL('../tools/release-preflight.mjs',import.meta.url),'utf8');
ok(!/\$executeRaw|\.(create|update|delete|upsert|executeRaw|createMany|updateMany|deleteMany)\s*\(/.test(source),'preflight implementation contains no DB writes');
ok(!source.includes('process.env.DATABASE_URL')&&!source.includes('console.log(process.env'),'preflight never prints credential URLs');
console.log(JSON.stringify({ok:true,assertions,feature:'release_checksum_preflight_isolated_ci'}));
