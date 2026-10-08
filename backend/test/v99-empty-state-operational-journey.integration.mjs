import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {buildReadinessReport} from '../tools/three-unit-readiness.mjs';

const UNITS=['centro','big','shopping-contagem'],SCHEMA='empty_state_journey_ci',PORT=3163,BASE='http://127.0.0.1:'+PORT;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let admin,prisma,server,schemaCreated=false,checks=0,mainError;
const ok=(v,msg)=>{checks++;assert.ok(v,msg)};
const eq=(a,b,msg)=>{checks++;assert.equal(a,b,msg)};
const creds={username:'empty_journey_owner_ci',password:'empty-journey-owner-password-123'};
const env=url=>({...process.env,DATABASE_URL:url.toString(),ADMIN_USERNAME:creds.username,ADMIN_PASSWORD:creds.password,ADMIN_NAME:'Owner Jornada',PORT:String(PORT),COOKIE_SECURE:'false',OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:UNITS.join(','),WHATSAPP_AUTOMATION_ENABLED:'false',WHATSAPP_AGENT_API_ENABLED:'false',EVOLUTION_WEBHOOK_ENABLED:'false'});
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function req(path,{actor,unit,method='GET',body,key}={}){
 const headers={Accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...(actor?{cookie:actor.cookie,'x-csrf-token':actor.csrf}:{}),...(unit?{'x-unit-id':unit}:{}),...(key?{'idempotency-key':key}:{})};
 return fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function good(r,msg){ok(r.ok,msg+' HTTP '+r.status);return r.json()}
async function login(username,password){
 const r=await req('/api/v1/auth/login',{method:'POST',body:{username,password}}),x=await good(r,'login '+username);
 ok(!!cookie(r)&&!!x.csrfToken,'authenticated session and CSRF token');
 return {cookie:cookie(r),csrf:x.csrfToken};
}
async function setup(){
 admin=new PrismaClient();
 const u=new URL(String(process.env.DATABASE_URL||''));
 ok(['localhost','127.0.0.1','::1'].includes(u.hostname),'local database only');
 ok(!u.searchParams.has('schema')||u.searchParams.get('schema')==='public','parent schema public');
 const ids=await admin.$queryRawUnsafe('SELECT current_database() AS name,current_schema() AS schema');
 eq(ids[0]?.name,process.env.READINESS_TEST_DATABASE,'explicit CI database identity');
 ok(/(?:_ci|_test)$/.test(ids[0]?.name||''),'CI/test name suffix');
 eq(ids[0]?.schema,'public','public parent scope');
 const existing=await admin.$queryRawUnsafe("SELECT schema_name FROM information_schema.schemata WHERE schema_name='"+SCHEMA+"'");
 eq(existing.length,0,'dedicated schema is not reused');
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+SCHEMA+'"');schemaCreated=true;
 u.searchParams.set('schema',SCHEMA);
 const migration=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{cwd:new URL('../',import.meta.url),env:env(u),encoding:'utf8',timeout:180000});
 eq(migration.status,0,'isolated Prisma migration upgrade');
 prisma=new PrismaClient({datasources:{db:{url:u.toString()}}});
 const connected=await prisma.$queryRawUnsafe('SELECT current_database() AS name,current_schema() AS schema');
 eq(connected[0]?.schema,SCHEMA,'isolated Prisma schema identity');
 eq(connected[0]?.name,process.env.READINESS_TEST_DATABASE,'isolated Prisma database identity');
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']]){
  await prisma.unit.create({data:{id,name,timezone:'America/Sao_Paulo',active:true}});
 }
 const createAdmin=spawnSync('npm',['run','admin:create'],{cwd:new URL('../',import.meta.url),env:env(u),encoding:'utf8',timeout:60000});
 eq(createAdmin.status,0,'owner created with real credential hashing');
 for(const entity of ['professional','client','booking','stockBalance'])eq(await prisma[entity].count(),0,'empty '+entity);
 const report=await buildReadinessReport(prisma);
 eq(report.businessDataReadiness.result,'EXPECTED_EMPTY_STATE','no real data is expected');
 eq(report.technicalReadiness.result,'STRUCTURAL_READY','structural migrations units and owner');
 server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:env(u),stdio:'ignore'});
 for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error('isolated backend exited');try{if((await fetch(BASE+'/api/v1/health')).ok)return}catch{}await sleep(250)}
 throw Error('isolated backend startup failed');
}
async function identityAndCatalog(owner){
 const me=await good(await req('/api/v1/auth/me',{actor:owner}),'protected session readback');
 ok(me.user?.networkAdmin===true,'owner network principal');
 const category='journey-cat',service='journey-svc';
 await good(await req('/api/v1/config/categories',{actor:owner,unit:'centro',method:'POST',body:{id:category,name:'Unhas Jornada',active:true,config:{}}}),'create category');
 await good(await req('/api/v1/config/services',{actor:owner,unit:'centro',method:'POST',body:{id:service,name:'Manicure Jornada',categoryId:category,categoryName:'Unhas Jornada',price:50,durationMin:30,active:true,config:{show:true,online:true,clientArea:'hands',proRules:{}}}}),'create service price duration');
 const date=new Date(Date.now()+2*86400000).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const day=new Date(date+'T12:00:00Z').getUTCDay(),pros={};
 for(const unit of UNITS){
  const id='journey-pro-'+unit;pros[unit]=id;
  await good(await req('/api/v1/config/professionals',{actor:owner,unit,method:'POST',body:{id,name:'Profissional Jornada '+unit,publicName:'Pro '+unit,active:true,unitIds:[unit],config:{show:true,online:true,schedule:{[unit+'-'+day]:{work:true,start:'09:00',end:'18:00'}}},serviceRules:{[service]:{enabled:true,online:true,duration:30,price:50,commission:40}}}}),'create professional and schedule '+unit);
  await good(await req('/api/v1/config/workstations',{actor:owner,unit,method:'POST',body:{id:'journey-station-'+unit,unitId:unit,name:'Mesa Jornada',allowedCategoryIds:[category],active:true,config:{capacity:1}}}),'create resource '+unit);
  eq(await prisma.professionalUnit.count({where:{professionalId:id,unitId:unit,active:true}}),1,'ProfessionalUnit '+unit);
 }
 return {date,service,pros};
}
async function clientAgenda(owner,cfg){
 const client=await good(await req('/api/v1/clients',{actor:owner,unit:'big',method:'POST',key:'journey-global',body:{name:'Cliente Global Jornada',phone:'31999991837',email:'journey@example.invalid',source:'Presencial'}}),'manual client Big');
 await good(await req('/api/v1/clients/'+client.id,{actor:owner,unit:'big',method:'PATCH',body:{notes:'Nota teste rede'}}),'client profile edit');
 const user=await good(await req('/api/v1/admin/users',{actor:owner,method:'POST',body:{username:'journey_agenda_ci',displayName:'Agenda Rede',systemRole:'OPERATOR',permissions:['agenda.read','agenda.manage','clients.read'],units:[{unitId:'big',role:'reception',permissions:['clients.read']}]}}),'create cross-unit reception');
 const token=await good(await req('/api/v1/auth/users/'+user.id+'/activation-token',{actor:owner,method:'POST',body:{}}),'issue activation');
 await good(await req('/api/v1/auth/activate',{method:'POST',body:{token:token.token,newPassword:'journey-agenda-password-123'}}),'activate user');
 const desk=await login('journey_agenda_ci','journey-agenda-password-123');
 const found=await good(await req('/api/v1/clients?q=Cliente%20Global',{actor:desk,unit:'centro'}),'global client search from Centro');
 ok(found.some(c=>c.id===client.id),'same central Client can be found in Centro');
 for(const [unit,time] of [['big','10:00'],['centro','11:00'],['shopping-contagem','12:00']]){
  const search=await good(await req('/api/v1/clients?q=Cliente%20Global',{actor:desk,unit}),'global client search '+unit);
  ok(search.some(c=>c.id===client.id),'client reused in '+unit);
  const availability=await good(await req('/api/v1/public/availability?unitId='+unit+'&serviceId='+cfg.service+'&professionalId='+cfg.pros[unit]+'&date='+cfg.date),'availability for reception '+unit);
  ok(Array.isArray(availability.slots)&&availability.slots.length>0,'available time in '+unit);
  const b=await good(await req('/api/v1/bookings',{actor:desk,unit,method:'POST',key:'journey-booking-'+unit,body:{clientId:client.id,serviceId:cfg.service,professionalId:cfg.pros[unit],serviceDate:cfg.date,startAt:cfg.date+'T'+time+':00-03:00'}}),'reception appointment '+unit);
  eq(b.clientId,client.id,'same global client in '+unit);
  const visible=await good(await req('/api/v1/bookings',{actor:desk,unit}),'reception booking readback '+unit);
  ok(visible.some(x=>x.id===b.id),'cross-unit agenda read permission '+unit);
 }
 eq(await prisma.client.count({where:{id:client.id}}),1,'no duplicate Client');
 eq(await prisma.clientUnitLink.count({where:{clientId:client.id,active:true}}),3,'three unit history links');
 for(const unit of UNITS){
  const before={cash:await prisma.cashSession.count(),finance:await prisma.openCommand.count(),stock:await prisma.stockLocation.count(),movements:await prisma.stockMovement.count(),workstations:await prisma.workstation.count()};
  const cashDenied=await req('/api/v1/cash-sessions',{actor:desk,unit,method:'POST',key:'journey-denied-cash-'+unit,body:{businessDate:cfg.date,openingAmount:0}});
  eq(cashDenied.status,403,'cross-unit agenda cannot open cash '+unit);
  const financeDenied=await req('/api/v1/commands',{actor:desk,unit,method:'POST',key:'journey-denied-finance-'+unit,body:{clientId:client.id,serviceDate:cfg.date,grossAmount:50}});
  eq(financeDenied.status,403,'cross-unit agenda cannot create command '+unit);
  const stockDenied=await req('/api/v1/stock/consumptions',{actor:desk,unit,method:'POST',key:'journey-denied-stock-'+unit,body:{locationId:unit,items:[{productId:'none',qty:1}]}});
  eq(stockDenied.status,403,'cross-unit agenda cannot consume stock '+unit);
  const configDenied=await req('/api/v1/config/workstations',{actor:desk,unit,method:'POST',body:{id:'journey-denied-workstation-'+unit,unitId:unit,name:'Forbidden workstation',allowedCategoryIds:[]}});
  eq(configDenied.status,403,'cross-unit agenda cannot configure '+unit);
  eq(await prisma.cashSession.count(),before.cash,'denied cash has no side effect '+unit);
  eq(await prisma.openCommand.count(),before.finance,'denied finance has no side effect '+unit);
  eq(await prisma.stockLocation.count(),before.stock,'denied stock creates no location '+unit);
  eq(await prisma.stockMovement.count(),before.movements,'denied stock creates no movement '+unit);
  eq(await prisma.workstation.count(),before.workstations,'denied config creates no workstation '+unit);
 }
 return client;
}
async function publicJourney(cfg,client){
 for(const unit of UNITS){
  const cat=await good(await req('/api/v1/public/catalog?unitId='+encodeURIComponent(unit)),'public catalog '+unit);
  ok(cat.professionals?.some(p=>p.id===cfg.pros[unit]),'published professional '+unit);
  const slots=await good(await req('/api/v1/public/availability?unitId='+encodeURIComponent(unit)+'&serviceId='+cfg.service+'&professionalId='+cfg.pros[unit]+'&date='+cfg.date),'public availability '+unit);
  ok(Array.isArray(slots.slots)&&slots.slots.length>0,'real available slots '+unit);
  await good(await req('/api/v1/public/bookings',{method:'POST',key:'journey-public-'+unit,body:{unitId:unit,serviceId:cfg.service,professionalId:cfg.pros[unit],startAt:cfg.date+'T16:00',clientName:client.name,clientPhone:client.phone}}),'public booking '+unit);
 }
 eq(await prisma.client.count({where:{id:client.id}}),1,'public booking did not duplicate network identity');
}
async function cashAndCommands(owner,cfg,client){
 for(const unit of UNITS){
  const cash=await good(await req('/api/v1/cash-sessions',{actor:owner,unit,method:'POST',key:'journey-cash-'+unit,body:{businessDate:cfg.date,openingAmount:0}}),'cash open '+unit);
  const cmd=await good(await req('/api/v1/commands',{actor:owner,unit,method:'POST',key:'journey-command-'+unit,body:{clientId:client.id,serviceDate:cfg.date,grossAmount:50,discountAmount:0}}),'command open '+unit);
  await good(await req('/api/v1/commands/'+cmd.id+'/items',{actor:owner,unit,method:'POST',key:'journey-command-line-'+unit,body:{serviceId:cfg.service,professionalId:cfg.pros[unit],unitPrice:50,commissionPercent:40}}),'command item '+unit);
  await good(await req('/api/v1/commands/'+cmd.id+'/payments',{actor:owner,unit,method:'POST',key:'journey-payment-'+unit,body:{cashSessionId:cash.id,method:'PIX',amount:50}}),'payment '+unit);
  eq(Number((await prisma.openCommand.findUniqueOrThrow({where:{id:cmd.id}})).remainingAmount),0,'payment settles command '+unit);
  await good(await req('/api/v1/cash-sessions/'+cash.id+'/close',{actor:owner,unit,method:'POST',body:{closingAmount:0}}),'cash close '+unit);
 }
}
async function stockJourney(owner){
 await good(await req('/api/v1/stock/products',{actor:owner,method:'POST',body:{id:'journey-product',name:'Insumo Jornada',type:'INPUT',unit:'un',defaultCost:10,allocations:{nails:100},active:true}}),'create global product');
 await good(await req('/api/v1/stock/locations',{actor:owner}),'configure stock locations through API');
 for(const unit of UNITS){
  await good(await req('/api/v1/stock/inventory',{actor:owner,unit,method:'POST',key:'journey-stock-start-'+unit,body:{locationId:unit,reason:'Contagem inicial sintética',counts:[{productId:'journey-product',countedQty:5}]}}),'initial inventory '+unit);
  await good(await req('/api/v1/stock/consumptions',{actor:owner,unit,method:'POST',key:'journey-stock-use-'+unit,body:{locationId:unit,items:[{productId:'journey-product',qty:1}]}}),'stock consumption '+unit);
  const b=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'journey-product',locationId:unit}}});
  eq(Number(b.qty),4,'correct stock remaining '+unit);
 }
}
async function readModels(owner,client){
 const history=await good(await req('/api/v1/clients/'+client.id+'/history',{actor:owner,unit:'big'}),'network history API');
 ok(UNITS.every(u=>history.bookings.some(b=>b.unitId===u)),'history contains three units');
 ok(UNITS.every(u=>history.commands.some(c=>c.unitId===u)),'command history contains three units');
 for(const unit of UNITS){
  const bookings=await good(await req('/api/v1/bookings',{actor:owner,unit}),'agenda projection '+unit);
  ok(bookings.some(b=>b.clientId===client.id),'booking readback '+unit);
  const report=await good(await req('/api/v1/reports/operational-summary',{actor:owner,unit}),'operational report '+unit);
  ok(report.bookings>=2&&report.bookingItems>=2,'new bookings appear in unit report '+unit);
  ok(report.commands>=1&&report.confirmedPayments>=1&&Number(report.confirmedPaymentAmount)>=50,'new command and payment appear in report '+unit);
  ok(report.stockMovements>=2&&report.linkedClients>=1,'new stock and global client appear in report '+unit);
  const cmds=await good(await req('/api/v1/commands',{actor:owner,unit}),'finance projection '+unit);
  ok(cmds.some(c=>c.clientId===client.id),'command readback '+unit);
 }
}
try{
 await setup();const owner=await login(creds.username,creds.password),cfg=await identityAndCatalog(owner),client=await clientAgenda(owner,cfg);
 await publicJourney(cfg,client);await cashAndCommands(owner,cfg,client);await stockJourney(owner);await readModels(owner,client);
 console.log(JSON.stringify({result:'EMPTY-STATE PRODUCTION READINESS: PASS',checks,units:UNITS,isolated:true}));
}catch(e){mainError=e}finally{
 const failures=[],step=async(name,fn)=>{try{await fn()}catch(e){failures.push(new Error(name+': '+String(e?.code||e?.name||'FAILED')))}};
 if(server&&server.exitCode===null){server.kill('SIGTERM');for(let i=0;i<30&&server.exitCode===null;i++)await sleep(100)}
 if(prisma)await step('journey client disconnect',()=>prisma.$disconnect());
 if(admin){
  if(schemaCreated){
   await step('drop isolated journey schema',()=>admin.$executeRawUnsafe('DROP SCHEMA "'+SCHEMA+'" CASCADE'));
   await step('verify schema removal',async()=>{const rows=await admin.$queryRawUnsafe("SELECT schema_name FROM information_schema.schemata WHERE schema_name='"+SCHEMA+"'");assert.equal(rows.length,0)});
  }
  await step('admin client disconnect',()=>admin.$disconnect());
 }
 if(mainError||failures.length)throw new AggregateError([...(mainError?[mainError]:[]),...failures],'EMPTY-STATE PRODUCTION READINESS: FAIL');
}