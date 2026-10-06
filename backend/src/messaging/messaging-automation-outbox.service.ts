import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MessagingAutomationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { channelForUnit } from './messaging-channels';
import { MessagingFoundationService } from './messaging-foundation.service';

const TEXT:Readonly<Record<string,string>>=Object.freeze({
  BOOKING_CONFIRMATION:'Seu agendamento no Império das Unhas foi registrado.',
  SIGNAL_REQUEST:'Há uma atualização relacionada ao seu agendamento.',
  SIGNAL_REMINDER:'Lembrete: há uma atualização pendente relacionada ao seu agendamento.',
  APPOINTMENT_REMINDER:'Lembrete do seu agendamento no Império das Unhas.',
  WAITLIST_OFFER:'Encontramos uma oportunidade de encaixe para você.',
  POST_SERVICE:'Obrigada pela sua visita ao Império das Unhas.',
  FEEDBACK_REQUEST:'Conte para nós como foi sua experiência no Império das Unhas.',
});

function auditId(action:string,automationId:string){
  return 'wa5a_'+createHash('sha256').update(action+'|'+automationId).digest('hex').slice(0,40);
}
function digits(value:string|null|undefined){return String(value||'').replace(/\D/g,'')}

@Injectable()
export class MessagingAutomationOutboxService {
  constructor(
    private readonly prisma:PrismaService,
    private readonly foundation:MessagingFoundationService,
  ){}

  async markDueReady(limit=100,now=new Date()){
    const safeLimit=Math.min(500,Math.max(1,Math.trunc(limit||100)));
    const rows=await this.prisma.messagingAutomation.findMany({
      where:{status:MessagingAutomationStatus.PENDING,scheduledAt:{lte:now}},
      select:{id:true,unitId:true,automationType:true,scheduledAt:true},
      orderBy:[{scheduledAt:'asc'},{id:'asc'}],
      take:safeLimit,
    });
    const ready:string[]=[];
    for(const row of rows){
      const changed=await this.prisma.$transaction(async tx=>{
        const updated=await tx.messagingAutomation.updateMany({
          where:{id:row.id,status:MessagingAutomationStatus.PENDING,scheduledAt:{lte:now}},
          data:{status:MessagingAutomationStatus.READY,lastError:null},
        });
        if(updated.count!==1)return false;
        await tx.auditEvent.upsert({
          where:{id:auditId('automation.ready',row.id)},
          create:{id:auditId('automation.ready',row.id),unitId:row.unitId,action:'automation.ready',entityType:'MessagingAutomation',entityId:row.id,legacyPayload:{automationType:row.automationType,scheduledAt:row.scheduledAt.toISOString()},occurredAt:now},
          update:{},
        });
        return true;
      });
      if(changed)ready.push(row.id);
    }
    return {ready:ready.length,ids:ready,now};
  }

  private async fail(id:string,unitId:string,reason:string){
    await this.prisma.$transaction(async tx=>{
      await tx.messagingAutomation.updateMany({
        where:{id,status:MessagingAutomationStatus.ENQUEUED},
        data:{status:MessagingAutomationStatus.FAILED,lastError:reason.slice(0,300)},
      });
      await tx.auditEvent.upsert({
        where:{id:auditId('automation.enqueue_failed',id)},
        create:{id:auditId('automation.enqueue_failed',id),unitId,action:'automation.enqueue_failed',entityType:'MessagingAutomation',entityId:id,legacyPayload:{reason:reason.slice(0,300)},occurredAt:new Date()},
        update:{legacyPayload:{reason:reason.slice(0,300)},occurredAt:new Date()},
      });
    });
    return {outcome:'FAILED' as const,id,reason};
  }

