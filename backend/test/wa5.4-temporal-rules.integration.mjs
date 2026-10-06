import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {BookingAutomationMaterializationService} from '../dist/src/messaging/booking-automation-materialization.service.js';
import {BookingAutomationLifecycleService} from '../dist/src/messaging/booking-automation-lifecycle.service.js';

const prisma=new PrismaClient();
const prefix='wa54-ci-'+Date.now(),clientId=prefix+'-client',proId=prefix+'-pro',svc=prefix+'-svc';
const H=60*60*1000;
const ids=[];

async function createBooking(label,leadHours,unitId='centro'){
  const id=prefix+'-'+label;ids.push(id);
  const startAt=new Date(Date.now()+leadHours*H);
  await prisma.booking.create({data:{
    id,unitId,clientId,serviceDate:new Date(startAt.toISOString().slice(0,10)+'T00:00:00.000Z'),startAt,
    serviceId:svc,professionalId:proId,status:'Agendado',legacyPayload:{source:'wa5.4-test'},
    items:{create:{id:id+'-item',unitId,serviceId:svc,professionalId:proId,startAt,durationMin:45,unitPrice:'50',sortOrder:0}},
  }});
  return {id,startAt};
}
const rows=id=>prisma.messagingAutomation.findMany({where:{bookingId:id},orderBy:{automationType:'asc'}});

try{
  await prisma.$connect();await ensureCanonicalUnits(prisma);
  await prisma.client.create({data:{id:clientId,name:'Cliente WA5.4',phone:'+5531998665544',registrationUnitId:'centro',legacyPayload:{source:'wa5.4-test'}}});
  await prisma.professional.create({data:{id:proId,name:'Pro WA5.4',legacyPayload:{source:'wa5.4-test'}}});
  await prisma.service.create({data:{id:svc,name:'Serviço WA5.4',price:'50',durationMin:45,legacyPayload:{}}});
  for(const unitId of ['centro','big'])await prisma.professionalUnit.create({data:{professionalId:proId,unitId}});

  const base=new MessagingAutomationService(prisma),mat=new BookingAutomationMaterializationService(prisma,base),life=new BookingAutomationLifecycleService(prisma,mat,base);

  const before=Date.now();
  const far=await createBooking('far',30);
  await mat.materializeCreatedBooking(far.id);
  const farRows=await rows(far.id);
  assert.equal(farRows.length,4);
  const farMap=new Map(farRows.map(x=>[x.automationType,x]));
  assert.ok(farMap.get('BOOKING_CONFIRMATION').scheduledAt.getTime()>=before,'confirmação não fica no passado');
  assert.ok(farMap.get('SIGNAL_REQUEST').scheduledAt.getTime()>=before,'signal request não fica no passado');
  assert.ok(Math.abs((farMap.get('SIGNAL_REMINDER').scheduledAt.getTime()-farMap.get('SIGNAL_REQUEST').scheduledAt.getTime())-24*H)<1500,'signal reminder = request +24h');
  assert.ok(farMap.get('SIGNAL_REMINDER').scheduledAt<far.startAt,'signal reminder fica antes do atendimento');
  assert.ok(Math.abs((far.startAt.getTime()-farMap.get('APPOINTMENT_REMINDER').scheduledAt.getTime())-24*H)<1500,'lead normal usa 24h');
  assert.equal(farMap.get('APPOINTMENT_REMINDER').payload.businessTimezone,'America/Sao_Paulo');

  const medium=await createBooking('medium',10);
  await mat.materializeCreatedBooking(medium.id);
  const mediumRows=await rows(medium.id),mediumMap=new Map(mediumRows.map(x=>[x.automationType,x]));
  assert.equal(mediumRows.length,3,'menos de 24h não cria SIGNAL_REMINDER se cair após atendimento');
  assert.equal(mediumMap.has('SIGNAL_REMINDER'),false);
  assert.ok(Math.abs((medium.startAt.getTime()-mediumMap.get('APPOINTMENT_REMINDER').scheduledAt.getTime())-2*H)<1500,'lead <24h e >2h usa 2h');

  const near=await createBooking('near',1);
  await mat.materializeCreatedBooking(near.id);
  const nearRows=await rows(near.id),nearTypes=new Set(nearRows.map(x=>x.automationType));
  assert.deepEqual([...nearTypes].sort(),['BOOKING_CONFIRMATION','SIGNAL_REQUEST'].sort(),'lead <2h não cria reminders');

  await mat.materializeCreatedBooking(far.id);
  assert.equal((await rows(far.id)).length,4,'replay não duplica regras temporais');

  const oldReminder=farMap.get('APPOINTMENT_REMINDER');
  const newStart=new Date(Date.now()+40*H);
  await prisma.$transaction(async tx=>{
    await tx.bookingItem.updateMany({where:{bookingId:far.id},data:{startAt:newStart}});
    await tx.booking.update({where:{id:far.id},data:{startAt:newStart,serviceDate:new Date(newStart.toISOString().slice(0,10)+'T00:00:00.000Z'),version:{increment:1}}});
  });
  await life.replaceForReschedule(far.id);
  const afterReschedule=await rows(far.id);
  assert.equal(afterReschedule.find(x=>x.id===oldReminder.id).status,'CANCELLED','reminder antigo é cancelado no reagendamento');
  const currentReminder=afterReschedule.find(x=>x.generation===2&&x.automationType==='APPOINTMENT_REMINDER');
  assert.ok(currentReminder&&currentReminder.status==='PENDING','novo reminder é criado');
  assert.ok(Math.abs((newStart.getTime()-currentReminder.scheduledAt.getTime())-24*H)<1500,'reagendamento recalcula horário');

  await prisma.booking.update({where:{id:far.id},data:{status:'Cancelado',version:{increment:1}}});
  await life.cancelForBooking(far.id);
  assert.equal((await rows(far.id)).filter(x=>x.status==='PENDING').length,0,'cancelamento elimina automações futuras ativas');

  assert.equal(await prisma.messagingOutbox.count({where:{bookingId:{in:ids}}}),0,'WA5.4 cria zero Outbox');
  assert.equal(String(process.env.WHATSAPP_AUTOMATION_ENABLED||'false').toLowerCase(),'false');

  console.log(JSON.stringify({ok:true,feature:'wa5_4_temporal_rules',normal24h:true,shortLead2h:true,under2hSkipped:true,signal24h:true,reschedule:true,cancel:true,replay:true,outbox:false}));
}finally{
  const autos=await prisma.messagingAutomation.findMany({where:{bookingId:{in:ids}},select:{id:true}}).catch(()=>[]);
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingAutomation',entityId:{in:autos.map(x=>x.id)}}}).catch(()=>{});
  await prisma.messagingAutomation.deleteMany({where:{bookingId:{in:ids}}}).catch(()=>{});
  await prisma.booking.deleteMany({where:{id:{in:ids}}}).catch(()=>{});
  await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:svc}}).catch(()=>{});
  await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});
  await prisma.$disconnect();
}
