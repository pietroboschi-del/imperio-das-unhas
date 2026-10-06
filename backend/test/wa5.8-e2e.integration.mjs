import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {BookingAutomationMaterializationService} from '../dist/src/messaging/booking-automation-materialization.service.js';
import {BookingAutomationLifecycleService} from '../dist/src/messaging/booking-automation-lifecycle.service.js';
import {WaitlistAutomationMaterializationService} from '../dist/src/messaging/waitlist-automation-materialization.service.js';
import {PostServiceAutomationMaterializationService} from '../dist/src/messaging/post-service-automation-materialization.service.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {MessagingAutomationOutboxService} from '../dist/src/messaging/messaging-automation-outbox.service.js';
import {MessagingDispatchService} from '../dist/src/messaging/messaging-dispatch.service.js';
import {FakeMessagingProvider} from './helpers/fake-messaging-provider.mjs';

const prisma=new PrismaClient();
const prefix='wa58-ci-'+Date.now();
const clientIds={centro:prefix+'-centro-c',big:prefix+'-big-c',nophone:prefix+'-nophone-c'};
const proId=prefix+'-pro',services=[prefix+'-svc-a',prefix+'-svc-b'];
const bookingId=prefix+'-booking',postBookingId=prefix+'-post-booking',opportunityId=prefix+'-opportunity',requestId=prefix+'-request';
const oldFlag=process.env.WHATSAPP_AUTOMATION_ENABLED;
const H=60*60*1000;

async function makeBooking(id,unitId,clientId,startAt,status='Agendado',itemCount=2){
 await prisma.booking.create({data:{
  id,unitId,clientId,serviceDate:new Date(startAt.toISOString().slice(0,10)+'T00:00:00.000Z'),startAt,
  serviceId:services[0],professionalId:proId,status,legacyPayload:{source:'wa5.8-test',multiItem:itemCount>1},
  items:{create:[
   {id:id+'-i1',unitId,serviceId:services[0],professionalId:proId,startAt,durationMin:30,unitPrice:'40',sortOrder:0},
   {id:id+'-i2',unitId,serviceId:services[1],professionalId:proId,startAt:new Date(startAt.getTime()+30*60000),durationMin:45,unitPrice:'55',sortOrder:1},
  ].slice(0,itemCount)},
 }});
}
async function autos(id){return prisma.messagingAutomation.findMany({where:{bookingId:id},orderBy:[{generation:'asc'},{automationType:'asc'}]})}