  async enqueueReady(id:string){
    let row=await this.prisma.messagingAutomation.findUnique({where:{id}});
    if(!row)return {outcome:'NOT_FOUND' as const,id};
    if(row.status===MessagingAutomationStatus.CANCELLED)return {outcome:'SKIPPED' as const,id,status:'CANCELLED'};
    const outboxKey='wa5:automation-outbox:'+row.id;
    if(row.status===MessagingAutomationStatus.DONE){
      const existing=await this.prisma.messagingOutbox.findUnique({where:{idempotencyKey:outboxKey}});
      return {outcome:'SKIPPED' as const,id,status:'DONE',outbox:existing};
    }
    if(row.status===MessagingAutomationStatus.ENQUEUED){
      const existing=await this.prisma.messagingOutbox.findUnique({where:{idempotencyKey:outboxKey}});
      if(existing)return {outcome:'ENQUEUED' as const,id,outbox:existing,replayed:true};
    }else if(row.status===MessagingAutomationStatus.READY){
      const claim=await this.prisma.messagingAutomation.updateMany({
        where:{id:row.id,status:MessagingAutomationStatus.READY},
        data:{status:MessagingAutomationStatus.ENQUEUED,lastError:null},
      });
      if(claim.count!==1){
        row=await this.prisma.messagingAutomation.findUnique({where:{id}});
        if(!row||row.status===MessagingAutomationStatus.CANCELLED)return {outcome:'SKIPPED' as const,id,status:row?.status||'NOT_FOUND'};
        if(row.status!==MessagingAutomationStatus.ENQUEUED)return {outcome:'SKIPPED' as const,id,status:row.status};
      }else{
        row={...row,status:MessagingAutomationStatus.ENQUEUED};
      }
    }else{
      return {outcome:'SKIPPED' as const,id,status:row.status};
    }

    const channelId=channelForUnit(row.unitId);
    if(!channelId)return this.fail(row.id,row.unitId,'UNIT_MESSAGING_CHANNEL_NOT_FOUND');
    const client=row.clientId?await this.prisma.client.findUnique({where:{id:row.clientId},select:{phone:true}}):null;
    const number=digits(client?.phone);
    if(!number)return this.fail(row.id,row.unitId,'CLIENT_PHONE_MISSING');
    const text=TEXT[row.automationType]||'Há uma atualização do Império das Unhas para você.';

    try{
      const outbox=await this.foundation.queueMessage({
        channelId,
        unitId:row.unitId,
        clientId:row.clientId,
        bookingId:row.bookingId,
        idempotencyKey:outboxKey,
        messageType:row.automationType,
        trigger:'WA5_AUTOMATION',
        payload:{
          number,text,
          automationId:row.id,
          sourceType:row.sourceType,
          sourceId:row.sourceId,
          logicalKey:row.logicalKey,
          generation:row.generation,
          automationPayload:row.payload,
        },
      });
      await this.prisma.auditEvent.upsert({
        where:{id:auditId('automation.enqueued',row.id)},
        create:{id:auditId('automation.enqueued',row.id),unitId:row.unitId,action:'automation.enqueued',entityType:'MessagingAutomation',entityId:row.id,legacyPayload:{outboxId:outbox.id,channelId,messageType:row.automationType},occurredAt:new Date()},
        update:{legacyPayload:{outboxId:outbox.id,channelId,messageType:row.automationType}},
      });
      return {outcome:'ENQUEUED' as const,id:row.id,outbox,replayed:false};
    }catch(error){
      return this.fail(row.id,row.unitId,'OUTBOX_QUEUE_FAILED');
    }
  }

  async retryFailed(id:string){
    const changed=await this.prisma.messagingAutomation.updateMany({
      where:{id,status:MessagingAutomationStatus.FAILED},
      data:{status:MessagingAutomationStatus.READY,lastError:null},
    });
    if(changed.count!==1){
      const row=await this.prisma.messagingAutomation.findUnique({where:{id}});
      return {outcome:'SKIPPED' as const,id,status:row?.status||'NOT_FOUND'};
    }
    await this.prisma.auditEvent.upsert({
      where:{id:auditId('automation.retry_ready',id)},
      create:{id:auditId('automation.retry_ready',id),unitId:(await this.prisma.messagingAutomation.findUniqueOrThrow({where:{id},select:{unitId:true}})).unitId,action:'automation.retry_ready',entityType:'MessagingAutomation',entityId:id,legacyPayload:{},occurredAt:new Date()},
      update:{},
    });
    return this.enqueueReady(id);
  }

  async processDue(limit=100,now=new Date()){
    const marked=await this.markDueReady(limit,now);
    const results=[];for(const id of marked.ids)results.push(await this.enqueueReady(id));
    return {marked,results};
  }
}
