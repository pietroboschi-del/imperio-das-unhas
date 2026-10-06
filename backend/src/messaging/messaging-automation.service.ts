import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { MessagingAutomationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateMessagingAutomationInput={
  unitId:string;
  clientId?:string|null;
  bookingId?:string|null;
  sourceType:string;
  sourceId:string;
  automationType:string;
  scheduledAt:Date;
  idempotencyKey:string;
  logicalKey:string;
  generation?:number;
  payload?:Prisma.InputJsonValue|null;
};

function stableValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    const row=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(row).sort().map(key=>[key,stableValue(row[key])]));
  }
  return value;
}

@Injectable()
export class MessagingAutomationService {
  constructor(private readonly prisma:PrismaService){}

  private bounded(value:string,label:string,max=200){
    const normalized=String(value||'').trim();
    if(!normalized)throw new ConflictException(label+' é obrigatório');
    if(normalized.length>max)throw new ConflictException(label+' excede o limite permitido');
    return normalized;
  }

  private generation(value?:number){
    const generation=value===undefined?1:Number(value);
    if(!Number.isInteger(generation)||generation<1)throw new ConflictException('generation deve ser inteiro positivo');
    return generation;
  }

  private requestHash(input:{
    unitId:string;clientId:string|null;bookingId:string|null;sourceType:string;sourceId:string;
    automationType:string;scheduledAt:string;logicalKey:string;generation:number;payload:unknown;
  }){
    return createHash('sha256').update(JSON.stringify(stableValue(input))).digest('hex');
  }

  private async validateContext(unitId:string,clientId:string|null,bookingId:string|null){
    const [unit,client,booking]=await Promise.all([
      this.prisma.unit.findUnique({where:{id:unitId},select:{id:true}}),
      clientId?this.prisma.client.findUnique({where:{id:clientId},select:{id:true}}):Promise.resolve(null),
      bookingId?this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,unitId:true,clientId:true}}):Promise.resolve(null),
    ]);
    if(!unit)throw new NotFoundException('Unidade de contexto não encontrada');
    if(clientId&&!client)throw new NotFoundException('Cliente de contexto não encontrada');
    if(bookingId&&!booking)throw new NotFoundException('Agendamento de contexto não encontrado');
    if(booking&&booking.unitId!==unitId)throw new ConflictException('Agendamento não pertence à unidade informada');
    if(booking&&clientId&&booking.clientId&&booking.clientId!==clientId)throw new ConflictException('Agendamento não pertence à cliente informada');
  }

  async create(input:CreateMessagingAutomationInput){
    const unitId=this.bounded(input.unitId,'unitId',128);
    const clientId=String(input.clientId||'').trim()||null;
    const bookingId=String(input.bookingId||'').trim()||null;
    const sourceType=this.bounded(input.sourceType,'sourceType',100);
    const sourceId=this.bounded(input.sourceId,'sourceId',200);
    const automationType=this.bounded(input.automationType,'automationType',100);
    const idempotencyKey=this.bounded(input.idempotencyKey,'Idempotency-Key',200);
    const logicalKey=this.bounded(input.logicalKey,'logicalKey',240);
    const generation=this.generation(input.generation);
    const scheduledAt=new Date(input.scheduledAt);
    if(Number.isNaN(scheduledAt.getTime()))throw new ConflictException('scheduledAt inválido');
    const payload=input.payload??Prisma.JsonNull;
    const requestHash=this.requestHash({
      unitId,clientId,bookingId,sourceType,sourceId,automationType,
      scheduledAt:scheduledAt.toISOString(),logicalKey,generation,payload,
    });

    const existing=await this.prisma.messagingAutomation.findUnique({where:{idempotencyKey}});
    if(existing){
      if(existing.requestHash!==requestHash)throw new ConflictException('Idempotency-Key já utilizada para outra automação');
      return existing;
    }
    await this.validateContext(unitId,clientId,bookingId);

    try{
      return await this.prisma.$transaction(async tx=>{
        const raced=await tx.messagingAutomation.findUnique({where:{idempotencyKey}});
        if(raced){
          if(raced.requestHash!==requestHash)throw new ConflictException('Idempotency-Key já utilizada para outra automação');
          return raced;
        }
        const logical=await tx.messagingAutomation.findUnique({where:{logicalKey_generation:{logicalKey,generation}}});
        if(logical){
          if(logical.requestHash===requestHash)return logical;
          throw new ConflictException('logicalKey/generation já identifica outra automação');
        }
        const row=await tx.messagingAutomation.create({data:{
          unitId,clientId,bookingId,sourceType,sourceId,automationType,
          status:MessagingAutomationStatus.PENDING,scheduledAt,idempotencyKey,requestHash,
          logicalKey,generation,payload,
        }});
        await tx.auditEvent.create({data:{
          id:randomUUID(),unitId,action:'automation.created',entityType:'MessagingAutomation',entityId:row.id,
          legacyPayload:{sourceType,sourceId,automationType,logicalKey,generation,scheduledAt:scheduledAt.toISOString()},
          occurredAt:new Date(),
        }});
        return row;
      });
    }catch(error){
      if((error as {code?:string})?.code==='P2002'){
        const raced=await this.prisma.messagingAutomation.findUnique({where:{idempotencyKey}});
        if(raced){
          if(raced.requestHash===requestHash)return raced;
          throw new ConflictException('Idempotency-Key já utilizada para outra automação');
        }
        const logical=await this.prisma.messagingAutomation.findUnique({where:{logicalKey_generation:{logicalKey,generation}}});
        if(logical){
          if(logical.requestHash===requestHash)return logical;
          throw new ConflictException('logicalKey/generation já identifica outra automação');
        }
      }
      throw error;
    }
  }

  async cancel(id:string,reason='cancelled'){
    const automationId=this.bounded(id,'automationId',200);
    const cancellationReason=this.bounded(reason,'reason',300);
    const current=await this.prisma.messagingAutomation.findUnique({where:{id:automationId}});
    if(!current)throw new NotFoundException('Automação não encontrada');
    if(current.status===MessagingAutomationStatus.CANCELLED)return current;
    if(current.status===MessagingAutomationStatus.DONE||current.status===MessagingAutomationStatus.ENQUEUED){
      throw new ConflictException('Automação já avançou além do ponto de cancelamento isolado');
    }
    return this.prisma.$transaction(async tx=>{
      const now=new Date();
      const updated=await tx.messagingAutomation.updateMany({
        where:{id:automationId,status:{in:[
          MessagingAutomationStatus.PENDING,
          MessagingAutomationStatus.READY,
          MessagingAutomationStatus.FAILED,
        ]}},
        data:{status:MessagingAutomationStatus.CANCELLED,cancelledAt:now,lastError:null},
      });
      const row=await tx.messagingAutomation.findUnique({where:{id:automationId}});
      if(!row)throw new NotFoundException('Automação não encontrada');
      if(updated.count===1){
        await tx.auditEvent.create({data:{
          id:randomUUID(),unitId:row.unitId,action:'automation.cancelled',entityType:'MessagingAutomation',entityId:row.id,
          legacyPayload:{reason:cancellationReason,sourceType:row.sourceType,sourceId:row.sourceId,automationType:row.automationType,logicalKey:row.logicalKey,generation:row.generation},
          occurredAt:now,
        }});
      }
      return row;
    });
  }
}
