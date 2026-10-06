import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {BookingAvailabilityService} from '../dist/src/core/booking-availability.service.js';
import {WaitlistService} from '../dist/src/core/waitlist.service.js';
import {WaitlistOpportunityService} from '../dist/src/core/waitlist-opportunity.service.js';
import {CoreWriteController} from '../dist/src/core/core-write.controller.js';

const prisma=new PrismaClient();
let checks=0;
const ok=(v,m)=>{checks++;assert.ok(v,m)};
const eq=(a,b,m)=>{checks++;assert.equal(a,b,m)};
const units=['big','centro','shopping-contagem'];
const date='2030-10-08';
const services=['wa4e2e-maint','wa4e2e-mani','wa4e2e-pedi'];
const pros=['wa4e2e-a','wa4e2e-b','wa4e2e-c'];
const userId=u=>'wa4e2e-user-'+u;
const clientId=u=>'wa4e2e-client-'+u;
const blockerId=u=>'wa4e2e-blocker-'+u;
const key=u=>'wa4-e2e-'+u;
const requestId=k=>'wr_'+createHash('sha256').update('whatsapp-agent-waitlist|'+k).digest('hex').slice(0,40);
const requestIds=units.map(u=>requestId(key(u)));

async function cleanup(){
 const opps=await prisma.waitlistOpportunity.findMany({where:{requestId:{in:requestIds}},select:{id:true}}).catch(()=>[]);
 const oppIds=opps.map(x=>x.id);
 await prisma.auditEvent.deleteMany({where:{OR:[
  {entityId:{in:[...requestIds,...oppIds,...units.map(blockerId)]}},
  {userId:{in:units.map(userId)}},
 ]}}).catch(()=>{});
 await prisma.managementTask.deleteMany({where:{sourceType:'waitlist',sourceId:{in:requestIds}}}).catch(()=>{});
 await prisma.waitlistOpportunity.deleteMany({where:{requestId:{in:requestIds}}}).catch(()=>{});
 await prisma.waitlistRequest.deleteMany({where:{id:{in:requestIds}}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{id:{in:units.map(blockerId)}}}).catch(()=>{});
 await prisma.clientUnitLink.deleteMany({where:{clientId:{in:units.map(clientId)}}}).catch(()=>{});
 await prisma.client.deleteMany({where:{id:{in:units.map(clientId)}}}).catch(()=>{});
 await prisma.user.deleteMany({where:{id:{in:units.map(userId)}}}).catch(()=>{});
 await prisma.workstation.deleteMany({where:{id:{startsWith:'wa4e2e-ws-'}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:{in:pros}}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:{in:pros}}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:{in:services}}}).catch(()=>{});
 await prisma.serviceCategory.deleteMany({where:{id:{in:['wa4e2e-hands','wa4e2e-feet']}}}).catch(()=>{});
}

