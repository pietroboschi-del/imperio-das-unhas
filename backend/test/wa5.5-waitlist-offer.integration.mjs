import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {BookingAvailabilityService} from '../dist/src/core/booking-availability.service.js';
import {WaitlistOpportunityService} from '../dist/src/core/waitlist-opportunity.service.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';
import {WaitlistAutomationMaterializationService} from '../dist/src/messaging/waitlist-automation-materialization.service.js';

const prisma=new PrismaClient();
const prefix='wa55-ci-'+Date.now(),service=prefix+'-svc',pro=prefix+'-pro',cat=prefix+'-cat';
const requestIds=[prefix+'-centro-r',prefix+'-big-r'],clientIds=[prefix+'-centro-c',prefix+'-big-c'];
let opportunityIds=[];

async function setupUnit(unitId,requestId,clientId){
  await prisma.client.create({data:{id:clientId,name:'Cliente '+unitId,phone:'+55319'+(unitId==='big'?'11112222':'33334444'),registrationUnitId:unitId,legacyPayload:{source:'wa5.5-test'}}});
  await prisma.waitlistRequest.create({data:{
    id:requestId,unitId,clientId,status:'WAITING',
    legacyPayload:{source:'WHATSAPP_AGENT',services:[{serviceId:service}],serviceIds:[service],desiredDate:'2030-10-08',timeFrom:'09:00',timeTo:'12:00',acceptsOtherProfessional:true,acceptsOtherUnits:false,channelId:'CENTRAL'},
  }});
}

