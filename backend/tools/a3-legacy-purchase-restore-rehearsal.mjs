// A3-FIN-REP: restore a synthetic pre-A3 (23-migration) database with an unreconciled purchase.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrations=path.join(root,'prisma','migrations');
const excluded='20261010_a3_fin_rep_authoritative_ledger';
const first='imperio_a3_legacy_pre';
const restored='imperio_a3_legacy_restored';
const original=process.env.DATABASE_URL||'';
const parsed=new URL(original);
if(process.env.SYNTHETIC_REHEARSAL!=='1'||!['localhost','127.0.0.1','::1'].includes(parsed.hostname)||!parsed.pathname.includes('imperio_ci'))throw Error('A3 restore rehearsal only allowed in synthetic loopback CI');
const url=name=>{const u=new URL(original);u.pathname='/'+name;u.searchParams.delete('schema');return u.toString()};
const run=(program,args,env={})=>{
 const out=spawnSync(program,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',maxBuffer:16*1024*1024});
 if(out.error||out.status!==0)throw Error(program+' '+args.join(' ')+': '+(out.stderr||out.stdout||out.error));
 return out.stdout.trim();
};
const sql=(u,statement)=>run('psql',[u,'-X','-t','-A','-v','ON_ERROR_STOP=1','-c',statement]);
const reset=name=>{sql(url('imperio_ci'),'DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)');sql(url('imperio_ci'),'CREATE DATABASE "'+name+'"')};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'imperio-a3-restore-'));
try{
 reset(first);reset(restored);
 const dest=path.join(tmp,'prisma');
 fs.mkdirSync(path.join(dest,'migrations'),{recursive:true});
 fs.copyFileSync(path.join(root,'prisma','schema.prisma'),path.join(dest,'schema.prisma'));
 for(const name of fs.readdirSync(migrations)){
  if(name===excluded)continue;
  const from=path.join(migrations,name),to=path.join(dest,'migrations',name);
  if(fs.statSync(from).isDirectory())fs.cpSync(from,to,{recursive:true});
  else fs.copyFileSync(from,to);
 }
 const n=fs.readdirSync(path.join(dest,'migrations')).filter(n=>fs.statSync(path.join(dest,'migrations',n)).isDirectory()).length;
 if(n!==23)throw Error('Expected 23 pre-A3 migrations; found '+n);
 run('npx',['prisma','migrate','deploy','--schema',path.join(dest,'schema.prisma')],{DATABASE_URL:url(first)});
 const before=sql(url(first),"SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StockPurchase' AND column_name='financeUnitId')");
 if(before!=='f')throw Error('Legacy pre-A3 purchase unexpectedly has financeUnitId');
 sql(url(first),"INSERT INTO \"Unit\" (\"id\",\"name\",\"updatedAt\") VALUES ('centro','Centro sintético',NOW()) ON CONFLICT (\"id\") DO NOTHING");
 sql(url(first),"INSERT INTO \"StockLocation\" (\"id\",\"kind\",\"unitId\",\"name\",\"updatedAt\") VALUES ('a3_loc','UNIT','centro','Estoque histórico sintético',NOW())");
 sql(url(first),"INSERT INTO \"StockPurchase\" (\"id\",\"destinationLocationId\",\"purchaseDate\",\"supplier\",\"goodsTotal\",\"total\",\"createdByUserId\",\"idempotencyKey\") VALUES ('a3_legacy_purchase','a3_loc','2026-09-01','Fornecedor histórico sintético',9,9,'synthetic_owner','a3_legacy_key')");
 const backup=path.join(tmp,'pre-a3.pgdump');
 run('pg_dump',['-Fc','--file',backup,url(first)]);
 run('pg_restore',['--no-owner','--no-acl','--dbname',url(restored),backup]);
 if(sql(url(restored),"SELECT count(*) FROM \"StockPurchase\" WHERE id='a3_legacy_purchase'")!=='1')throw Error('Legacy row not restored');
 run('npx',['prisma','migrate','deploy','--schema',path.join(root,'prisma','schema.prisma')],{DATABASE_URL:url(restored)});
 const count=sql(url(restored),'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
 if(count!=='24')throw Error('Expected 24 upgraded migrations, got '+count);
 if(sql(url(restored),"SELECT COALESCE(\"financeUnitId\",'NULL') FROM \"StockPurchase\" WHERE id='a3_legacy_purchase'")!=='NULL')throw Error('Migration improperly assigned unknown financial ownership');
 if(sql(url(restored),"SELECT total FROM \"StockPurchase\" WHERE id='a3_legacy_purchase'")!=='9.00')throw Error('Restored purchase value changed');
 // Manual reconciliation simulated ONLY in restored clone after explicit fixture mapping.
 sql(url(restored),"UPDATE \"StockPurchase\" SET \"financeUnitId\"='centro' WHERE id='a3_legacy_purchase' AND \"financeUnitId\" IS NULL");
 if(sql(url(restored),"SELECT \"financeUnitId\" FROM \"StockPurchase\" WHERE id='a3_legacy_purchase'")!=='centro')throw Error('Sandbox reconciliation failed');
 console.log(JSON.stringify({ok:true,scenario:'A3 restored synthetic pre-A3 backup 23-to-24 migrations',legacyPurchaseUntouchedBeforeApprovedMapping:true,manualReconciliationInClone:true,productionWrites:false}));
}finally{
 for(const name of [restored,first]){try{sql(url('imperio_ci'),'DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)')}catch{}}
 fs.rmSync(tmp,{recursive:true,force:true});
}
