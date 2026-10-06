import { Injectable, NotFoundException } from '@nestjs/common';
import { MessagingAutomationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingAutomationMaterializationService } from './booking-automation-materialization.service';
import { MessagingAutomationService } from './messaging-automation.service';

const ACTIVE_STATUSES=[
  MessagingAutomationStatus.PENDING,
  MessagingAutomationStatus.READY,
  MessagingAutomationStatus.FAILED,
] as const;
const TERMINAL_BOOKING=new Set(['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou']);

@Injectable()
export class BookingAutomationLifecycleService {
  constructor(
    private readonly prisma:PrismaService,
    private readonly materializer:BookingAutomationMaterializationService,
    private readonly automations:MessagingAutomationService,
  ){}

  private async cancelRows(bookingId:string,whereGeneration:{lt?:number;equals?:number}|null,reason:string){
    const rows=await this.prisma.messagingAutomation.findMany({
      where:{
        bookingId,
        status:{in:[...ACTIVE_STATUSES]},
        ...(whereGeneration?{generation:whereGeneration}:{}),
      },
      select:{id:true},
      orderBy:[{generation:'asc'},{automationType:'asc'},{id:'asc'}],
    });
    for(const row of rows)await this.automations.cancel(row.id,reason);
    return rows.length;
  }

  async cancelForBooking(bookingId:string,reason='BOOKING_CANCELLED'){
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true}});
    if(!booking)throw new NotFoundException('Agendamento não encontrado para cancelamento de automações');
    const cancelled=await this.cancelRows(bookingId,null,reason);
    return {bookingId,cancelled};
  }

  async replaceForReschedule(bookingId:string){
    for(let attempt=0;attempt<5;attempt++){
      const booking=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,version:true,status:true}});
      if(!booking)throw new NotFoundException('Agendamento não encontrado para reagendamento de automações');
      if(TERMINAL_BOOKING.has(booking.status))return this.cancelForBooking(bookingId,'BOOKING_TERMINAL_DURING_RESCHEDULE');
      const generation=booking.version;

      await this.cancelRows(bookingId,{lt:generation},'BOOKING_RESCHEDULED_SUPERSEDED');
      await this.materializer.materializeBookingGeneration(bookingId,generation,'BOOKING_RESCHEDULED');

      const latest=await this.prisma.booking.findUnique({where:{id:bookingId},select:{version:true,status:true}});
      if(!latest)throw new NotFoundException('Agendamento removido durante reagendamento de automações');
      if(TERMINAL_BOOKING.has(latest.status)){
        await this.cancelForBooking(bookingId,'BOOKING_TERMINAL_DURING_RESCHEDULE');
        return {bookingId,generation:latest.version,replaced:false,terminal:true};
      }
      if(latest.version===generation){
        return {bookingId,generation,replaced:true,terminal:false};
      }
      await this.cancelRows(bookingId,{equals:generation},'CONCURRENT_RESCHEDULE_SUPERSEDED');
    }
    throw new Error('Não foi possível estabilizar geração de automações após reagendamentos concorrentes');
  }
}
