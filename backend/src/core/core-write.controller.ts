import { Body, ConflictException, Controller, Headers, NotFoundException, Param, Patch, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { BookingItemWriteDto, CreateBlockSeriesDto, CreateBookingDto, CreateClientDto, UpdateBookingDto, UpdateClientDto } from './core-write.dto';

const TERMINAL_BOOKING=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

@Controller('api/v1')
export class CoreWriteController {
  constructor(private readonly prisma: PrismaService) {}

  private assertWritesEnabled(){
    if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException('Escrita operacional central ainda não habilitada neste ambiente');
  }
  private operationId(scope:string,key?:string){
    if(!key)return randomUUID();
    const normalized=String(key).trim();
    if(!normalized||normalized.length>200)throw new ConflictException('Idempotency-Key inválida');
    return 'op_'+createHash('sha256').update(scope+'|'+normalized).digest('hex').slice(0,40);
  }
  private phone(value?:string|null){const d=String(value||'').replace(/\D/g,'');if(!d)return null;if(d.startsWith('55')&&d.length>=12)return '+'+d;if(d.length===10||d.length===11)return '+55'+d;return '+'+d}
  private normName(value?:string|null){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  private profile(body:CreateClientDto|UpdateClientDto){
    return Object.fromEntries(Object.entries({cpf:body.cpf,birthDate:body.birthDate,cep:body.cep,neighborhood:body.neighborhood,city:body.city,profession:body.profession,source:body.source,notes:body.notes}).filter(([,v])=>v!==undefined));
  }
  private clientView(row:any){
    const legacy=row?.legacyPayload&&typeof row.legacyPayload==='object'?row.legacyPayload:{};
    const p=legacy?.operationalProfile&&typeof legacy.operationalProfile==='object'?legacy.operationalProfile:legacy;
    return {id:row.id,name:row.name,active:row.active,phone:row.phone,email:row.email,registrationUnitId:row.registrationUnitId,version:row.version,cpf:p?.cpf||'',birthDate:p?.birthDate||'',cep:p?.cep||'',neighborhood:p?.neighborhood||'',city:p?.city||'',profession:p?.profession||'',source:p?.source||'',notes:p?.notes||''};
  }
  private async duplicateClient(name:string,phone:string|null,email:string|null,excludeId?:string){
    const ors:any[]=[];if(phone)ors.push({phone});if(email)ors.push({email});if(!ors.length)return null;
    const rows=await this.prisma.client.findMany({where:{active:true,OR:ors,...(excludeId?{id:{not:excludeId}}:{})},take:50});
    const nn=this.normName(name);return rows.find(x=>this.normName(x.name)===nn)||null;
  }
  private professionalCanDo(proLegacy:any,serviceLegacy:any,professionalId:string,serviceId:string){
    const services=Array.isArray(proLegacy?.services)?proLegacy.services.map(String):[];
    const rule=serviceLegacy?.proRules&&typeof serviceLegacy.proRules==='object'?serviceLegacy.proRules[professionalId]:undefined;
    if(rule?.enabled===false)return false;
    if(rule?.enabled===true)return true;
    return services.length?services.includes(serviceId):true;
  }
  private async prepareItems(tx:Prisma.TransactionClient,unitId:string,serviceDate:string,items:BookingItemWriteDto[],status:string){
    const out:any[]=[];
    for(let i=0;i<items.length;i++){
      const it=items[i],startAt=new Date(it.startAt);if(Number.isNaN(startAt.getTime()))throw new ConflictException('Horário inválido');
      if(String(it.startAt).slice(0,10)!==serviceDate)throw new ConflictException('Horário do serviço deve pertencer à data da visita');
      const isBlock=status==='Bloqueado';if(!isBlock&&!it.serviceId)throw new ConflictException('Serviço é obrigatório para atendimentos');
      const [service,pro]=await Promise.all([
        it.serviceId?tx.service.findFirst({where:{id:it.serviceId,active:true},select:{id:true,price:true,durationMin:true,legacyPayload:true}}):Promise.resolve(null),
        tx.professionalUnit.findFirst({where:{professionalId:it.professionalId,unitId,active:true,professional:{active:true}},select:{professional:{select:{id:true,legacyPayload:true}}}}),
      ]);
      if(it.serviceId&&!service)throw new NotFoundException('Serviço não encontrado ou inativo');
      if(!pro)throw new NotFoundException('Profissional não atende nesta unidade');
      if(service&&it.serviceId&&!this.professionalCanDo(pro.professional.legacyPayload,service.legacyPayload,it.professionalId,it.serviceId))throw new ConflictException('Profissional não executa este serviço');
      const rule=service&&it.serviceId?(service.legacyPayload as any)?.proRules?.[it.professionalId]:null;
      const duration=Math.max(1,Number(it.durationMin??rule?.duration??service?.durationMin??30));
      const unitPrice=new Prisma.Decimal(Number(isBlock?0:(it.unitPrice??rule?.price??service?.price??0)).toFixed(2));
      out.push({id:'bi_'+createHash('sha256').update(unitId+'|'+i+'|'+(it.serviceId||'block')+'|'+it.professionalId+'|'+it.startAt+'|'+randomUUID()).digest('hex').slice(0,40),unitId,serviceId:it.serviceId||null,professionalId:it.professionalId,startAt,durationMin:duration,unitPrice,preference:!!it.preference,forceFit:!!it.forceFit,sortOrder:i,legacyPayload:{source:'central_api'}});
    }
    return out;
  }
  private async lockAndCheck(tx:Prisma.TransactionClient,unitId:string,serviceDate:string,bookingId:string|null,items:any[],status:string){
    if(TERMINAL_BOOKING.includes(status))return;
    const keys=[...new Set(items.map(x=>x.professionalId+'|'+serviceDate))].sort();
    for(const k of keys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}), hashtext(${k}))`;
    for(let i=0;i<items.length;i++){
      const item=items[i],start=item.startAt.getTime(),end=start+item.durationMin*60000;
      for(let j=0;j<i;j++){const other=items[j],os=other.startAt.getTime(),oe=os+other.durationMin*60000;if(other.professionalId===item.professionalId&&os<end&&oe>start&&!(item.forceFit||other.forceFit))throw new ConflictException('Dois serviços da mesma visita estão sobrepostos para a mesma profissional')}
      if(item.forceFit)continue;
      const candidates=await tx.bookingItem.findMany({where:{unitId,professionalId:item.professionalId,...(bookingId?{bookingId:{not:bookingId}}:{}),startAt:{gte:new Date(start-12*60*60*1000),lt:new Date(end)},booking:{status:{notIn:TERMINAL_BOOKING}}},select:{startAt:true,durationMin:true}});
      for(const x of candidates){const xs=x.startAt.getTime(),xe=xs+x.durationMin*60000;if(xs<end&&xe>start)throw new ConflictException('Horário não está mais disponível')}
    }
  }
  private bookingView(unitId:string,id:string){
    return this.prisma.booking.findFirst({where:{id,unitId},select:{id:true,unitId:true,clientId:true,serviceDate:true,startAt:true,serviceId:true,professionalId:true,notes:true,status:true,blockAllDay:true,blockSeriesId:true,blockRecurrence:true,blockException:true,version:true,client:{select:{id:true,name:true,phone:true,email:true}},items:{orderBy:{sortOrder:'asc'},select:{id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,unitPrice:true,preference:true,forceFit:true,sortOrder:true,service:{select:{id:true,name:true,price:true,durationMin:true}},professional:{select:{id:true,name:true,publicName:true}}}}}});
  }

  @Post('clients')
  @UnitScoped()
  @RequirePermissions('clients.manage')
  async createClient(@Req() req:ImperioRequest,@Body() body:CreateClientDto,@Headers('idempotency-key') key?:string){
    this.assertWritesEnabled();
    const phone=this.phone(body.phone),email=body.email?.trim().toLowerCase()||null;if(!phone&&!email)throw new ConflictException('Informe telefone ou e-mail para identificar o cliente na rede');
    const duplicate=await this.duplicateClient(body.name,phone,email);
    if(duplicate){
      const link=await this.prisma.clientUnitLink.findUnique({where:{clientId_unitId:{clientId:duplicate.id,unitId:req.unitId!}}});
      if(!link||!link.active)await this.prisma.$transaction(async tx=>{await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:duplicate.id,unitId:req.unitId!}},create:{clientId:duplicate.id,unitId:req.unitId!,source:'operational'},update:{active:true}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.linked_to_unit',entityType:'Client',entityId:duplicate.id,legacyPayload:{source:'central_api',deduplicated:true},occurredAt:new Date()}})});
      return this.clientView(duplicate);
    }
    const id=this.operationId('client',key),profile=this.profile(body);
    const client=await this.prisma.$transaction(async tx=>{const existing=await tx.client.findUnique({where:{id}});if(existing)return existing;const created=await tx.client.create({data:{id,name:body.name.trim(),phone,email,registrationUnitId:req.unitId!,legacyPayload:{source:'central_api',operationalProfile:profile},unitLinks:{create:{unitId:req.unitId!,source:'operational'}}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.created',entityType:'Client',entityId:id,legacyPayload:{source:'central_api'},occurredAt:new Date()}});return created});
    return this.clientView(client);
  }

  @Patch('clients/:id')
  @UnitScoped()
  @RequirePermissions('clients.manage')
  async updateClient(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:UpdateClientDto){
    this.assertWritesEnabled();const current=await this.prisma.client.findFirst({where:{id,active:true}});if(!current)throw new NotFoundException('Cliente não encontrada');
    const name=body.name?.trim()||current.name,phone=body.phone===undefined?current.phone:this.phone(body.phone),email=body.email===undefined?current.email:(body.email.trim().toLowerCase()||null);
    if(!phone&&!email)throw new ConflictException('Informe telefone ou e-mail para identificar o cliente na rede');
    if(await this.duplicateClient(name,phone,email,id))throw new ConflictException('Já existe outra cliente com o mesmo nome e contato');
    const old=current.legacyPayload&&typeof current.legacyPayload==='object'&&!Array.isArray(current.legacyPayload)?current.legacyPayload as any:{};
    const profile={...(old.operationalProfile&&typeof old.operationalProfile==='object'?old.operationalProfile:{}),...this.profile(body)};
    const updated=await this.prisma.$transaction(async tx=>{const row=await tx.client.update({where:{id},data:{name,phone,email,legacyPayload:{...old,operationalProfile:profile},version:{increment:1}}});await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:id,unitId:req.unitId!}},create:{clientId:id,unitId:req.unitId!,source:'operational_update'},update:{active:true}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.updated',entityType:'Client',entityId:id,legacyPayload:{source:'central_api'},occurredAt:new Date()}});return row});
    return this.clientView(updated);
  }

  @Post('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async createBooking(@Req() req:ImperioRequest,@Body() body:CreateBookingDto,@Headers('idempotency-key') key?:string){
    this.assertWritesEnabled();if(body.clientId&&!await this.prisma.client.findFirst({where:{id:body.clientId,active:true}}))throw new NotFoundException('Cliente não encontrado ou inativo');
    const rawItems=body.items?.length?body.items:(body.serviceId&&body.professionalId&&body.startAt?[{serviceId:body.serviceId,professionalId:body.professionalId,startAt:body.startAt} as BookingItemWriteDto]:[]);
    if(!rawItems.length)throw new ConflictException('Informe pelo menos um serviço do agendamento');
    const id=this.operationId(req.unitId!,key),status=body.status||'Agendado';
    await this.prisma.$transaction(async tx=>{const existing=await tx.booking.findUnique({where:{id}});if(existing)return;const unit=await tx.unit.findFirst({where:{id:req.unitId!,active:true}});if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');const items=await this.prepareItems(tx,req.unitId!,body.serviceDate,rawItems,status);await this.lockAndCheck(tx,req.unitId!,body.serviceDate,null,items,status);const first=items[0];await tx.booking.create({data:{id,unitId:req.unitId!,clientId:body.clientId||null,serviceId:first.serviceId||null,professionalId:first.professionalId,serviceDate:new Date(body.serviceDate+'T00:00:00.000Z'),startAt:first.startAt,notes:body.notes?.trim()||null,status,blockAllDay:!!body.blockAllDay,legacyPayload:{source:'central_api',multiItem:true},items:{create:items.map(x=>({...x,id:x.id}))}}});if(body.clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:body.clientId,unitId:req.unitId!}},create:{clientId:body.clientId,unitId:req.unitId!,source:'booking'},update:{active:true}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'booking.created',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',itemCount:items.length},occurredAt:new Date()}})});
    return this.bookingView(req.unitId!,id);
  }

  @Post('booking-block-series')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async createBlockSeries(@Req() req:ImperioRequest,@Body() body:CreateBlockSeriesDto,@Headers('idempotency-key') key?:string){
    this.assertWritesEnabled();const unitId=req.unitId!,seriesKey=key||randomUUID();
    return this.prisma.$transaction(async tx=>{
      const ids=body.occurrences.map((_,i)=>this.operationId(unitId+'|block-series|'+i,seriesKey));
      const existing=await tx.booking.findMany({where:{id:{in:ids},unitId},include:{items:true}});
      if(existing.length===ids.length)return {seriesKey,count:existing.length,bookings:ids.map(id=>existing.find(x=>x.id===id)!)};
      if(existing.length)throw new ConflictException('Série de bloqueios parcialmente existente; revise antes de repetir a operação');
      const unit=await tx.unit.findFirst({where:{id:unitId,active:true}});if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');
      const pro=await tx.professionalUnit.findFirst({where:{professionalId:body.professionalId,unitId,active:true,professional:{active:true}}});if(!pro)throw new NotFoundException('Profissional não atende nesta unidade');
      const prepared:any[]=[];
      for(let i=0;i<body.occurrences.length;i++){
        const o=body.occurrences[i],items=await this.prepareItems(tx,unitId,o.serviceDate,[{professionalId:body.professionalId,startAt:o.startAt,durationMin:o.durationMin,unitPrice:0,forceFit:!!body.forceFit}],'Bloqueado');
        await this.lockAndCheck(tx,unitId,o.serviceDate,null,items,'Bloqueado');
        prepared.push({index:i,id:ids[i],occurrence:o,item:items[0]});
      }
      const rows:any[]=[];
      for(const x of prepared){const row=await tx.booking.create({data:{id:x.id,unitId,clientId:null,serviceDate:new Date(x.occurrence.serviceDate+'T00:00:00.000Z'),startAt:x.item.startAt,serviceId:null,professionalId:body.professionalId,notes:body.notes?.trim()||'Horário bloqueado',status:'Bloqueado',blockAllDay:!!body.blockAllDay,blockSeriesId:'bs_'+createHash('sha256').update(String(seriesKey)).digest('hex').slice(0,24),blockRecurrence:body.recurrence?body.recurrence as Prisma.InputJsonValue:Prisma.JsonNull,legacyPayload:{source:'central_api',blockSeries:true,seriesKey},items:{create:{...x.item,id:x.item.id}}},include:{items:true}});rows.push(row)}
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId,action:'booking.block_series_created',entityType:'Booking',entityId:String(seriesKey),legacyPayload:{source:'central_api',professionalId:body.professionalId,count:rows.length,forceFit:!!body.forceFit},occurredAt:new Date()}});
      return {seriesKey,count:rows.length,bookings:rows};
    });
  }

  @Patch('bookings/:id')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async updateBooking(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:UpdateBookingDto){
    this.assertWritesEnabled();
    await this.prisma.$transaction(async tx=>{const current=await tx.booking.findFirst({where:{id,unitId:req.unitId!},include:{items:{orderBy:{sortOrder:'asc'}}}});if(!current)throw new NotFoundException('Agendamento não encontrado nesta unidade');const serviceDate=body.serviceDate||current.serviceDate.toISOString().slice(0,10),status=body.status||current.status;let items:any[]=current.items;
      if(body.items?.length){items=await this.prepareItems(tx,req.unitId!,serviceDate,body.items,status);await this.lockAndCheck(tx,req.unitId!,serviceDate,id,items,status);await tx.bookingItem.deleteMany({where:{bookingId:id}});await tx.bookingItem.createMany({data:items.map(x=>({...x,bookingId:id}))});}else if(status!==current.status&&!TERMINAL_BOOKING.includes(status)){await this.lockAndCheck(tx,req.unitId!,serviceDate,id,items,status)}
      const first=items[0]||null;await tx.booking.update({where:{id},data:{serviceDate:new Date(serviceDate+'T00:00:00.000Z'),status,notes:body.notes===undefined?current.notes:(body.notes.trim()||null),startAt:first?.startAt||current.startAt,serviceId:first?first.serviceId:(current.serviceId||null),professionalId:first?.professionalId||current.professionalId,...(body.blockAllDay===undefined?{}:{blockAllDay:body.blockAllDay}),...(body.blockException===undefined?{}:{blockException:body.blockException}),version:{increment:1}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'booking.updated',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',status,itemCount:items.length},occurredAt:new Date()}})});
    return this.bookingView(req.unitId!,id);
  }
}
