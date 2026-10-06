import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {BookingAvailabilityService} from '../dist/src/core/booking-availability.service.js';
import {WaitlistOpportunityService} from '../dist/src/core/waitlist-opportunity.service.js';
const prisma=new PrismaClient();let checks=0;const eq=(a,b,m)=>{checks++;assert.equal(a,b,m)},ok=(v,m)=>{checks++;assert.ok(v,m)};
const date='2030-10-08',service='wa45-s',pro='wa45-p';
async function cleanup(){await prisma.auditEvent.deleteMany({where:{OR:[{action:'waitlist.offer_candidate_ready'},{action:'waitlist.opportunity_found'}]}}).catch(()=>{});await prisma.waitlistOpportunity.deleteMany({where:{requestId:'wa45-r'}}).catch(()=>{});await prisma.waitlistRequest.deleteMany({where:{id:'wa45-r'}}).catch(()=>{});await prisma.workstation.deleteMany({where:{id:'wa45-ws'}}).catch(()=>{});await prisma.professionalUnit.deleteMany({where:{professionalId:pro}}).catch(()=>{});await prisma.professional.deleteMany({where:{id:pro}}).catch(()=>{});await prisma.service.deleteMany({where:{id:service}}).catch(()=>{});await prisma.serviceCategory.deleteMany({where:{id:'wa45-cat'}}).catch(()=>{})}
try{await prisma.$connect();process.env.OPERATIONAL_WRITES_ENABLED='true';process.env.OPERATIONAL_WRITES_UNITS='';await ensureCanonicalUnits(prisma);await cleanup();
await prisma.serviceCategory.create({data:{id:'wa45-cat',name:'WA45',active:true}});
await prisma.service.create({data:{id:service,name:'WA45 Serviço',categoryId:'wa45-cat',price:'50',durationMin:30,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',proRules:{[pro]:{enabled:true,online:true}}}}});
await prisma.professional.create({data:{id:pro,name:'WA45 Pro',active:true,legacyPayload:{show:true,online:true,services:[service],schedule:{'centro-2':{work:true,start:'09:00',end:'18:00'}}}}});
await prisma.professionalUnit.create({data:{professionalId:pro,unitId:'centro',active:true}});
await prisma.workstation.create({data:{id:'wa45-ws',unitId:'centro',name:'WA45',allowedCategoryIds:['wa45-cat'],active:true}});
await prisma.waitlistRequest.create({data:{id:'wa45-r',unitId:'centro',status:'WAITING',legacyPayload:{source:'WHATSAPP_AGENT',services:[{serviceId:service}],serviceIds:[service],desiredDate:date,timeFrom:'09:00',timeTo:'12:00',acceptsOtherProfessional:true,acceptsOtherUnits:false}}});
const matcher=new WaitlistOpportunityService(prisma,new BookingAvailabilityService(prisma));
const beforeOutbox=await prisma.messagingOutbox.count();
const rows=await matcher.reevaluateForAvailabilityEvent({unitId:'centro',date,sourceType:'CANCELLATION',sourceBookingId:'wa45-source'});
eq(rows.length,1,'oportunidade gera candidato de oferta');
const op=await prisma.waitlistOpportunity.findUniqueOrThrow({where:{id:rows[0].id}});
eq(op.status,'FOUND','status operacional permanece FOUND');eq(op.legacyPayload.offerState,'CONTACT_PENDING','estado futuro inicia CONTACT_PENDING');
eq(await prisma.auditEvent.count({where:{action:'waitlist.offer_candidate_ready',entityId:op.id}}),1,'evento de candidato de oferta criado uma vez');
await matcher.reevaluateForAvailabilityEvent({unitId:'centro',date,sourceType:'CANCELLATION',sourceBookingId:'wa45-source'});
eq(await prisma.auditEvent.count({where:{action:'waitlist.offer_candidate_ready',entityId:op.id}}),1,'reprocessamento não duplica evento');
eq(await prisma.messagingOutbox.count(),beforeOutbox,'WA4.5 não cria outbound');
eq(await prisma.booking.count({where:{id:{startsWith:'wa45'}}}),0,'WA4.5 não cria booking');
console.log(JSON.stringify({ok:true,checks,feature:'wa4_5_offer_candidate_ready',externalMessages:false}));
}finally{await cleanup().catch(()=>{});await prisma.$disconnect()}
