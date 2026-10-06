import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {MessagingDispatchService} from '../dist/src/messaging/messaging-dispatch.service.js';
import {messagingSendingStaleMs} from '../dist/src/messaging/messaging-dispatch-config.js';
import {FakeMessagingProvider} from './helpers/fake-messaging-provider.mjs';

const prisma=new PrismaClient();
let checks=0;
const ok=(value,message)=>{checks++;assert.ok(value,message)};
const eq=(actual,expected,message)=>{checks++;assert.equal(actual,expected,message)};
const now=new Date('2026-10-06T03:00:00.000Z');
const oldAutomation=process.env.WHATSAPP_AUTOMATION_ENABLED;
const oldStale=process.env.MESSAGING_SENDING_STALE_MS;

async function queue(foundation,key){
  return foundation.queueMessage({
    channelId:'BIG_CENTRO',
    unitId:'big',
    idempotencyKey:key,
    messageType:'WA2_1_TEST',
    trigger:'WA2_1_TEST',
    payload:{number:'5531999990000',text:key},
  });
}
async function forceState(id,status,lastAttemptAt){
  return prisma.messagingOutbox.update({
    where:{id},
    data:{status,lastAttemptAt,attempts:1,nextAttemptAt:null,lastError:null},
  });
}

try{
  await prisma.$connect();
  await ensureCanonicalUnits(prisma);
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}});
  await prisma.messagingOutbox.deleteMany();
  await prisma.messagingChannel.updateMany({data:{enabled:false}});
  await prisma.messagingChannel.update({where:{id:'BIG_CENTRO'},data:{enabled:true}});
  delete process.env.MESSAGING_SENDING_STALE_MS;
  eq(messagingSendingStaleMs(),300000,'lease possui default conservador de cinco minutos');
  process.env.MESSAGING_SENDING_STALE_MS='300000';
  process.env.WHATSAPP_AUTOMATION_ENABLED='true';

  eq(messagingSendingStaleMs(),300000,'lease configurável usa MESSAGING_SENDING_STALE_MS');

  const foundation=new MessagingFoundationService(prisma);

  let fake=new FakeMessagingProvider();
  let dispatch=new MessagingDispatchService(prisma,fake);

  const recent=await queue(foundation,'wa2.1-recent');
  await forceState(recent.id,'SENDING',new Date(now.getTime()-60_000));
  let recovery=await dispatch.recoverStaleSending(20,now);
  eq(recovery.recovered,0,'SENDING recente não é recuperado');
  eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:recent.id}})).status,'SENDING','SENDING recente permanece SENDING');
  eq(fake.calls.length,0,'recuperação de SENDING recente não chama provider');

  const stale=await queue(foundation,'wa2.1-stale');
  await forceState(stale.id,'SENDING',new Date(now.getTime()-10*60_000));
  recovery=await dispatch.recoverStaleSending(20,now);
  eq(recovery.recovered,1,'SENDING stale é recuperado uma vez');
  const staleRecovered=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:stale.id}});
  eq(staleRecovered.status,'FAILED','SENDING stale vira FAILED recuperável');
  ok(staleRecovered.nextAttemptAt instanceof Date&&staleRecovered.nextAttemptAt>now,'SENDING stale recebe nextAttemptAt futuro');
  eq(staleRecovered.lastError,'Previous send attempt did not complete','SENDING stale recebe erro sanitizado');
  eq(await prisma.auditEvent.count({where:{action:'communication.send_recovered',entityId:stale.id}}),1,'SENDING stale gera um AuditEvent');
  eq(fake.calls.length,0,'recuperação stale não chama provider');

  const concurrent=await queue(foundation,'wa2.1-concurrent');
  await forceState(concurrent.id,'SENDING',new Date(now.getTime()-10*60_000));
  fake=new FakeMessagingProvider();
  dispatch=new MessagingDispatchService(prisma,fake);
  const concurrentResults=await Promise.all([
    dispatch.recoverStaleSending(20,now),
    dispatch.recoverStaleSending(20,now),
  ]);
  eq(concurrentResults.reduce((sum,item)=>sum+item.recovered,0),1,'duas recuperações concorrentes têm uma única alteração efetiva');
  eq(await prisma.auditEvent.count({where:{action:'communication.send_recovered',entityId:concurrent.id}}),1,'concorrência gera um único AuditEvent');
  eq(fake.calls.length,0,'recuperação concorrente não chama provider');

  const viaPending=await queue(foundation,'wa2.1-process-pending');
  await forceState(viaPending.id,'SENDING',new Date(Date.now()-10*60_000));
  fake=new FakeMessagingProvider();
  fake.nextProviderMessageId='wa2.1-retry-provider';
  dispatch=new MessagingDispatchService(prisma,fake);
  await dispatch.processPending(20);
  const processRecovered=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:viaPending.id}});
  eq(processRecovered.status,'FAILED','processPending primeiro recupera SENDING stale');
  ok(processRecovered.nextAttemptAt instanceof Date,'processPending agenda retry após recuperação');
  eq(fake.calls.length,0,'processPending não envia SENDING stale no mesmo ato de recuperação');

  await prisma.messagingOutbox.update({
    where:{id:viaPending.id},
    data:{nextAttemptAt:new Date(Date.now()-1000)},
  });
  await dispatch.processPending(20);
  const retried=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:viaPending.id}});
  eq(retried.status,'SENT','FAILED recuperado pode seguir retry normal quando elegível');
  eq(fake.calls.length,1,'retry normal chama provider uma única vez após elegibilidade');

  const protectedStatuses=['SENT','DELIVERED','READ','CANCELLED'];
  const protectedIds=[];
  for(const status of protectedStatuses){
    const row=await queue(foundation,'wa2.1-protected-'+status.toLowerCase());
    await forceState(row.id,status,new Date(now.getTime()-10*60_000));
    protectedIds.push([row.id,status]);
  }
  recovery=await dispatch.recoverStaleSending(50,now);
  for(const [id,status] of protectedIds){
    eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id}})).status,status,status+' nunca entra na recuperação stale');
    eq(await prisma.auditEvent.count({where:{action:'communication.send_recovered',entityId:id}}),0,status+' não gera audit de recuperação');
  }

  const flagOff=await queue(foundation,'wa2.1-flag-off');
  process.env.WHATSAPP_AUTOMATION_ENABLED='false';
  fake=new FakeMessagingProvider();
  dispatch=new MessagingDispatchService(prisma,fake);
  await dispatch.processPending(50);
  eq(fake.calls.length,0,'feature flag OFF não provoca envio externo');
  eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:flagOff.id}})).status,'PENDING','feature flag OFF mantém PENDING sem envio');

  console.log(JSON.stringify({
    ok:true,
    checks,
    feature:'wa2_1_stale_sending_recovery',
    defaultStaleMs:300000,
    externalCalls:false,
  }));
}finally{
  process.env.WHATSAPP_AUTOMATION_ENABLED=oldAutomation;
  if(oldStale===undefined)delete process.env.MESSAGING_SENDING_STALE_MS;
  else process.env.MESSAGING_SENDING_STALE_MS=oldStale;
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}}).catch(()=>{});
  await prisma.messagingOutbox.deleteMany().catch(()=>{});
  await prisma.messagingChannel.updateMany({data:{enabled:false}}).catch(()=>{});
  await prisma.$disconnect();
}
