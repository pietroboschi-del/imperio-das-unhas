import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),port=Number(process.env.CLIENT_COMMIT_IDEMPOTENCY_TEST_PORT||3108),base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const batchId='BATCH_COMMIT_IDEMPOTENCY_CI',H=n=>'sha256:'+String(n).padStart(64,'0');
let clientIds=[];
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(400)}throw Error('backend não iniciou')}
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function cleanup(){
 const envs=await prisma.migrationEnvelope.findMany({where:{reconciliationId:batchId},select:{id:true}});
 if(envs.length)await prisma.migrationEntity.deleteMany({where:{envelopeId:{in:envs.map(x=>x.id)}}});
 if(clientIds.length){
  await prisma.clientUnitLink.deleteMany({where:{clientId:{in:clientIds}}});
  await prisma.client.deleteMany({where:{id:{in:clientIds}}});
 }
 await prisma.clientDuplicateReview.deleteMany({where:{batchId}});
 await prisma.migrationEnvelope.deleteMany({where:{reconciliationId:batchId}});
}
async function main(){
 await cleanup();
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping']])await prisma.unit.upsert({where:{id},create:{id,name},update:{active:true}});
 const p=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),MIGRATION_IMPORT_ENABLED:'true',CLIENT_BATCH_COMMIT_ENABLED:'true',OPERATIONAL_WRITES_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
  assert.ok(r.ok,'login owner CI');
  const c=cookie(r),auth=await r.json(),h={'content-type':'application/json','cookie':c,'x-csrf-token':auth.csrfToken};
  const payload={mode:'CLIENTS_ONLY',batchId,phase:'FINAL',files:[
   {unitId:'centro',exportedAt:'2026-10-04T14:00:00-03:00',fileName:'centro-idempotency.xlsx',fileHash:H(921),rows:[{sourceRow:2,id:'centro-idem',nome:'Cliente Idem Centro',celular:'31911110001'}]},
   {unitId:'big',exportedAt:'2026-10-04T14:01:00-03:00',fileName:'big-idempotency.xlsx',fileHash:H(922),rows:[{sourceRow:2,id:'big-idem',nome:'Cliente Idem Big',celular:'31911110002'}]}
  ]};
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers:h,body:JSON.stringify(payload)});
  assert.ok(r.ok,'dry-run FINAL multiunidade');
  const dry=await r.json();
  assert.equal(dry.report.plans.length,2,'dois clientes planejados');
  assert.ok(dry.report.plans.every(x=>x.action==='CREATE'),'sem conflitos no batch de idempotência');
  clientIds=dry.report.plans.map(x=>'client:import:'+x.clusterId.replace('cluster:',''));

  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId,approvalReportHash:dry.report.reportHash})});
  assert.ok(r.ok,'primeiro commit aceito');
  const first=await r.json();
  assert.equal(first.duplicate,false,'primeiro commit não é duplicata');
  assert.equal(await prisma.client.count({where:{id:{in:clientIds}}}),2,'primeiro commit cria dois clientes');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:{in:clientIds}}}),2,'primeiro commit cria dois vínculos');
  const before=await prisma.client.findMany({where:{id:{in:clientIds}},orderBy:{id:'asc'}});
  const beforeSources=before.map(x=>Array.isArray(x.legacyPayload?.clientsOnly?.sources)?x.legacyPayload.clientsOnly.sources.length:0);
  assert.deepEqual(beforeSources,[1,1],'proveniência inicial sem duplicação');

  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId,approvalReportHash:dry.report.reportHash})});
  assert.ok(r.ok,'retry exato do commit aceito');
  const duplicate=await r.json();
  assert.equal(duplicate.duplicate,true,'retry exato identificado como duplicata');
  assert.equal(await prisma.client.count({where:{id:{in:clientIds}}}),2,'retry não duplica clientes');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:{in:clientIds}}}),2,'retry não duplica vínculos');
  const after=await prisma.client.findMany({where:{id:{in:clientIds}},orderBy:{id:'asc'}});
  assert.deepEqual(after.map(x=>Array.isArray(x.legacyPayload?.clientsOnly?.sources)?x.legacyPayload.clientsOnly.sources.length:0),[1,1],'retry não duplica proveniência');

  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId,approvalReportHash:H(999)})});
  assert.equal(r.status,409,'batch já importado rejeita outro hash');

  const envs=await prisma.migrationEnvelope.findMany({where:{reconciliationId:batchId},orderBy:{instanceId:'asc'}});
  assert.equal(envs.length,2,'dois envelopes importados');
  const corrupted={...(envs[1].summary&&typeof envs[1].summary==='object'&&!Array.isArray(envs[1].summary)?envs[1].summary:{}),committedReportHash:H(998)};
  await prisma.migrationEnvelope.update({where:{id:envs[1].id},data:{summary:corrupted}});
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId,approvalReportHash:dry.report.reportHash})});
  assert.equal(r.status,409,'retry exige unanimidade do committedReportHash em todos os envelopes');
  const err=await r.json();assert.ok(String(err.message||'').includes('unanimemente'),'erro explicita inconsistência multiunidade');
  assert.equal(await prisma.client.count({where:{id:{in:clientIds}}}),2,'estado inconsistente não reexecuta promoção');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:{in:clientIds}}}),2,'estado inconsistente não duplica vínculos');

  console.log(JSON.stringify({ok:true,feature:'client_commit_idempotency'}));
 }finally{
  if(p.exitCode===null&&p.signalCode===null){p.kill('SIGTERM');await Promise.race([once(p,'exit'),sleep(3000)]).catch(()=>{})}
  await cleanup().catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await cleanup().catch(()=>{});await prisma.$disconnect().catch(()=>{});process.exit(1)});