try{
 await prisma.$connect();await ensureCanonicalUnits(prisma);
 process.env.WHATSAPP_AUTOMATION_ENABLED='false';
 await prisma.messagingChannel.updateMany({data:{enabled:false}});
 await prisma.client.createMany({data:[
  {id:clientIds.centro,name:'Centro WA5.8',phone:'+5531998001111',registrationUnitId:'centro',legacyPayload:{}},
  {id:clientIds.big,name:'Big WA5.8',phone:'+5531998002222',registrationUnitId:'big',legacyPayload:{}},
  {id:clientIds.nophone,name:'Sem telefone WA5.8',phone:null,registrationUnitId:'centro',legacyPayload:{}},
 ]});
 await prisma.professional.create({data:{id:proId,name:'Pro WA5.8',legacyPayload:{source:'wa5.8-test'}}});
 await prisma.service.createMany({data:[
  {id:services[0],name:'WA5.8 A',price:'40',durationMin:30,legacyPayload:{show:true}},
  {id:services[1],name:'WA5.8 B',price:'55',durationMin:45,legacyPayload:{show:true}},
 ]});
 for(const unitId of ['centro','big'])await prisma.professionalUnit.create({data:{professionalId:proId,unitId}});

 const baseline={
  bookings:await prisma.booking.count(),
  commands:await prisma.openCommand.count(),
  payments:await prisma.commandPayment.count(),
  cash:await prisma.cashSession.count(),
 };

 const automation=new MessagingAutomationService(prisma);
 const bookingMat=new BookingAutomationMaterializationService(prisma,automation);
 const lifecycle=new BookingAutomationLifecycleService(prisma,bookingMat,automation);
 const waitlistMat=new WaitlistAutomationMaterializationService(prisma,automation);
 const postMat=new PostServiceAutomationMaterializationService(prisma,automation);
 const foundation=new MessagingFoundationService(prisma);
 const bridge=new MessagingAutomationOutboxService(prisma,foundation);

 const start=new Date(Date.now()+72*H);
 await makeBooking(bookingId,'centro',clientIds.centro,start,'Agendado',2);
 const concurrentCreated=await Promise.all([bookingMat.materializeCreatedBooking(bookingId),bookingMat.materializeCreatedBooking(bookingId)]);
 assert.equal(concurrentCreated[0].created[0].id,concurrentCreated[1].created[0].id,'criação concorrente converge');
 let rows=await autos(bookingId);
 assert.equal(rows.length,4,'multi-serviço gera quatro automações do booking, não por item');
 assert.deepEqual(new Set(rows.map(x=>x.automationType)),new Set(['BOOKING_CONFIRMATION','SIGNAL_REQUEST','SIGNAL_REMINDER','APPOINTMENT_REMINDER']));
 assert.ok(rows.every(x=>x.unitId==='centro'&&x.bookingId===bookingId&&x.clientId===clientIds.centro));
 const g1Reminder=rows.find(x=>x.generation===1&&x.automationType==='APPOINTMENT_REMINDER');
 assert.ok(g1Reminder);assert.ok(Math.abs((start.getTime()-g1Reminder.scheduledAt.getTime())-24*H)<2500,'regra temporal -24h aplicada');

 const reschedule=async hours=>{
  const next=new Date(Date.now()+hours*H);
  await prisma.$transaction(async tx=>{
   await tx.bookingItem.updateMany({where:{bookingId},data:{startAt:next}});
   await tx.booking.update({where:{id:bookingId},data:{startAt:next,serviceDate:new Date(next.toISOString().slice(0,10)+'T00:00:00.000Z'),version:{increment:1}}});
  });
  await lifecycle.replaceForReschedule(bookingId);
  return next;
 };
 const secondStart=await reschedule(96);
 rows=await autos(bookingId);
 assert.equal(rows.filter(x=>x.generation===1&&x.status==='CANCELLED').length,4,'primeira geração cancelada');
 assert.equal(rows.filter(x=>x.generation===2&&x.status==='PENDING').length,4,'segunda geração criada');
 const thirdStart=await reschedule(120);
 await lifecycle.replaceForReschedule(bookingId);
 rows=await autos(bookingId);
 assert.equal(rows.filter(x=>x.generation===2&&x.status==='CANCELLED').length,4,'segunda geração cancelada após novo reagendamento');
 assert.equal(rows.filter(x=>x.generation===3&&x.status==='PENDING').length,4,'terceira geração única após replay');
 const g3Reminder=rows.find(x=>x.generation===3&&x.automationType==='APPOINTMENT_REMINDER');
 assert.ok(Math.abs((thirdStart.getTime()-g3Reminder.scheduledAt.getTime())-24*H)<2500,'novo reminder recalculado');
 assert.notEqual(g1Reminder.id,g3Reminder.id);

 await prisma.booking.update({where:{id:bookingId},data:{status:'Cancelado',version:{increment:1}}});
 await Promise.all([lifecycle.cancelForBooking(bookingId),lifecycle.cancelForBooking(bookingId)]);
 rows=await autos(bookingId);
 assert.equal(rows.filter(x=>x.status==='PENDING'||x.status==='READY'||x.status==='FAILED').length,0,'cancelamento repetido deixa zero automação futura acionável');

 await prisma.waitlistRequest.create({data:{id:requestId,unitId:'big',clientId:clientIds.big,status:'OPPORTUNITY',legacyPayload:{channelId:'CENTRAL',serviceIds:services,services:services.map(serviceId=>({serviceId}))}}});
 await prisma.waitlistOpportunity.create({data:{
  id:opportunityId,unitId:'big',requestId,status:'FOUND',bookingId:null,
  legacyPayload:{requestId,primaryUnitId:'big',offeredUnitId:'big',serviceIds:services,classification:'IDEAL',offerState:'CONTACT_PENDING',
    visitStartAt:new Date(Date.now()+48*H).toISOString(),visitEndAt:new Date(Date.now()+49*H).toISOString(),
    items:services.map((serviceId,i)=>({serviceId,professionalId:proId,startAt:new Date(Date.now()+(48+i)*H).toISOString()}))},
 }});
 const beforeWaitlistBookings=await prisma.booking.count();
 const offerConcurrent=await Promise.all([waitlistMat.materializeOfferCandidate(opportunityId),waitlistMat.materializeOfferCandidate(opportunityId)]);
 assert.equal(offerConcurrent[0].created.id,offerConcurrent[1].created.id,'waitlist concorrente converge');
 const offer=offerConcurrent[0].created;
 assert.equal(offer.bookingId,null);assert.equal(offer.unitId,'big');assert.equal(offer.automationType,'WAITLIST_OFFER');
 assert.equal(offer.payload.serviceIds.length,2,'waitlist multi-serviço preservado em uma automação');
 assert.equal(await prisma.booking.count(),beforeWaitlistBookings,'waitlist não cria booking automático');

 const postStart=new Date(Date.now()-3*H);
 await makeBooking(postBookingId,'centro',clientIds.centro,postStart,'Concluído',2);
 const completedAt=new Date(Date.now()-H);
 const completionAuditId=randomUUID();
 await prisma.auditEvent.create({data:{id:completionAuditId,unitId:'centro',action:'booking.updated',entityType:'Booking',entityId:postBookingId,legacyPayload:{status:'Concluído'},occurredAt:completedAt}});
 const postConcurrent=await Promise.all([postMat.materializeCompletedBooking(postBookingId),postMat.materializeCompletedBooking(postBookingId)]);
 assert.equal(postConcurrent[0].created[0].id,postConcurrent[1].created[0].id,'pós-atendimento concorrente converge');
 const postRows=await autos(postBookingId);
 assert.equal(postRows.length,2);assert.deepEqual(new Set(postRows.map(x=>x.automationType)),new Set(['POST_SERVICE','FEEDBACK_REQUEST']));
 assert.equal(await prisma.messagingAutomation.count({where:{bookingId:postBookingId,automationType:{in:['RETURN_REMINDER','REACTIVATION']}}}),0,'retorno/reativação não são inventados sem regra real');

 const dueNow=new Date(Date.now()+24*H);
 await bridge.markDueReady(500,dueNow);
 const postService=await prisma.messagingAutomation.findFirstOrThrow({where:{bookingId:postBookingId,automationType:'POST_SERVICE'}});
 const [queued1,queued2]=await Promise.all([bridge.enqueueReady(postService.id),bridge.enqueueReady(postService.id)]);
 assert.equal(queued1.outbox.id,queued2.outbox.id,'Outbox concorrente é idempotente');
 assert.equal(await prisma.messagingOutbox.count({where:{idempotencyKey:'wa5:automation-outbox:'+postService.id}}),1);
 assert.equal(queued1.outbox.unitId,'centro');

 await bridge.markDueReady(500,new Date(Date.now()+96*H));
 const offerQueued=await bridge.enqueueReady(offer.id);
 assert.equal(offerQueued.outbox.channelId,'BIG_CENTRO');assert.equal(offerQueued.outbox.unitId,'big');
 assert.equal(queued1.outbox.channelId,'BIG_CENTRO');assert.equal(queued1.outbox.unitId,'centro','mesmo canal preserva unitId distinto');

 const noPhone=await automation.create({unitId:'centro',clientId:clientIds.nophone,sourceType:'WA5_8_RECOVERY',sourceId:prefix+'-recovery',automationType:'FEEDBACK_REQUEST',scheduledAt:new Date(Date.now()-H),idempotencyKey:prefix+':recovery',logicalKey:prefix+':recovery',generation:1,payload:{}});
 await bridge.markDueReady(500,new Date());
 const failed=await bridge.enqueueReady(noPhone.id);assert.equal(failed.outcome,'FAILED');
 assert.equal((await prisma.messagingAutomation.findUniqueOrThrow({where:{id:noPhone.id}})).status,'FAILED');
 await prisma.client.update({where:{id:clientIds.nophone},data:{phone:'+5531998003333'}});
 const recovered=await bridge.retryFailed(noPhone.id);assert.equal(recovered.outcome,'ENQUEUED');assert.ok(recovered.outbox,'retry seguro cria um único Outbox');

 const fake=new FakeMessagingProvider(),dispatch=new MessagingDispatchService(prisma,fake);
 const dispatchResult=await dispatch.processOne(queued1.outbox.id);
 assert.equal(dispatchResult.outcome,'SKIPPED');assert.equal(dispatchResult.status,'AUTOMATION_DISABLED');
 assert.equal(fake.calls.length,0,'nenhum provider é chamado com automação OFF');
 assert.ok((await prisma.messagingChannel.findMany()).every(x=>x.enabled===false),'todos os canais seguem OFF');

 assert.ok(await prisma.auditEvent.count({where:{action:'automation.created',entityType:'MessagingAutomation'}})>0,'criação auditada');
 assert.ok(await prisma.auditEvent.count({where:{action:'automation.cancelled',entityType:'MessagingAutomation'}})>0,'cancelamento auditado');
 assert.ok(await prisma.auditEvent.count({where:{action:'automation.ready',entityType:'MessagingAutomation'}})>0,'READY auditado');
 assert.ok(await prisma.auditEvent.count({where:{action:'automation.enqueued',entityType:'MessagingAutomation'}})>0,'enqueue auditado');

 const finalFinancial={commands:await prisma.openCommand.count(),payments:await prisma.commandPayment.count(),cash:await prisma.cashSession.count()};
 assert.deepEqual(finalFinancial,{commands:baseline.commands,payments:baseline.payments,cash:baseline.cash},'WA5 não cria efeitos financeiros');

 console.log(JSON.stringify({ok:true,feature:'wa5_8_e2e',bookingCreation:true,temporalRules:true,replay:true,concurrency:true,multiService:true,multipleReschedules:true,cancel:true,waitlistOffer:true,postService:true,returnConfigured:false,reactivationConfigured:false,unitIsolation:true,outboxIdempotent:true,retryRecovery:true,automationOff:true,channelsOff:true,providerCalls:0,evolutionCalls:0,financialWrites:false,automaticWaitlistBooking:false}));
}finally{
 process.env.WHATSAPP_AUTOMATION_ENABLED=oldFlag;
 const autoIds=(await prisma.messagingAutomation.findMany({where:{OR:[{bookingId:{in:[bookingId,postBookingId]}},{sourceId:opportunityId},{sourceType:'WA5_8_RECOVERY'}]},select:{id:true}}).catch(()=>[])).map(x=>x.id);
 const outIds=(await prisma.messagingOutbox.findMany({where:{idempotencyKey:{startsWith:'wa5:automation-outbox:'}},select:{id:true}}).catch(()=>[])).map(x=>x.id);
 await prisma.auditEvent.deleteMany({where:{OR:[
  {entityType:'MessagingAutomation',entityId:{in:autoIds}},
  {entityType:'MessagingOutbox',entityId:{in:outIds}},
  {entityType:'Booking',entityId:{in:[bookingId,postBookingId]}},
 ]}}).catch(()=>{});
 await prisma.messagingOutbox.deleteMany({where:{id:{in:outIds}}}).catch(()=>{});
 await prisma.messagingAutomation.deleteMany({where:{id:{in:autoIds}}}).catch(()=>{});
 await prisma.waitlistOpportunity.deleteMany({where:{id:opportunityId}}).catch(()=>{});
 await prisma.waitlistRequest.deleteMany({where:{id:requestId}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{id:{in:[bookingId,postBookingId]}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:{in:services}}}).catch(()=>{});
 await prisma.client.deleteMany({where:{id:{in:Object.values(clientIds)}}}).catch(()=>{});
 await prisma.messagingChannel.updateMany({data:{enabled:false}}).catch(()=>{});
 await prisma.$disconnect();
}
