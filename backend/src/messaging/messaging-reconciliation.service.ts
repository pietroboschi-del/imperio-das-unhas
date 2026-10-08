import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MessagingOutboxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type ReconciliationAction='CONFIRM_SENT'|'CONFIRM_NOT_SENT'|'CANCEL';

@Injectable()
export class MessagingReconciliationService {
  constructor(private readonly prisma:PrismaService){}
  async listPending(limit=50){
    const safeLimit=Math.min(100,Math.max(1,Math.trunc(limit||50)));
    return this.prisma.messagingOutbox.findMany({
      where:{status:MessagingOutboxStatus.RECONCILIATION_REQUIRED},
      orderBy:[{lastAttemptAt:'asc'},{id:'asc'}],
      take:safeLimit,
      select:{id:true,unitId:true,channelId:true,messageType:true,trigger:true,status:true,attempts:true,lastAttemptAt:true,lastError:true,createdAt:true},
    });
  }
  async reconcile(id:string,action:ReconciliationAction,operatorId:string,providerMessageId?:string){
    if(!['CONFIRM_SENT','CONFIRM_NOT_SENT','CANCEL'].includes(action))throw new ConflictException('Invalid reconciliation action');
    const externalId=String(providerMessageId||'').trim();
    if(action==='CONFIRM_SENT'&&!externalId)throw new ConflictException('providerMessageId is required');
    return this.prisma.$transaction(async tx=>{
      const row=await tx.messagingOutbox.findUnique({where:{id}});
      if(!row)throw new NotFoundException('Outbox not found');
      if(row.status!==MessagingOutboxStatus.RECONCILIATION_REQUIRED)throw new ConflictException('Outbox is not awaiting reconciliation');
      const now=new Date();
      const status=action==='CONFIRM_SENT'?MessagingOutboxStatus.SENT:action==='CANCEL'?MessagingOutboxStatus.CANCELLED:MessagingOutboxStatus.FAILED;
      const updated=await tx.messagingOutbox.updateMany({
        where:{id,status:MessagingOutboxStatus.RECONCILIATION_REQUIRED},
        data:{status,nextAttemptAt:action==='CONFIRM_NOT_SENT'?now:null,
          ...(action==='CONFIRM_SENT'?{providerMessageId:externalId,sentAt:now,lastError:null}:{}),
          ...(action==='CANCEL'?{cancelledAt:now}:{}),
        },
      });
      if(updated.count!==1)throw new ConflictException('Outbox reconciliation already changed');
      await tx.auditEvent.create({data:{id:randomUUID(),userId:operatorId,unitId:row.unitId,
        action:'communication.reconciled',entityType:'MessagingOutbox',entityId:id,occurredAt:now,
        legacyPayload:{action,channelId:row.channelId,attempts:row.attempts,providerMessageId:action==='CONFIRM_SENT'?externalId:null} as Prisma.InputJsonValue,
      }});
      return {id,status,action};
    });
  }
}
