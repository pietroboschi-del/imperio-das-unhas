import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

function obj(v:any){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
const TERMINAL_REQUEST=new Set(['BOOKED','DECLINED','EXPIRED','REMOVED']);

@Injectable()
export class WaitlistTraceService {
 constructor(private readonly prisma:PrismaService){}

 async setState(unitId:string,requestId:string,opportunityId:string,state:'CONTACTED'|'OFFERED'|'ACCEPTED'|'DECLINED'|'EXPIRED'|'CANCELLED',actorId:string){
  return this.prisma.$transaction(async tx=>{
   const req=await tx.waitlistRequest.findFirst({where:{id:requestId,unitId}});
   if(!req)throw new NotFoundException('Pedido de encaixe não encontrado nesta unidade');
   const op=await tx.waitlistOpportunity.findFirst({where:{id:opportunityId,requestId,unitId:{in:[unitId,opportunityId?undefined:unitId].filter(Boolean) as string[]}}});
   // opportunity may be offered in another allowed unit; verify through request ownership instead of trusting caller unit.
   const actualOp=op||await tx.waitlistOpportunity.findFirst({where:{id:opportunityId,requestId}});
   if(!actualOp)throw new NotFoundException('Oportunidade não encontrada');
   const rLegacy=obj(req.legacyPayload),oLegacy=obj(actualOp.legacyPayload);
   const allowedOther=rLegacy.acceptsOtherUnits===true;
   if(actualOp.unitId!==unitId&&!allowedOther)throw new ConflictException('Oportunidade fora do escopo permitido do pedido');
   if(TERMINAL_REQUEST.has(req.status)&&state!=='CANCELLED')throw new ConflictException('Pedido de encaixe já encerrado');
   let reqStatus=req.status,opStatus=actualOp.status,offerState=state;
   if(state==='CONTACTED'){reqStatus='CONTACTED';opStatus='CONTACTED';offerState='CONTACT_PENDING'}
   else if(state==='OFFERED'){reqStatus='CONTACTED';opStatus='CONTACTED';offerState='OFFERED'}
   else if(state==='ACCEPTED'){reqStatus='CONTACTED';opStatus='CONTACTED';offerState='ACCEPTED'}
   else if(state==='DECLINED'){reqStatus='DECLINED';opStatus='DECLINED';offerState='DECLINED'}
   else if(state==='EXPIRED'){reqStatus='EXPIRED';opStatus='EXPIRED';offerState='EXPIRED'}
   else if(state==='CANCELLED'){reqStatus='REMOVED';opStatus='INVALIDATED';offerState='CANCELLED'}
   const now=new Date();
   await tx.waitlistOpportunity.update({where:{id:actualOp.id},data:{status:opStatus,legacyPayload:{...oLegacy,offerState,lastStateAt:now.toISOString(),lastStateByUserId:actorId} as Prisma.InputJsonValue}});
   await tx.waitlistRequest.update({where:{id:req.id},data:{status:reqStatus,legacyPayload:{...rLegacy,offerState,currentOpportunityId:actualOp.id,lastStateAt:now.toISOString(),lastStateByUserId:actorId} as Prisma.InputJsonValue,version:{increment:1}}});
   await tx.auditEvent.create({data:{id:randomUUID(),userId:actorId,unitId:req.unitId,action:'waitlist.state_changed',entityType:'WaitlistRequest',entityId:req.id,legacyPayload:{requestId:req.id,opportunityId:actualOp.id,state,requestStatus:reqStatus,opportunityStatus:opStatus},occurredAt:now}});
   return {requestId:req.id,opportunityId:actualOp.id,state,requestStatus:reqStatus,opportunityStatus:opStatus};
  });
 }

 async convert(unitId:string,requestId:string,opportunityId:string,bookingId:string,actorId:string){
  return this.prisma.$transaction(async tx=>{
   const req=await tx.waitlistRequest.findFirst({where:{id:requestId,unitId}});
   if(!req)throw new NotFoundException('Pedido de encaixe não encontrado nesta unidade');
   const op=await tx.waitlistOpportunity.findFirst({where:{id:opportunityId,requestId}});
   if(!op)throw new NotFoundException('Oportunidade não encontrada');
   if(op.status==='CONVERTED'&&op.bookingId===bookingId)return {requestId,opportunityId,bookingId,status:'CONVERTED'};
   const booking=await tx.booking.findFirst({where:{id:bookingId,unitId:op.unitId},include:{items:true}});
   if(!booking)throw new NotFoundException('Booking final não encontrado na unidade da oportunidade');
   if(req.clientId&&booking.clientId!==req.clientId)throw new ConflictException('Booking não pertence à cliente do pedido');
   const legacy=obj(req.legacyPayload),requiredIds=new Set((Array.isArray(legacy.serviceIds)?legacy.serviceIds:[]).map(String));
   const bookedIds=new Set(booking.items.map(x=>String(x.serviceId||'')));
   if(requiredIds.size&&[...requiredIds].some(id=>!bookedIds.has(id)))throw new ConflictException('Booking não atende integralmente os serviços do pedido');
   const commercialValue=booking.items.reduce((sum,x)=>sum+Number(x.unitPrice||0),0),now=new Date();
   const oLegacy=obj(op.legacyPayload);
   await tx.waitlistOpportunity.update({where:{id:op.id},data:{status:'CONVERTED',bookingId,legacyPayload:{...oLegacy,offerState:'CONVERTED',convertedAt:now.toISOString(),convertedByUserId:actorId,commercialValueAtConversion:commercialValue,bookingCurrentStatus:booking.status} as Prisma.InputJsonValue}});
   await tx.waitlistRequest.update({where:{id:req.id},data:{status:'BOOKED',legacyPayload:{...legacy,offerState:'CONVERTED',appointmentId:bookingId,convertedOpportunityId:op.id,bookedAt:now.toISOString()} as Prisma.InputJsonValue,version:{increment:1}}});
   await tx.auditEvent.create({data:{id:randomUUID(),userId:actorId,unitId:req.unitId,action:'waitlist.converted',entityType:'WaitlistRequest',entityId:req.id,legacyPayload:{requestId:req.id,opportunityId:op.id,bookingId,commercialValueAtConversion:commercialValue},occurredAt:now}});
   return {requestId:req.id,opportunityId:op.id,bookingId,status:'CONVERTED',commercialValueAtConversion:commercialValue};
  });
 }
}
