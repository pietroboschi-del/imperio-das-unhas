import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CANONICAL_MESSAGING_CHANNEL_IDS,
  UNIT_MESSAGING_CHANNEL_MAP,
  isMessagingChannelId,
  whatsappAutomationEnabled,
} from './messaging-channels';

export type QueueMessageInput={
  channelId:string;
  unitId?:string|null;
  clientId?:string|null;
  bookingId?:string|null;
  commandId?:string|null;
  idempotencyKey:string;
  messageType:string;
  trigger:string;
  payload:Prisma.InputJsonValue;
  nextAttemptAt?:Date|null;
};

function optionalId(value?:string|null){
  const normalized=String(value||'').trim();
  return normalized||null;
}

function stableValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    const row=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(row).sort().map(key=>[key,stableValue(row[key])]));
  }
  return value;
}

@Injectable()
export class MessagingFoundationService {
  constructor(private readonly prisma:PrismaService){}

  private bounded(value:string,label:string,max=120){
    const normalized=String(value||'').trim();
    if(!normalized)throw new ConflictException(label+' é obrigatório');
    if(normalized.length>max)throw new ConflictException(label+' excede o limite permitido');
    return normalized;
  }

  private requestHash(input:{
    channelId:string;
    unitId:string|null;
    clientId:string|null;
    bookingId:string|null;
    commandId:string|null;
    messageType:string;
    trigger:string;
    payload:Prisma.InputJsonValue;
  }){
    return createHash('sha256').update(JSON.stringify(stableValue(input))).digest('hex');
  }

  private async validateContext(unitId:string|null,clientId:string|null,bookingId:string|null,commandId:string|null){
    if((bookingId||commandId)&&!unitId)throw new ConflictException('unitId é obrigatório quando bookingId ou commandId estiver presente');
    const [unit,client,booking,command]=await Promise.all([
      unitId?this.prisma.unit.findUnique({where:{id:unitId},select:{id:true}}):Promise.resolve(null),
      clientId?this.prisma.client.findUnique({where:{id:clientId},select:{id:true}}):Promise.resolve(null),
      bookingId?this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,unitId:true,clientId:true}}):Promise.resolve(null),
      commandId?this.prisma.openCommand.findUnique({where:{id:commandId},select:{id:true,unitId:true,clientId:true}}):Promise.resolve(null),
    ]);
    if(unitId&&!unit)throw new NotFoundException('Unidade de contexto não encontrada');
    if(clientId&&!client)throw new NotFoundException('Cliente de contexto não encontrada');
    if(bookingId&&!booking)throw new NotFoundException('Agendamento de contexto não encontrado');
    if(commandId&&!command)throw new NotFoundException('Comanda de contexto não encontrada');
    if(booking&&unitId&&booking.unitId!==unitId)throw new ConflictException('Agendamento não pertence à unidade informada');
    if(command&&unitId&&command.unitId!==unitId)throw new ConflictException('Comanda não pertence à unidade informada');
    if(booking&&clientId&&booking.clientId&&booking.clientId!==clientId)throw new ConflictException('Agendamento não pertence à cliente informada');
    if(command&&clientId&&command.clientId&&command.clientId!==clientId)throw new ConflictException('Comanda não pertence à cliente informada');
  }

  async runtimeStatus(){
    const channels=await this.prisma.messagingChannel.findMany({
      select:{id:true,provider:true,enabled:true},
      orderBy:{id:'asc'},
    });
    return {
      automationEnabled:whatsappAutomationEnabled(),
      channels,
      unitRoutes:{...UNIT_MESSAGING_CHANNEL_MAP},
    };
  }

  async canDispatch(channelId:string){
    if(!whatsappAutomationEnabled())return false;
    const channel=await this.prisma.messagingChannel.findUnique({where:{id:channelId},select:{enabled:true}});
    return channel?.enabled===true;
  }

  async queueMessage(input:QueueMessageInput){
    const channelId=this.bounded(input.channelId,'channelId',80);
    if(!isMessagingChannelId(channelId))throw new ConflictException('Canal de comunicação não é canônico');
    const idempotencyKey=this.bounded(input.idempotencyKey,'Idempotency-Key',200);
    const messageType=this.bounded(input.messageType,'messageType',100);
    const trigger=this.bounded(input.trigger,'trigger',100);
    const unitId=optionalId(input.unitId),clientId=optionalId(input.clientId),bookingId=optionalId(input.bookingId),commandId=optionalId(input.commandId);
    const requestHash=this.requestHash({channelId,unitId,clientId,bookingId,commandId,messageType,trigger,payload:input.payload});

    const existing=await this.prisma.messagingOutbox.findUnique({where:{idempotencyKey}});
    if(existing){
      if(existing.requestHash!==requestHash)throw new ConflictException('Idempotency-Key já utilizada para outra mensagem');
      return existing;
    }

    const channel=await this.prisma.messagingChannel.findUnique({where:{id:channelId},select:{id:true,enabled:true,provider:true}});
    if(!channel)throw new NotFoundException('Canal de comunicação não encontrado');
    await this.validateContext(unitId,clientId,bookingId,commandId);

    try{
      return await this.prisma.$transaction(async tx=>{
        const raced=await tx.messagingOutbox.findUnique({where:{idempotencyKey}});
        if(raced){
          if(raced.requestHash!==requestHash)throw new ConflictException('Idempotency-Key já utilizada para outra mensagem');
          return raced;
        }
        const row=await tx.messagingOutbox.create({data:{
          channelId,
          unitId,
          clientId,
          bookingId,
          commandId,
          status:'PENDING',
          idempotencyKey,
          requestHash,
          messageType,
          trigger,
          payload:input.payload,
          attempts:0,
          nextAttemptAt:input.nextAttemptAt||null,
        }});
        await tx.auditEvent.create({data:{
          id:randomUUID(),
          unitId,
          action:'communication.queued',
          entityType:'MessagingOutbox',
          entityId:row.id,
          legacyPayload:{
            channelId,
            messageType,
            trigger,
            automationEnabled:whatsappAutomationEnabled(),
            channelEnabled:channel.enabled,
            provider:channel.provider,
          },
          occurredAt:new Date(),
        }});
        return row;
      });
    }catch(error){
      if((error as {code?:string})?.code==='P2002'){
        const raced=await this.prisma.messagingOutbox.findUnique({where:{idempotencyKey}});
        if(raced&&raced.requestHash===requestHash)return raced;
      }
      throw error;
    }
  }

  canonicalChannelIds(){
    return [...CANONICAL_MESSAGING_CHANNEL_IDS];
  }
}
