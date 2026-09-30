import { Body, ConflictException, Controller, Headers, NotFoundException, Post, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';
import { PublicBookingDto } from './public-booking.dto';

@Controller('api/v1/public')
export class PublicBookingController {
 constructor(private readonly prisma:PrismaService){}
 private enabled(){if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException('Agendamento online central ainda não habilitado neste ambiente')}
 private id(scope:string,key?:string){const k=String(key||'').trim();return k?'pub_'+createHash('sha256').update(scope+'|'+k).digest('hex').slice(0,40):randomUUID()}
 @Public() @Post('bookings')
 async book(@Body() b:PublicBookingDto,@Headers('idempotency-key') key?:string){
  this.enabled();const startAt=new Date(b.startAt+':00-03:00');if(Number.isNaN(startAt.getTime()))throw new ConflictException('Horário inválido');const serviceDate=new Date(b.startAt.slice(0,10)+'T00:00:00.000Z');const bookingId=this.id(b.unitId+'|site-booking',key);
  return this.prisma.$transaction(async tx=>{const prior=await tx.booking.findUnique({where:{id:bookingId}});if(prior)return prior;
   const unit=await tx.unit.findFirst({where:{id:b.unitId,active:true}});if(!unit)throw new NotFoundException('Unidade indisponível');
   const service=await tx.service.findFirst({where:{id:b.serviceId,active:true}});if(!service)throw new NotFoundException('Serviço indisponível');
   const pro=await tx.professionalUnit.findFirst({where:{unitId:b.unitId,professionalId:b.professionalId,active:true,professional:{active:true}}});if(!pro)throw new NotFoundException('Profissional indisponível nesta unidade');
   const endAt=new Date(startAt.getTime()+service.durationMin*60000);const candidates=await tx.booking.findMany({where:{unitId:b.unitId,professionalId:b.professionalId,startAt:{gte:new Date(startAt.getTime()-12*60*60*1000),lt:endAt},status:{notIn:['CANCELLED','CANCELED']}}});for(const x of candidates){if(!x.startAt)continue;const xs=x.startAt.getTime(),xe=xs+service.durationMin*60000;if(xs<endAt.getTime()&&xe>startAt.getTime())throw new ConflictException('Horário não está mais disponível');}
   const phone=b.clientPhone.replace(/\D/g,'');let client=await tx.client.findFirst({where:{phone,active:true}});if(!client)client=await tx.client.create({data:{id:randomUUID(),name:b.clientName,phone,email:b.clientEmail||null,registrationUnitId:b.unitId,active:true,legacyPayload:{source:'website'}}});
   await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:client.id,unitId:b.unitId}},create:{clientId:client.id,unitId:b.unitId,source:'website',active:true},update:{active:true}});
   const row=await tx.booking.create({data:{id:bookingId,unitId:b.unitId,clientId:client.id,serviceDate,startAt,serviceId:b.serviceId,professionalId:b.professionalId,status:'SCHEDULED',notes:null,legacyPayload:{source:'website',authorType:'CLIENT',durationMin:service.durationMin}}});
   await tx.auditEvent.create({data:{id:randomUUID(),unitId:b.unitId,action:'booking.created_online',entityType:'Booking',entityId:row.id,legacyPayload:{source:'website',clientId:client.id,serviceId:b.serviceId,professionalId:b.professionalId},occurredAt:new Date()}});return row;});
 }
}
