import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingAvailabilityService, MultiServiceSpec } from './booking-availability.service';
import { WaitlistAutomationMaterializationService } from '../messaging/waitlist-automation-materialization.service';

export type WaitlistOpportunitySource=
 'EXISTING_AVAILABILITY'|'CANCELLATION'|'RESCHEDULE'|'SERVICE_CHANGE'|'UNBLOCK'|
 'PROFESSIONAL_AVAILABILITY_CHANGE'|'OTHER_AVAILABILITY_CHANGE';

type AvailabilityEvent={unitId:string;date:string;sourceType:WaitlistOpportunitySource;sourceBookingId?:string;sourceReferenceId?:string};

function obj(v:any){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function minutes(t:string){const m=/^(\d{2}):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):Number.NaN}
function withinWindow(start:string,end:string,from?:string|null,to?:string|null){
 const a=minutes(start),z=minutes(end),f=from?minutes(from):0,t=to?minutes(to):24*60;
 return Number.isFinite(a)&&Number.isFinite(z)&&a>=f&&z<=t;
}
function dateAllowed(date:string,legacy:any){
 const exact=String(legacy.desiredDate||legacy.availabilityDate||'');
 const from=String(legacy.desiredDateFrom||exact||'');
 const to=String(legacy.desiredDateTo||exact||'');
 if(exact&&date!==exact)return false;
 if(from&&date<from)return false;
 if(to&&date>to)return false;
 return true;
}

@Injectable()
export class WaitlistOpportunityService {
 constructor(
  private readonly prisma:PrismaService,
  private readonly availability:BookingAvailabilityService,
  @Optional() private readonly waitlistAutomations?:WaitlistAutomationMaterializationService,
 ){}

