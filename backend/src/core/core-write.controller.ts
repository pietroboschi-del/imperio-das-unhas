import { Body, ConflictException, Controller, Headers, NotFoundException, Post, Req } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { CreateBookingDto, CreateClientDto } from './core-write.dto';

@Controller('api/v1')
export class CoreWriteController {
  constructor(private readonly prisma: PrismaService) {}

  private operationId(unitId:string,key?:string){
    if(!key)return randomUUID();
    const normalized=String(key).trim();
    if(!normalized||normalized.length>200)throw new ConflictException('Idempotency-Key inválida');
    return 'op_'+createHash('sha256').update(unitId+'|'+normalized).digest('hex').slice(0,40);
  }

  @Post('clients')
  @UnitScoped()
  @RequirePermissions('clients.manage')
  async createClient(@Req() req:ImperioRequest,@Body() body:CreateClientDto,@Headers('idempotency-key') key?:string){
    assertOperationalWriteEnabled(req.unitId!);
    const rawPhone=body.phone?.trim()||null,phone=rawPhone?rawPhone.replace(/\\D/g,''):null,email=body.email?.trim().toLowerCase()||null;
    if(!phone&&!email)throw new ConflictException('Informe telefone ou e-mail para identificar o cliente na rede');
    const duplicate=await this.prisma.client.findFirst({where:{active:true,OR:[...(phone?[{phone}]:[]),...(email?[{email}]:[])]}});
    if(duplicate){
      const link=await this.prisma.clientUnitLink.findUnique({where:{clientId_unitId:{clientId:duplicate.id,unitId:req.unitId!}}});
      if(!link||!link.active){
        await this.prisma.$transaction(async tx=>{
          await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:duplicate.id,unitId:req.unitId!}},create:{clientId:duplicate.id,unitId:req.unitId!,source:'operational'},update:{active:true}});
          await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.linked_to_unit',entityType:'Client',entityId:duplicate.id,legacyPayload:{source:'central_api',deduplicated:true},occurredAt:new Date()}});
        });
      }
      return duplicate;
    }
    const id=this.operationId('client',key);
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.client.findUnique({where:{id}});
      if(existing)return existing;
      const client=await tx.client.create({data:{id,name:body.name.trim(),phone,email,registrationUnitId:req.unitId!,unitLinks:{create:{unitId:req.unitId!,source:'operational'}}}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.created',entityType:'Client',entityId:id,legacyPayload:{source:'central_api'},occurredAt:new Date()}});
      return client;
    });
  }

  @Post('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async createBooking(@Req() req:ImperioRequest,@Body() body:CreateBookingDto,@Headers('idempotency-key') key?:string){
    assertOperationalWriteEnabled(req.unitId!);
    const [unit,service,professional,client]=await Promise.all([
      this.prisma.unit.findFirst({where:{id:req.unitId!,active:true}}),
      this.prisma.service.findFirst({where:{id:body.serviceId,active:true}}),
      this.prisma.professional.findFirst({where:{id:body.professionalId,active:true,units:{some:{unitId:req.unitId!,active:true}}}}),
      body.clientId?this.prisma.client.findFirst({where:{id:body.clientId,active:true}}):Promise.resolve(null),
    ]);
    if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');
    if(!service)throw new NotFoundException('Serviço não encontrado ou inativo');
    if(!professional)throw new NotFoundException('Profissional não atende nesta unidade');
    if(body.clientId&&!client)throw new NotFoundException('Cliente não encontrado ou inativo');
    const id=this.operationId(req.unitId!,key);
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}), hashtext(${body.professionalId+'|'+body.serviceDate}))`;
      const existing=await tx.booking.findUnique({where:{id}});
      if(existing)return existing;
      const startAt=new Date(body.startAt);
      if(Number.isNaN(startAt.getTime()))throw new ConflictException('Horário inválido');
      const endAt=new Date(startAt.getTime()+service.durationMin*60000);
      const candidates=await tx.booking.findMany({where:{unitId:req.unitId!,professionalId:body.professionalId,startAt:{gte:new Date(startAt.getTime()-12*60*60*1000),lt:endAt},status:{notIn:['CANCELLED','CANCELED','Cancelado','CANCELADO']}},include:{service:{select:{durationMin:true}}}});
      for(const x of candidates){
        if(!x.startAt)continue;
        const xs=x.startAt.getTime();
        const existingDuration=x.service?.durationMin||Number((x.legacyPayload as any)?.durationMin)||60;
        const xe=xs+existingDuration*60000;
        if(xs<endAt.getTime()&&xe>startAt.getTime())throw new ConflictException('Horário não está mais disponível');
      }
      const booking=await tx.booking.create({data:{id,unitId:req.unitId!,clientId:body.clientId||null,serviceId:body.serviceId,professionalId:body.professionalId,serviceDate:new Date(body.serviceDate+'T00:00:00.000Z'),startAt,notes:body.notes?.trim()||null,status:body.status||'Agendado',legacyPayload:{source:'central_api',durationMin:service.durationMin}}});
      if(body.clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:body.clientId,unitId:req.unitId!}},create:{clientId:body.clientId,unitId:req.unitId!,source:'booking'},update:{active:true}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'booking.created',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',serviceId:body.serviceId,professionalId:body.professionalId},occurredAt:new Date()}});
      return booking;
    });
  }
}