try{
  await prisma.$connect();process.env.OPERATIONAL_WRITES_ENABLED='true';process.env.OPERATIONAL_WRITES_UNITS='';
  await ensureCanonicalUnits(prisma);
  await prisma.serviceCategory.create({data:{id:cat,name:'WA55',active:true}});
  await prisma.service.create({data:{id:service,name:'WA55 Serviço',categoryId:cat,price:'50',durationMin:30,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',proRules:{[pro]:{enabled:true,online:true}}}}});
  await prisma.professional.create({data:{id:pro,name:'WA55 Pro',active:true,legacyPayload:{show:true,online:true,services:[service],schedule:{
    'centro-2':{work:true,start:'09:00',end:'18:00'},
    'big-2':{work:true,start:'09:00',end:'18:00'},
  }}}});
  for(const unitId of ['centro','big']){
    await prisma.professionalUnit.create({data:{professionalId:pro,unitId,active:true}});
    await prisma.workstation.create({data:{id:prefix+'-ws-'+unitId,unitId,name:'WA55 '+unitId,allowedCategoryIds:[cat],active:true}});
  }
  await setupUnit('centro',requestIds[0],clientIds[0]);await setupUnit('big',requestIds[1],clientIds[1]);

  const base=new MessagingAutomationService(prisma);
  const waitlistAutomations=new WaitlistAutomationMaterializationService(prisma,base);
  const matcher=new WaitlistOpportunityService(prisma,new BookingAvailabilityService(prisma),waitlistAutomations);
  const beforeBookings=await prisma.booking.count();
  const beforeOutbox=await prisma.messagingOutbox.count();

  for(const [unitId,requestId] of [['centro',requestIds[0]],['big',requestIds[1]]]){
    const result=await matcher.reevaluateForAvailabilityEvent({unitId,date:'2030-10-08',sourceType:'CANCELLATION',sourceBookingId:prefix+'-source-'+unitId});
    assert.equal(result.length,1,unitId+' gera oportunidade real');
    const op=await prisma.waitlistOpportunity.findUniqueOrThrow({where:{id:result[0].id}});
    opportunityIds.push(op.id);
    assert.equal(op.bookingId,null,'oportunidade não cria booking');
    const rows=await prisma.messagingAutomation.findMany({where:{sourceType:'WAITLIST_OFFER_CANDIDATE',sourceId:op.id}});
    assert.equal(rows.length,1,unitId+' gera uma automação lógica');
    assert.equal(rows[0].unitId,unitId);
    assert.equal(rows[0].bookingId,null);
    assert.equal(rows[0].automationType,'WAITLIST_OFFER');
    assert.equal(rows[0].clientId,unitId==='centro'?clientIds[0]:clientIds[1]);
  }

  const [centroOp,bigOp]=opportunityIds;
  const centroRow=await prisma.messagingAutomation.findFirstOrThrow({where:{sourceId:centroOp,automationType:'WAITLIST_OFFER'}});
  const bigRow=await prisma.messagingAutomation.findFirstOrThrow({where:{sourceId:bigOp,automationType:'WAITLIST_OFFER'}});
  assert.equal(centroRow.unitId,'centro');assert.equal(bigRow.unitId,'big');
  assert.notEqual(centroRow.sourceId,bigRow.sourceId,'Big e Centro permanecem separados mesmo com canal futuro compartilhado');

  await matcher.reevaluateForAvailabilityEvent({unitId:'centro',date:'2030-10-08',sourceType:'CANCELLATION',sourceBookingId:prefix+'-source-centro'});
  assert.equal(await prisma.messagingAutomation.count({where:{sourceId:centroOp,automationType:'WAITLIST_OFFER'}}),1,'replay do WA4 não duplica automação');

  const concurrent=await Promise.all([
    waitlistAutomations.materializeOfferCandidate(centroOp),
    waitlistAutomations.materializeOfferCandidate(centroOp),
  ]);
  assert.equal(concurrent[0].created.id,concurrent[1].created.id,'concorrência converge na mesma automação');
  assert.equal(await prisma.messagingAutomation.count({where:{sourceId:centroOp,automationType:'WAITLIST_OFFER'}}),1);

  const multiId=prefix+'-multi-op';opportunityIds.push(multiId);
  await prisma.waitlistOpportunity.create({data:{
    id:multiId,unitId:'centro',requestId:requestIds[0],status:'FOUND',bookingId:null,
    legacyPayload:{requestId:requestIds[0],primaryUnitId:'centro',offeredUnitId:'centro',serviceIds:[service,prefix+'-svc-2'],classification:'IDEAL',
      visitStartAt:'2030-10-08T12:00:00.000Z',visitEndAt:'2030-10-08T13:00:00.000Z',offerState:'CONTACT_PENDING',
      items:[{serviceId:service,professionalId:pro,startAt:'2030-10-08T12:00:00.000Z'},{serviceId:prefix+'-svc-2',professionalId:pro,startAt:'2030-10-08T12:30:00.000Z'}]},
  }});
  const multi=await waitlistAutomations.materializeOfferCandidate(multiId);
  assert.equal(multi.created.payload.serviceIds.length,2,'multi-serviço permanece uma automação por oportunidade');
  assert.equal(multi.created.payload.items.length,2);
  assert.equal(await prisma.messagingAutomation.count({where:{sourceId:multiId}}),1);

  assert.equal(await prisma.booking.count(),beforeBookings,'WA5.5 não cria booking automaticamente');
  assert.equal(await prisma.messagingOutbox.count(),beforeOutbox,'WA5.5 não cria Outbox');
  assert.equal(String(process.env.WHATSAPP_AUTOMATION_ENABLED||'false').toLowerCase(),'false');

  console.log(JSON.stringify({ok:true,feature:'wa5_5_waitlist_offer',replay:true,concurrency:true,multiService:true,unitIsolation:true,automaticBooking:false,outbox:false}));
}finally{
  const autos=await prisma.messagingAutomation.findMany({where:{sourceType:'WAITLIST_OFFER_CANDIDATE',sourceId:{in:opportunityIds}},select:{id:true}}).catch(()=>[]);
  await prisma.auditEvent.deleteMany({where:{OR:[
    {entityType:'MessagingAutomation',entityId:{in:autos.map(x=>x.id)}},
    {entityType:'WaitlistOpportunity',entityId:{in:opportunityIds}},
  ]}}).catch(()=>{});
  await prisma.messagingAutomation.deleteMany({where:{sourceType:'WAITLIST_OFFER_CANDIDATE',sourceId:{in:opportunityIds}}}).catch(()=>{});
  await prisma.waitlistOpportunity.deleteMany({where:{id:{in:opportunityIds}}}).catch(()=>{});
  await prisma.waitlistRequest.deleteMany({where:{id:{in:requestIds}}}).catch(()=>{});
  await prisma.client.deleteMany({where:{id:{in:clientIds}}}).catch(()=>{});
  await prisma.workstation.deleteMany({where:{id:{startsWith:prefix+'-ws-'}}}).catch(()=>{});
  await prisma.professionalUnit.deleteMany({where:{professionalId:pro}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:pro}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:service}}).catch(()=>{});
  await prisma.serviceCategory.deleteMany({where:{id:cat}}).catch(()=>{});
  await prisma.$disconnect();
}
