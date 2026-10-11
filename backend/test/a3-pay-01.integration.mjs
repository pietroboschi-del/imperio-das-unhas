import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
const database=String(process.env.DATABASE_URL||'');
if(!database.includes('imperio_ci')||!/(localhost|127\.0\.0\.1)/.test(database))throw Error('A3-PAY-01 requires isolated imperio_ci');
const prisma=new PrismaClient(),port=3246,root='http://127.0.0.1:'+port;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'centro,big,shopping-contagem'},stdio:['ignore','pipe','pipe']});
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(root+'/api/v1/health')).ok)return}catch{}await pause(250)}throw Error('Isolated Nest health timeout')}
async function run(){
 await ready();
 const login=await fetch(root+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
 assert.equal(login.status,201,'synthetic CI admin login');
 const session={cookie:cookie(login),csrf:(await login.json()).csrfToken};
 const req=(unit,path,method='GET',body,key)=>fetch(root+'/api/v1'+path,{method,headers:{'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf,'x-unit-id':unit,...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const post=async(unit,path,body,key)=>{const r=await req(unit,path,'POST',body,key);assert(r.ok,unit+' '+path+' '+r.status+' '+(await r.clone().text()).slice(0,300));return r.json()};
 const units=['centro','big','shopping-contagem'],day='2026-10-11';
 const client=await prisma.client.findFirst({where:{active:true},select:{id:true}});
 assert(client,'CI synthetic client fixture must exist');
 const all={};
 for(const unit of units){
  const name='a3pay_'+unit.replace(/\W/g,'_');
  const account=await post(unit,'/finance/accounts',{id:name,name:'Conta sintética A3PAY',type:'BANK',unitId:unit,metadata:{paymentMethodIds:['pm_custom_pix','pm_custom_other','pm_custom_debit'],feeRules:{},details:{}}});
  assert.equal(account.unitId,unit);
  const cash=await post(unit,'/cash-sessions',{businessDate:day,openingAmount:0},'a3pay-open-'+unit);
  const command=await post(unit,'/commands',{serviceDate:day,grossAmount:30},'a3pay-command-'+unit);
  const commandEntries=[];
  for(const [idx,method,amount] of [[0,'PIX',15],[1,'OTHER',8],[2,'DEBIT_CARD',7]]){
   const entry=await post(unit,'/commands/'+command.id+'/payments',{cashSessionId:cash.id,accountId:name,method,amount},'a3pay-command-'+unit+'-'+idx);
   assert.equal(entry.method,method);commandEntries.push(entry.id);
  }
  const cmd=await (await req(unit,'/commands/'+command.id)).json();
  assert.equal(cmd.status,'CLOSED','mixed command fully paid');
  assert.deepEqual(cmd.payments.map(p=>p.method),['PIX','OTHER','DEBIT_CARD']);
  const rvId='a3pay-rv-'+unit;
  await prisma.receivableOpening.create({data:{id:rvId,clientId:client.id,unitId:unit,sourceDate:new Date(day+'T00:00:00.000Z'),originalAmount:16,balance:16,status:'OPEN'}});
  const pix=await post(unit,'/finance/receivables/settle',{clientId:client.id,receivableIds:[rvId],amount:10,accountId:name,date:day,method:'PIX',cashSessionId:cash.id},'a3pay-monthly-pix-'+unit);
  const other=await post(unit,'/finance/receivables/settle',{clientId:client.id,receivableIds:[rvId],amount:6,accountId:name,date:day,method:'OTHER',cashSessionId:cash.id},'a3pay-monthly-other-'+unit);
  assert.equal(pix.metadata.method,'PIX');assert.equal(other.metadata.method,'OTHER');
  assert.equal(Number((await prisma.receivableOpening.findUniqueOrThrow({where:{id:rvId}})).balance),0);
  const closed=await post(unit,'/cash-sessions/'+cash.id+'/close',{closingAmount:0,closeNote:'CI sintética A3-PAY-01'});
  const snap=closed.legacyPayload?.snapshot;
  assert.equal(Number(snap.received),46,'command 30 + monthly 16 counted once');
  assert.equal(Number(snap.pix),25,'PIX 15 command + 10 monthly');
  assert.equal(Number(snap.cards),7,'debit 7');
  assert.equal(Number(snap.cash),0,'bank receipts must not inflate physical cash');
  const reportResponse=await req(unit,'/finance/reports/receipt-summary?from='+day+'&to='+day);
  assert.equal(reportResponse.status,200);
  const summary=await reportResponse.json();
  const own=summary.receipts.filter(x=>[...commandEntries,pix.id,other.id].includes(x.id));
  assert.equal(own.length,5,'3 command payments + 2 monthly receipts exactly once');
  assert.deepEqual(own.map(x=>x.method).sort(),['DEBIT_CARD','OTHER','OTHER','PIX','PIX'].sort(),'reported types match persisted canonical classes');
  assert(own.every(x=>x.unitId===unit),'report unit isolation');
  const historical=await prisma.centralFinanceEntry.findUniqueOrThrow({where:{id:other.id}});
  assert.equal(historical.metadata.method,'OTHER','historical OTHER preserved without reclassification');
  all[unit]={totalReceipts:46,pix:25,cards:7,other:14,monthly:16,entryIds:[...commandEntries,pix.id,other.id]};
 }
 for(const unit of units){
  const view=await (await req(unit,'/finance/reports/receipt-summary?from='+day+'&to='+day)).json();
  for(const other of units.filter(x=>x!==unit))assert(all[other].entryIds.every(id=>!view.receipts.some(x=>x.id===id)),'cross-unit receipts hidden');
 }
 console.log(JSON.stringify({ok:true,case:'A3-PAY-01 synthetic PostgreSQL end to end',units:all,closeCash:true,report:true,crossUnitIsolation:true,historicalOtherUnchanged:true}));
}
try{await run()}finally{server.kill('SIGTERM');await Promise.race([once(server,'exit'),pause(2500)]).catch(()=>{});await prisma.$disconnect().catch(()=>{})}
