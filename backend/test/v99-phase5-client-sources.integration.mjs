import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),url='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=x=>createHash('sha256').update(x).digest('hex');
let tests=0;
const ok=(value,label)=>{tests++;assert.ok(value,label)};
const owner={username:'phase5_sources_owner_ci',token:'phase5-sources-owner-session',csrf:'phase5-sources-owner-csrf'};
const employee={username:'phase5_sources_worker_ci',token:'phase5-sources-operator-session',csrf:'phase5-sources-operator-csrf'};
async function userSession(v,admin){
  const u=await prisma.user.upsert({where:{username:v.username},
    create:{username:v.username,displayName:v.username,networkAdmin:admin,systemRole:admin?'OWNER':'OPERATOR',active:true,passwordResetRequired:false,permissions:admin?['*']:['clients.read','clients.manage']},
    update:{networkAdmin:admin,systemRole:admin?'OWNER':'OPERATOR',active:true,passwordResetRequired:false,permissions:admin?['*']:['clients.read','clients.manage']}});
  await prisma.session.deleteMany({where:{userId:u.id}});
  await prisma.session.create({data:{userId:u.id,tokenHash:hash(v.token),csrfHash:hash(v.csrf),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
}
async function waitHealth(){for(let i=0;i<60;i++){try{const r=await fetch(url+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw Error('backend não iniciou')}
function headers(v,csrf=true){return {'content-type':'application/json',cookie:'imperio_session='+v.token,...(csrf?{'x-csrf-token':v.csrf}:{})}}
async function run(){
  await userSession(owner,true);
  await userSession(employee,false);
  await prisma.auditEvent.deleteMany({where:{entityType:'ClientSourceConfig',entityId:'network'}});
  await prisma.clientSourceConfig.deleteMany({where:{id:'network'}});
  const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),
    env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  try{
    await waitHealth();
    let r=await fetch(url+'/api/v1/config/client-sources',{headers:headers(employee,false)});
    ok(r.status===200,'operator can read shared choices');
    const initial=await r.json();
    ok(initial.version===0&&initial.options.length>=7,'default 7 client source options');
    const options=[...initial.options,{id:'phase5_ci',label:'Teste de campanha',active:true,order:90,isDefault:false,previousLabels:[]}];
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(employee),body:JSON.stringify({expectedVersion:0,options})});
    ok(r.status===403,'operator cannot modify global choices');
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(owner,false),body:JSON.stringify({expectedVersion:0,options})});
    ok(r.status===403,'owner must send CSRF token');
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(owner),body:JSON.stringify({expectedVersion:0,options})});
    ok(r.status===200,'owner creates network choices');
    const changed=await r.json();
    ok(changed.version===1&&changed.options.some(x=>x.id==='phase5_ci'),'versioned write acknowledged');
    ok((await prisma.clientSourceConfig.findUnique({where:{id:'network'}}))?.version===1,'PostgreSQL persisted change');
    r=await fetch(url+'/api/v1/config/client-sources',{headers:headers(employee,false)});
    const shared=await r.json();
    ok(shared.options.find(x=>x.id==='phase5_ci')?.label==='Teste de campanha','all units/users share central source options');
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(owner),body:JSON.stringify({expectedVersion:0,options})});
    ok(r.status===409,'stale version cannot overwrite current');
    const dupe=[...options,{id:'duplicate_ci',label:'Instagram',active:true,order:100,isDefault:false,previousLabels:[]}];
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(owner),body:JSON.stringify({expectedVersion:1,options:dupe})});
    ok(r.status===409,'duplicate labels rejected');
    const inactive=options.map(o=>({...o,active:false,isDefault:false}));
    r=await fetch(url+'/api/v1/config/client-sources',{method:'PUT',headers:headers(owner),body:JSON.stringify({expectedVersion:1,options:inactive})});
    ok(r.status===400,'cannot disable all options');
    ok(await prisma.auditEvent.count({where:{entityType:'ClientSourceConfig',entityId:'network',action:'clients.source_options.updated'}})===1,'exactly one audit event');
    console.log(JSON.stringify({ok:true,tests,feature:'network_client_sources_security_persistence'}));
  }finally{
    server.kill('SIGTERM');
    await prisma.auditEvent.deleteMany({where:{entityType:'ClientSourceConfig',entityId:'network'}}).catch(()=>{});
    await prisma.clientSourceConfig.deleteMany({where:{id:'network'}}).catch(()=>{});
    for(const v of [owner,employee]){
      await prisma.session.deleteMany({where:{user:{username:v.username}}}).catch(()=>{});
      await prisma.user.deleteMany({where:{username:v.username}}).catch(()=>{});
    }
    await prisma.$disconnect();
  }
}
run().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
