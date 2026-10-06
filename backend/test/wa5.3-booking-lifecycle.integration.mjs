import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {BookingAutomationMaterializationService} from '../dist/src/messaging/booking-automation-materialization.service.js';
import {BookingAutomationLifecycleService} from '../dist/src/messaging/booking-automation-lifecycle.service.js';

const prisma=new PrismaClient();
const prefix='wa53-ci-'+Date.now(),clientId=prefix+'-client',proId=prefix+'-pro',svcA=prefix+'-a',svcB=prefix+'-b';
const bookingId=prefix+'-booking',bigId=prefix+'-big';

async function createBooking(id,unitId){
  return prisma.booking.create({data:{
    id,unitId,clientId,serviceDate:new Date('2030-07-01T00:00:00.000Z'),startAt:new Date('2030-07-01T13:00:00.000Z'),
    serviceId:svcA,professionalId:proId,status:'Agendado',legacyPayload:{source:'wa5.3-test',multiItem:true},
    items:{create:[
      {id:id+'-1',unitId,serviceId:svcA,professionalId:proId,startAt:new Date('2030-07-01T13:00:00.000Z'),durationMin:30,unitPrice:'40',sortOrder:0},
      {id:id+'-2',unitId,serviceId:svcB,professionalId:proId,startAt:new Date('2030-07-01T13:30:00.000Z'),durationMin:30,unitPrice:'45',sortOrder:1},
    ]},
  }});
}
async function generations(id){return prisma.messagingAutomation.findMany({where:{bookingId:id},orderBy:[{generation:'asc'},{automationType:'asc'}]})}

try{
 await prisma.$connect();await ensureCanonicalUnits(prisma);
 await prisma.client.create({data:{id:clientId,name:'Cliente WA5.3',phone:'+5531998776655',registrationUnitId:'centro',legacyPayload:{source:'wa5.3-test'}}});
 await prisma.professional.create({data:{id:proId,name:'Pro WA5.3',legacyPayload:{source:'wa5.3-test'}}});
 await prisma.service.createMany({data:[{id:svcA,name:'A',price:'40',durationMin:30,legacyPayload:{}},{id:svcB,name:'B',price:'45',durationMin:30,legacyPayload:{}}]});
 for(const unitId of ['centro','big'])await prisma.professionalUnit.create({data:{professionalId:proId,unitId}});
 const base=new MessagingAutomationService(prisma),mat=new BookingAutomationMaterializationService(prisma,base),life=new BookingAutomationLifecycleService(prisma,mat,base);

 await createBooking(bookingId,'centro');await mat.materializeCreatedBooking(bookingId);
 assert.equal((await generations(bookingId)).length,3);

 await prisma.$transaction(async tx=>{
   await tx.bookingItem.updateMany({where:{bookingId},data:{startAt:new Date('2030-07-02T14:00:00.000Z')}});
   await tx.booking.update({where:{id:bookingId},data:{serviceDate:new Date('2030-07-02T00:00:00.000Z'),startAt:new Date('2030-07-02T14:00:00.000Z'),version:{increment:1}}});
 });
 await life.replaceForReschedule(bookingId);
 let rows=await generations(bookingId);
 assert.equal(rows.filter(x=>x.generation===1&&x.status==='CANCELLED').length,3,'geração antiga cancelada');
 assert.equal(rows.filter(x=>x.generation===2&&x.status==='PENDING').length,3,'nova geração criada uma vez');
 await life.replaceForReschedule(bookingId);
 rows=await generations(bookingId);assert.equal(rows.length,6,'replay do mesmo reagendamento não duplica');

 await prisma.$transaction(async tx=>{
   await tx.bookingItem.updateMany({where:{bookingId},data:{startAt:new Date('2030-07-03T15:00:00.000Z')}});
   await tx.booking.update({where:{id:bookingId},data:{serviceDate:new Date('2030-07-03T00:00:00.000Z'),startAt:new Date('2030-07-03T15:00:00.000Z'),version:{increment:1}}});
 });
 await Promise.all([life.replaceForReschedule(bookingId),life.replaceForReschedule(bookingId)]);
 rows=await generations(bookingId);
 assert.equal(rows.filter(x=>x.generation===2&&x.status==='CANCELLED').length,3);
 assert.equal(rows.filter(x=>x.generation===3&&x.status==='PENDING').length,3,'concorrência converge em uma geração atual');

 await prisma.booking.update({where:{id:bookingId},data:{status:'Cancelado',version:{increment:1}}});
 await life.cancelForBooking(bookingId);
 rows=await generations(bookingId);
 assert.equal(rows.filter(x=>x.status==='PENDING').length,0,'cancelamento elimina automações ativas');
 await life.cancelForBooking(bookingId);
 assert.equal((await generations(bookingId)).length,9,'replay de cancelamento não duplica');

 await createBooking(bigId,'big');await mat.materializeCreatedBooking(bigId);
 const bigRows=await generations(bigId);assert.ok(bigRows.every(x=>x.unitId==='big'));
 assert.equal(bigRows.length,3,'multiunidade permanece isolada');
 assert.equal(await prisma.messagingOutbox.count({where:{bookingId:{in:[bookingId,bigId]}}}),0,'WA5.3 não cria Outbox');

 console.log(JSON.stringify({ok:true,feature:'wa5_3_booking_lifecycle',replay:true,concurrency:true,multipleReschedules:true,cancelAfterReschedule:true,multiService:true,multiUnit:true,outbox:false}));
}finally{
 const ids=[bookingId,bigId];const autos=await prisma.messagingAutomation.findMany({where:{bookingId:{in:ids}},select:{id:true}}).catch(()=>[]);
 await prisma.auditEvent.deleteMany({where:{entityType:'MessagingAutomation',entityId:{in:autos.map(x=>x.id)}}}).catch(()=>{});
 await prisma.messagingAutomation.deleteMany({where:{bookingId:{in:ids}}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{id:{in:ids}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:{in:[svcA,svcB]}}}).catch(()=>{});
 await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});
 await prisma.$disconnect();
}
