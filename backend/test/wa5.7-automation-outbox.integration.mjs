import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {MessagingAutomationOutboxService} from '../dist/src/messaging/messaging-automation-outbox.service.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {MessagingDispatchService} from '../dist/src/messaging/messaging-dispatch.service.js';
import {FakeMessagingProvider} from './helpers/fake-messaging-provider.mjs';

const prisma=new PrismaClient();
const prefix='wa57-ci-'+Date.now(),centroClient=prefix+'-centro-c',bigClient=prefix+'-big-c',noPhoneClient=prefix+'-nophone-c',bookingId=prefix+'-booking';
const automationIds=[];

async function auto(base,input){
 const row=await base.create(input);automationIds.push(row.id);return row;
}
try{
 await prisma.$connect();await ensureCanonicalUnits(prisma);
 await prisma.messagingChannel.updateMany({data:{enabled:false}});
 process.env.WHATSAPP_AUTOMATION_ENABLED='false';
 await prisma.client.createMany({data:[
  {id:centroClient,name:'Centro WA5.7',phone:'+5531998111222',registrationUnitId:'centro',legacyPayload:{}},
  {id:bigClient,name:'Big WA5.7',phone:'+5531998333444',registrationUnitId:'big',legacyPayload:{}},
  {id:noPhoneClient,name:'Sem telefone WA5.7',phone:null,registrationUnitId:'centro',legacyPayload:{}},
 ]});
 await prisma.booking.create({data:{id:bookingId,unitId:'centro',clientId:centroClient,serviceDate:new Date('2031-01-10T00:00:00.000Z'),status:'Agendado',legacyPayload:{source:'wa5.7-test'}}});

 const automation=new MessagingAutomationService(prisma),foundation=new MessagingFoundationService(prisma),bridge=new MessagingAutomationOutboxService(prisma,foundation);
 const due=new Date('2031-01-01T10:00:00.000Z'),now=new Date('2031-01-01T11:00:00.000Z');
 const first=await auto(automation,{unitId:'centro',clientId:centroClient,bookingId,sourceType:'BOOKING_CREATED',sourceId:bookingId,automationType:'BOOKING_CONFIRMATION',scheduledAt:due,idempotencyKey:prefix+':first',logicalKey:prefix+':first',generation:1,payload:{test:true}});
 const future=await auto(automation,{unitId:'centro',clientId:centroClient,bookingId,sourceType:'BOOKING_CREATED',sourceId:bookingId,automationType:'APPOINTMENT_REMINDER',scheduledAt:new Date('2031-01-02T10:00:00.000Z'),idempotencyKey:prefix+':future',logicalKey:prefix+':future',generation:1,payload:{test:true}});
 const marked=await bridge.markDueReady(100,now);
 assert.ok(marked.ids.includes(first.id));assert.ok(!marked.ids.includes(future.id));
 assert.equal((await prisma.messagingAutomation.findUniqueOrThrow({where:{id:first.id}})).status,'READY');
 assert.equal((await prisma.messagingAutomation.findUniqueOrThrow({where:{id:future.id}})).status,'PENDING');

 const queued=await bridge.enqueueReady(first.id);
 assert.equal(queued.outcome,'ENQUEUED');assert.equal(queued.outbox.status,'PENDING');
 assert.equal(queued.outbox.channelId,'BIG_CENTRO');assert.equal(queued.outbox.unitId,'centro');assert.equal(queued.outbox.clientId,centroClient);assert.equal(queued.outbox.bookingId,bookingId);
 assert.equal(queued.outbox.idempotencyKey,'wa5:automation-outbox:'+first.id);
 assert.equal(queued.outbox.payload.automationId,first.id);assert.equal(queued.outbox.payload.sourceId,bookingId);
 assert.equal((await prisma.messagingAutomation.findUniqueOrThrow({where:{id:first.id}})).status,'ENQUEUED');

 const replay=await bridge.enqueueReady(first.id);
 assert.equal(replay.outbox.id,queued.outbox.id);assert.equal(await prisma.messagingOutbox.count({where:{idempotencyKey:'wa5:automation-outbox:'+first.id}}),1);

 const concurrent=await auto(automation,{unitId:'big',clientId:bigClient,sourceType:'TEST',sourceId:prefix+'-big',automationType:'WAITLIST_OFFER',scheduledAt:due,idempotencyKey:prefix+':concurrent',logicalKey:prefix+':concurrent',generation:1,payload:{test:true}});
 await bridge.markDueReady(100,now);
 const both=await Promise.all([bridge.enqueueReady(concurrent.id),bridge.enqueueReady(concurrent.id)]);
 assert.equal(both[0].outbox.id,both[1].outbox.id,'concorrência converge em um Outbox');
 assert.equal(await prisma.messagingOutbox.count({where:{idempotencyKey:'wa5:automation-outbox:'+concurrent.id}}),1);

 const cancelled=await auto(automation,{unitId:'centro',clientId:centroClient,sourceType:'TEST',sourceId:prefix+'-cancel',automationType:'APPOINTMENT_REMINDER',scheduledAt:due,idempotencyKey:prefix+':cancel',logicalKey:prefix+':cancel',generation:1,payload:{}});
 await bridge.markDueReady(100,now);await automation.cancel(cancelled.id,'WA5.7_TEST_CANCEL');
 const cancelledResult=await bridge.enqueueReady(cancelled.id);
 assert.equal(cancelledResult.outcome,'SKIPPED');assert.equal(cancelledResult.status,'CANCELLED');
 assert.equal(await prisma.messagingOutbox.count({where:{idempotencyKey:'wa5:automation-outbox:'+cancelled.id}}),0);

 const centro2=await auto(automation,{unitId:'centro',clientId:centroClient,sourceType:'TEST',sourceId:prefix+'-centro2',automationType:'POST_SERVICE',scheduledAt:due,idempotencyKey:prefix+':centro2',logicalKey:prefix+':centro2',generation:1,payload:{}});
 await bridge.markDueReady(100,now);const centroOut=(await bridge.enqueueReady(centro2.id)).outbox;
 const bigOut=(await bridge.enqueueReady(concurrent.id)).outbox;
 assert.equal(centroOut.channelId,'BIG_CENTRO');assert.equal(bigOut.channelId,'BIG_CENTRO');
 assert.equal(centroOut.unitId,'centro');assert.equal(bigOut.unitId,'big','canal compartilhado não mistura unitId');

 const failed=await auto(automation,{unitId:'centro',clientId:noPhoneClient,sourceType:'TEST',sourceId:prefix+'-failed',automationType:'FEEDBACK_REQUEST',scheduledAt:due,idempotencyKey:prefix+':failed',logicalKey:prefix+':failed',generation:1,payload:{}});
 await bridge.markDueReady(100,now);
 const failure=await bridge.enqueueReady(failed.id);assert.equal(failure.outcome,'FAILED');assert.equal((await prisma.messagingAutomation.findUniqueOrThrow({where:{id:failed.id}})).status,'FAILED');
 await prisma.client.update({where:{id:noPhoneClient},data:{phone:'+5531998555666'}});
 const retried=await bridge.retryFailed(failed.id);assert.equal(retried.outcome,'ENQUEUED');assert.ok(retried.outbox);

 const fake=new FakeMessagingProvider(),dispatch=new MessagingDispatchService(prisma,fake);
 const dispatchResult=await dispatch.processOne(queued.outbox.id);
 assert.equal(dispatchResult.outcome,'SKIPPED');assert.equal(dispatchResult.status,'AUTOMATION_DISABLED');assert.equal(fake.calls.length,0,'flag OFF faz zero provider calls');
 assert.ok((await prisma.messagingChannel.findMany()).every(x=>x.enabled===false),'canais permanecem OFF');

 console.log(JSON.stringify({ok:true,feature:'wa5_7_automation_outbox',readyOnly:true,replay:true,concurrency:true,cancelledBlocked:true,unitIsolation:true,retry:true,automationOff:true,providerCalls:fake.calls.length}));
}finally{
 const outbox=await prisma.messagingOutbox.findMany({where:{idempotencyKey:{startsWith:'wa5:automation-outbox:'}},select:{id:true}}).catch(()=>[]);
 await prisma.auditEvent.deleteMany({where:{OR:[{entityType:'MessagingAutomation',entityId:{in:automationIds}},{entityType:'MessagingOutbox',entityId:{in:outbox.map(x=>x.id)}}]}}).catch(()=>{});
 await prisma.messagingOutbox.deleteMany({where:{idempotencyKey:{startsWith:'wa5:automation-outbox:'}}}).catch(()=>{});
 await prisma.messagingAutomation.deleteMany({where:{id:{in:automationIds}}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{id:bookingId}}).catch(()=>{});
 await prisma.client.deleteMany({where:{id:{in:[centroClient,bigClient,noPhoneClient]}}}).catch(()=>{});
 await prisma.messagingChannel.updateMany({data:{enabled:false}}).catch(()=>{});
 await prisma.$disconnect();
}
