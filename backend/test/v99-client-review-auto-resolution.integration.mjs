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

  const batchCentralMerge='BATCH_REVIEW_MERGE_KEEP_CENTRAL_CI',centralMergeId='client-review-merge-central-ci';
  await cleanup(batchCentralMerge,[centralMergeId]);
  await prisma.client.create({data:{id:centralMergeId,name:'Carla Souza',phone:null,email:null,legacyPayload:{clientsOnly:{cpf:'55566677788',sources:[]}}}});
  const mergePayload={mode:'CLIENTS_ONLY',batchId:batchCentralMerge,phase:'FINAL',files:[{unitId:'centro',exportedAt:'2026-10-04T09:45:00-03:00',fileName:batchCentralMerge+'.xlsx',fileHash:H(913),rows:[
   {sourceRow:2,id:'root-a',nome:'Carla Souza',celular:'31966667777',cpf:'555.666.777-88'},
   {sourceRow:3,id:'root-b',nome:'Carla Souza',celular:'31988889999',cpf:'555.666.777-88'},
   {sourceRow:4,id:'leaf',nome:'Carla Souza Silva',celular:'31966667777'}
  ]}]};
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers:h,body:JSON.stringify(mergePayload)});
  assert.ok(r.ok,'dry-run merge para destino central em revisão');
  const mergeDry=await r.json(),mergePlans=mergeDry.report.plans.filter(x=>x.action==='REVIEW_REQUIRED');
  const rootPlan=mergePlans.find(x=>x.targetClientId===centralMergeId),leafPlan=mergePlans.find(x=>x.targetClientId!==centralMergeId);
  assert.ok(rootPlan&&leafPlan,'raiz central e folha de merge exigem revisão');
  assert.ok(rootPlan.conflicts.some(x=>x.type==='SOURCE_FIELD_CONFLICT'&&x.field==='phone'),'raiz possui telefone conflitante');
  assert.ok(leafPlan.conflicts.some(x=>(x.candidateClusterIds||[]).includes(rootPlan.clusterId)),'folha pode apontar para a raiz pelo relatório');
  const centralMergeIds=[centralMergeId,importedId(rootPlan.clusterId),importedId(leafPlan.clusterId)];cleanupJobs.push([batchCentralMerge,centralMergeIds]);

  await decide(h,batchCentralMerge,leafPlan.clusterId,'MERGE',rootPlan.clusterId);
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId:batchCentralMerge,approvalReportHash:mergeDry.report.reportHash})});
  assert.equal(r.status,409,'destino REVIEW_REQUIRED pendente bloqueia cadeia de merge');
  const pendingRoot=await r.json();assert.ok(String(pendingRoot.message||'').includes('Revisão humana pendente'),'erro identifica revisão pendente da raiz');
  assert.equal((await prisma.client.findUniqueOrThrow({where:{id:centralMergeId}})).phone,null,'cadeia bloqueada não altera cliente central');

  await decide(h,batchCentralMerge,rootPlan.clusterId,'KEEP_CENTRAL');
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId:batchCentralMerge,approvalReportHash:mergeDry.report.reportHash})});
  assert.ok(r.ok,'merge para raiz KEEP_CENTRAL é promovido');
  const centralMerged=await prisma.client.findUniqueOrThrow({where:{id:centralMergeId}});
  assert.equal(centralMerged.phone,null,'merge não reintroduz valor de campo conflitante protegido pela raiz');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:centralMergeId,unitId:'centro'}}),1,'cadeia merge mantém vínculo da unidade na raiz central');
  const mergedSources=Array.isArray(centralMerged.legacyPayload?.clientsOnly?.sources)?centralMerged.legacyPayload.clientsOnly.sources:[];
  assert.equal(mergedSources.filter(x=>x.batchId===batchCentralMerge).length,3,'cadeia merge preserva proveniência das três linhas');
  assert.equal(await prisma.client.count({where:{id:{in:[importedId(rootPlan.clusterId),importedId(leafPlan.clusterId)]}}}),0,'cadeia para KEEP_CENTRAL não cria clientes duplicados');

  const batchStrong='BATCH_REVIEW_MULTIPLE_STRONG_CI',strongA='client-review-strong-a-ci',strongB='client-review-strong-b-ci';
  await cleanup(batchStrong,[strongA,strongB]);
  await prisma.client.create({data:{id:strongA,name:'Diana Lopes',phone:null,email:null,legacyPayload:{clientsOnly:{cpf:'84520371964',sources:[]}}}});
  await prisma.client.create({data:{id:strongB,name:'Diana Lopes',phone:null,email:'diana.legacy@example.com',legacyPayload:{clientsOnly:{cpf:'86420975311',sources:[]}}}});
  const strongPayload={mode:'CLIENTS_ONLY',batchId:batchStrong,phase:'FINAL',files:[{unitId:'centro',exportedAt:'2026-10-04T10:05:00-03:00',fileName:batchStrong+'.xlsx',fileHash:H(914),rows:[
   {sourceRow:2,id:'strong-source',nome:'Diana Lopes',celular:'31977776666',email:'diana.legacy@example.com',cpf:'845.203.719-64'}
  ]}]};
  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers:h,body:JSON.stringify(strongPayload)});
  assert.ok(r.ok,'dry-run multiple strong matches');
  const strongDry=await r.json(),strongPlan=strongDry.report.plans.find(x=>x.conflicts.some(c=>c.type==='MULTIPLE_STRONG_MATCHES'));
  assert.ok(strongPlan&&strongPlan.action==='REVIEW_REQUIRED'&&!strongPlan.targetClientId,'multiple strong matches não escolhe cliente central automaticamente');
  const strongConflict=strongPlan.conflicts.find(c=>c.type==='MULTIPLE_STRONG_MATCHES');
  assert.deepEqual([...strongConflict.candidateClientIds].sort(),[strongA,strongB].sort(),'relatório lista exatamente os dois candidatos centrais');

  r=await fetch(base+'/api/v1/client-duplicate-reviews/'+encodeURIComponent(batchStrong),{headers:{'cookie':c}});
  assert.ok(r.ok,'fila multiple strong carregada');
  const strongQueue=await r.json(),strongItem=strongQueue.items.find(x=>x.clusterId===strongPlan.clusterId);
  assert.deepEqual((strongItem?.centralCandidates||[]).map(x=>x.clientId).sort(),[strongA,strongB].sort(),'fila expõe os dois clientes centrais candidatos');

  r=await fetch(base+'/api/v1/client-duplicate-reviews/'+encodeURIComponent(batchStrong)+'/'+encodeURIComponent(strongPlan.clusterId),{method:'POST',headers:h,body:JSON.stringify({decision:'MATCH_CENTRAL',targetClientId:'client-fora-do-relatorio'})});
  assert.equal(r.status,409,'MATCH_CENTRAL rejeita cliente fora dos candidatos do relatório');
  assert.equal(await prisma.clientDuplicateReview.count({where:{batchId:batchStrong,clusterId:strongPlan.clusterId}}),0,'alvo central inválido não é persistido');

  r=await fetch(base+'/api/v1/client-duplicate-reviews/'+encodeURIComponent(batchStrong)+'/'+encodeURIComponent(strongPlan.clusterId),{method:'POST',headers:h,body:JSON.stringify({decision:'MATCH_CENTRAL',targetClientId:strongA,note:'CPF confirma o cliente central correto'})});
  assert.ok(r.ok,'MATCH_CENTRAL válido salvo');
  const strongReview=await prisma.clientDuplicateReview.findUniqueOrThrow({where:{batchId_clusterId:{batchId:batchStrong,clusterId:strongPlan.clusterId}}});
  assert.equal(strongReview.targetClientId,strongA,'decisão persiste cliente central selecionado de forma explícita');
  cleanupJobs.push([batchStrong,[strongA,strongB,importedId(strongPlan.clusterId)]]);

  r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{method:'POST',headers:h,body:JSON.stringify({batchId:batchStrong,approvalReportHash:strongDry.report.reportHash})});
  assert.ok(r.ok,'MATCH_CENTRAL promove candidato central escolhido');
  const selected=await prisma.client.findUniqueOrThrow({where:{id:strongA}}),other=await prisma.client.findUniqueOrThrow({where:{id:strongB}});
  assert.equal(selected.phone,null,'seleção de identidade não autoriza preencher telefone central vazio');
  assert.equal(selected.email,null,'seleção de identidade não copia e-mail que também apontava para outro cliente central');
  assert.equal(selected.legacyPayload?.clientsOnly?.cpf,'84520371964','CPF do cliente selecionado é preservado');
  assert.equal(other.email,'diana.legacy@example.com','cliente central não selecionado permanece inalterado');
  assert.equal(await prisma.clientUnitLink.count({where:{clientId:strongA,unitId:'centro'}}),1,'unidade é vinculada ao cliente central escolhido');
  assert.ok(Array.isArray(selected.legacyPayload?.clientsOnly?.sources)&&selected.legacyPayload.clientsOnly.sources.some(x=>x.batchId===batchStrong),'proveniência do Excel é anexada ao cliente escolhido');
  assert.equal(await prisma.client.count({where:{id:importedId(strongPlan.clusterId)}}),0,'MATCH_CENTRAL não cria terceira duplicata');

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
