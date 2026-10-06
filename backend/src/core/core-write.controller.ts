import { Body, ConflictException, Controller, Headers, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { CreateBookingDto, CreateClientDto, UpdateBookingDto } from './core-write.dto';

@Controller('api/v1')
export class CoreWriteController {
  constructor(private readonly prisma: PrismaService) {}

  private operationId(scope:string,key?:string){
    if(!key)return randomUUID();
    const normalized=String(key).trim();
    if(!normalized||normalized.length>200)throw new ConflictException('Idempotency-Key inválida');
    return 'op_'+createHash('sha256').update(scope+'|'+normalized).digest('hex').slice(0,40);
  }

  private isCancelled(status?:string){
    return ['CANCELLED','CANCELED','Cancelado','CANCELADO'].includes(String(status||''));
  }

  private storedItems(row:any){
    const payload=(row?.legacyPayload&&typeof row.legacyPayload==='object')?row.legacyPayload:{};
    const src=Array.isArray(payload.items)&&payload.items.length?payload.items:null;
    if(src)return src.map((x:any)=>({
      serviceId:String(x.serviceId||''),
      professionalId:String(x.professionalId||x.pro||''),
      startAt:String(x.startAt||''),
      durationMin:Number(x.durationMin||x.duration||30),
      price:Number(x.price||0),
      clientArea:String(x.clientArea||'none'),
      mustFinishBeforeSameArea:!!x.mustFinishBeforeSameArea,
      preference:!!x.preference,
      forceFit:!!x.forceFit,
    }));
    if(!row?.serviceId||!row?.professionalId||!row?.startAt)return [];
    const serviceLegacy=(row.service?.legacyPayload&&typeof row.service.legacyPayload==='object')?row.service.legacyPayload:{};
    return [{
      serviceId:row.serviceId,
      professionalId:row.professionalId,
      startAt:new Date(row.startAt).toISOString(),
      durationMin:Number(row.service?.durationMin||payload.durationMin||30),
      price:Number(row.service?.price||0),
      clientArea:String(serviceLegacy.clientArea||'none'),
      mustFinishBeforeSameArea:!!serviceLegacy.mustFinishBeforeSameArea,
      preference:false,
      forceFit:false,
    }];
  }

  private overlaps(a:any,b:any){
    const as=new Date(a.startAt).getTime(),bs=new Date(b.startAt).getTime();
    if(!Number.isFinite(as)||!Number.isFinite(bs))return false;
    return as+Number(a.durationMin||30)*60000>bs&&bs+Number(b.durationMin||30)*60000>as;
  }

  private areaIssue(a:any,b:any){
    if(a.clientArea==='none'||b.clientArea==='none'||!a.clientArea||a.clientArea!==b.clientArea)return false;
    const as=new Date(a.startAt).getTime(),bs=new Date(b.startAt).getTime();
    const ae=as+Number(a.durationMin||30)*60000,be=bs+Number(b.durationMin||30)*60000;
    if(a.mustFinishBeforeSameArea&&!b.mustFinishBeforeSameArea&&bs<ae)return true;
    if(b.mustFinishBeforeSameArea&&!a.mustFinishBeforeSameArea&&as<be)return true;
    return as<be&&bs<ae;
  }

  private async resolveItems(tx:any,unitId:string,body:any){
    const raw=Array.isArray(body.items)&&body.items.length
      ? body.items
      : (body.serviceId&&body.professionalId&&body.startAt?[{serviceId:body.serviceId,professionalId:body.professionalId,startAt:body.startAt}]:[]);
    if(!raw.length)throw new ConflictException('Informe pelo menos um serviço no agendamento');
    if(raw.length>12)throw new ConflictException('Quantidade de serviços acima do limite operacional');
    for(const x of raw){
      if(!x||!String(x.serviceId||'').trim()||!String(x.professionalId||'').trim()||!String(x.startAt||'').trim())throw new ConflictException('Serviço, profissional e horário são obrigatórios em todos os itens');
      if(Number.isNaN(new Date(x.startAt).getTime()))throw new ConflictException('Horário inválido em um dos serviços');
    }
    const serviceIds=[...new Set(raw.map((x:any)=>String(x.serviceId)))];
    const professionalIds=[...new Set(raw.map((x:any)=>String(x.professionalId)))];
    const [services,professionals]=await Promise.all([
      tx.service.findMany({where:{id:{in:serviceIds},active:true}}),
      tx.professional.findMany({where:{id:{in:professionalIds},active:true,units:{some:{unitId,active:true}}}}),
    ]);
    const sm=new Map(services.map((x:any)=>[x.id,x])),pm=new Map(professionals.map((x:any)=>[x.id,x]));
    const items=raw.map((x:any)=>{
      const service:any=sm.get(String(x.serviceId)),professional:any=pm.get(String(x.professionalId));
      if(!service)throw new NotFoundException('Serviço não encontrado ou inativo');
      if(!professional)throw new NotFoundException('Profissional não atende nesta unidade');
      const sl=(service.legacyPayload&&typeof service.legacyPayload==='object')?service.legacyPayload:{};
      const pl=(professional.legacyPayload&&typeof professional.legacyPayload==='object')?professional.legacyPayload:{};
      const rule=(sl.proRules&&typeof sl.proRules==='object')?sl.proRules[String(x.professionalId)]:null;
      if(rule&&rule.enabled===false)throw new ConflictException('Profissional não executa este serviço');
      if(!rule&&Array.isArray(pl.services)&&pl.services.length&&!pl.services.includes(String(x.serviceId)))throw new ConflictException('Profissional não executa este serviço');
      const duration=Number(rule?.duration??service.durationMin);
      const price=Number(rule?.price??service.price);
      if(!Number.isFinite(duration)||duration<=0)throw new ConflictException('Duração inválida para serviço/profissional');
      if(!Number.isFinite(price)||price<0)throw new ConflictException('Preço inválido para serviço/profissional');
      return {
        serviceId:service.id,
        professionalId:professional.id,
        startAt:new Date(x.startAt).toISOString(),
        durationMin:duration,
        price,
        clientArea:String(sl.clientArea||'none'),
        mustFinishBeforeSameArea:!!sl.mustFinishBeforeSameArea,
        preference:!!x.preference,
        forceFit:!!x.forceFit,
      };
    });
    for(let i=0;i<items.length;i++)for(let j=0;j<i;j++){
      const a=items[i],b=items[j];
      if(a.professionalId===b.professionalId&&this.overlaps(a,b)&&!(a.forceFit||b.forceFit))throw new ConflictException('Dois serviços do agendamento se sobrepõem para a mesma profissional');
      if(this.areaIssue(a,b))throw new ConflictException('Serviços da mesma área da cliente violam a regra de simultaneidade/sequência');
    }
    return items;
  }

  private async validateAgendaConflicts(tx:any,unitId:string,serviceDate:string,clientId:string|null,items:any[],ignoreBookingId?:string){
    const existing=await tx.booking.findMany({
      where:{unitId,serviceDate:new Date(serviceDate+'T00:00:00.000Z'),...(ignoreBookingId?{id:{not:ignoreBookingId}}:{})},
      include:{service:true},
    });
    for(const row of existing){
      if(this.isCancelled(row.status))continue;
      const other=this.storedItems(row);
      for(const a of items)for(const b of other){
        if(a.professionalId===b.professionalId&&this.overlaps(a,b)&&!a.forceFit)throw new ConflictException('Horário não está mais disponível para a profissional');
        if(clientId&&row.clientId===clientId&&this.areaIssue(a,b))throw new ConflictException('Cliente já possui serviço incompatível na mesma área neste horário');
      }
    }
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
    const unitId=req.unitId!,id=this.operationId(unitId,key);
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}), hashtext(${'agenda|'+body.serviceDate}))`;
      const prior=await tx.booking.findUnique({where:{id}});if(prior)return prior;
      const [unit,client]=await Promise.all([
        tx.unit.findFirst({where:{id:unitId,active:true}}),
        body.clientId?tx.client.findFirst({where:{id:body.clientId,active:true}}):Promise.resolve(null),
      ]);
      if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');
      if(body.clientId&&!client)throw new NotFoundException('Cliente não encontrado ou inativo');
      const items=await this.resolveItems(tx,unitId,body);
      await this.validateAgendaConflicts(tx,unitId,body.serviceDate,body.clientId||null,items);
      const first=items[0];
      const booking=await tx.booking.create({data:{
        id,unitId,clientId:body.clientId||null,serviceId:first.serviceId,professionalId:first.professionalId,
        serviceDate:new Date(body.serviceDate+'T00:00:00.000Z'),startAt:new Date(first.startAt),notes:body.notes?.trim()||null,status:body.status||'Agendado',
        legacyPayload:{source:'central_api',durationMin:first.durationMin,items} as any,
      }});
      if(body.clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:body.clientId,unitId}},create:{clientId:body.clientId,unitId,source:'booking'},update:{active:true}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId,action:'booking.created',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',itemCount:items.length},occurredAt:new Date()}});
      return booking;
    });
  }

  @Patch('bookings/:id')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async updateBooking(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:UpdateBookingDto){
    assertOperationalWriteEnabled(req.unitId!);
    const unitId=req.unitId!;
    return this.prisma.$transaction(async tx=>{
      const current=await tx.booking.findFirst({where:{id,unitId},include:{service:true}});
      if(!current)throw new NotFoundException('Agendamento não encontrado nesta unidade');
      const serviceDate=body.serviceDate||current.serviceDate.toISOString().slice(0,10);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}), hashtext(${'agenda|'+serviceDate}))`;
      const status=body.status||current.status,clientId=body.clientId===undefined?current.clientId:(body.clientId||null);
      if(clientId&&!await tx.client.findFirst({where:{id:clientId,active:true}}))throw new NotFoundException('Cliente não encontrado ou inativo');
      let items=this.storedItems(current);
      if(Array.isArray(body.items)&&body.items.length)items=await this.resolveItems(tx,unitId,body);
      if(!items.length)throw new ConflictException('Agendamento sem itens operacionais');
      if(!this.isCancelled(status))await this.validateAgendaConflicts(tx,unitId,serviceDate,clientId,items,id);
      const first=items[0],beforeItems=this.storedItems(current);
      const beforeStart=beforeItems[0]?.startAt||'',rescheduled=serviceDate!==current.serviceDate.toISOString().slice(0,10)||beforeStart!==first.startAt;
      const action=this.isCancelled(status)&&!this.isCancelled(current.status)?'booking.cancelled':(rescheduled?'booking.rescheduled':'booking.updated');
      const legacy={...((current.legacyPayload&&typeof current.legacyPayload==='object')?current.legacyPayload:{}),source:'central_api',durationMin:first.durationMin,items} as any;
      const updated=await tx.booking.update({where:{id},data:{
        clientId,serviceId:first.serviceId,professionalId:first.professionalId,serviceDate:new Date(serviceDate+'T00:00:00.000Z'),
        startAt:new Date(first.startAt),notes:body.notes===undefined?current.notes:(body.notes?.trim()||null),status,legacyPayload:legacy,version:{increment:1},
      }});
      if(clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId,unitId}},create:{clientId,unitId,source:'booking'},update:{active:true}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId,action,entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',itemCount:items.length,previousStatus:current.status,status},occurredAt:new Date()}});
      return updated;
    });
  }
}