async function setup(){
 await ensureCanonicalUnits(prisma);
 await cleanup();
 await prisma.unit.updateMany({where:{id:{in:units}},data:{active:true,timezone:'America/Sao_Paulo'}});
 await prisma.serviceCategory.createMany({data:[
  {id:'wa4e2e-hands',name:'WA4 E2E Hands',active:true},
  {id:'wa4e2e-feet',name:'WA4 E2E Feet',active:true},
 ]});
 await prisma.service.createMany({data:[
  {id:'wa4e2e-maint',name:'Manutenção E2E',categoryId:'wa4e2e-hands',price:'100',durationMin:75,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{'wa4e2e-a':{enabled:true,online:true,duration:75,price:100}}}},
  {id:'wa4e2e-mani',name:'Manicure E2E',categoryId:'wa4e2e-hands',price:'40',durationMin:45,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:false,proRules:{'wa4e2e-b':{enabled:true,online:true,duration:45,price:40}}}},
  {id:'wa4e2e-pedi',name:'Pedicure E2E',categoryId:'wa4e2e-feet',price:'45',durationMin:50,active:true,legacyPayload:{show:true,online:true,clientArea:'feet',mustFinishBeforeSameArea:false,proRules:{'wa4e2e-c':{enabled:true,online:true,duration:50,price:45}}}},
 ]});
 const schedule=Object.fromEntries(units.map(u=>[u+'-2',{work:true,start:'09:00',end:'18:00'}]));
 for(const [id,sv] of [['wa4e2e-a',['wa4e2e-maint']],['wa4e2e-b',['wa4e2e-mani']],['wa4e2e-c',['wa4e2e-pedi']]]){
  await prisma.professional.create({data:{id,name:id,publicName:id,active:true,legacyPayload:{show:true,online:true,services:sv,schedule}}});
  for(const unitId of units)await prisma.professionalUnit.create({data:{professionalId:id,unitId,active:true}});
 }
 for(const unitId of units){
  await prisma.workstation.createMany({data:[
   {id:'wa4e2e-ws-'+unitId+'-h',unitId,name:'Hands',allowedCategoryIds:['wa4e2e-hands'],active:true},
   {id:'wa4e2e-ws-'+unitId+'-f',unitId,name:'Feet',allowedCategoryIds:['wa4e2e-feet'],active:true},
  ]});
  await prisma.user.create({data:{
   id:userId(unitId),username:'wa4e2e_'+unitId.replace(/-/g,'_'),displayName:'Recepção '+unitId,
   passwordResetRequired:true,active:true,networkAdmin:false,systemRole:'OPERATOR',permissions:[],
   unitAccesses:{create:{unitId,role:'reception',permissions:['tasks.read','agenda.manage'],active:true}},
  }});
  await prisma.client.create({data:{id:clientId(unitId),name:'Cliente '+unitId,phone:'+55319'+String(70000000+units.indexOf(unitId)),active:true,registrationUnitId:unitId,legacyPayload:{source:'wa4e2e'}}});
  const blockerStart=new Date('2030-10-08T12:00:00.000Z');
  await prisma.booking.create({data:{
   id:blockerId(unitId),unitId,clientId:clientId(unitId),serviceDate:new Date(date+'T00:00:00.000Z'),startAt:blockerStart,
   serviceId:'wa4e2e-maint',professionalId:'wa4e2e-a',status:'Confirmado',legacyPayload:{source:'wa4e2e_blocker'},
   items:{create:{id:'wa4e2e-bi-'+unitId,unitId,serviceId:'wa4e2e-maint',professionalId:'wa4e2e-a',startAt:blockerStart,durationMin:180,unitPrice:'100',sortOrder:0}},
  }});
 }
}

