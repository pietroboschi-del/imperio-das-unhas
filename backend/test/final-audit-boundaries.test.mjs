import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validate} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {AuthService} from '../dist/src/auth/auth.service.js';
import {StockService} from '../dist/src/core/stock.service.js';
import {FinanceWriteController} from '../dist/src/core/finance-write.controller.js';
import {SyncCommandDto} from '../dist/src/core/finance-write.dto.js';

test('one credential token cannot change a password twice under concurrent consumption',async()=>{
  // Both requests observe the initial token before asynchronous Argon2 hashing.
  // This boundary double models the atomic conditional UPDATE used by PostgreSQL.
  let used=false,passwordWrites=0;
  const token={id:'token',userId:'user',purpose:'ACTIVATE',usedAt:null,invalidatedAt:null,expiresAt:new Date(Date.now()+60000),user:{active:true}};
  const db={userCredentialToken:{findUnique:async()=>structuredClone(token),update:async()=>{used=true;},updateMany:async({where})=>{if(where.id==='token'){if(used)return {count:0};used=true;return {count:1};}return {count:0};}},user:{update:async()=>{passwordWrites++;}},session:{updateMany:async()=>({count:0})}};
  db.$transaction=async fn=>fn(db);
  const service=new AuthService(db);
  const results=await Promise.allSettled([service.consumeCredentialToken('token','first-password-123','ACTIVATE'),service.consumeCredentialToken('token','second-password-123','ACTIVATE')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(passwordWrites,1);
});

test('stock gate OFF denies product creation before any persistence',async()=>{
  const old=process.env.OPERATIONAL_WRITES_ENABLED;process.env.OPERATIONAL_WRITES_ENABLED='false';
  let writes=0;const db={product:{findUnique:async()=>null,create:async({data})=>{writes++;return data;}},auditEvent:{create:async()=>({})}};db.$transaction=async fn=>fn(db);
  try{await assert.rejects(()=>new StockService(db).upsertProduct({networkAdmin:true},{name:'Test',type:'RESALE'}),e=>e.getStatus?.()===503);assert.equal(writes,0);}finally{if(old===undefined)delete process.env.OPERATIONAL_WRITES_ENABLED;else process.env.OPERATIONAL_WRITES_ENABLED=old;}
});

test('direct professional payment without a service-line recipient is rejected server-side',async()=>{
  const old=process.env.OPERATIONAL_WRITES_ENABLED;process.env.OPERATIONAL_WRITES_ENABLED='true';let writes=0;
  const db={$executeRaw:async()=>0,$queryRaw:async()=>[],commandPayment:{findUnique:async()=>null,create:async({data})=>{writes++;return data;}},openCommand:{findFirst:async()=>({id:'cmd',status:'OPEN',remainingAmount:10}),update:async()=>({})},commandServiceItem:{findMany:async()=>[],findFirst:async()=>null},auditEvent:{create:async()=>({})}};db.$transaction=async fn=>fn(db);
  try{await assert.rejects(()=>new FinanceWriteController(db).payment({unitId:'centro',principal:{userId:'owner'}},'cmd',{method:'DIRECT_PROFESSIONAL',amount:10},'direct'),e=>e.getStatus?.()===409);assert.equal(writes,0);}finally{if(old===undefined)delete process.env.OPERATIONAL_WRITES_ENABLED;else process.env.OPERATIONAL_WRITES_ENABLED=old;}
});

test('nested service item rejects negative price/commission and unknown fields',async()=>{
  const dto=plainToInstance(SyncCommandDto,{grossAmount:10,discountAmount:0,amountDue:10,items:[{serviceId:'s',professionalId:'p',quantity:1,unitPrice:-10,commissionFixedAmount:-5,networkAdmin:true}]});
  assert.ok((await validate(dto,{whitelist:true,forbidNonWhitelisted:true})).length>0);
});

test('unknown stock location is validated before unit gate and cannot cause writes',async()=>{
 const old=process.env.OPERATIONAL_WRITES_ENABLED,units=process.env.OPERATIONAL_WRITES_UNITS;
 process.env.OPERATIONAL_WRITES_ENABLED='true';process.env.OPERATIONAL_WRITES_UNITS='centro,big,shopping-contagem';
 let writes=0;const db={stockLocation:{findUnique:async()=>null},$transaction:async()=>{writes++;throw Error('unexpected transaction')}};
 try{await assert.rejects(()=>new StockService(db).consume({networkAdmin:true},{locationId:'evil-location',items:[{productId:'p',qty:1}]},'unknown'),e=>e.getStatus?.()===404);assert.equal(writes,0);}
 finally{if(old===undefined)delete process.env.OPERATIONAL_WRITES_ENABLED;else process.env.OPERATIONAL_WRITES_ENABLED=old;if(units===undefined)delete process.env.OPERATIONAL_WRITES_UNITS;else process.env.OPERATIONAL_WRITES_UNITS=units;}
});
