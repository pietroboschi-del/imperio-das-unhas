import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),port=Number(process.env.CLIENT_REVIEW_GATE_TEST_PORT||3106),base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const batchId='BATCH_REVIEW_GATE_CI',centralId='client-review-gate-ci';
const H=n=>'sha256:'+String(n).padStart(64,'0');
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(400)}throw Error('backend não iniciou')}
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];

async function cleanup(){
 const envs=await prisma.migrationEnvelope.findMany({where:{reconciliationId:batchId},select:{id:true}});
 if(envs.length)await prisma.migrationEntity.deleteMany({where:{envelopeId:{in:envs.map(x=>x.id)}}});
 await prisma.clientDuplicateReview.deleteMany({where:{batchId}});
 await prisma.migrationEnvelope.deleteMany({where:{reconciliationId:batchId}});
 await prisma.clientUnitLink.deleteMany({where:{clientId:centralId}});
 await prisma.client.deleteMany({where:{id:centralId}});
}

async function main(){
 await cleanup();
 await prisma.unit.upsert({where:{id:'centro'},create:{id:'centro',name:'Centro de Contagem'},update:{active:true}});
 await prisma.client.create({data:{id:centralId,name:'Ana Revisão',phone:'+5531999991000',email:'central@example.com',legacyPayload:{clientsOnly:{cpf:'12345678901',sources:[]}}}});

 const p=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),MIGRATION_IMPORT_ENABLED:'true',CLIENT_BATCH_COMMIT_ENABLED:'true',OPERATIONAL_WRITES_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
  assert.ok(r.ok,'login owner CI');
  const c=cookie(r),auth=await r.json(),h={'content-type':'application/json','cookie':c,'x-csrf-token':auth.csrfToken};

  const payload={mode:'CLIENTS_ONLY',batchId,phase:'FINAL',files:[{unitId:'centro',exportedAt:'2026-10-04T09:00:00-03:00',fileName:'review-gate.xlsx',fileHash:H(901),rows:[{sourceRow:2,id:'legacy-review-gate',nome:'Ana Revisão',celular:'31999991000',email:'legado@example.com',cpf:'123.456.789-01'}]}]};
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers:h,body:JSON.stringify(payload)});
  assert.ok(r.ok,'dry-run FINAL');
  const dry=await r.json(),plan=dry.report.plans.find(x=>x.targetClientId===centralId);
  assert.ok(plan&&plan.action==='REVIEW_REQUIRED','conflito exige revisão humana');

  r=await fetch(base+'/api/v1/client-duplicate-reviews/'+encodeURIComponent(batchId)+'/'+encodeURIComponent(plan.clusterId),{method:'POST',headers:h,body:JSON.stringify({decision:'REVIEW_LATER',note:'aguardar conferência'})});
  assert.ok(r.ok,'REVIEW_LATER salvo');

  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId,approvalReportHash:dry.report.reportHash,resolutions:{[plan.clusterId]:{mode:'KEEP_CENTRAL'}}})});
  assert.equal(r.status,409,'REVIEW_LATER bloqueia promoção mesmo com resolution manual');
  const body=await r.json();
  assert.ok(String(body.message||'').includes('revisar depois'),'erro explica bloqueio pela fila humana');

  assert.equal(await prisma.client.count({where:{id:centralId}}),1,'cliente central permanece único');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:centralId}}),0,'promoção bloqueada não cria vínculo');
  const env=await prisma.migrationEnvelope.findFirstOrThrow({where:{reconciliationId:batchId}});
  assert.notEqual(env.status,'IMPORTED','batch não é marcado importado');
  console.log(JSON.stringify({ok:true,feature:'client_review_promotion_gate'}));
 }finally{
  if(p.exitCode===null&&p.signalCode===null){p.kill('SIGTERM');await Promise.race([once(p,'exit'),sleep(3000)]).catch(()=>{})}
  await cleanup().catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await cleanup().catch(()=>{});await prisma.$disconnect().catch(()=>{});process.exit(1)});
