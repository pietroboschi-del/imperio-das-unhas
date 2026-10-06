import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingAutomationService } from './messaging-automation.service';

@Injectable()
export class PostServiceAutomationMaterializationService {
  constructor(
    private readonly prisma:PrismaService,
    private readonly automations:MessagingAutomationService,
  ){}

  async materializeCompletedBooking(bookingId:string){
    const booking=await this.prisma.booking.findUnique({
      where:{id:bookingId},
      select:{
        id:true,unitId:true,clientId:true,status:true,
        items:{
          orderBy:{sortOrder:'asc'},
          select:{
            id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,sortOrder:true,
            service:{select:{id:true,name:true,legacyPayload:true}},
          },
        },
      },
    });
    if(!booking)throw new NotFoundException('Agendamento não encontrado para pós-atendimento');
    if(booking.status!=='Concluído')return {bookingId,created:[],skipped:true,reason:'BOOKING_NOT_COMPLETED'};
    if(!booking.clientId||!booking.items.some(item=>!!item.serviceId))return {bookingId,created:[],skipped:true,reason:'NO_CLIENT_OR_SERVICE'};

    const completionAudit=await this.prisma.auditEvent.findFirst({
      where:{
        entityType:'Booking',entityId:booking.id,action:'booking.updated',
        legacyPayload:{path:['status'],equals:'Concluído'},
      },
      orderBy:[{occurredAt:'asc'},{id:'asc'}],
      select:{occurredAt:true,id:true},
    });
    if(!completionAudit)return {bookingId,created:[],skipped:true,reason:'COMPLETION_EVENT_NOT_FOUND'};
    const eventAt=completionAudit.occurredAt;
    const items=booking.items.filter(item=>!!item.serviceId).map(item=>({
      bookingItemId:item.id,
      serviceId:String(item.serviceId),
      serviceName:item.service?.name||null,
      professionalId:item.professionalId,
      startAt:item.startAt.toISOString(),
      durationMin:item.durationMin,
      sortOrder:item.sortOrder,
    }));

    const specs=[
      {automationType:'POST_SERVICE',phase:'POST_SERVICE_COMPLETED'},
      {automationType:'FEEDBACK_REQUEST',phase:'FEEDBACK_AFTER_COMPLETION'},
    ] as const;
    const created=[];
    for(const spec of specs){
      const row=await this.automations.create({
        unitId:booking.unitId,
        clientId:booking.clientId,
        bookingId:booking.id,
        sourceType:'BOOKING_COMPLETED',
        sourceId:booking.id,
        automationType:spec.automationType,
        scheduledAt:eventAt,
        idempotencyKey:'wa5:booking-completed:'+booking.id+':'+spec.automationType,
        logicalKey:'booking-completed:'+booking.id+':'+spec.automationType,
        generation:1,
        payload:{
          completionAuditId:completionAudit.id,
          completedAt:eventAt.toISOString(),
          bookingStatus:booking.status,
          items,
          itemCount:items.length,
          returnAutomationConfigured:false,
          reactivationAutomationConfigured:false,
          phase:spec.phase,
        } as Prisma.InputJsonValue,
      });
      created.push(row);
    }
    return {bookingId,created,skipped:false,types:created.map(x=>x.automationType)};
  }
}
