import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
const prisma=new PrismaClient(),port=3233,host='http://127.0.0.1:'+port;
const sha=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0;function ok(value,reason){assert.ok(value,reason);checks++}
const ids=['a4-owner','a4-centro','a4-viewer','a4-big'];
async function cleanup(){
 await prisma.auditEvent.deleteMany({where:{action:{startsWith:'task.manual.'}}});
 await prisma.managementTask.deleteMany({where:{OR:[{id:{startsWith:'manual_'}},{id:{startsWith:'a4_'}}]}});
 await prisma.session.deleteMany({where:{userId:{in:ids}}});
 await prisma.userUnitAccess.deleteMany({where:{userId:{in:ids}}});
 await prisma.user.deleteMany({where:{id:{in:ids}}});
}
async function user(id,units,perms,admin=false){
 await prisma.user.create({data:{id,username:id,displayName:id,networkAdmin:admin,systemRole:admin?'OWNER':'OPERATOR',permissions:perms,active:true,passwordResetRequired:false}});
 if(units.length)await prisma.userUnitAccess.createMany({data:units.map(unitId=>({userId:id,unitId,role:'OPERATOR',permissions:[],active:true}))});
 await prisma.session.create({data:{userId:id,tokenHash:sha(id+'-token'),csrfHash:sha(id+'-csrf'),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
 return {cookie:'imperio_session='+id+'-token','x-csrf-token':id+'-csrf','content-type':'application/json'};
}
async function wait(){for(let i=0;i<90;i++){try{if((await fetch(host+'/api/v1/health')).ok)return}catch{}await sleep(250)}throw Error('Servidor A4 indisponível')}
async function call(headers,unit,path,method='GET',body,key){
 return fetch(host+'/api/v1'+path,{method,headers:{...headers,'x-unit-id':unit,...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
async function main(){
 if(process.env.CI!=='true'||!/\/imperio_ci(?:\?|$)/.test(String(process.env.DATABASE_URL||'')))throw Error('Teste A4 exige ambiente CI e banco imperio_ci isolado');
 const file=new URL('../../assets/js/a4-tasks-central.js',import.meta.url);
 execFileSync(process.execPath,['--check',file.pathname]);
 const src=readFileSync(file,'utf8');
 ok(src.includes("sourceOfTruth:'postgresql'"),'frontend central obrigatório');
 ok(!src.includes('save({render:false})'),'sem persistência local como autoridade');
 await cleanup();
 for(const id of ['centro','big','shopping-contagem'])await prisma.unit.upsert({where:{id},create:{id,name:id,active:true},update:{active:true}});
 const boss=await user('a4-owner',['centro','big','shopping-contagem'],['tasks.read','tasks.manage'],true);
 const employee=await user('a4-centro',['centro'],['tasks.read','tasks.manage']);
 const viewer=await user('a4-viewer',['centro'],['tasks.read']);
 const big=await user('a4-big',['big'],['tasks.read','tasks.manage']);
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:''},stdio:'ignore'});
 try{
  await wait();
  const payload={title:'Tarefa sintética',unitId:'centro',assignedUserId:'a4-centro',dueDate:'2026-10-15',priority:'high',category:'general',note:'Teste de persistência'};
  let r=await call(boss,'centro','/tasks','POST',payload,'a4-once');ok(r.status===201,'cria tarefa persistida');const created=await r.json();
  r=await call(boss,'centro','/tasks','POST',payload,'a4-once');ok(r.ok&&(await r.json()).id===created.id,'replay idempotente');
  r=await call(boss,'centro','/tasks','POST',{...payload,title:'Diferente'},'a4-once');ok(r.status===409,'replay conflitante');
  r=await call(employee,'centro','/tasks');ok((await r.json()).some(x=>x.id===created.id),'segunda sessão acessa mesma tarefa');
  r=await call(viewer,'centro','/tasks');ok(!(await r.json()).some(x=>x.id===created.id),'responsável filtra leitura');
  r=await call(viewer,'centro','/tasks','POST',payload,'a4-forbidden');ok(r.status===403,'somente tasks.manage modifica');
  r=await call(employee,'big','/tasks');ok(r.status===403,'não lê unidade não autorizada');
  r=await call(employee,'centro','/tasks/'+created.id,'PATCH',{...payload,title:'Editada',expectedUpdatedAt:created.updatedAt},'a4-edit');ok(r.ok,'edita registro');const edited=await r.json();
  r=await call(boss,'centro','/tasks/'+created.id,'PATCH',{...payload,title:'Conflito',expectedUpdatedAt:created.updatedAt},'a4-stale');ok(r.status===409,'edição desatualizada rejeitada');
  r=await call(boss,'centro','/tasks/'+created.id+'/complete','POST',{expectedUpdatedAt:edited.updatedAt},'a4-complete');ok(r.ok,'conclui');const done=await r.json();
  r=await call(boss,'centro','/tasks/'+created.id+'/complete','POST',{expectedUpdatedAt:edited.updatedAt},'a4-complete');ok(r.ok,'conclusão repetida não duplica');
  r=await call(boss,'centro','/tasks/'+created.id+'/reopen','POST',{expectedUpdatedAt:done.updatedAt},'a4-reopen');ok(r.ok,'reabre');
  ok((await prisma.managementTask.findUniqueOrThrow({where:{id:created.id}})).status==='OPEN','estado real restaurado');
  r=await call(boss,'centro','/tasks','POST',{...payload,assignedUserId:'a4-big'},'a4-invalid-assignee');ok(r.status===409,'responsável de outra unidade rejeitado');
  r=await call(boss,'big','/tasks','POST',{...payload,unitId:'big',assignedUserId:'a4-big'},'a4-big');ok(r.status===201,'Big Shopping persiste');
  r=await call(boss,'shopping-contagem','/tasks','POST',{...payload,unitId:'shopping-contagem',assignedUserId:'a4-owner'},'a4-shopping');ok(r.status===201,'Shopping Contagem persiste');
  r=await call(big,'big','/tasks');ok((await r.json()).every(x=>x.unitId==='big'),'Big segregado');
  r=await call(boss,'shopping-contagem','/tasks');ok((await r.json()).every(x=>x.unitId==='shopping-contagem'),'Shopping segregado');
  await prisma.managementTask.create({data:{id:'a4_automated',title:'Tarefa automática sintética',unitId:'centro',assignedUserId:'a4-centro',sourceType:'WAITLIST',sourceId:'a4_auto'}});
  r=await call(boss,'centro','/tasks/a4_automated/complete','POST',{expectedUpdatedAt:new Date().toISOString()},'a4-no-auto');ok(r.status===403,'tarefas automáticas protegidas');
  r=await call(boss,'centro','/tasks','POST',{...payload,dueDate:'2026-02-31'},'a4-bad-date');ok(r.status===409,'rejeita data inválida');
  const events=await prisma.auditEvent.findMany({where:{entityType:'ManagementTask',entityId:created.id}});
  ok(events.some(x=>x.action==='task.manual.created')&&events.some(x=>x.action==='task.manual.completed')&&events.some(x=>x.action==='task.manual.reopened'),'auditoria persistida');
  const fresh=await prisma.managementTask.findUniqueOrThrow({where:{id:created.id}});
  const race=await Promise.all(['A','B'].map(s=>call(boss,'centro','/tasks/'+created.id,'PATCH',{...payload,title:'Concorrente '+s,expectedUpdatedAt:fresh.updatedAt},'a4-race-'+s)));
  ok(race.filter(x=>x.ok).length===1&&race.filter(x=>x.status===409).length===1,'concorrência preserva versão');
  // A4-F03: central admin saves explicit task permissions per unit; backend enforces them.
  r=await call(boss,'centro','/admin/users/a4-viewer/access','PATCH',{
   permissions:[],units:[{unitId:'centro',role:'reception',permissions:['tasks.read','tasks.manage']},
    {unitId:'big',role:'reception',permissions:['tasks.read']}]
  });ok(r.ok,'owner saves task grants through central admin API');
  const savedGrants=await prisma.userUnitAccess.findMany({where:{userId:'a4-viewer'}});
  ok(savedGrants.some(x=>x.unitId==='centro'&&x.permissions.includes('tasks.manage'))
   &&savedGrants.some(x=>x.unitId==='big'&&x.permissions.includes('tasks.read')&&!x.permissions.includes('tasks.manage')),
   'unit-specific grants persist in PostgreSQL, not browser state');
  r=await call(viewer,'big','/tasks');ok(r.ok,'tasks.read grants Big read');
  r=await call(viewer,'big','/tasks','POST',{...payload,unitId:'big',assignedUserId:'a4-big'},'a4-viewer-big-denied');
  ok(r.status===403,'Big tasks.read does not imply tasks.manage');
  r=await call(viewer,'centro','/tasks','POST',{...payload,title:'Gravação após concessão',assignedUserId:'a4-centro'},'a4-viewer-centro-allowed');
  ok(r.status===201,'Centro tasks.manage can write after persisted grant');
  r=await call(viewer,'shopping-contagem','/tasks');ok(r.status===403,'grants never extend to third unit');

  console.log(JSON.stringify({ok:true,checks,module:'A4-TASK-01'}));
 }finally{server.kill('SIGTERM');await cleanup();await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
