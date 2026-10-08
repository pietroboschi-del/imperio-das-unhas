import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MessagingInboundType, MessagingOutboxStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { ParsedEvolutionInbound, ParsedEvolutionStatus } from './evolution-webhook.parser';

function stable(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){const row=value as Record<string,unknown>;return Object.fromEntries(Object.keys(row).sort().map(key=>[key,stable(row[key])]))}
  return value;
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function retryAfter(attempts:number,now:Date){const minutes=Math.min(60,Math.max(1,2**Math.max(0,attempts-1)));return new Date(now.getTime()+minutes*60_000)}

@Injectable()
export class MessagingInboundService {
  constructor(private readonly prisma:PrismaService){}
  private async resolveUniqueClient(senderPhone:string){
    const rows=await this.prisma.client.findMany({where:{active:true,phone:senderPhone},select:{id:true},take:2});
    return rows.length===1?rows[0].id:null;
  }
  async receive(input:ParsedEvolutionInbound){
    if(!input.channelId)throw new BadRequestException('Evolution instance is not configured');
    if(!await this.prisma.messagingChannel.findUnique({where:{id:input.channelId},select:{id:true}}))throw new BadRequestException('Messaging channel is not configured');
    const clientId=await this.resolveUniqueClient(input.senderPhone);
    const deduplicationKey=hash({provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId});
    const contentHash=hash({
      provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId,providerConversationId:input.providerConversationId,
      senderPhone:input.senderPhone,recipientInstance:input.recipientInstance,messageType:input.messageType,textBody:input.textBody,
      mediaMetadata:input.mediaMetadata,providerTimestamp:input.providerTimestamp,
    });
    const existing=await this.prisma.messagingInbound.findUnique({where:{deduplicationKey}});
    if(existing){
      if(existing.contentHash===contentHash)return {row:existing,replayed:true};
      await this.auditReplayConflict(existing.id,input);throw new ConflictException('Webhook replay conflict');
    }
    try{
      const row=await this.prisma.$transaction(async tx=>{
        const created=await tx.messagingInbound.create({data:{
          provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId,providerConversationId:input.providerConversationId,
          senderPhone:input.senderPhone,recipientInstance:input.recipientInstance,messageType:input.messageType as MessagingInboundType,textBody:input.textBody,
          mediaMetadata:input.mediaMetadata?input.mediaMetadata as Prisma.InputJsonValue:Prisma.DbNull,
          providerTimestamp:input.providerTimestamp,rawMetadata:input.rawMetadata as Prisma.InputJsonValue,processingStatus:'RECEIVED',
          unitId:null,clientId,bookingId:null,commandId:null,threadRef:input.threadRef,deduplicationKey,contentHash,
        }});
        await tx.auditEvent.create({data:{
          id:randomUUID(),unitId:null,action:'communication.received',entityType:'MessagingInbound',entityId:created.id,
          legacyPayload:{provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId,messageType:input.messageType,clientMatched:Boolean(clientId),unitResolved:false},
          occurredAt:new Date(),
        }});
        return created;
      });
      return {row,replayed:false};
    }catch(error){
      if((error as {code?:string})?.code==='P2002'){
        const raced=await this.prisma.messagingInbound.findUnique({where:{deduplicationKey}});
        if(raced&&raced.contentHash===contentHash)return {row:raced,replayed:true};
        if(raced)await this.auditReplayConflict(raced.id,input);
        throw new ConflictException('Webhook replay conflict');
      }
      throw error;
    }
  }
  async applyStatus(input:ParsedEvolutionStatus){
    if(!input.channelId)throw new BadRequestException('Evolution instance is not configured');
    const row=await this.prisma.messagingOutbox.findFirst({where:{channelId:input.channelId,providerMessageId:input.providerMessageId}});
    if(!row)return {matched:false,updated:false,status:null};
    const next=this.nextStatus(row.status,input.targetStatus);
    if(!next)return {matched:true,updated:false,status:row.status};
    const now=new Date(),data:any={status:next};let action:string;
    if(next===MessagingOutboxStatus.SENT){data.sentAt=row.sentAt||now;action='communication.sent'}
    else if(next===MessagingOutboxStatus.DELIVERED){data.deliveredAt=row.deliveredAt||now;action='communication.delivered'}
    else if(next===MessagingOutboxStatus.READ){data.readAt=row.readAt||now;action='communication.read'}
    else{data.lastError='Provider delivery failure requires reconciliation';data.nextAttemptAt=null;action='communication.reconciliation_required'}
    const updated=await this.prisma.$transaction(async tx=>{
      const changed=await tx.messagingOutbox.updateMany({where:{id:row.id,status:row.status},data});
      if(changed.count!==1)return false;
      await tx.auditEvent.create({data:{
        id:randomUUID(),unitId:row.unitId,action,entityType:'MessagingOutbox',entityId:row.id,
        legacyPayload:{provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId,source:'provider_webhook'},occurredAt:now,
      }});
      return true;
    });
    const current=await this.prisma.messagingOutbox.findUnique({where:{id:row.id},select:{status:true}});
    return {matched:true,updated,status:current?.status||row.status};
  }
  private nextStatus(current:MessagingOutboxStatus,target:ParsedEvolutionStatus['targetStatus']):MessagingOutboxStatus|null{
    if(current===MessagingOutboxStatus.CANCELLED)return null;
    if(target==='SENT'){if(current===MessagingOutboxStatus.SENT||current===MessagingOutboxStatus.DELIVERED||current===MessagingOutboxStatus.READ)return null;return MessagingOutboxStatus.SENT}
    if(target==='DELIVERED'){if(current===MessagingOutboxStatus.DELIVERED||current===MessagingOutboxStatus.READ)return null;return MessagingOutboxStatus.DELIVERED}
    if(target==='READ'){if(current===MessagingOutboxStatus.READ)return null;return MessagingOutboxStatus.READ}
    if(current===MessagingOutboxStatus.DELIVERED||current===MessagingOutboxStatus.READ||current===MessagingOutboxStatus.FAILED||current===MessagingOutboxStatus.RECONCILIATION_REQUIRED)return null;
    return MessagingOutboxStatus.RECONCILIATION_REQUIRED;
  }
  private async auditReplayConflict(existingId:string,input:ParsedEvolutionInbound){
    await this.prisma.auditEvent.create({data:{
      id:randomUUID(),unitId:null,action:'communication.inbound_replay_conflict',entityType:'MessagingInbound',entityId:existingId,
      legacyPayload:{provider:input.provider,channelId:input.channelId,providerMessageId:input.providerMessageId},occurredAt:new Date(),
    }});
  }
}
