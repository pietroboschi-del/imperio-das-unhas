import { Inject, Injectable } from '@nestjs/common';
import { MessagingOutboxStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isMessagingChannelId, whatsappAutomationEnabled } from './messaging-channels';
import { MESSAGING_PROVIDER, MessagingProvider, MessagingProviderError } from './messaging.provider';
import { messagingSendingStaleMs } from './messaging-dispatch-config';

export type DispatchOutcome='SENT'|'FAILED'|'RECONCILIATION_REQUIRED'|'SKIPPED'|'NOT_FOUND';
function retryAt(attempt:number,now:Date){
  const minutes=Math.min(60,Math.max(1,2**Math.max(0,attempt-1)));
  return new Date(now.getTime()+minutes*60_000);
}
function safeProviderError(error:unknown){
  if(error instanceof MessagingProviderError)return String(error.message||'Messaging provider failure').slice(0,300);
  return 'Messaging provider failure';
}

@Injectable()
export class MessagingDispatchService {
  constructor(private readonly prisma:PrismaService,@Inject(MESSAGING_PROVIDER) private readonly provider:MessagingProvider){}
  async processOne(id:string):Promise<{outcome:DispatchOutcome;id:string;status?:string}>{
    if(!whatsappAutomationEnabled())return {outcome:'SKIPPED',id,status:'AUTOMATION_DISABLED'};
    const now=new Date();
    const claimed=await this.prisma.$transaction(async tx=>{
      const row=await tx.messagingOutbox.findUnique({where:{id},include:{channel:true}});
      if(!row)return null;
      if(!row.channel.enabled)return {blocked:true,row} as const;
      if(row.status!==MessagingOutboxStatus.PENDING&&row.status!==MessagingOutboxStatus.FAILED)return {blocked:true,row} as const;
      if(row.status===MessagingOutboxStatus.FAILED&&(!row.nextAttemptAt||row.nextAttemptAt>now))return {blocked:true,row} as const;
      if(row.status===MessagingOutboxStatus.PENDING&&row.nextAttemptAt&&row.nextAttemptAt>now)return {blocked:true,row} as const;
      const updated=await tx.messagingOutbox.updateMany({
        where:{id:row.id,status:row.status,attempts:row.attempts},
        data:{status:MessagingOutboxStatus.SENDING,attempts:{increment:1},lastAttemptAt:now,nextAttemptAt:null,lastError:null},
      });
      if(updated.count!==1)return {blocked:true,row} as const;
      const after=await tx.messagingOutbox.findUnique({where:{id:row.id},include:{channel:true}});
      return after?{blocked:false,row:after} as const:null;
    });
    if(!claimed)return {outcome:'NOT_FOUND',id};
    if(claimed.blocked)return {outcome:'SKIPPED',id,status:claimed.row.status};
    const row=claimed.row;
    if(!isMessagingChannelId(row.channelId)){
      await this.failClaim(row.id,row.unitId,row.channelId,row.messageType,row.trigger,row.attempts,'Messaging channel is invalid',now,false);
      return {outcome:'FAILED',id,status:MessagingOutboxStatus.FAILED};
    }
    try{
      const result=await this.provider.send({outboxId:row.id,channelId:row.channelId,unitId:row.unitId,idempotencyKey:row.idempotencyKey,payload:row.payload});
      const providerMessageId=String(result.providerMessageId||'').trim();
      if(!providerMessageId)throw new MessagingProviderError('PROVIDER_MESSAGE_ID_MISSING','Messaging provider response did not include a message id',true,'DELIVERY_UNKNOWN');
      const sentAt=result.acceptedAt||new Date();
      const persisted=await this.prisma.$transaction(async tx=>{
        const updated=await tx.messagingOutbox.updateMany({
          where:{id:row.id,status:MessagingOutboxStatus.SENDING},
          data:{status:MessagingOutboxStatus.SENT,providerMessageId,sentAt,nextAttemptAt:null,lastError:null},
        });
        if(updated.count===1)await tx.auditEvent.create({data:{
          id:randomUUID(),unitId:row.unitId,action:'communication.sent',entityType:'MessagingOutbox',entityId:row.id,
          legacyPayload:{provider:this.provider.providerName,channelId:row.channelId,messageType:row.messageType,trigger:row.trigger,attempts:row.attempts},
          occurredAt:new Date(),
        }});
        return updated.count===1;
      });
      if(!persisted)return {outcome:'SKIPPED',id,status:'SEND_STATE_CHANGED_REQUIRES_REVIEW'};
      return {outcome:'SENT',id,status:MessagingOutboxStatus.SENT};
    }catch(error){
      const definite=error instanceof MessagingProviderError&&error.certainty==='DEFINITE_FAILURE';
      await this.failClaim(row.id,row.unitId,row.channelId,row.messageType,row.trigger,row.attempts,safeProviderError(error),new Date(),definite&&error instanceof MessagingProviderError&&error.retryable,error instanceof MessagingProviderError?error.code:'PROVIDER_RESULT_UNKNOWN',!definite);
      return {outcome:definite?'FAILED':'RECONCILIATION_REQUIRED',id,status:definite?MessagingOutboxStatus.FAILED:MessagingOutboxStatus.RECONCILIATION_REQUIRED};
    }
  }
  async recoverStaleSending(limit=50,now=new Date()){
    const safeLimit=Math.min(100,Math.max(1,Math.trunc(limit||50)));
    const staleMs=messagingSendingStaleMs();
    const cutoff=new Date(now.getTime()-staleMs);
    const rows=await this.prisma.messagingOutbox.findMany({
      where:{status:MessagingOutboxStatus.SENDING,lastAttemptAt:{lt:cutoff}},
      select:{id:true,unitId:true,channelId:true,messageType:true,trigger:true,attempts:true},
      orderBy:{lastAttemptAt:'asc'},
      take:safeLimit,
    });
    const recovered:string[]=[];
    for(const row of rows){
      const changed=await this.prisma.$transaction(async tx=>{
        const updated=await tx.messagingOutbox.updateMany({
          where:{id:row.id,status:MessagingOutboxStatus.SENDING,lastAttemptAt:{lt:cutoff}},
          data:{
            status:MessagingOutboxStatus.RECONCILIATION_REQUIRED,
            lastError:'Previous send attempt has unknown delivery outcome',
            nextAttemptAt:null,
          },
        });
        if(updated.count!==1)return false;
        await tx.auditEvent.create({data:{
          id:randomUUID(),
          unitId:row.unitId,
          action:'communication.reconciliation_required',
          entityType:'MessagingOutbox',
          entityId:row.id,
          legacyPayload:{
            provider:this.provider.providerName,
            channelId:row.channelId,
            messageType:row.messageType,
            trigger:row.trigger,
            attempts:row.attempts,
            staleMs,
          },
          occurredAt:now,
        }});
        return true;
      });
      if(changed)recovered.push(row.id);
    }
    return {recovered:recovered.length,ids:recovered,staleMs,cutoff};
  }

