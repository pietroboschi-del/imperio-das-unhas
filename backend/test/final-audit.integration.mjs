import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {hasPhysicalCapacity} from '../dist/src/core/booking-capacity.js';
import {businessDayRange} from '../dist/src/core/business-day-range.js';

const schema='final_audit_ci',port=3171,base='http://127.0.0.1:'+port;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const parent=new PrismaClient();let db,server,offServer,created=false,checks=0;
const eq=(a,b,m)=>{checks++;assert.equal(a,b,m)};
const ok=(v,m)=>{checks++;assert.ok(v,m)};
const username='final_audit_owner',password='final-audit-owner-password-123';
const root=new URL('../',import.meta.url);
async function request(path,{actor,unit='centro',method='GET',body,key,origin=base}={}){
 return fetch(origin+path,{method,headers:{'content-type':'application/json','x-unit-id':unit,...(actor?{cookie:actor.cookie,'x-csrf-token':actor.csrf}:{}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
async function good(response,label){ok(response.ok,label+' HTTP '+response.status);return response.json()}
async function login(origin=base){const r=await request('/api/v1/auth/login',{origin,method:'POST',body:{username,password}});const a=await good(r,'owner login');return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:a.csrfToken}}
async function health(origin){for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/v1/health')).ok)return;}catch{}await sleep(100)}throw Error('isolated backend startup timeout')}
async function setup(){
 const u=new URL(process.env.DATABASE_URL||'');
 ok(['localhost','127.0.0.1','::1'].includes(u.hostname),'loopback database');
 eq(u.searchParams.get('schema')||'public','public','parent schema');
 const [identity]=await parent.$queryRaw`SELECT current_database() AS name`;
 eq(identity.name,process.env.READINESS_TEST_DATABASE,'explicit CI database identity');
 ok(/_(ci|test)$/.test(identity.name),'CI database suffix');
 const exists=await parent.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;
 eq(exists.length,0,'schema must be new');
 await parent.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');created=true;u.searchParams.set('schema',schema);
 const env={...process.env,DATABASE_URL:u.toString(),ADMIN_USERNAME:username,ADMIN_PASSWORD:password,ADMIN_NAME:'Final Audit Owner',COOKIE_SECURE:'false',OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'centro,big,shopping-contagem',WHATSAPP_AUTOMATION_ENABLED:'false',WHATSAPP_AGENT_API_ENABLED:'false',EVOLUTION_WEBHOOK_ENABLED:'false'};
 const migrate=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{cwd:root,env,encoding:'utf8',timeout:180000});eq(migrate.status,0,'isolated migrations '+migrate.stderr);
 db=new PrismaClient({datasources:{db:{url:u.toString()}}});
 for(const id of ['centro','big','shopping-contagem'])await db.unit.create({data:{id,name:id,timezone:'America/Sao_Paulo'}});
 const admin=spawnSync('npm',['run','admin:create'],{cwd:root,env,encoding:'utf8',timeout:60000});eq(admin.status,0,'owner creation');
 server=spawn(process.execPath,['dist/src/main.js'],{cwd:root,env:{...env,PORT:String(port)},stdio:'ignore'});
 offServer=spawn(process.execPath,['dist/src/main.js'],{cwd:root,env:{...env,PORT:String(port+1),OPERATIONAL_WRITES_ENABLED:'false'},stdio:'ignore'});
 await Promise.all([health(base),health('http://127.0.0.1:'+(port+1))]);
 return env;
}
async function main(){
 try{
  await setup();const owner=await login();const offOwner=await login('http://127.0.0.1:'+(port+1));
  let r=await request('/api/v1/stock/products',{origin:'http://127.0.0.1:'+(port+1),actor:offOwner,method:'POST',body:{id:'gate-off',name:'Denied',type:'RESALE'}});eq(r.status,503,'stock global write gate');eq(await db.product.count({where:{id:'gate-off'}}),0,'no product write while gate closed');
  // Real credential hashing and simultaneous HTTP activation, no injected sessions.
  const staff=await good(await request('/api/v1/admin/users',{actor:owner,method:'POST',body:{username:'final_staff',displayName:'Staff',permissions:['units.read','clients.read','agenda.read'],units:[{unitId:'centro',role:'operator',permissions:['finance.read']}]}}),'create staff');
  const invite=await good(await request('/api/v1/auth/users/'+staff.id+'/activation-token',{actor:owner,method:'POST',body:{}}),'activation token');
  const activated=await Promise.all(['a','b'].map(x=>request('/api/v1/auth/activate',{method:'POST',body:{token:invite.token,newPassword:'final-staff-password-'+x}})));
  eq(activated.filter(x=>x.ok).length,1,'one activation winner');eq(activated.filter(x=>x.status===401).length,1,'token race loser rejected');
  const winner=activated[0].ok?'a':'b';r=await request('/api/v1/auth/login',{method:'POST',body:{username:'final_staff',password:'final-staff-password-'+winner}});const auth=await good(r,'staff login');const operator={cookie:r.headers.get('set-cookie').split(';')[0],csrf:auth.csrfToken};
  // Parallel identities in distinct units converge under the same identity lock.
  const clients=await Promise.all(['centro','big','shopping-contagem'].map(unit=>request('/api/v1/clients',{actor:owner,unit,method:'POST',key:'client-'+unit,body:{name:'Global Concurrent Client',phone:'31987654321',source:'Audit'}}).then(r=>good(r,'client '+unit))));
  eq(new Set(clients.map(c=>c.id)).size,1,'one global identity');const client=clients[0];eq(await db.clientUnitLink.count({where:{clientId:client.id}}),3,'three persisted client links');
  await db.service.create({data:{id:'audit-service',name:'Service',price:10,durationMin:30}});
  await db.professional.create({data:{id:'audit-pro',name:'Professional'}});await db.professionalUnit.create({data:{professionalId:'audit-pro',unitId:'centro'}});
  const cmd=await good(await request('/api/v1/commands',{actor:owner,method:'POST',key:'cmd-direct',body:{clientId:client.id,serviceDate:'2026-10-08',grossAmount:10}}),'direct command');
  for(const professionalId of [undefined,'unrelated']){r=await request('/api/v1/commands/'+cmd.id+'/payments',{actor:owner,method:'POST',key:'bad-'+(professionalId||'none'),body:{method:'DIRECT_PROFESSIONAL',amount:10,...(professionalId?{professionalId}:{})}});eq(r.status,409,'invalid direct recipient');}
  eq(await db.commandPayment.count({where:{commandId:cmd.id}}),0,'recipient denial has no payment');
  await good(await request('/api/v1/commands/'+cmd.id+'/items',{actor:owner,method:'POST',key:'service-line',body:{serviceId:'audit-service',professionalId:'audit-pro',unitPrice:10}}),'service line');
  const payment=await good(await request('/api/v1/commands/'+cmd.id+'/payments',{actor:owner,method:'POST',key:'valid-direct',body:{method:'DIRECT_PROFESSIONAL',amount:10,professionalId:'audit-pro'}}),'valid direct payment');
  eq(payment.cashSessionId,null,'direct payment outside cash');eq(payment.legacyPayload.professionalId,'audit-pro','recipient persisted');eq(payment.legacyPayload.cashImpact,false,'no cash impact');eq(payment.legacyPayload.treasuryImpact,false,'no treasury impact');
  await good(await request('/api/v1/commands/'+cmd.id+'/payments',{actor:owner,method:'POST',key:'valid-direct',body:{method:'DIRECT_PROFESSIONAL',amount:10,professionalId:'audit-pro'}}),'direct replay');eq(await db.commandPayment.count({where:{commandId:cmd.id}}),1,'one direct payment');
  r=await request('/api/v1/commands/'+cmd.id+'/payments',{actor:owner,method:'POST',key:'valid-direct',body:{method:'DIRECT_PROFESSIONAL',amount:10,professionalId:'unrelated'}});eq(r.status,409,'changed recipient replay rejected');
  await good(await request('/api/v1/commands',{actor:owner,unit:'big',method:'POST',key:'cmd-big',body:{clientId:client.id,serviceDate:'2026-10-08',grossAmount:50}}),'Big financial command');
  const dossier=await good(await request('/api/v1/clients/'+client.id+'/history',{actor:operator,unit:'big'}),'global dossier');ok(dossier.commands.length>0&&dossier.commands.every(c=>c.unitId==='centro'),'network client access does not expose Big finance');
  const cash=await good(await request('/api/v1/cash-sessions',{actor:owner,method:'POST',key:'cash',body:{businessDate:'2026-10-08',openingAmount:0}}),'cash open');
  const cashCmd=await good(await request('/api/v1/commands',{actor:owner,method:'POST',key:'cash-command',body:{serviceDate:'2026-10-08',grossAmount:10}}),'cash command');
  // Hold the actual aggregate lock, enqueue close before payment, then release.
  let release,locked;const ready=new Promise(r=>locked=r),hold=new Promise(r=>release=r);
  const blocker=db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'centro'}),hashtext(${'cash-session|'+cash.id}))`;locked();await hold;},{timeout:15000});
  await ready;
  const close=request('/api/v1/cash-sessions/'+cash.id+'/close',{actor:owner,method:'POST',body:{closingAmount:0}});
  async function waiting(n){for(let i=0;i<100;i++){const [x]=await db.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted`;if(x.n>=n)return;await sleep(20)}throw Error('Expected lock waiter '+n);}
  try{await waiting(1);const pending=request('/api/v1/commands/'+cashCmd.id+'/payments',{actor:owner,method:'POST',key:'closed-cash',body:{cashSessionId:cash.id,method:'PIX',amount:10}});await waiting(2);release();await blocker;ok((await close).ok,'queued close accepted');eq((await pending).status,409,'payment cannot enter closed cash');}finally{release();await blocker;}
  eq(await db.commandPayment.count({where:{commandId:cashCmd.id}}),0,'closed cash payment creates no effects');
  const invalid=await request('/api/v1/commands/'+cashCmd.id+'/snapshot',{actor:owner,method:'PUT',body:{grossAmount:10,discountAmount:0,amountDue:10,items:[{serviceId:'audit-service',professionalId:'audit-pro',unitPrice:-10,commissionFixedAmount:-5,networkAdmin:true}]}});eq(invalid.status,400,'nested invalid item denied');
  const product=await good(await request('/api/v1/stock/products',{actor:owner,method:'POST',body:{id:'audit-product',name:'Product',type:'RESALE'}}),'stock product');
  eq(await db.stockLocation.count({where:{id:{in:['central','centro','big','shopping-contagem']}}}),4,'authorized product creation initializes empty-state stock locations');
  const purchase={destinationLocationId:'centro',purchaseDate:'2026-10-08',supplier:'Audit',freight:1,items:[{productId:product.id,qty:5,unitCost:2}]};
  const bought=await Promise.all([1,2].map(()=>request('/api/v1/stock/purchases',{actor:owner,method:'POST',key:'purchase-race',body:purchase}).then(r=>good(r,'purchase replay'))));eq(bought[0].id,bought[1].id,'concurrent purchase replay');
  r=await request('/api/v1/stock/purchases',{actor:owner,method:'POST',key:'purchase-race',body:{...purchase,destinationLocationId:'big'}});eq(r.status,409,'changed destination replay denied');
  const inv={locationId:'centro',reason:'Count',counts:[{productId:product.id,countedQty:4}]};
  await Promise.all([1,2].map(()=>request('/api/v1/stock/inventory',{actor:owner,method:'POST',key:'inventory-race',body:inv}).then(r=>good(r,'inventory replay'))));
  r=await request('/api/v1/stock/inventory',{actor:owner,method:'POST',key:'inventory-race',body:{...inv,counts:[{productId:product.id,countedQty:100}]}});eq(r.status,409,'changed inventory replay denied');
  const transfer=await good(await request('/api/v1/stock/transfers',{actor:owner,method:'POST',key:'transfer',body:{sourceLocationId:'centro',destinationLocationId:'big',transferDate:'2026-10-08',items:[{productId:product.id,qty:1}]}}),'transfer');
  for(const action of ['send','receive'])await Promise.all([1,2].map(()=>request('/api/v1/stock/transfers/'+transfer.id+'/'+action,{actor:owner,method:'POST',body:{}}).then(r=>good(r,'transfer '+action))));
  eq(await db.stockMovement.count({where:{referenceId:transfer.id}}),2,'one transfer out and one in under concurrent replay');
  const balance=await db.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:product.id,locationId:'centro'}}});eq(Number(balance.qty),3,'stock quantity coherent');
  // Canonical public input and configured workstation capacity are checked at persistence.
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10),day=new Date(future+'T12:00:00Z').getUTCDay();
  await db.serviceCategory.create({data:{id:'public-cat',name:'Public nails'}});
  await db.service.update({where:{id:'audit-service'},data:{categoryId:'public-cat',legacyPayload:{online:true,show:true,clientArea:'hands'}}});
  for(const pro of ['audit-pro','public-pro-2']){
   const data={name:pro,legacyPayload:{services:['audit-service'],schedule:{['centro-'+day]:{work:true,start:'09:00',end:'18:00'}}}};
   await db.professional.upsert({where:{id:pro},create:{id:pro,...data},update:data});
   await db.professionalUnit.upsert({where:{professionalId_unitId:{professionalId:pro,unitId:'centro'}},create:{professionalId:pro,unitId:'centro'},update:{active:true}});
  }
  await db.workstation.create({data:{id:'public-station',name:'Single station',unitId:'centro',allowedCategoryIds:['public-cat']}});
  const publicBody={unitId:'centro',serviceId:'audit-service',professionalId:'audit-pro',startAt:future+'T12:00:00',clientName:'Public concurrent',clientPhone:'31981234567'};
  r=await request('/api/v1/public/bookings',{method:'POST',key:'public-past',body:{...publicBody,startAt:'2020-01-01T12:00:00'}});eq(r.status,409,'past public booking denied');
  r=await request('/api/v1/public/bookings',{method:'POST',key:'public-grid',body:{...publicBody,startAt:future+'T12:01:00'}});eq(r.status,409,'off-grid direct public request denied');
  const publicRace=await Promise.all(['audit-pro','public-pro-2'].map(pro=>request('/api/v1/public/bookings',{method:'POST',key:'public-'+pro,body:{...publicBody,professionalId:pro}})));
  eq(publicRace.filter(r=>r.ok).length,1,'one station has one public winner');eq(publicRace.filter(r=>r.status===409).length,1,'resource race loser denied');
  const pro=publicRace[0].ok?'audit-pro':'public-pro-2';
  await good(await request('/api/v1/public/bookings',{method:'POST',key:'public-'+pro,body:{...publicBody,professionalId:pro}}),'public replay');
  r=await request('/api/v1/public/bookings',{method:'POST',key:'public-'+pro,body:{...publicBody,professionalId:pro,clientName:'Changed client'}});eq(r.status,409,'changed public identity replay denied');
  const slots=await good(await request('/api/v1/public/availability?unitId=centro&date='+future+'&serviceId=audit-service&professionalId='+(pro==='audit-pro'?'public-pro-2':'audit-pro')),'resource-aware slots');ok(!slots.slots.some(s=>s.localStart==='12:00'),'availability excludes occupied resource for another professional');
  const range=businessDayRange('2026-10-08','America/Sao_Paulo');eq(range.start.toISOString(),'2026-10-08T03:00:00.000Z','local midnight start');eq(range.end.toISOString(),'2026-10-09T03:00:00.000Z','local midnight end');
  const stations=[{id:'one',categories:['nails']}],d={id:'existing',start:0,end:10,categoryId:'nails'};
  eq(hasPhysicalCapacity(stations,[d],[{...d,id:'candidate'}]),false,'resource race different professionals still exceeds one station');
  eq(hasPhysicalCapacity(stations,[d],[{...d,id:'candidate',start:10,end:20}]),true,'resource release at endpoint');
  console.log(JSON.stringify({ok:true,checks,feature:'final_audit_postgres_boundaries'}));
 }finally{
  for(const p of [server,offServer])if(p?.exitCode===null){p.kill('SIGTERM');}
  if(db)await db.$disconnect();
  if(created)await parent.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');
  await parent.$disconnect();
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
