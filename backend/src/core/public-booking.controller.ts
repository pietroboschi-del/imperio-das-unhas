import { Body, ConflictException, Controller, Headers, NotFoundException, Post, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';
import { PublicBookingDto } from './public-booking.dto';

const TERMINAL=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

@Controller('api/v1/public')
export class PublicBookingController {
 constructor(private readonly prisma:PrismaService){}
 private enabled(){if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException('Agendamento online central ainda não habilitado neste ambiente')}
 private id(scope:string,key?:string){const k=String(key||'').trim();return k?'pub_'+createHash('sha256').update(scope+'|'+k).digest('hex').slice(0,40):randomUUID()}
 private startAt(value:string){const iso=value.length===16?value+':00-03:00':value+'-03:00';const date=new Date(iso);if(Number.isNaN(date.getTime()))throw new ConflictException('Horário inválido');return date}
 private normName(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
 private canDo(proLegacy:any,serviceLegacy:any,professionalId:string,serviceId:string){const services=Array.isArray(proLegacy?.services)?proLegacy.services.map(String):[],rule=serviceLegacy?.proRules&&typeof serviceLegacy.proRules==='object'?serviceLegacy.proRules[professionalId]:undefined;if(rule?.enabled===false)return false;if(rule?.enabled===true)return true;return services.length?services.includes(serviceId):true}
 @Public() @Post('bookings')
 async book(@Body() b:PublicBookingDto,@Headers('idempotency-key') key?:string){
  this.enabled();const startAt=this.startAt(b.startAt);const serviceDate=new Date(b.startAt.slice(0,10)+'T00:00:00.000Z');const bookingId=this.id(b.unitId+'|site-booking',key);
  return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${b.unitId}), hashtext(${b.professionalId+'|'+b.startAt.slice(0,10)}))`;const prior=await tx.booking.findUnique({where:{id:bookingId},include:{items:true}});if(prior)return prior;
   const unit=await tx.unit.findFirst({where:{id:b.unitId,active:true}});if(!unit)throw new NotFoundException('Unidade indisponível');
   const service=await tx.service.findFirst({where:{id:b.serviceId,active:true},select:{id:true,price:true,durationMin:true,legacyPayload:true}});if(!service)throw new NotFoundException('Serviço indisponível');
   const pro=await tx.professionalUnit.findFirst({where:{unitId:b.unitId,professionalId:b.professionalId,active:true,professional:{active:true}},select:{professional:{select:{legacyPayload:true}}}});if(!pro)throw new NotFoundException('Profissional indisponível nesta unidade');
   if(!this.canDo(pro.professional.legacyPayload,service.legacyPayload,b.professionalId,b.serviceId))throw new ConflictException('Profissional não executa este serviço');
   const rule=(service.legacyPayload as any)?.proRules?.[b.professionalId],duration=Math.max(1,Number(rule?.duration??service.durationMin??30)),unitPrice=new Prisma.Decimal(Number(rule?.price??service.price??0).toFixed(2)),endAt=new Date(startAt.getTime()+duration*60000);
   const candidates=await tx.bookingItem.findMany({where:{unitId:b.unitId,professionalId:b.professionalId,startAt:{gte:new Date(startAt.getTime()-12*60*60*1000),lt:endAt},booking:{status:{notIn:TERMINAL}}},select:{startAt:true,durationMin:true}});for(const x of candidates){const xs=x.startAt.getTime(),xe=xs+x.durationMin*60000;if(xs<endAt.getTime()&&xe>startAt.getTime())throw new ConflictException('Horário não está mais disponível')}
   const digits=b.clientPhone.replace(/\D/g,'');if(!digits)throw new ConflictException('Celular inválido');const phone=digits.startsWith('55')&&digits.length>=12?'+'+digits:(digits.length===10||digits.length===11?'+55'+digits:'+'+digits);const samePhone=await tx.client.findMany({where:{phone,active:true},take:30});let client=samePhone.find(x=>this.normName(x.name)===this.normName(b.clientName));if(!client)client=await tx.client.create({data:{id:randomUUID(),name:b.clientName,phone,email:b.clientEmail||null,registrationUnitId:b.unitId,active:true,legacyPayload:{source:'website'}}});
   await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:client.id,unitId:b.unitId}},create:{clientId:client.id,unitId:b.unitId,source:'website',active:true},update:{active:true}});
   const itemId='bi_'+createHash('sha256').update(bookingId+'|0').digest('hex').slice(0,40);
   const row=await tx.booking.create({data:{id:bookingId,unitId:b.unitId,clientId:client.id,serviceDate,startAt,serviceId:b.serviceId,professionalId:b.professionalId,status:'Agendado',notes:null,legacyPayload:{source:'website',authorType:'CLIENT',multiItem:true},items:{create:{id:itemId,unitId:b.unitId,serviceId:b.serviceId,professionalId:b.professionalId,startAt,durationMin:duration,unitPrice,preference:false,forceFit:false,sortOrder:0,legacyPayload:{source:'website'}}}},include:{items:true}});
   await tx.auditEvent.create({data:{id:randomUUID(),unitId:b.unitId,action:'booking.created_online',entityType:'Booking',entityId:row.id,legacyPayload:{source:'website',clientId:client.id,serviceId:b.serviceId,professionalId:b.professionalId},occurredAt:new Date()}});return row;});
 }
}
