import assert from 'node:assert/strict';
import {AuthService} from '../dist/src/auth/auth.service.js';
import {CoreWriteController} from '../dist/src/core/core-write.controller.js';
import {StockService} from '../dist/src/core/stock.service.js';
import {FinanceWriteController} from '../dist/src/core/finance-write.controller.js';
process.env.OPERATIONAL_WRITES_ENABLED='true';
const failures=[];
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message)}}
await check('activation token is consumed exactly once under concurrency',async()=>{
 let used=false,passwordWrites=0;
 const row={id:'token',userId:'u',purpose:'ACTIVATE',usedAt:null,invalidatedAt:null,expiresAt:new Date(Date.now()+60000),user:{active:true}};
 const tx={user:{update:async()=>{passwordWrites++}},userCredentialToken:{update:async()=>{used=true},updateMany:async({where})=>{if(where.id==='token'){if(used)return {count:0};used=true;return {count:1}}return {count:0}}},session:{updateMany:async()=>({count:0})}};
 const svc=new AuthService({userCredentialToken:{findUnique:async()=>structuredClone(row)},$transaction:async fn=>fn(tx)});
 const results=await Promise.allSettled([svc.consumeCredentialToken('secret','first-password-123','ACTIVATE'),svc.consumeCredentialToken('secret','other-password-123','ACTIVATE')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(passwordWrites,1);
});
await check('direct payment without a service-line recipient has no write',async()=>{
 let writes=0;
 const tx={$executeRaw:async()=>0,$queryRaw:async()=>[],commandPayment:{findUnique:async()=>null,create:async()=>{writes++;return {}}},openCommand:{findFirst:async()=>({id:'c',unitId:'centro',status:'OPEN',remainingAmount:100}),update:async()=>{writes++}},commandServiceItem:{findFirst:async()=>null},professionalUnit:{findFirst:async()=>null},auditEvent:{create:async()=>{writes++}}};
 const controller=new FinanceWriteController({$transaction:async fn=>fn(tx)});
 await assert.rejects(controller.payment({unitId:'centro',principal:{userId:'u'}},'c',{method:'DIRECT_PROFESSIONAL',amount:10},'k'),/profissional|destinat/i);
 assert.equal(writes,0);
});
await check('stock mutation obeys operational write freeze',async()=>{
 process.env.OPERATIONAL_WRITES_ENABLED='false';let writes=0;
 const stock=new StockService({$transaction:async fn=>fn({product:{findUnique:async()=>null,create:async()=>{writes++;return {id:'p'}}},auditEvent:{create:async()=>{writes++}}})});
 await assert.rejects(stock.upsertProduct({networkAdmin:true},{name:'p',type:'RESALE'}),/habilitada/i);assert.equal(writes,0);
 process.env.OPERATIONAL_WRITES_ENABLED='true';
});
await check('internal agenda rejects exhausted configured workstation capacity',async()=>{
 const startAt=new Date('2026-10-09T12:00:00Z');
 const tx={$executeRaw:async()=>0,booking:{findFirst:async()=>null},bookingItem:{findMany:async()=>[{id:'existing',professionalId:'other',startAt,durationMin:30,service:{categoryId:'cat'}}]},workstation:{findMany:async()=>[{id:'only-station',allowedCategoryIds:['cat']}]},service:{findMany:async()=>[{id:'s',categoryId:'cat'}]}};
 // The existing professional-conflict query is empty; only resource occupancy conflicts.
 tx.bookingItem.findMany=async args=>args.where.professionalId?[]:[{id:'existing',professionalId:'other',startAt,durationMin:30,service:{categoryId:'cat'}}];
 const controller=new CoreWriteController({},null,null,null);
 await assert.rejects(controller.lockAndCheck(tx,'centro','2026-10-09',null,[{id:'new',professionalId:'new-pro',serviceId:'s',startAt,durationMin:30}], 'Agendado'),/capacidade|recurso|estação/i);
});
if(failures.length)throw Error(failures.join('\n'));
