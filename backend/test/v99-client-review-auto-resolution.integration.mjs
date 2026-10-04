import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),port=Number(process.env.CLIENT_REVIEW_RESOLUTION_TEST_PORT||3107),base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const H=n=>'sha256:'+String(n).padStart(64,'0');
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(400)}throw Error('backend não iniciou')}
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];

async function cleanup(batchId,clientIds=[]){
 const envs=await prisma.migrationEnvelope.findMany({where:{reconciliationId:batchId},select:{id:true}});
 if(envs.length)await prisma.migrationEntity.deleteMany({where:{envelopeId:{in:envs.map(x=>x.id)}}});
 await prisma.clientDuplicateReview.deleteMany({where:{batchId}});
 await prisma.migrationEnvelope.deleteMany({where:{reconciliationId:batchId}});
 if(clientIds.length){
  await prisma.clientUnitLink.deleteMany({where:{clientId:{in:clientIds}}});
  await prisma.client.deleteMany({where:{id:{in:clientIds}}});
 }
}
const importedId=clusterId=>'client:import:'+clusterId.replace('cluster:','');

async function stageAndReport(h,batchId,hashN){
 const payload={mode:'CLIENTS_ONLY',batchId,phase:'FINAL',files:[{unitId:'centro',exportedAt:'2026-10-04T09:30:00-03:00',fileName:batchId+'.xlsx',fileHash:H(hashN),rows:[
  {sourceRow:2,id:'a',nome:'Aline Pontello',celular:'31984869296'},
  {sourceRow:3,id:'b',nome:'Aline Pontelo',celular:'31984869296'}
 ]}]};
 let r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers:h,body:JSON.stringify(payload)});
 assert.ok(r.ok,'dry-run ambíguo');
 const dry=await r.json();
 const plans=dry.report.plans.filter(x=>x.action==='REVIEW_REQUIRED');
 assert.equal(plans.length,2,'dois clusters exigem revisão');
 return {dry,plans};
}
async function decide(h,batchId,clusterId,decision,targetClusterId){
 const body={decision,...(targetClusterId?{targetClusterId}:{})};
 const r=await fetch(base+'/api/v1/client-duplicate-reviews/'+encodeURIComponent(batchId)+'/'+encodeURIComponent(clusterId),{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.ok(r.ok,decision+' salvo');
}

async function main(){
 await prisma.unit.upsert({where:{id:'centro'},create:{id:'centro',name:'Centro de Contagem'},update:{active:true}});
 const p=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),MIGRATION_IMPORT_ENABLED:'true',CLIENT_BATCH_COMMIT_ENABLED:'true',OPERATIONAL_WRITES_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 const cleanupJobs=[];
 try{
  await wait();
  let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
  assert.ok(r.ok,'login owner CI');
  const c=cookie(r),auth=await r.json(),h={'content-type':'application/json','cookie':c,'x-csrf-token':auth.csrfToken};

  const batchMerge='BATCH_REVIEW_AUTO_MERGE_CI';
  await cleanup(batchMerge);
  const one=await stageAndReport(h,batchMerge,911),[a,b]=one.plans;
  const ids=[importedId(a.clusterId),importedId(b.clusterId)];cleanupJobs.push([batchMerge,ids]);
  await decide(h,batchMerge,a.clusterId,'MERGE',b.clusterId);
  await decide(h,batchMerge,b.clusterId,'KEEP_SEPARATE');
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId:batchMerge,approvalReportHash:one.dry.report.reportHash})});
  assert.ok(r.ok,'commit usa decisões humanas sem resolutions manual');
  const committed=await r.json();
  assert.equal(committed.conflictsResolved,2,'duas revisões humanas resolvidas');
  assert.equal(await prisma.client.count({where:{id:{in:ids}}}),1,'MERGE + KEEP_SEPARATE produz um cliente central');
  assert.ok(await prisma.client.findUnique({where:{id:importedId(b.clusterId)}}),'cluster mantido separado vira raiz criada');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:importedId(b.clusterId),unitId:'centro'}}),1,'raiz recebe vínculo da unidade');
  const root=await prisma.client.findUniqueOrThrow({where:{id:importedId(b.clusterId)}});
  const sources=Array.isArray(root.legacyPayload?.clientsOnly?.sources)?root.legacyPayload.clientsOnly.sources:[];
  assert.equal(sources.length,2,'mesclagem incorpora proveniência dos dois clusters');

  const batchCycle='BATCH_REVIEW_CYCLE_CI';
  await cleanup(batchCycle);
  const two=await stageAndReport(h,batchCycle,912),[x,y]=two.plans;
  const cycleIds=[importedId(x.clusterId),importedId(y.clusterId)];cleanupJobs.push([batchCycle,cycleIds]);
  await decide(h,batchCycle,x.clusterId,'MERGE',y.clusterId);
  await decide(h,batchCycle,y.clusterId,'MERGE',x.clusterId);
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId:batchCycle,approvalReportHash:two.dry.report.reportHash})});
  assert.equal(r.status,409,'ciclo de merge é bloqueado');
  const err=await r.json();assert.ok(String(err.message||'').includes('Ciclo de mesclagem'),'erro identifica ciclo');
  assert.equal(await prisma.client.count({where:{id:{in:cycleIds}}}),0,'ciclo não cria clientes');
  const cycleEnvs=await prisma.migrationEnvelope.findMany({where:{reconciliationId:batchCycle}});
  assert.ok(cycleEnvs.every(e=>e.status!=='IMPORTED'),'ciclo não marca batch como importado');

  console.log(JSON.stringify({ok:true,feature:'client_review_auto_resolution'}));
 }finally{
  if(p.exitCode===null&&p.signalCode===null){p.kill('SIGTERM');await Promise.race([once(p,'exit'),sleep(3000)]).catch(()=>{})}
  for(const [batch,ids] of cleanupJobs)await cleanup(batch,ids).catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
