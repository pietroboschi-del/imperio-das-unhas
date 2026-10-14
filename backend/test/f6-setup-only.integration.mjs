import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

// Never run this writing fixture against a real database.
const dbUrl=new URL(process.env.DATABASE_URL||'');
assert.ok(['localhost','127.0.0.1','::1'].includes(dbUrl.hostname)&&dbUrl.pathname==='/imperio_ci','synthetic loopback imperio_ci only');
const prisma=new PrismaClient(),prefix='f6_'+randomUUID().replaceAll('-','').slice(0,12);
const units=['centro','big','shopping-contagem'];
const port=Number(process.env.F6_SETUP_TEST_PORT||3197),base='http://127.0.0.1:'+port;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0,server;
const check=(value,message)=>{checks++;assert.ok(value,message)};
async function start(scope){
 server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:'',SETUP_WRITES_ENABLED:'true',SETUP_WRITES_UNITS:scope,WHATSAPP_AUTOMATION_ENABLED:'false',EVOLUTION_WEBHOOK_ENABLED:'false',WHATSAPP_AGENT_API_ENABLED:'false'},stdio:['ignore','ignore','inherit']});
 for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error('backend exited');try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(250)}throw Error('backend health timeout');
}
async function stop(){if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),sleep(3000)]);if(server.exitCode===null)server.kill('SIGKILL')}}
async function login(username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD){
 const r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});check(r.ok,'synthetic login');
 const data=await r.json();return {'content-type':'application/json',cookie:(r.headers.get('set-cookie')||'').split(';')[0],'x-csrf-token':data.csrfToken};
}
async function request(path,h,body,method='POST'){
 return fetch(base+path,{method,headers:{...h,'idempotency-key':randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const counts=async()=>Object.fromEntries(await Promise.all(['booking','openCommand','cashSession','commandPayment','centralFinanceEntry','stockMovement','stockBalance','stockPurchase'].map(async name=>[name,await prisma[name].count()])));
async function main(){
 try{
  for(const id of units)await prisma.unit.upsert({where:{id},create:{id,name:id},update:{active:true}});
  await start('centro');let owner=await login();
  let r=await request('/api/v1/clients',{...owner,'x-unit-id':'big'},{name:'Denied fixture',email:prefix+'denied@example.invalid'});check(r.status===503,'setup allowlist denies Big');
  r=await request('/api/v1/stock/products',owner,{id:prefix+'_denied',name:'Denied catalog',type:'RESALE'});check(r.status===503,'global catalog denies partial setup allowlist');
  check(await prisma.product.count({where:{id:prefix+'_denied'}})===0,'denied product not persisted');
  await stop();await start(units.join(','));owner=await login();
  const before=await counts(),created=[];
  for(const unit of units){
   const h={...owner,'x-unit-id':unit};
   r=await request('/api/v1/clients',h,{name:'Setup '+unit,email:prefix+unit+'@example.invalid'});check(r.ok,'setup client '+unit);const client=await r.json();created.push(client.id);
   r=await request('/api/v1/clients/'+client.id,h,{name:'Edited '+unit},'PATCH');check(r.ok,'setup client edit '+unit);
   r=await request('/api/v1/finance/accounts',h,{id:prefix+'_'+unit,name:'Setup bank '+unit,type:'BANK'});check(r.ok,'setup account '+unit);const account=await r.json();
   r=await request('/api/v1/finance/accounts',h,{id:account.id,name:'Edited bank '+unit,type:'BANK',expectedUpdatedAt:account.updatedAt,active:false});check(r.ok,'account edit and logical disable '+unit);
   r=await request('/api/v1/bookings',h,{clientId:client.id,serviceDate:'2027-01-04',serviceId:'setup_service',professionalId:'setup_professional',startAt:'2027-01-04T15:00:00.000Z'});check(r.status===503,'booking stays blocked '+unit);
   r=await request('/api/v1/commands',h,{serviceDate:'2027-01-04',grossAmount:10,discountAmount:0});check(r.status===503,'command stays blocked '+unit);
   r=await request('/api/v1/cash-sessions',h,{businessDate:'2027-01-04',openingAmount:0});check(r.status===503,'cash stays blocked '+unit);
   r=await request('/api/v1/commands/'+prefix+'/payments',h,{method:'CASH',amount:10});check(r.status===503,'payment stays blocked '+unit);
   r=await request('/api/v1/finance/entries',h,{direction:'income',status:'Efetivado',amount:10});check(r.status===503,'ledger stays blocked '+unit);
   r=await request('/api/v1/public/bookings',{'content-type':'application/json'},{unitId:unit,serviceId:'setup_service',professionalId:'setup_professional',startAt:'2027-01-04T12:00',clientName:'Synthetic',clientPhone:'31999990000'});check(r.status===503,'public booking stays blocked '+unit);
  }
  r=await request('/api/v1/stock/products',owner,{id:prefix+'_product',name:'Setup product',type:'RESALE'});check(r.ok,'global setup product');
  r=await request('/api/v1/stock/products/'+prefix+'_product',owner,{name:'Edited product',type:'RESALE',active:false},'PATCH');check(r.ok,'catalog edit and logical disable');
  const locations=await prisma.stockLocation.findMany({where:{unitId:{in:units}}});
  for(const location of locations){r=await request('/api/v1/stock/consumptions',owner,{locationId:location.id,items:[{productId:prefix+'_product',qty:1}]});check(r.status===503,'stock movement stays blocked '+location.unitId)}
  assert.deepEqual(await counts(),before);checks++;
  const username=prefix+'_reader',password='synthetic-f6-reader-password';
  r=await request('/api/v1/admin/users',owner,{username,displayName:'Synthetic setup reader',systemRole:'OPERATOR',permissions:[],units:[{unitId:'centro',role:'reception',permissions:['clients.read','finance.read']}]});check(r.ok,'create synthetic reader');const user=await r.json();
  r=await request('/api/v1/auth/users/'+user.id+'/activation-token',owner,{});check(r.ok,'synthetic activation token');const token=await r.json();
  r=await request('/api/v1/auth/activate',{'content-type':'application/json'},{token:token.token,newPassword:password});check(r.ok,'activate synthetic reader');const reader=await login(username,password);
  for(const unit of ['centro','big']){r=await request('/api/v1/clients',{...reader,'x-unit-id':unit},{name:'Denied reader',email:prefix+'reader@example.invalid'});check(r.status===403,'permission/unit denial '+unit)}
  r=await request('/api/v1/finance/accounts',{...reader,'x-unit-id':'centro'},{id:prefix+'_forbidden',name:'Denied account',type:'BANK'});check(r.status===403,'account permission denied');
  r=await request('/api/v1/stock/products',reader,{name:'Denied product',type:'RESALE'});check(r.status===403,'catalog permission denied');
  r=await request('/api/v1/auth/logout',owner,{});check(r.ok,'logout');owner=await login();
  for(let i=0;i<units.length;i++){
   const unit=units[i],h={...owner,'x-unit-id':unit};
   check((await prisma.client.findUnique({where:{id:created[i]}})).name==='Edited '+unit,'persisted client after relogin '+unit);
   r=await request('/api/v1/finance/accounts',h,undefined,'GET');check(r.ok,'read accounts after relogin');const rows=await r.json();check(rows.some(x=>x.id===prefix+'_'+unit&&!x.active),'persisted account disable '+unit);check(!rows.some(x=>x.id.startsWith(prefix)&&x.unitId!==unit),'account isolation '+unit);
  }
  check((await prisma.product.findUnique({where:{id:prefix+'_product'}})).active===false,'persisted product disable');
  console.log(JSON.stringify({ok:true,checks,feature:'F6 setup-only HTTP persistence RBAC and operational freeze',productionWrites:false}));
 }finally{await stop();await prisma.$disconnect()}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
