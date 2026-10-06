import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingAutomationService } from './messaging-automation.service';

const SKIP_STATUSES=new Set(['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou','Concluído','Bloqueado']);
const INITIAL_AUTOMATION_TYPES=['BOOKING_CONFIRMATION','SIGNAL_REQUEST','APPOINTMENT_REMINDER'] as const;

function obj(value:unknown){
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

@Injectable()
export class BookingAutomationMaterializationService {
  constructor(
    private readonly prisma:PrismaService,
    private readonly automations:MessagingAutomationService,
  ){}

  async materializeCreatedBooking(bookingId:string){
    const booking=await this.prisma.booking.findUnique({
      where:{id:bookingId},
      select:{
        id:true,unitId:true,clientId:true,status:true,version:true,createdAt:true,legacyPayload:true,
        items:{
          orderBy:{sortOrder:'asc'},
          select:{id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,sortOrder:true},
        },
      },
    });
    if(!booking)throw new NotFoundException('Agendamento não encontrado para materialização de automações');
    const serviceItems=booking.items.filter(item=>!!item.serviceId);
    if(!booking.clientId||booking.items.length===0||serviceItems.length===0||SKIP_STATUSES.has(booking.status)){
      return {bookingId:booking.id,created:[],skipped:true};
    }

    const starts=booking.items.map(item=>item.startAt.getTime());
    const ends=booking.items.map(item=>item.startAt.getTime()+item.durationMin*60_000);
    const visitStartAt=new Date(Math.min(...starts));
    const visitEndAt=new Date(Math.max(...ends));
    const legacy=obj(booking.legacyPayload);
    const serviceIds=serviceItems.map(item=>String(item.serviceId));
    const payloadBase={
      bookingVersion:booking.version,
      bookingStatus:booking.status,
      bookingSource:String(legacy.source||'unknown'),
      itemCount:booking.items.length,
      serviceIds,
      professionalIds:booking.items.map(item=>item.professionalId),
      visitStartAt:visitStartAt.toISOString(),
      visitEndAt:visitEndAt.toISOString(),
    } satisfies Record<string,Prisma.JsonValue>;

    const specs=[
      {automationType:'BOOKING_CONFIRMATION',scheduledAt:booking.createdAt,payload:{...payloadBase,phase:'INITIAL_CONFIRMATION'}},
      {automationType:'SIGNAL_REQUEST',scheduledAt:booking.createdAt,payload:{...payloadBase,phase:'SIGNAL_LOGICAL_ONLY',financialDecision:'DEFERRED_TO_WA6'}},
      {automationType:'APPOINTMENT_REMINDER',scheduledAt:visitStartAt,payload:{...payloadBase,phase:'REMINDER_PLACEHOLDER_WA5_2'}},
    ] as const;

    const created=[];
    for(const spec of specs){
      const logicalKey='booking:'+booking.id+':'+spec.automationType;
      const generation=1;
      const row=await this.automations.create({
        unitId:booking.unitId,
        clientId:booking.clientId,
        bookingId:booking.id,
        sourceType:'BOOKING_CREATED',
        sourceId:booking.id,
        automationType:spec.automationType,
        scheduledAt:spec.scheduledAt,
        idempotencyKey:'wa5:booking-created:'+booking.id+':'+spec.automationType+':g'+generation,
        logicalKey,
        generation,
        payload:spec.payload as Prisma.InputJsonValue,
      });
      created.push(row);
    }
    return {bookingId:booking.id,created,skipped:false,types:[...INITIAL_AUTOMATION_TYPES]};
  }
}
