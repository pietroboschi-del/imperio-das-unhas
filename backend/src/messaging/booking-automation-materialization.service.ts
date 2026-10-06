import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingAutomationService } from './messaging-automation.service';

const SKIP_STATUSES=new Set(['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou','Concluído','Bloqueado']);
const HOUR_MS=60*60*1000;
const DAY_MS=24*HOUR_MS;
const INITIAL_AUTOMATION_TYPES=['BOOKING_CONFIRMATION','SIGNAL_REQUEST','SIGNAL_REMINDER','APPOINTMENT_REMINDER'] as const;

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
    return this.materializeBookingGeneration(bookingId,1,'BOOKING_CREATED');
  }

  async materializeBookingGeneration(bookingId:string,generation:number,sourceType='BOOKING_RESCHEDULED'){
    if(!Number.isInteger(generation)||generation<1)throw new Error('generation inválida para materialização');
    const booking=await this.prisma.booking.findUnique({
      where:{id:bookingId},
      select:{
        id:true,unitId:true,clientId:true,status:true,version:true,createdAt:true,updatedAt:true,legacyPayload:true,
        items:{
          orderBy:{sortOrder:'asc'},
          select:{id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,sortOrder:true},
        },
      },
    });
    if(!booking)throw new NotFoundException('Agendamento não encontrado para materialização de automações');
    const unit=await this.prisma.unit.findUnique({where:{id:booking.unitId},select:{timezone:true}});
    if(!unit?.timezone)throw new NotFoundException('Timezone canônico da unidade não encontrado');
    new Intl.DateTimeFormat('en-US',{timeZone:unit.timezone}).format(new Date());

    const serviceItems=booking.items.filter(item=>!!item.serviceId);
    if(!booking.clientId||booking.items.length===0||serviceItems.length===0||SKIP_STATUSES.has(booking.status)){
      return {bookingId:booking.id,created:[],skipped:true};
    }

    const starts=booking.items.map(item=>item.startAt.getTime());
    if(booking.items.some(item=>item.durationMin==null))throw new Error('BookingItem sem duração histórica confiável; automação não materializada');
    const ends=booking.items.map(item=>item.startAt.getTime()+Number(item.durationMin)*60_000);
    const visitStartAt=new Date(Math.min(...starts));
    const visitEndAt=new Date(Math.max(...ends));
    const legacy=obj(booking.legacyPayload);
    const serviceIds=serviceItems.map(item=>String(item.serviceId));
    const eventAt=generation===1?booking.createdAt:booking.updatedAt;
    const payloadBase={
      bookingVersion:booking.version,
      bookingStatus:booking.status,
      bookingSource:String(legacy.source||'unknown'),
      itemCount:booking.items.length,
      serviceIds,
      professionalIds:booking.items.map(item=>item.professionalId),
      visitStartAt:visitStartAt.toISOString(),
      visitEndAt:visitEndAt.toISOString(),
      businessTimezone:unit.timezone,
    } satisfies Record<string,Prisma.JsonValue>;

    const specs:Array<{automationType:string;scheduledAt:Date;payload:Prisma.InputJsonValue}>=[
      {automationType:'BOOKING_CONFIRMATION',scheduledAt:eventAt,payload:{...payloadBase,phase:'INITIAL_CONFIRMATION'} as Prisma.InputJsonValue},
      {automationType:'SIGNAL_REQUEST',scheduledAt:eventAt,payload:{...payloadBase,phase:'SIGNAL_LOGICAL_ONLY',financialDecision:'DEFERRED_TO_WA6'} as Prisma.InputJsonValue},
    ];

    const signalReminderAt=new Date(eventAt.getTime()+DAY_MS);
    if(signalReminderAt.getTime()<visitStartAt.getTime()){
      specs.push({
        automationType:'SIGNAL_REMINDER',
        scheduledAt:signalReminderAt,
        payload:{...payloadBase,phase:'SIGNAL_REMINDER_LOGICAL_ONLY',financialDecision:'DEFERRED_TO_WA6',cancelWhenSignalConfirmed:true} as Prisma.InputJsonValue,
      });
    }

    const leadMs=visitStartAt.getTime()-eventAt.getTime();
    const appointmentReminderAt=
      leadMs>=DAY_MS?new Date(visitStartAt.getTime()-DAY_MS):
      leadMs>2*HOUR_MS?new Date(visitStartAt.getTime()-2*HOUR_MS):
      null;
    if(appointmentReminderAt&&appointmentReminderAt.getTime()>=eventAt.getTime()){
      specs.push({
        automationType:'APPOINTMENT_REMINDER',
        scheduledAt:appointmentReminderAt,
        payload:{...payloadBase,phase:'APPOINTMENT_REMINDER',leadRuleHours:leadMs>=DAY_MS?24:2} as Prisma.InputJsonValue,
      });
    }

    const created=[];
    for(const spec of specs){
      const logicalKey='booking:'+booking.id+':'+spec.automationType;
      const row=await this.automations.create({
        unitId:booking.unitId,
        clientId:booking.clientId,
        bookingId:booking.id,
        sourceType,
        sourceId:booking.id,
        automationType:spec.automationType,
        scheduledAt:spec.scheduledAt,
        idempotencyKey:'wa5:booking:'+booking.id+':'+spec.automationType+':g'+generation,
        logicalKey,
        generation,
        payload:spec.payload,
      });
      created.push(row);
    }
    return {bookingId:booking.id,created,skipped:false,types:created.map(row=>row.automationType),supportedTypes:[...INITIAL_AUTOMATION_TYPES]};
  }
}