 async reevaluateForAvailabilityEvent(event:AvailabilityEvent){
  const rows=await this.prisma.waitlistRequest.findMany({
   where:{status:{in:['WAITING','OPPORTUNITY','CONTACTED']}},
   orderBy:[{createdAt:'asc'},{id:'asc'}],
   take:500,
  });
  const candidates:any[]=[];
  for(const request of rows){
   const legacy=obj(request.legacyPayload);
   const sameUnit=request.unitId===event.unitId;
   if(!sameUnit&&legacy.acceptsOtherUnits!==true)continue;
   if(!dateAllowed(event.date,legacy))continue;
   const specsRaw=Array.isArray(legacy.services)&&legacy.services.length?legacy.services:
    (legacy.serviceId?[{serviceId:legacy.serviceId,professionalId:legacy.preferredProfessionalId||null,preferenceMode:legacy.professionalPreferenceMode||'preferred'}]:[]);
   if(!specsRaw.length)continue;
   const acceptsOtherProfessional=legacy.acceptsOtherProfessional!==false;
   const specs:MultiServiceSpec[]=specsRaw.map((x:any)=>{
    const pid=String(x.professionalId||'')||undefined;
    let mode=(x.preferenceMode==='required'?'required':'preferred') as 'preferred'|'required';
    if(pid&&!acceptsOtherProfessional)mode='required';
    return {serviceId:String(x.serviceId||''),professionalId:pid,preferenceMode:mode};
   });
   if(specs.some(x=>!x.serviceId))continue;
   const from=legacy.timeFrom||legacy.availabilityStartTime||null,to=legacy.timeTo||legacy.availabilityEndTime||null;
   let option:any=null;
   if(specs.length===1){
    const spec=specs[0];
    const result=await this.availability.availability({unitId:event.unitId,date:event.date,serviceId:spec.serviceId,professionalId:spec.preferenceMode==='required'?spec.professionalId:undefined});
    const slots=result.slots.filter((s:any)=>withinWindow(s.localStart,s.localEnd,from,to)).map((s:any)=>({
     visitStartAt:s.startAt,visitEndAt:s.endAt,localStart:s.localStart,localEnd:s.localEnd,visitDurationMin:s.durationMin,
     preferencePenalty:spec.professionalId&&s.professionalId!==spec.professionalId?1:0,
     items:[{serviceId:spec.serviceId,professionalId:s.professionalId,professionalName:s.professionalName,startAt:s.startAt,endAt:s.endAt,localStart:s.localStart,localEnd:s.localEnd,durationMin:s.durationMin,price:s.price}],
    }));
    slots.sort((a:any,b:any)=>a.preferencePenalty-b.preferencePenalty||a.localStart.localeCompare(b.localStart)||String(a.items[0].professionalId).localeCompare(String(b.items[0].professionalId)));
    option=slots[0]||null;
   }else{
    const result=await this.availability.multiAvailability({unitId:event.unitId,date:event.date,services:specs});
    const visits=result.visits.filter((v:any)=>withinWindow(v.localStart,v.localEnd,from,to));
    option=visits[0]||null;
   }
   if(!option)continue;
   const primaryPenalty=sameUnit?0:1;
   const preferredPenalty=Number(option.preferencePenalty||0);
   const windowStart=from?minutes(from):minutes(option.localStart),deviation=Math.max(0,minutes(option.localStart)-windowStart);
   candidates.push({request,legacy,option,primaryPenalty,preferredPenalty,deviation});
  }
  candidates.sort((a,b)=>a.primaryPenalty-b.primaryPenalty||a.preferredPenalty-b.preferredPenalty||a.deviation-b.deviation||
   a.request.createdAt.getTime()-b.request.createdAt.getTime()||a.request.id.localeCompare(b.request.id));

  const created:any[]=[];
  for(const c of candidates){
   const signature=JSON.stringify(c.option.items.map((x:any)=>[x.serviceId,x.professionalId,x.startAt]));
   const id='wo_'+createHash('sha256').update([c.request.id,event.unitId,event.date,signature].join('|')).digest('hex').slice(0,40);
   const classification=(c.primaryPenalty||c.preferredPenalty)?'ALTERNATIVE':'IDEAL';
   const legacy:any={
    sourceType:event.sourceType,sourceBookingId:event.sourceBookingId||null,sourceReferenceId:event.sourceReferenceId||event.sourceBookingId||null,
    requestId:c.request.id,primaryUnitId:c.request.unitId,offeredUnitId:event.unitId,date:event.date,
    serviceIds:c.option.items.map((x:any)=>x.serviceId),classification,
    visitStartAt:c.option.visitStartAt,visitEndAt:c.option.visitEndAt,localStart:c.option.localStart,localEnd:c.option.localEnd,
    items:c.option.items.map((x:any)=>({serviceId:x.serviceId,professionalId:x.professionalId,professionalName:x.professionalName||'',startAt:x.startAt,endAt:x.endAt,localStart:x.localStart,localEnd:x.localEnd,durationMin:x.durationMin,price:x.price})),
    preferencePenalty:c.preferredPenalty,unitPenalty:c.primaryPenalty,deviationMin:c.deviation,offerState:'CONTACT_PENDING',
   };
   await this.prisma.$transaction(async tx=>{
    const old=await tx.waitlistOpportunity.findUnique({where:{id}});
    if(!old)await tx.waitlistOpportunity.create({data:{id,unitId:event.unitId,requestId:c.request.id,status:'FOUND',bookingId:null,legacyPayload:legacy as Prisma.InputJsonValue}});
    const reqLegacy=obj(c.request.legacyPayload);
    await tx.waitlistRequest.update({where:{id:c.request.id},data:{
     status:c.request.status==='WAITING'?'OPPORTUNITY':c.request.status,
     legacyPayload:{...reqLegacy,opportunityActive:true,opportunityId:id,opportunityUnitId:event.unitId,opportunityDate:event.date,opportunityStartTime:c.option.localStart,opportunityEndTime:c.option.localEnd,opportunityClass:classification,opportunitySourceType:event.sourceType} as Prisma.InputJsonValue,
     version:{increment:1},
    }});
    if(!old){
     await tx.auditEvent.create({data:{id:randomUUID(),unitId:c.request.unitId,action:'waitlist.opportunity_found',entityType:'WaitlistOpportunity',entityId:id,legacyPayload:{requestId:c.request.id,offeredUnitId:event.unitId,serviceIds:legacy.serviceIds,sourceType:event.sourceType,sourceBookingId:event.sourceBookingId||null,classification},occurredAt:new Date()}});
     await tx.auditEvent.create({data:{id:randomUUID(),unitId:c.request.unitId,action:'waitlist.offer_candidate_ready',entityType:'WaitlistOpportunity',entityId:id,legacyPayload:{requestId:c.request.id,offeredUnitId:event.unitId,serviceIds:legacy.serviceIds,offerState:'CONTACT_PENDING',source:'WA4'},occurredAt:new Date()}});
    }
   });
   if(this.waitlistAutomations)await this.waitlistAutomations.materializeOfferCandidate(id);
   created.push({id,requestId:c.request.id,unitId:event.unitId,classification,...c.option});
  }
  return created;
 }
}
