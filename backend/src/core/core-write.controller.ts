import { assertBookingResourceCapacity } from './booking-resource-capacity';
import { Body, ConflictException, Controller, Headers, NotFoundException, Optional, Param, Patch, Post, Req } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { BookingItemWriteDto, CreateBlockSeriesDto, CreateBookingDto, CreateClientDto, UpdateBookingDto, UpdateClientDto } from './core-write.dto';
import { insideProfessionalSchedule, professionalLocalStart } from './professional-schedule';
import { WaitlistOpportunityService } from './waitlist-opportunity.service';
import { BookingAutomationMaterializationService } from '../messaging/booking-automation-materialization.service';
import { BookingAutomationLifecycleService } from '../messaging/booking-automation-lifecycle.service';
import { PostServiceAutomationMaterializationService } from '../messaging/post-service-automation-materialization.service';

const TERMINAL_BOOKING=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

@Controller('api/v1')
export class CoreWriteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlistOpportunities:WaitlistOpportunityService,
    private readonly bookingAutomations:BookingAutomationMaterializationService,
    private readonly bookingAutomationLifecycle:BookingAutomationLifecycleService,
    @Optional() private readonly postServiceAutomations?:PostServiceAutomationMaterializationService,
  ) {}

  private operationId(scope:string,key?:string){
    if(!key)return randomUUID();
    const normalized=String(key).trim();
    if(!normalized||normalized.length>200)throw new ConflictException('Idempotency-Key inválida');
    return 'op_'+createHash('sha256').update(scope+'|'+normalized).digest('hex').slice(0,40);
  }
  private phone(value?:string|null){const d=String(value||'').replace(/\D/g,'');if(!d)return null;if(d.startsWith('55')&&d.length>=12)return '+'+d;if(d.length===10||d.length===11)return '+55'+d;return '+'+d}
  private normName(value?:string|null){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  private profile(body:CreateClientDto|UpdateClientDto){
    return Object.fromEntries(Object.entries({cpf:body.cpf,birthDate:body.birthDate,cep:body.cep,neighborhood:body.neighborhood,city:body.city,profession:body.profession,source:body.source,origin:body.origin,notes:body.notes}).filter(([,v])=>v!==undefined));
  }
  private clientView(row:any){
    const legacy=row?.legacyPayload&&typeof row.legacyPayload==='object'?row.legacyPayload:{};
    const p=legacy?.operationalProfile&&typeof legacy.operationalProfile==='object'?legacy.operationalProfile:legacy;
    return {id:row.id,name:row.name,active:row.active,phone:row.phone,email:row.email,registrationUnitId:row.registrationUnitId,version:row.version,cpf:p?.cpf||'',birthDate:p?.birthDate||'',cep:p?.cep||'',neighborhood:p?.neighborhood||'',city:p?.city||'',profession:p?.profession||'',source:p?.source||'',origin:p?.origin||'',notes:p?.notes||''};
  }
  private async duplicateClient(name:string,phone:string|null,email:string|null,excludeId?:string,db:any=this.prisma){
    const ors:any[]=[];if(phone)ors.push({phone});if(email)ors.push({email});if(!ors.length)return null;
    const rows=await db.client.findMany({where:{active:true,OR:ors,...(excludeId?{id:{not:excludeId}}:{})},take:50});
    const nn=this.normName(name);return rows.find((x:any)=>this.normName(x.name)===nn)||null;
  }
  private professionalCanDo(proLegacy:any,serviceLegacy:any,professionalId:string,serviceId:string){
    const services=Array.isArray(proLegacy?.services)?proLegacy.services.map(String):[];
    const rule=serviceLegacy?.proRules&&typeof serviceLegacy.proRules==='object'?serviceLegacy.proRules[professionalId]:undefined;
    if(rule?.enabled===false)return false;
    if(rule?.enabled===true)return true;
    return services.length?services.includes(serviceId):true;
  }
  private bookingRequestHash(unitId:string,body:CreateBookingDto,items:BookingItemWriteDto[],status:string){
    const canonical={
      unitId,
      clientId:body.clientId||null,
      serviceDate:body.serviceDate,
      status,
      notes:body.notes?.trim()||null,
      blockAllDay:!!body.blockAllDay,
      items:items.map(x=>({
        serviceId:x.serviceId||null,
        professionalId:x.professionalId,
        startAt:new Date(x.startAt).toISOString(),
        durationMin:x.durationMin??null,
        unitPrice:x.unitPrice??null,
        preference:!!x.preference,
        forceFit:!!x.forceFit,
      })),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }
  private async prepareItems(tx:Prisma.TransactionClient,unitId:string,serviceDate:string,items:BookingItemWriteDto[],status:string){
    const out:any[]=[];
    const checkSchedule=status!=='Bloqueado'&&!TERMINAL_BOOKING.includes(status);
    const unit=checkSchedule?await tx.unit.findFirst({where:{id:unitId},select:{timezone:true}}):null;
    if(checkSchedule&&!unit)throw new NotFoundException('Unidade não encontrada');
    for(let i=0;i<items.length;i++){
      const it=items[i],startAt=new Date(it.startAt);if(Number.isNaN(startAt.getTime()))throw new ConflictException('Horário inválido');
      if(!checkSchedule&&String(it.startAt).slice(0,10)!==serviceDate)throw new ConflictException('Horário do serviço deve pertencer à data da visita');
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
      const localStart=checkSchedule?professionalLocalStart(startAt,unit!.timezone):'';
      if(checkSchedule&&localStart.slice(0,10)!==serviceDate)throw new ConflictException('Horário do serviço deve pertencer à data local da visita');
      if(checkSchedule&&!insideProfessionalSchedule(pro.professional.legacyPayload,unitId,localStart,duration))throw new ConflictException('Horário fora da escala da profissional');
      const unitPrice=new Prisma.Decimal(Number(isBlock?0:(it.unitPrice??rule?.price??service?.price??0)).toFixed(2));
      const serviceConfig=service?.legacyPayload&&typeof service.legacyPayload==='object'&&!Array.isArray(service.legacyPayload)?service.legacyPayload as any:{};
      out.push({id:'bi_'+createHash('sha256').update(unitId+'|'+i+'|'+(it.serviceId||'block')+'|'+it.professionalId+'|'+it.startAt+'|'+randomUUID()).digest('hex').slice(0,40),unitId,serviceId:it.serviceId||null,professionalId:it.professionalId,startAt,durationMin:duration,unitPrice,preference:!!it.preference,forceFit:!!it.forceFit,sortOrder:i,clientAreaSnapshot:isBlock?null:String(serviceConfig.clientArea||'none'),mustFinishBeforeSameAreaSnapshot:isBlock?null:serviceConfig.mustFinishBeforeSameArea===true,legacyPayload:{source:'central_api',areaSnapshotSource:isBlock?'not_applicable':'service_at_write'}});
    }
    return out;
  }
  private clientAreaConflict(a:any,b:any){
    const areaA=a.clientAreaSnapshot,areaB=b.clientAreaSnapshot;
    if(areaA==null||areaB==null||areaA==='none'||areaB==='none'||areaA!==areaB)return false;
    if(a.mustFinishBeforeSameAreaSnapshot==null||b.mustFinishBeforeSameAreaSnapshot==null)return false;
    const as=a.startAt.getTime(),bs=b.startAt.getTime(),ae=as+Number(a.durationMin)*60000,be=bs+Number(b.durationMin)*60000;
    if(a.mustFinishBeforeSameAreaSnapshot&&!b.mustFinishBeforeSameAreaSnapshot&&bs<ae)return true;
    if(b.mustFinishBeforeSameAreaSnapshot&&!a.mustFinishBeforeSameAreaSnapshot&&as<be)return true;
    return as<be&&bs<ae;
  }
  private async lockAndCheck(tx:Prisma.TransactionClient,unitId:string,serviceDate:string,bookingId:string|null,items:any[],status:string,blockAllDay=false,clientId:string|null=null){
    if(TERMINAL_BOOKING.includes(status))return;
    for(const item of items)if(!Number.isFinite(Number(item.durationMin))||Number(item.durationMin)<=0)throw new ConflictException('Agendamento possui item sem duração histórica confiável; revise o item antes de operar');
    for(let i=0;i<items.length;i++)for(let j=0;j<i;j++)if(this.clientAreaConflict(items[j],items[i]))throw new ConflictException('Serviços incompatíveis da mesma área da cliente não podem se sobrepor ou violar a sequência configurada');
    const keys=[...new Set([...items.map(x=>x.professionalId+'|'+serviceDate),'physical|'+serviceDate])].sort(),day=new Date(serviceDate+'T00:00:00.000Z');
    for(const k of keys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}), hashtext(${k}))`;
    if(clientId)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}),hashtext(${'client|'+clientId+'|'+serviceDate}))`;
    for(let i=0;i<items.length;i++){
      const item=items[i],start=item.startAt.getTime(),end=start+item.durationMin*60000;
      for(let j=0;j<i;j++){const other=items[j],os=other.startAt.getTime(),oe=os+other.durationMin*60000;if(other.professionalId===item.professionalId&&os<end&&oe>start&&!(item.forceFit||other.forceFit))throw new ConflictException('Dois serviços da mesma visita estão sobrepostos para a mesma profissional')}
      if(item.forceFit)continue;
      const allDayBlock=await tx.booking.findFirst({where:{unitId,serviceDate:day,blockAllDay:true,status:{notIn:TERMINAL_BOOKING},...(bookingId?{id:{not:bookingId}}:{}),OR:[{items:{some:{professionalId:item.professionalId}}},{items:{none:{}},professionalId:item.professionalId}]},select:{id:true}});
      if(allDayBlock)throw new ConflictException('Profissional bloqueada durante todo o dia');
      if(blockAllDay){
        const occupied=await tx.bookingItem.findFirst({where:{unitId,professionalId:item.professionalId,...(bookingId?{bookingId:{not:bookingId}}:{}),booking:{serviceDate:day,status:{notIn:TERMINAL_BOOKING}}},select:{id:true}});
        if(occupied)throw new ConflictException('Existem agendamentos para esta profissional neste dia');
      }
      const candidates=await tx.bookingItem.findMany({where:{unitId,professionalId:item.professionalId,...(bookingId?{bookingId:{not:bookingId}}:{}),startAt:{gte:new Date(start-12*60*60*1000),lt:new Date(end)},booking:{status:{notIn:TERMINAL_BOOKING}}},select:{startAt:true,durationMin:true}});
      for(const x of candidates){if(x.durationMin==null)throw new ConflictException('Existe item histórico sem duração confiável ocupando esta agenda; revise antes de gravar');const xs=x.startAt.getTime(),xe=xs+x.durationMin*60000;if(xs<end&&xe>start)throw new ConflictException('Horário não está mais disponível')}
    }
    if(status!=='Bloqueado')await assertBookingResourceCapacity(tx,unitId,serviceDate,items,bookingId);
    if(clientId){
      const clientItems=await tx.bookingItem.findMany({where:{unitId,...(bookingId?{bookingId:{not:bookingId}}:{}),booking:{clientId,serviceDate:day,status:{notIn:TERMINAL_BOOKING}}},select:{startAt:true,durationMin:true,clientAreaSnapshot:true,mustFinishBeforeSameAreaSnapshot:true}});
      for(const item of items)for(const other of clientItems){
        if(other.durationMin==null)continue;
        if(this.clientAreaConflict(item,other))throw new ConflictException('Cliente já possui serviço incompatível na mesma área neste horário');
      }
    }
  }
  private bookingView(unitId:string,id:string){
    return this.prisma.booking.findFirst({where:{id,unitId},select:{id:true,unitId:true,clientId:true,serviceDate:true,startAt:true,serviceId:true,professionalId:true,notes:true,status:true,blockAllDay:true,blockSeriesId:true,blockRecurrence:true,blockException:true,version:true,client:{select:{id:true,name:true,phone:true,email:true}},items:{orderBy:{sortOrder:'asc'},select:{id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,unitPrice:true,preference:true,forceFit:true,sortOrder:true,clientAreaSnapshot:true,mustFinishBeforeSameAreaSnapshot:true,service:{select:{id:true,name:true,price:true,durationMin:true}},professional:{select:{id:true,name:true,publicName:true}}}}}});
  }

  @Post('clients')
  @UnitScoped()
  @RequirePermissions('clients.manage')
  async createClient(@Req() req:ImperioRequest,@Body() body:CreateClientDto,@Headers('idempotency-key') key?:string){
    assertOperationalWriteEnabled(req.unitId!);
    const phone=this.phone(body.phone),email=body.email?.trim().toLowerCase()||null;if(!phone&&!email)throw new ConflictException('Informe telefone ou e-mail para identificar o cliente na rede');
    const id=this.operationId('client|'+req.unitId!,key),profile=this.profile(body);
    const client=await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('client-identity'), 0)`;
      const existing=await tx.client.findUnique({where:{id}});if(existing){const samePayload=existing.active&&this.normName(existing.name)===this.normName(body.name)&&existing.phone===phone&&(existing.email||null)===(email||null);if(!samePayload)throw new ConflictException('Idempotency-Key já utilizada para outro cadastro nesta unidade');await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:existing.id,unitId:req.unitId!}},create:{clientId:existing.id,unitId:req.unitId!,source:'operational_idempotent'},update:{active:true}});return existing}const duplicate=await this.duplicateClient(body.name,phone,email,undefined,tx);
      if(duplicate){await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:duplicate.id,unitId:req.unitId!}},create:{clientId:duplicate.id,unitId:req.unitId!,source:'operational'},update:{active:true}});return duplicate;}const created=await tx.client.create({data:{id,name:body.name.trim(),phone,email,registrationUnitId:req.unitId!,legacyPayload:{source:'central_api',operationalProfile:profile},unitLinks:{create:{unitId:req.unitId!,source:'operational'}}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.created',entityType:'Client',entityId:id,legacyPayload:{source:'central_api'},occurredAt:new Date()}});return created});
    return this.clientView(client);
  }

  @Patch('clients/:id')
  @UnitScoped()
  @RequirePermissions('clients.manage')
  async updateClient(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:UpdateClientDto){
    assertOperationalWriteEnabled(req.unitId!);
    const updated=await this.prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('client-identity'), 0)`;
    const current=await tx.client.findFirst({where:{id,active:true}});if(!current)throw new NotFoundException('Cliente não encontrada');
    const name=body.name?.trim()||current.name,phone=body.phone===undefined?current.phone:this.phone(body.phone),email=body.email===undefined?current.email:(body.email.trim().toLowerCase()||null);
    if(!phone&&!email)throw new ConflictException('Informe telefone ou e-mail para identificar o cliente na rede');
    if(await this.duplicateClient(name,phone,email,id,tx))throw new ConflictException('Já existe outra cliente com o mesmo nome e contato');
    const old=current.legacyPayload&&typeof current.legacyPayload==='object'&&!Array.isArray(current.legacyPayload)?current.legacyPayload as any:{};
    const profile={...(old.operationalProfile&&typeof old.operationalProfile==='object'?old.operationalProfile:{}),...this.profile(body)};
    const row=await tx.client.update({where:{id},data:{name,phone,email,legacyPayload:{...old,operationalProfile:profile},version:{increment:1}}});await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:id,unitId:req.unitId!}},create:{clientId:id,unitId:req.unitId!,source:'operational_update'},update:{active:true}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'client.updated',entityType:'Client',entityId:id,legacyPayload:{source:'central_api'},occurredAt:new Date()}});return row;
    });
    return this.clientView(updated);
  }

  @Post('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async createBooking(@Req() req:ImperioRequest,@Body() body:CreateBookingDto,@Headers('idempotency-key') key?:string){
    assertOperationalWriteEnabled(req.unitId!);if(body.clientId&&!await this.prisma.client.findFirst({where:{id:body.clientId,active:true}}))throw new NotFoundException('Cliente não encontrado ou inativo');
    const rawItems=body.items?.length?body.items:(body.serviceId&&body.professionalId&&body.startAt?[{serviceId:body.serviceId,professionalId:body.professionalId,startAt:body.startAt} as BookingItemWriteDto]:[]);
    if(!rawItems.length)throw new ConflictException('Informe pelo menos um serviço do agendamento');
    const id=this.operationId(req.unitId!,key),status=body.status||'Agendado',idempotencyHash=this.bookingRequestHash(req.unitId!,body,rawItems,status);
    await this.prisma.$transaction(async tx=>{const existing=await tx.booking.findUnique({where:{id}});if(existing){const legacy=existing.legacyPayload&&typeof existing.legacyPayload==='object'&&!Array.isArray(existing.legacyPayload)?existing.legacyPayload as any:{};if(legacy.idempotencyHash!==idempotencyHash)throw new ConflictException('Idempotency-Key já utilizada para outro agendamento nesta unidade');return}const unit=await tx.unit.findFirst({where:{id:req.unitId!,active:true}});if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');const items=await this.prepareItems(tx,req.unitId!,body.serviceDate,rawItems,status);await this.lockAndCheck(tx,req.unitId!,body.serviceDate,null,items,status,!!body.blockAllDay,body.clientId||null);const first=items[0];await tx.booking.create({data:{id,unitId:req.unitId!,clientId:body.clientId||null,serviceId:first.serviceId||null,professionalId:first.professionalId,serviceDate:new Date(body.serviceDate+'T00:00:00.000Z'),startAt:first.startAt,notes:body.notes?.trim()||null,status,blockAllDay:!!body.blockAllDay,legacyPayload:{source:'central_api',multiItem:true,idempotencyHash},items:{create:items.map(x=>({...x,id:x.id}))}}});if(body.clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:body.clientId,unitId:req.unitId!}},create:{clientId:body.clientId,unitId:req.unitId!,source:'booking'},update:{active:true}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'booking.created',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',itemCount:items.length},occurredAt:new Date()}})});
    await this.bookingAutomations.materializeCreatedBooking(id);
    return this.bookingView(req.unitId!,id);
  }

  @Post('booking-block-series')
  @UnitScoped()
  @RequirePermissions('agenda.manage')
  async createBlockSeries(@Req() req:ImperioRequest,@Body() body:CreateBlockSeriesDto,@Headers('idempotency-key') key?:string){
    assertOperationalWriteEnabled(req.unitId!);const unitId=req.unitId!,seriesKey=key||randomUUID();
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
        await this.lockAndCheck(tx,unitId,o.serviceDate,null,items,'Bloqueado',!!body.blockAllDay,null);
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
    assertOperationalWriteEnabled(req.unitId!);
    const before=await this.prisma.booking.findFirst({where:{id,unitId:req.unitId!},include:{items:{orderBy:{sortOrder:'asc'}}}});
    if(!before)throw new NotFoundException('Agendamento não encontrado nesta unidade');
    await this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}),hashtext(${'booking-update|'+id}))`;const current=await tx.booking.findFirst({where:{id,unitId:req.unitId!},include:{items:{orderBy:{sortOrder:'asc'}}}});if(!current)throw new NotFoundException('Agendamento não encontrado nesta unidade');const currentServiceDate=current.serviceDate.toISOString().slice(0,10),serviceDate=body.serviceDate||currentServiceDate,status=body.status||current.status,effectiveBlockAllDay=body.blockAllDay===undefined?current.blockAllDay:body.blockAllDay;let items:any[]=current.items;
      if(serviceDate!==currentServiceDate&&!body.items?.length)throw new ConflictException('Para alterar a data, envie também todos os itens do agendamento com os novos horários');
      if(body.items?.length){items=await this.prepareItems(tx,req.unitId!,serviceDate,body.items,status);await this.lockAndCheck(tx,req.unitId!,serviceDate,id,items,status,effectiveBlockAllDay,current.clientId||null);await tx.bookingItem.deleteMany({where:{bookingId:id}});await tx.bookingItem.createMany({data:items.map(x=>({...x,bookingId:id}))});}else if((status!==current.status||body.serviceDate!==undefined||body.blockAllDay!==undefined)&&!TERMINAL_BOOKING.includes(status)){await this.lockAndCheck(tx,req.unitId!,serviceDate,id,items,status,effectiveBlockAllDay,current.clientId||null)}
      const first=items[0]||null;await tx.booking.update({where:{id},data:{serviceDate:new Date(serviceDate+'T00:00:00.000Z'),status,notes:body.notes===undefined?current.notes:(body.notes.trim()||null),startAt:first?.startAt||current.startAt,serviceId:first?first.serviceId:(current.serviceId||null),professionalId:first?.professionalId||current.professionalId,...(body.blockAllDay===undefined?{}:{blockAllDay:body.blockAllDay}),...(body.blockException===undefined?{}:{blockException:body.blockException}),version:{increment:1}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'booking.updated',entityType:'Booking',entityId:id,legacyPayload:{source:'central_api',status,itemCount:items.length},occurredAt:new Date()}})});
    const after=await this.prisma.booking.findFirst({where:{id,unitId:req.unitId!},include:{items:{orderBy:{sortOrder:'asc'}}}});
    const oldDate=before.serviceDate.toISOString().slice(0,10);
    const terminalBefore=TERMINAL_BOOKING.includes(before.status),terminalAfter=after?TERMINAL_BOOKING.includes(after.status):false;
    const beforeSig=before.items.map(x=>[x.professionalId,x.startAt.toISOString(),x.durationMin,x.serviceId||''].join('|')).sort().join('~');
    const afterSig=(after?.items||[]).map(x=>[x.professionalId,x.startAt.toISOString(),x.durationMin,x.serviceId||''].join('|')).sort().join('~');
    const rescheduled=!!after&&(oldDate!==after.serviceDate.toISOString().slice(0,10)||beforeSig!==afterSig);
    const completedTransition=before.status!=='Concluído'&&after?.status==='Concluído';
    if(!terminalBefore&&terminalAfter){
      await this.waitlistOpportunities.reevaluateForAvailabilityEvent({unitId:req.unitId!,date:oldDate,sourceType:'CANCELLATION',sourceBookingId:id,sourceReferenceId:id});
      await this.bookingAutomationLifecycle.cancelForBooking(id,'BOOKING_CANCELLED');
    }else if(rescheduled){
      await this.waitlistOpportunities.reevaluateForAvailabilityEvent({unitId:req.unitId!,date:oldDate,sourceType:'RESCHEDULE',sourceBookingId:id,sourceReferenceId:id});
      await this.bookingAutomationLifecycle.replaceForReschedule(id);
    }
    if(completedTransition&&this.postServiceAutomations)await this.postServiceAutomations.materializeCompletedBooking(id);
    return this.bookingView(req.unitId!,id);
  }
}
