import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {PostServiceAutomationMaterializationService} from '../dist/src/messaging/post-service-automation-materialization.service.js';

const prisma=new PrismaClient();
const prefix='wa56-ci-'+Date.now(),clientId=prefix+'-client',proId=prefix+'-pro',services=[prefix+'-a',prefix+'-b'];
const ids=[prefix+'-completed',prefix+'-invalid'];

async function makeBooking(id,status,itemCount=2,unitId='centro'){
 const start=new Date('2030-11-04T13:00:00.000Z');
 await prisma.booking.create({data:{
  id,unitId,clientId,serviceDate:new Date('2030-11-04T00:00:00.000Z'),startAt:start,serviceId:services[0],professionalId:proId,status,
  legacyPayload:{source:'wa5.6-test'},
  items:{create:[
   {id:id+'-i1',unitId,serviceId:services[0],professionalId:proId,startAt:start,durationMin:30,unitPrice:'40',sortOrder:0},
   {id:id+'-i2',unitId,serviceId:services[1],professionalId:proId,startAt:new Date(start.getTime()+30*60000),durationMin:45,unitPrice:'55',sortOrder:1},
  ].slice(0,itemCount)},
 }});
}

try{
 await prisma.$connect();await ensureCanonicalUnits(prisma);
 await prisma.client.create({data:{id:clientId,name:'Cliente WA5.6',phone:'+5531998554433',registrationUnitId:'centro',legacyPayload:{source:'wa5.6-test'}}});
 await prisma.professional.create({data:{id:proId,name:'Pro WA5.6',legacyPayload:{source:'wa5.6-test'}}});
 await prisma.service.createMany({data:[
  {id:services[0],name:'Serviço A',price:'40',durationMin:30,legacyPayload:{show:true}},
  {id:services[1],name:'Serviço B',price:'55',durationMin:45,legacyPayload:{show:true}},
 ]});
 await prisma.professionalUnit.create({data:{professionalId:proId,unitId:'centro'}});

 await makeBooking(ids[0],'Concluído',2);
 const completedAt=new Date('2030-11-04T14:15:00.000Z');
 const completionAuditId=randomUUID();
 await prisma.auditEvent.create({data:{id:completionAuditId,unitId:'centro',action:'booking.updated',entityType:'Booking',entityId:ids[0],legacyPayload:{source:'central_api',status:'Concluído',itemCount:2},occurredAt:completedAt}});

 const base=new MessagingAutomationService(prisma),post=new PostServiceAutomationMaterializationService(prisma,base);
 const beforeOutbox=await prisma.messagingOutbox.count();
 const first=await post.materializeCompletedBooking(ids[0]);
 assert.equal(first.skipped,false);assert.deepEqual(first.types.sort(),['FEEDBACK_REQUEST','POST_SERVICE'].sort());
 let rows=await prisma.messagingAutomation.findMany({where:{bookingId:ids[0]},orderBy:{automationType:'asc'}});
 assert.equal(rows.length,2,'multi-serviço gera automação por booking, não por item');
 assert.ok(rows.every(x=>x.unitId==='centro'&&x.clientId===clientId&&x.bookingId===ids[0]));
 assert.ok(rows.every(x=>x.scheduledAt.getTime()===completedAt.getTime()),'instante vem do evento de conclusão persistido');
 assert.ok(rows.every(x=>x.payload.itemCount===2&&x.payload.items.length===2),'payload usa BookingItems reais');
 assert.ok(rows.every(x=>x.payload.completionAuditId===completionAuditId));

 const concurrent=await Promise.all([post.materializeCompletedBooking(ids[0]),post.materializeCompletedBooking(ids[0])]);
 assert.equal(concurrent[0].created[0].id,concurrent[1].created[0].id,'concorrência converge');
 assert.equal(await prisma.messagingAutomation.count({where:{bookingId:ids[0]}}),2,'replay/concorrência não duplicam');

 await makeBooking(ids[1],'Confirmado',1);
 const skipped=await post.materializeCompletedBooking(ids[1]);
 assert.equal(skipped.skipped,true);assert.equal(skipped.reason,'BOOKING_NOT_COMPLETED');
 assert.equal(await prisma.messagingAutomation.count({where:{bookingId:ids[1]}}),0,'estado inválido não gera pós-atendimento');

 assert.equal(await prisma.messagingAutomation.count({where:{bookingId:ids[0],automationType:{in:['RETURN_REMINDER','REACTIVATION']}}}),0,'retorno/reativação não são inventados');
 assert.equal(await prisma.messagingOutbox.count(),beforeOutbox,'WA5.6 cria zero Outbox');

 console.log(JSON.stringify({ok:true,feature:'wa5_6_post_service',completedState:'Concluído',postService:true,feedback:true,returnReminder:false,reactivation:false,replay:true,concurrency:true,multiService:true,outbox:false}));
}finally{
 const autos=await prisma.messagingAutomation.findMany({where:{bookingId:{in:ids}},select:{id:true}}).catch(()=>[]);
 await prisma.auditEvent.deleteMany({where:{OR:[{entityType:'MessagingAutomation',entityId:{in:autos.map(x=>x.id)}},{entityType:'Booking',entityId:{in:ids}}]}}).catch(()=>{});
 await prisma.messagingAutomation.deleteMany({where:{bookingId:{in:ids}}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{id:{in:ids}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:{in:services}}}).catch(()=>{});
 await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});
 await prisma.$disconnect();
}