  async processPending(limit=10){
    const safeLimit=Math.min(50,Math.max(1,Math.trunc(limit||10))),now=new Date();
    await this.recoverStaleSending(safeLimit,now);
    if(!whatsappAutomationEnabled())return [];
    const rows=await this.prisma.messagingOutbox.findMany({
      where:{OR:[{status:MessagingOutboxStatus.PENDING,OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now}}]},{status:MessagingOutboxStatus.FAILED,nextAttemptAt:{lte:now}}]},
      select:{id:true},orderBy:{createdAt:'asc'},take:safeLimit,
    });
    const results=[];for(const row of rows)results.push(await this.processOne(row.id));return results;
  }
  private async failClaim(id:string,unitId:string|null,channelId:string,messageType:string,trigger:string,attempts:number,lastError:string,now:Date,retryable=false,code='PROVIDER_FAILURE',unknown=false){
    await this.prisma.$transaction(async tx=>{
      const updated=await tx.messagingOutbox.updateMany({
        where:{id,status:MessagingOutboxStatus.SENDING},
        data:{status:unknown?MessagingOutboxStatus.RECONCILIATION_REQUIRED:MessagingOutboxStatus.FAILED,lastError:String(lastError||'Messaging provider failure').slice(0,300),nextAttemptAt:unknown?null:retryable?retryAt(attempts,now):null},
      });
      if(updated.count===1)await tx.auditEvent.create({data:{
        id:randomUUID(),unitId,action:unknown?'communication.reconciliation_required':'communication.failed',entityType:'MessagingOutbox',entityId:id,
        legacyPayload:{provider:this.provider.providerName,channelId,messageType,trigger,attempts,reason:code},occurredAt:now,
      }});
    });
  }
}
