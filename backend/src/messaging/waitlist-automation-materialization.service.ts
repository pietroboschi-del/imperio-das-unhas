import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingAutomationService } from './messaging-automation.service';

function obj(value:unknown){
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

@Injectable()
export class WaitlistAutomationMaterializationService {
  constructor(
    private readonly prisma:PrismaService,
    private readonly automations:MessagingAutomationService,
  ){}

  async materializeOfferCandidate(opportunityId:string){
    const opportunity=await this.prisma.waitlistOpportunity.findUnique({
      where:{id:opportunityId},
      select:{id:true,unitId:true,requestId:true,status:true,bookingId:true,legacyPayload:true,createdAt:true},
    });
    if(!opportunity)throw new NotFoundException('Oportunidade de encaixe não encontrada para automação');
    if(opportunity.bookingId)return {opportunityId:opportunity.id,created:null,skipped:true,reason:'BOOKING_ALREADY_EXISTS'};

    const request=opportunity.requestId?await this.prisma.waitlistRequest.findUnique({
      where:{id:opportunity.requestId},
      select:{id:true,unitId:true,clientId:true,legacyPayload:true},
    }):null;
    const legacy=obj(opportunity.legacyPayload);
    const requestLegacy=obj(request?.legacyPayload);
    const serviceIds=Array.isArray(legacy.serviceIds)?legacy.serviceIds.map(String):[];
    const items=Array.isArray(legacy.items)?legacy.items:[];

    const row=await this.automations.create({
      unitId:opportunity.unitId,
      clientId:request?.clientId||null,
      bookingId:null,
      sourceType:'WAITLIST_OFFER_CANDIDATE',
      sourceId:opportunity.id,
      automationType:'WAITLIST_OFFER',
      scheduledAt:opportunity.createdAt,
      idempotencyKey:'wa5:waitlist-offer:'+opportunity.id,
      logicalKey:'waitlist-opportunity:'+opportunity.id+':WAITLIST_OFFER',
      generation:1,
      payload:{
        opportunityId:opportunity.id,
        requestId:opportunity.requestId||null,
        primaryUnitId:String(legacy.primaryUnitId||request?.unitId||''),
        offeredUnitId:opportunity.unitId,
        serviceIds,
        items,
        visitStartAt:legacy.visitStartAt??null,
        visitEndAt:legacy.visitEndAt??null,
        localStart:legacy.localStart??null,
        localEnd:legacy.localEnd??null,
        classification:legacy.classification??null,
        offerState:legacy.offerState??'CONTACT_PENDING',
        channelId:requestLegacy.channelId??null,
        automaticAcceptance:false,
        automaticBooking:false,
      } as Prisma.InputJsonValue,
    });
    return {opportunityId:opportunity.id,created:row,skipped:false};
  }
}
