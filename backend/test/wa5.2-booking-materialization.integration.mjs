import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {BookingAutomationMaterializationService} from '../dist/src/messaging/booking-automation-materialization.service.js';

const prisma=new PrismaClient();
const prefix='wa52-ci-'+Date.now();
const clientId=prefix+'-client';
const proId=prefix+'-pro';
const services=[prefix+'-svc-a',prefix+'-svc-b'];

async function makeBooking(id,unitId,itemCount=1){
  const items=[
    {id:id+'-i1',unitId,serviceId:services[0],professionalId:proId,startAt:new Date('2030-06-10T13:00:00.000Z'),durationMin:30,unitPrice:'40',sortOrder:0},
    {id:id+'-i2',unitId,serviceId:services[1],professionalId:proId,startAt:new Date('2030-06-10T13:30:00.000Z'),durationMin:45,unitPrice:'55',sortOrder:1},
  ].slice(0,itemCount);
  return prisma.booking.create({data:{
    id,unitId,clientId,serviceDate:new Date('2030-06-10T00:00:00.000Z'),startAt:items[0].startAt,
    serviceId:items[0].serviceId,professionalId:proId,status:'Aguardando confirmação',
    legacyPayload:{source:'wa5.2-test',multiItem:itemCount>1},
    items:{create:items},
  }});
}

try{
  await prisma.$connect();
  await ensureCanonicalUnits(prisma);
  await prisma.client.create({data:{id:clientId,name:'Cliente WA5.2',phone:'+5531998887777',registrationUnitId:'centro',legacyPayload:{source:'wa5.2-test'}}});
  await prisma.professional.create({data:{id:proId,name:'Pro WA5.2',legacyPayload:{source:'wa5.2-test'}}});
  await prisma.service.createMany({data:services.map((id,i)=>({id,name:'Serviço WA5.2 '+i,price:String(40+i*15),durationMin:i?45:30,legacyPayload:{source:'wa5.2-test'}}))});
  for(const unitId of ['centro','big'])await prisma.professionalUnit.create({data:{professionalId:proId,unitId}});

  const automations=new MessagingAutomationService(prisma);
  const materializer=new BookingAutomationMaterializationService(prisma,automations);
  const beforeOutbox=await prisma.messagingOutbox.count();

  const bookingId=prefix+'-multi';
  await makeBooking(bookingId,'centro',2);
  const first=await materializer.materializeCreatedBooking(bookingId);
  assert.equal(first.skipped,false);
  assert.deepEqual(first.types.sort(),['APPOINTMENT_REMINDER','BOOKING_CONFIRMATION','SIGNAL_REMINDER','SIGNAL_REQUEST'].sort());
  let rows=await prisma.messagingAutomation.findMany({where:{bookingId},orderBy:{automationType:'asc'}});
  assert.equal(rows.length,4,'multi-serviço gera automações do booking, não por item');
  assert.equal(new Set(rows.map(x=>x.automationType)).size,4);
  assert.ok(rows.every(x=>x.unitId==='centro'&&x.clientId===clientId&&x.bookingId===bookingId));
  const confirmation=rows.find(x=>x.automationType==='BOOKING_CONFIRMATION');
  assert.equal(confirmation.payload.itemCount,2,'payload deriva dos BookingItems reais');
  assert.deepEqual(confirmation.payload.serviceIds,services,'serviços reais do booking são preservados');

  await materializer.materializeCreatedBooking(bookingId);
  rows=await prisma.messagingAutomation.findMany({where:{bookingId}});
  assert.equal(rows.length,4,'replay não duplica automações');
  assert.equal(await prisma.auditEvent.count({where:{entityType:'MessagingAutomation',action:'automation.created',entityId:{in:rows.map(x=>x.id)}}}),4,'replay não duplica auditoria');

  const bigId=prefix+'-big',centroId=prefix+'-centro';
  await makeBooking(bigId,'big',1);
  await makeBooking(centroId,'centro',1);
  await materializer.materializeCreatedBooking(bigId);
  await materializer.materializeCreatedBooking(centroId);
  const bigRows=await prisma.messagingAutomation.findMany({where:{bookingId:bigId}});
  const centroRows=await prisma.messagingAutomation.findMany({where:{bookingId:centroId}});
  assert.ok(bigRows.every(x=>x.unitId==='big'));
  assert.ok(centroRows.every(x=>x.unitId==='centro'));
  assert.equal(bigRows.length,4);assert.equal(centroRows.length,4);

  assert.equal(await prisma.messagingOutbox.count(),beforeOutbox,'WA5.2 cria zero Outbox');
  assert.equal(String(process.env.WHATSAPP_AUTOMATION_ENABLED||'false').toLowerCase(),'false','automação outbound permanece OFF');

  console.log(JSON.stringify({ok:true,feature:'wa5_2_booking_materialization',replayIdempotent:true,multiServiceBookingScoped:true,unitIsolation:true,outboxCreated:false,providerCalls:false}));
}finally{
  const ids=[prefix+'-multi',prefix+'-big',prefix+'-centro'];
  const autos=await prisma.messagingAutomation.findMany({where:{bookingId:{in:ids}},select:{id:true}}).catch(()=>[]);
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingAutomation',entityId:{in:autos.map(x=>x.id)}}}).catch(()=>{});
  await prisma.messagingAutomation.deleteMany({where:{bookingId:{in:ids}}}).catch(()=>{});
  await prisma.booking.deleteMany({where:{id:{in:ids}}}).catch(()=>{});
  await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:{in:services}}}).catch(()=>{});
  await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});
  await prisma.$disconnect();
}