try{
 await prisma.$connect();
 process.env.OPERATIONAL_WRITES_ENABLED='true';
 process.env.OPERATIONAL_WRITES_UNITS='';
 await setup();

 const availability=new BookingAvailabilityService(prisma);
 const matcher=new WaitlistOpportunityService(prisma,availability);
 const waitlist=new WaitlistService(prisma);
 const writes=new CoreWriteController(prisma,matcher);
 const specs=[
  {serviceId:'wa4e2e-maint',professionalId:'wa4e2e-a',preferenceMode:'required'},
  {serviceId:'wa4e2e-mani',professionalId:'wa4e2e-b',preferenceMode:'required'},
  {serviceId:'wa4e2e-pedi',professionalId:'wa4e2e-c',preferenceMode:'required'},
 ];

 const baseline={
  bookings:await prisma.booking.count(),
  outbox:await prisma.messagingOutbox.count(),
  commands:await prisma.openCommand.count(),
  payments:await prisma.commandPayment.count(),
  cash:await prisma.cashSession.count(),
 };

 for(const unitId of units){
  const initial=await availability.multiAvailability({unitId,date,services:specs});
  const desired=initial.visits.filter(v=>v.localStart>='09:00'&&v.localEnd<='12:00');
  eq(desired.length,0,unitId+' não possui combinação WA3C na janela desejada antes da liberação');

  const req=await waitlist.createFromWhatsapp({
   unitId,clientId:clientId(unitId),services:specs,desiredDate:date,
   timeFrom:'09:00',timeTo:'12:00',acceptsOtherProfessional:false,acceptsOtherUnits:false,
   note:'Manutenção + pé e mão na janela desejada',channelId:'CENTRAL',
   conversationRef:'wa4-e2e-conversation-'+unitId,messageRef:'wa4-e2e-message-'+unitId,
  },key(unitId));
  eq(req.id,requestId(key(unitId)),unitId+' cria pedido determinístico na fila existente');
  eq(req.status,'WAITING',unitId+' pedido inicia WAITING');
  const legacy=req.legacyPayload;
  eq(legacy.services.length,3,unitId+' preserva intenção de três serviços');
  eq(legacy.channelId,'CENTRAL',unitId+' usa o mesmo canal CENTRAL sem perder unitId');

  const tasks=await prisma.managementTask.findMany({where:{sourceType:'waitlist',sourceId:req.id}});
  eq(tasks.length,1,unitId+' gera uma única notificação da recepção');
  eq(tasks[0].unitId,unitId,unitId+' notificação respeita unidade principal');
  eq(tasks[0].assignedUserId,userId(unitId),unitId+' notificação chega somente à recepção da unidade');
  eq(tasks[0].legacyPayload.requestId,req.id,unitId+' notificação referencia o pedido correto');

  const beforeCancelBookings=await prisma.booking.count();
  const result=await writes.updateBooking(
   {unitId,principal:{userId:userId(unitId)}} ,
   blockerId(unitId),
   {status:'Cancelado'}
  );
  eq(result.status,'Cancelado',unitId+' cancelamento real libera a agenda');
  eq(await prisma.booking.count(),beforeCancelBookings,unitId+' cancelamento não cria booking novo');

  const opportunity=await prisma.waitlistOpportunity.findFirst({where:{requestId:req.id},orderBy:{createdAt:'asc'}});
  ok(opportunity,unitId+' cancelamento gera oportunidade vinculada');
  eq(opportunity.bookingId,null,unitId+' oportunidade não agenda automaticamente');
  eq(opportunity.unitId,unitId,unitId+' oportunidade permanece na unidade correta');
  eq(opportunity.legacyPayload.sourceType,'CANCELLATION',unitId+' registra origem da vaga');
  eq(opportunity.legacyPayload.sourceBookingId,blockerId(unitId),unitId+' rastreia booking que liberou a vaga');
  eq(opportunity.legacyPayload.items.length,3,unitId+' oportunidade cobre combinação multi-serviço completa');
  const refreshed=await prisma.waitlistRequest.findUniqueOrThrow({where:{id:req.id}});
  eq(refreshed.status,'OPPORTUNITY',unitId+' pedido fica relacionado à oportunidade sem converter');
 }

 const bigReq=await prisma.waitlistRequest.findUniqueOrThrow({where:{id:requestId(key('big'))}});
 const centroReq=await prisma.waitlistRequest.findUniqueOrThrow({where:{id:requestId(key('centro'))}});
 eq(bigReq.legacyPayload.channelId,'CENTRAL','Big usa CENTRAL');
 eq(centroReq.legacyPayload.channelId,'CENTRAL','Centro usa CENTRAL');
 eq(bigReq.unitId,'big','Big continua isolado por unitId');
 eq(centroReq.unitId,'centro','Centro continua isolado por unitId');

 const finalCounts={
  bookings:await prisma.booking.count(),
  outbox:await prisma.messagingOutbox.count(),
  commands:await prisma.openCommand.count(),
  payments:await prisma.commandPayment.count(),
  cash:await prisma.cashSession.count(),
 };
 eq(finalCounts.bookings,baseline.bookings,'WA4 E2E não cria booking automaticamente');
 eq(finalCounts.outbox,baseline.outbox,'WA4 E2E não cria mensagem externa/outbox');
 eq(finalCounts.commands,baseline.commands,'WA4 E2E não cria comanda');
 eq(finalCounts.payments,baseline.payments,'WA4 E2E não cria pagamento');
 eq(finalCounts.cash,baseline.cash,'WA4 E2E não altera caixa');

 console.log(JSON.stringify({ok:true,checks,feature:'wa4_end_to_end',units,externalMessages:false,automaticBooking:false,financialWrites:false}));
}finally{
 await cleanup().catch(()=>{});
 await prisma.$disconnect();
}
