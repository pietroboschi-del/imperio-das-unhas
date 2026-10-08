import { hasPhysicalCapacity } from './booking-capacity';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { isMessagingChannelId } from '../messaging/messaging-channels';
import { BookingAutomationMaterializationService } from '../messaging/booking-automation-materialization.service';
import { BookingAvailabilityService, PUBLIC_BOOKING_SLOT_MINUTES } from './booking-availability.service';
import { PublicBookingDto, PublicBookingItemDto } from './public-booking.dto';
import { WhatsappAgentBookingDto, WhatsappAgentMultiBookingDto } from './whatsapp-agent.dto';

const TERMINAL=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

type CanonicalItem={serviceId:string;professionalId:string;startAt:string};
type CanonicalInput={
 unitId:string;
 items:CanonicalItem[];
 clientId?:string;
 clientName?:string;
 clientPhone?:string;
 clientEmail?:string;
 clientProfile?:Record<string,unknown>;
 source:'website'|'whatsapp_agent';
 authorType:'CLIENT'|'AGENT';
 auditAction:'booking.created_online'|'booking.created_from_whatsapp';
 channelId?:string;
 key?:string;
 strictIdempotency:boolean;
 requireGrid:boolean;
 requirePhysicalCapacity?:boolean;
 idempotencyHashOverride?:string;
};

function obj(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function normName(value:string){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function phone(value:string){
 const d=String(value||'').replace(/\D/g,'');
 if(!d)throw new ConflictException('Celular inválido');
 if(d.startsWith('55')&&d.length>=12)return '+'+d;
 if(d.length===10||d.length===11)return '+55'+d;
 return '+'+d;
}
function clockMinute(value:string){
 const m=String(value||'').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
 if(!m)return Number.NaN;
 const h=Number(m[1]),min=Number(m[2]),sec=Number(m[3]||0);
 return h<=23&&min<=59&&sec<=59?h*60+min+sec/60:Number.NaN;
}
function scheduleDay(date:string){
 const d=new Date(date+'T12:00:00.000Z');
 return Number.isNaN(d.getTime())?-1:d.getUTCDay();
}
function zonedParts(value:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value);
 const read=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
 return {year:read('year'),month:read('month'),day:read('day'),hour:read('hour'),minute:read('minute'),second:read('second')};
}
function localDateTimeToUtc(localText:string,timeZone:string){
 const m=String(localText||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
 if(!m)throw new ConflictException('Horário inválido');
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]||0);
 const desired=Date.UTC(year,month-1,day,hour,minute,second);
 let guess=desired;
 for(let i=0;i<4;i++){
  const p=zonedParts(new Date(guess),timeZone);
  const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  const delta=desired-represented;
  guess+=delta;
  if(delta===0)break;
 }
 return new Date(guess);
}
function canDo(proLegacy:any,serviceLegacy:any,professionalId:string,serviceId:string){
 const services=Array.isArray(proLegacy?.services)?proLegacy.services.map(String):[];
 const rule=obj(serviceLegacy?.proRules)[professionalId];
 if(rule&&Object.prototype.hasOwnProperty.call(rule,'enabled'))return rule.enabled===true;
 return services.includes(serviceId);
}
function profile(row:any){
 const legacy=obj(row?.legacyPayload);
 return obj(legacy.operationalProfile||legacy);
}
function insideSchedule(proLegacy:any,unitId:string,startText:string,durationMin:number){
 const day=scheduleDay(startText.slice(0,10));
 if(day<0)return false;
 const r=obj(obj(proLegacy?.schedule)[unitId+'-'+day]);
 const a=clockMinute(String(r.start||'')),z=clockMinute(String(r.end||'')),start=clockMinute(startText.slice(11));
 return r.work===true&&Number.isFinite(a)&&Number.isFinite(z)&&Number.isFinite(start)&&z>a&&start>=a&&start+durationMin<=z;
}
function operationId(scope:string,key:string|undefined,prefix:string){
 const normalized=String(key||'').trim();
 if(!normalized)return randomUUID();
 if(normalized.length>200)throw new ConflictException('Idempotency-Key inválida');
 return prefix+createHash('sha256').update(scope+'|'+normalized).digest('hex').slice(0,40);
}
function strictKey(key?:string){
 const normalized=String(key||'').trim();
 if(!normalized||normalized.length>200)throw new ConflictException('Idempotency-Key obrigatória e deve ter até 200 caracteres');
 return normalized;
}
function hashAgentPayload(input:CanonicalInput){
 const canonical={
  unitId:input.unitId,
  items:input.items.map(x=>({serviceId:x.serviceId,professionalId:x.professionalId,startAt:x.startAt})),
  clientId:input.clientId||null,
  clientName:input.clientName?.trim()||null,
  clientPhone:input.clientPhone?phone(input.clientPhone):null,
  clientEmail:input.clientEmail?.trim().toLowerCase()||null,
  source:input.source,
  channelId:input.channelId||null,
  ...(input.source==='website'?{clientProfile:input.clientProfile||{}}:{}),
 };
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

@Injectable()
export class BookingCreationService {
 constructor(
  private readonly prisma:PrismaService,
  private readonly availability:BookingAvailabilityService,
  private readonly bookingAutomations:BookingAutomationMaterializationService,
 ){}

 private publicItems(body:PublicBookingDto):PublicBookingItemDto[]{
  if(body.items?.length)return body.items;
  if(body.serviceId&&body.professionalId&&body.startAt)return [{serviceId:body.serviceId,professionalId:body.professionalId,startAt:body.startAt}];
  throw new ConflictException('Informe pelo menos um serviço do agendamento');
 }

 async createPublicBooking(body:PublicBookingDto,key?:string){
  const profileData=Object.fromEntries(Object.entries({
   birthDate:body.birthDate,cpf:body.cpf,cep:body.cep,neighborhood:body.neighborhood,city:body.city,source:body.source,
  }).filter(([,v])=>v!==undefined&&v!==''));
  return this.createCanonical({
   unitId:body.unitId,
   items:this.publicItems(body).map(x=>({serviceId:x.serviceId,professionalId:x.professionalId,startAt:x.startAt})),
   clientName:body.clientName,
   clientPhone:body.clientPhone,
   clientEmail:body.clientEmail,
   clientProfile:profileData,
   source:'website',
   authorType:'CLIENT',
   auditAction:'booking.created_online',
   key,
   strictIdempotency:false,
   requireGrid:true,
  });
 }

 async createAgentMultiBooking(body:WhatsappAgentMultiBookingDto,key?:string){
  const idempotencyKey=strictKey(key);
  const channelId=String(body.channelId||'CENTRAL').trim();
  if(!isMessagingChannelId(channelId))throw new ConflictException('Canal de mensageria inválido');
  if(channelId!=='CENTRAL')throw new ConflictException('WA3C aceita somente o canal CENTRAL');
  if(body.clientId){
   const client=await this.prisma.client.findFirst({where:{id:body.clientId,active:true},select:{id:true}});
   if(!client)throw new NotFoundException('Cliente não encontrado ou inativo');
  }else if(!String(body.clientName||'').trim()||!String(body.clientPhone||'').trim()){
   throw new ConflictException('Informe clientId ou nome e telefone da cliente');
  }
  if(body.items.length!==body.services.length)throw new ConflictException('A seleção deve conter exatamente um item para cada serviço solicitado');
  const requestedIds=body.services.map(x=>x.serviceId),itemIds=body.items.map(x=>x.serviceId);
  if(new Set(requestedIds).size!==requestedIds.length||new Set(itemIds).size!==itemIds.length||requestedIds.some(id=>!itemIds.includes(id))){
   throw new ConflictException('A seleção de itens não corresponde aos serviços solicitados');
  }
  const directHash=createHash('sha256').update(JSON.stringify({
   unitId:body.unitId,date:body.date,services:body.services,
   items:body.items.map(x=>({serviceId:x.serviceId,professionalId:x.professionalId,startAt:new Date(x.startAt).toISOString()})),
   clientId:body.clientId||null,clientName:body.clientName?.trim()||null,
   clientPhone:body.clientPhone?phone(body.clientPhone):null,clientEmail:body.clientEmail?.trim().toLowerCase()||null,
   channelId,
  })).digest('hex');
  const expectedBookingId=operationId('whatsapp-agent-booking',idempotencyKey,'wa_');
  const existing=await this.prisma.booking.findUnique({where:{id:expectedBookingId},include:{items:true}});
  if(existing){
   this.verifyExisting(existing,directHash,true);
   await this.bookingAutomations.materializeCreatedBooking(existing.id);
   return this.multiBookingView(existing.id,body.date);
  }

  const result=await this.availability.multiAvailability({unitId:body.unitId,date:body.date,services:body.services});
  if(!result.bookingEnabled)throw new ServiceUnavailableException('Agendamento online não está habilitado nesta unidade');
  const normalized=body.items.map(x=>{
   const d=new Date(x.startAt);if(Number.isNaN(d.getTime()))throw new ConflictException('Horário inválido');
   return {serviceId:x.serviceId,professionalId:x.professionalId,startAt:d.toISOString()};
  }).sort((a,b)=>a.serviceId.localeCompare(b.serviceId));
  const visit=result.visits.find(v=>{
   const candidate=v.items.map((x:any)=>({serviceId:x.serviceId,professionalId:x.professionalId,startAt:x.startAt})).sort((a:any,b:any)=>a.serviceId.localeCompare(b.serviceId));
   return JSON.stringify(candidate)===JSON.stringify(normalized);
  });
  if(!visit)throw new ConflictException('A combinação selecionada não pertence à disponibilidade multi-serviço canônica atual');
  const byService=new Map(visit.items.map((x:any)=>[x.serviceId,x]));
  const row=await this.createCanonical({
   unitId:body.unitId,
   items:body.items.map(x=>{
    const selected:any=byService.get(x.serviceId);
    return {serviceId:x.serviceId,professionalId:x.professionalId,startAt:body.date+'T'+selected.localStart};
   }),
   clientId:body.clientId,clientName:body.clientName,clientPhone:body.clientPhone,clientEmail:body.clientEmail,
   source:'whatsapp_agent',authorType:'AGENT',auditAction:'booking.created_from_whatsapp',channelId,
   key:idempotencyKey,strictIdempotency:true,requireGrid:true,requirePhysicalCapacity:true,idempotencyHashOverride:directHash,
  });
  return this.multiBookingView(row.id,body.date);
 }

 private async multiBookingView(bookingId:string,date:string){
  const detail=await this.prisma.booking.findUniqueOrThrow({where:{id:bookingId},select:{
   id:true,unitId:true,clientId:true,status:true,
   items:{orderBy:{sortOrder:'asc'},select:{startAt:true,durationMin:true,unitPrice:true,service:{select:{id:true,name:true}},professional:{select:{id:true,name:true,publicName:true}}}},
  }});
  if(detail.items.some(x=>x.durationMin==null))throw new ConflictException('Agendamento histórico possui item sem duração confiável; revise antes de operar');
  const starts=detail.items.map(x=>x.startAt.getTime()),ends=detail.items.map(x=>x.startAt.getTime()+Number(x.durationMin)*60000);
  return {
   bookingId:detail.id,unitId:detail.unitId,clientId:detail.clientId,status:detail.status,date,
   visitStartAt:new Date(Math.min(...starts)).toISOString(),visitEndAt:new Date(Math.max(...ends)).toISOString(),
   items:detail.items.map(x=>({service:{id:x.service!.id,name:x.service!.name},professional:{id:x.professional.id,name:x.professional.publicName||x.professional.name},startAt:x.startAt.toISOString(),durationMin:x.durationMin,price:Number(x.unitPrice)})),
  };
 }

 async createAgentBooking(body:WhatsappAgentBookingDto,key?:string){
  const idempotencyKey=strictKey(key);
  const channelId=String(body.channelId||'CENTRAL').trim();
  if(!isMessagingChannelId(channelId))throw new ConflictException('Canal de mensageria inválido');
  if(channelId!=='CENTRAL')throw new ConflictException('WA3B aceita somente o canal CENTRAL');

  if(body.clientId){
   const client=await this.prisma.client.findFirst({where:{id:body.clientId,active:true},select:{id:true}});
   if(!client)throw new NotFoundException('Cliente não encontrado ou inativo');
  }else if(!String(body.clientName||'').trim()||!String(body.clientPhone||'').trim()){
   throw new ConflictException('Informe clientId ou nome e telefone da cliente');
  }

  const catalog=await this.availability.catalog(body.unitId);
  const service=catalog.services.find(x=>x.id===body.serviceId);
  if(!service)throw new NotFoundException('Serviço indisponível para agendamento online');
  const professional=(catalog.professionals as any[]).find(x=>x.id===body.professionalId);
  if(!professional)throw new NotFoundException('Profissional indisponível nesta unidade');
  if(!professional.serviceRules?.[body.serviceId])throw new ConflictException('Profissional não executa este serviço online');
  if(!catalog.bookingEnabled)throw new ServiceUnavailableException('Agendamento online não está habilitado nesta unidade');

  const availability=await this.availability.availability({
   unitId:body.unitId,date:body.date,serviceId:body.serviceId,professionalId:body.professionalId,
  });
  const requestedInstant=new Date(body.startAt);
  if(Number.isNaN(requestedInstant.getTime()))throw new ConflictException('Horário inválido');
  const normalized=requestedInstant.toISOString();
  const slot=availability.slots.find(x=>x.startAt===normalized&&x.professionalId===body.professionalId);
  if(!slot)throw new ConflictException('O horário selecionado não pertence à disponibilidade canônica atual');

  const row=await this.createCanonical({
   unitId:body.unitId,
   items:[{serviceId:body.serviceId,professionalId:body.professionalId,startAt:body.date+'T'+slot.localStart}],
   clientId:body.clientId,
   clientName:body.clientName,
   clientPhone:body.clientPhone,
   clientEmail:body.clientEmail,
   source:'whatsapp_agent',
   authorType:'AGENT',
   auditAction:'booking.created_from_whatsapp',
   channelId,
   key:idempotencyKey,
   strictIdempotency:true,
   requireGrid:true,
  });

  const detail=await this.prisma.booking.findUniqueOrThrow({
   where:{id:row.id},
   select:{
    id:true,unitId:true,clientId:true,status:true,serviceDate:true,
    items:{orderBy:{sortOrder:'asc'},take:1,select:{
     startAt:true,durationMin:true,unitPrice:true,
     service:{select:{id:true,name:true}},
     professional:{select:{id:true,name:true,publicName:true}},
    }},
   },
  });
  const item=detail.items[0];
  return {
   bookingId:detail.id,
   unitId:detail.unitId,
   clientId:detail.clientId,
   status:detail.status,
   service:item.service?{id:item.service.id,name:item.service.name}:null,
   professional:{id:item.professional.id,name:item.professional.publicName||item.professional.name},
   date:body.date,
   startAt:item.startAt.toISOString(),
   localStart:slot.localStart,
   durationMin:item.durationMin,
   price:Number(item.unitPrice),
  };
 }

 private async createCanonical(input:CanonicalInput){
  assertOperationalWriteEnabled(input.unitId,'Agendamento online central ainda não habilitado neste ambiente');
  if(!input.items.length)throw new ConflictException('Informe pelo menos um serviço do agendamento');
  const firstDate=input.items[0].startAt.slice(0,10);
  if(input.items.some(x=>x.startAt.slice(0,10)!==firstDate))throw new ConflictException('Todos os serviços da visita devem ocorrer na mesma data');
  const key=input.strictIdempotency?strictKey(input.key):input.key;
  const bookingId=input.strictIdempotency
   ?operationId('whatsapp-agent-booking',key,'wa_')
   :operationId(input.unitId+'|site-booking',key,'pub_');
  const idempotencyHash=input.idempotencyHashOverride||hashAgentPayload(input);

  const existingBefore=await this.prisma.booking.findUnique({where:{id:bookingId},include:{items:true}});
  if(existingBefore){
   const verified=this.verifyExisting(existingBefore,idempotencyHash,input.strictIdempotency);
   await this.bookingAutomations.materializeCreatedBooking(verified.id);
   return verified;
  }

  try{
   const row=await this.prisma.$transaction(async tx=>{
    assertOperationalWriteEnabled(input.unitId,'Agendamento online central ainda não habilitado neste ambiente');
    const prior=await tx.booking.findUnique({where:{id:bookingId},include:{items:true}});
    if(prior)return this.verifyExisting(prior,idempotencyHash,input.strictIdempotency);

    const unit=await tx.unit.findFirst({where:{id:input.unitId,active:true},select:{id:true,timezone:true}});
    if(!unit)throw new NotFoundException('Unidade indisponível');

    const prepared:any[]=[];
    for(let i=0;i<input.items.length;i++){
     const it=input.items[i];
     const localMinute=clockMinute(it.startAt.slice(11));
     if(input.requireGrid&&(!Number.isInteger(localMinute)||localMinute%PUBLIC_BOOKING_SLOT_MINUTES!==0)){
      throw new ConflictException('O horário não pertence ao grid canônico de disponibilidade');
     }
     const startAt=localDateTimeToUtc(it.startAt,unit.timezone);
     if(startAt<=new Date())throw new ConflictException('Horário passado não pode ser agendado online');
     const parts=zonedParts(startAt,unit.timezone);
     const calendar=String(parts.year).padStart(4,'0')+'-'+String(parts.month).padStart(2,'0')+'-'+String(parts.day).padStart(2,'0');
     if(calendar!==it.startAt.slice(0,10))throw new ConflictException('Data inválida');
     const [service,pro]=await Promise.all([
      tx.service.findFirst({where:{id:it.serviceId,active:true},select:{id:true,categoryId:true,price:true,durationMin:true,legacyPayload:true}}),
      tx.professionalUnit.findFirst({
       where:{unitId:input.unitId,professionalId:it.professionalId,active:true,professional:{active:true}},
       select:{professional:{select:{id:true,legacyPayload:true}}},
      }),
     ]);
     if(!service)throw new NotFoundException('Serviço indisponível');
     if(!pro)throw new NotFoundException('Profissional indisponível nesta unidade');
     const serviceLegacy=obj(service.legacyPayload),proLegacy=obj(pro.professional.legacyPayload);
     if(serviceLegacy.show===false||serviceLegacy.online===false)throw new NotFoundException('Serviço indisponível para agendamento online');
     if(proLegacy.show===false||proLegacy.online===false)throw new NotFoundException('Profissional indisponível para agendamento online');
     if(!canDo(proLegacy,serviceLegacy,it.professionalId,it.serviceId))throw new ConflictException('Profissional não executa este serviço');
     const rule=obj(obj(serviceLegacy.proRules)[it.professionalId]);
     if(rule.online===false)throw new ConflictException('Serviço indisponível para agendamento online com esta profissional');
     const duration=Math.max(1,Number(rule.duration??service.durationMin??30));
     const unitPrice=new Prisma.Decimal(Number(rule.price??service.price??0).toFixed(2));
     if(!insideSchedule(proLegacy,input.unitId,it.startAt,duration))throw new ConflictException('Horário fora da escala da profissional');
     prepared.push({
      id:'bi_'+createHash('sha256').update(bookingId+'|'+i).digest('hex').slice(0,40),
      bookingId,unitId:input.unitId,serviceId:it.serviceId,professionalId:it.professionalId,startAt,durationMin:duration,unitPrice,
      preference:false,forceFit:false,sortOrder:i,
      clientAreaSnapshot:String(serviceLegacy.clientArea||'none'),mustFinishBeforeSameAreaSnapshot:serviceLegacy.mustFinishBeforeSameArea===true,
      legacyPayload:{source:input.source,areaSnapshotSource:'service_at_write'},
      categoryId:service.categoryId||null,clientArea:String(serviceLegacy.clientArea||'none'),mustFinishBeforeSameArea:serviceLegacy.mustFinishBeforeSameArea===true,
     });
    }

    const serviceDate=new Date(firstDate+'T00:00:00.000Z');
    const lockKeys=[...new Set([
     ...prepared.map(x=>x.professionalId+'|'+firstDate),
     'physical|'+firstDate,
    ])].sort();
    for(const lock of lockKeys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.unitId}), hashtext(${lock}))`;

    // A second request with the same idempotency key may have entered before
    // the first transaction committed. Re-read after the advisory lock so it
    // converges to the committed booking instead of treating it as a slot race.
    const afterLock=await tx.booking.findUnique({where:{id:bookingId},include:{items:true}});
    if(afterLock)return this.verifyExisting(afterLock,idempotencyHash,input.strictIdempotency);

    for(let i=0;i<prepared.length;i++){
     const item=prepared[i],start=item.startAt.getTime(),end=start+item.durationMin*60000;
     for(let j=0;j<i;j++){
      const other=prepared[j],os=other.startAt.getTime(),oe=os+other.durationMin*60000;
      if(other.professionalId===item.professionalId&&os<end&&oe>start)throw new ConflictException('Os serviços selecionados estão sobrepostos para a mesma profissional');
     }
     const allDayBlock=await tx.booking.findFirst({
      where:{unitId:input.unitId,serviceDate,blockAllDay:true,status:{notIn:TERMINAL},OR:[{items:{some:{professionalId:item.professionalId}}},{items:{none:{}},professionalId:item.professionalId}]},
      select:{id:true},
     });
     if(allDayBlock)throw new ConflictException('Horário bloqueado para esta profissional');
     const candidates=await tx.bookingItem.findMany({
      where:{
       unitId:input.unitId,professionalId:item.professionalId,
       startAt:{gte:new Date(start-12*60*60*1000),lt:new Date(end)},
       booking:{status:{notIn:TERMINAL}},
      },
      select:{startAt:true,durationMin:true},
     });
     for(const x of candidates){
      if(x.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável; revise antes de gravar');
      const xs=x.startAt.getTime(),xe=xs+x.durationMin*60000;
      if(xs<end&&xe>start)throw new ConflictException('Horário não está mais disponível');
     }
    }

    const configuredStations=await tx.workstation.findMany({where:{unitId:input.unitId,active:true},select:{id:true,allowedCategoryIds:true},orderBy:{id:'asc'}});
    if(input.requirePhysicalCapacity||configuredStations.length){
     for(let i=0;i<prepared.length;i++)for(let j=0;j<i;j++){
      const a=prepared[j],b=prepared[i],as=a.startAt.getTime(),ae=as+a.durationMin*60000,bs=b.startAt.getTime(),be=bs+b.durationMin*60000;
      if(a.clientArea!=='none'&&b.clientArea!=='none'&&a.clientArea===b.clientArea){
       if(a.mustFinishBeforeSameArea&&!b.mustFinishBeforeSameArea&&bs<ae)throw new ConflictException('Ordem de execução da mesma área não foi respeitada');
       if(b.mustFinishBeforeSameArea&&!a.mustFinishBeforeSameArea&&as<be)throw new ConflictException('Ordem de execução da mesma área não foi respeitada');
       if(as<be&&ae>bs)throw new ConflictException('Serviços incompatíveis da mesma área não podem se sobrepor');
      }
     }
     const stations=configuredStations;
     const stationRows=stations.map(x=>({id:x.id,categories:Array.isArray(x.allowedCategoryIds)?x.allowedCategoryIds.map(String):[]}));
     const existingDemands=await tx.bookingItem.findMany({
      where:{unitId:input.unitId,booking:{serviceDate,status:{notIn:[...TERMINAL,'Bloqueado']}}},
      select:{id:true,startAt:true,durationMin:true,service:{select:{categoryId:true}}},
     });
     const demands=[
      ...existingDemands.map(x=>{if(x.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável; revise antes de calcular capacidade');return {id:'existing:'+x.id,start:x.startAt.getTime(),end:x.startAt.getTime()+x.durationMin*60000,categoryId:x.service?.categoryId||''}}),
      ...prepared.map((x:any,i:number)=>({id:'candidate:'+i,start:x.startAt.getTime(),end:x.startAt.getTime()+x.durationMin*60000,categoryId:x.categoryId||''})),
     ];
     if(!hasPhysicalCapacity(stationRows,demands.filter(x=>x.id.startsWith('existing:')),demands.filter(x=>x.id.startsWith('candidate:'))))throw new ConflictException('Capacidade física da unidade esgotada para a combinação selecionada');
    }

    const client=await this.resolveClient(tx,input);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.unitId}),hashtext(${'client|'+client.id+'|'+firstDate}))`;
    const sameClientItems=await tx.bookingItem.findMany({
     where:{unitId:input.unitId,booking:{clientId:client.id,serviceDate,status:{notIn:TERMINAL}}},
     select:{startAt:true,durationMin:true,clientAreaSnapshot:true,mustFinishBeforeSameAreaSnapshot:true},
    });
    const areaConflict=(a:any,b:any)=>{
     const areaA=a.clientAreaSnapshot,areaB=b.clientAreaSnapshot;
     if(areaA==null||areaB==null||areaA==='none'||areaB==='none'||areaA!==areaB)return false;
     if(a.mustFinishBeforeSameAreaSnapshot==null||b.mustFinishBeforeSameAreaSnapshot==null||a.durationMin==null||b.durationMin==null)return false;
     const as=a.startAt.getTime(),bs=b.startAt.getTime(),ae=as+Number(a.durationMin)*60000,be=bs+Number(b.durationMin)*60000;
     if(a.mustFinishBeforeSameAreaSnapshot&&!b.mustFinishBeforeSameAreaSnapshot&&bs<ae)return true;
     if(b.mustFinishBeforeSameAreaSnapshot&&!a.mustFinishBeforeSameAreaSnapshot&&as<be)return true;
     return as<be&&bs<ae;
    };
    for(const item of prepared)for(const other of sameClientItems)if(areaConflict(item,other))throw new ConflictException('Cliente já possui serviço incompatível na mesma área neste horário');
    await tx.clientUnitLink.upsert({
     where:{clientId_unitId:{clientId:client.id,unitId:input.unitId}},
     create:{clientId:client.id,unitId:input.unitId,source:input.source,active:true},
     update:{active:true},
    });

    const first=prepared[0];
    const bookingLegacy:any={source:input.source,authorType:input.authorType,multiItem:true};
    if(idempotencyHash)bookingLegacy.idempotencyHash=idempotencyHash;
    if(input.channelId)bookingLegacy.channelId=input.channelId;
    const row=await tx.booking.create({
     data:{
      id:bookingId,unitId:input.unitId,clientId:client.id,serviceDate,startAt:first.startAt,serviceId:first.serviceId,
      professionalId:first.professionalId,status:'Aguardando confirmação',notes:null,legacyPayload:bookingLegacy,
      items:{create:prepared.map(({bookingId,categoryId,clientArea,mustFinishBeforeSameArea,...x})=>x)},
     },
     include:{items:true},
    });
    await tx.auditEvent.create({data:{
     id:randomUUID(),unitId:input.unitId,action:input.auditAction,entityType:'Booking',entityId:row.id,
     legacyPayload:{
      source:input.source,clientId:client.id,itemCount:prepared.length,serviceIds:prepared.map(x=>x.serviceId),
      professionalIds:prepared.map(x=>x.professionalId),...(input.channelId?{channelId:input.channelId}:{}),
     },
     occurredAt:new Date(),
    }});
    return row;
   });
   await this.bookingAutomations.materializeCreatedBooking(row.id);
   return row;
  }catch(error){
   if((error as {code?:string})?.code==='P2002'){
    const raced=await this.prisma.booking.findUnique({where:{id:bookingId},include:{items:true}});
    if(raced){
     const verified=this.verifyExisting(raced,idempotencyHash,true);
     await this.bookingAutomations.materializeCreatedBooking(verified.id);
     return verified;
    }
   }
   throw error;
  }
 }

 private verifyExisting(row:any,idempotencyHash:string|null,strict:boolean){
  if(strict||idempotencyHash){
   const legacy=obj(row.legacyPayload);
   if(!idempotencyHash||legacy.idempotencyHash!==idempotencyHash)throw new ConflictException('Idempotency-Key já utilizada para outro agendamento');
  }
  return row;
 }

 private async resolveClient(tx:Prisma.TransactionClient,input:CanonicalInput){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('client-identity'), 0)`;
  if(input.clientId){
   const client=await tx.client.findFirst({where:{id:input.clientId,active:true}});
   if(!client)throw new NotFoundException('Cliente não encontrado ou inativo');
   return client;
  }
  const name=String(input.clientName||'').trim();
  if(!name)throw new ConflictException('Nome da cliente é obrigatório');
  const normalizedPhone=phone(String(input.clientPhone||''));
  const samePhone=await tx.client.findMany({where:{phone:normalizedPhone,active:true},orderBy:{createdAt:'asc'},take:30});
  let matches=samePhone.filter(x=>normName(x.name)===normName(name));
  if(input.source==='website'&&input.clientProfile?.birthDate){
   matches=matches.filter(x=>{
    const p=profile(x);
    return !(p?.birthDate&&String(p.birthDate)!==String(input.clientProfile?.birthDate));
   });
  }
  if(matches.length>1)throw new ConflictException('Mais de um cadastro ativo corresponde ao nome e telefone informados');
  let client=matches[0];
  const email=input.clientEmail?.trim().toLowerCase()||null;
  if(!client){
   client=await tx.client.create({data:{
    id:randomUUID(),name,phone:normalizedPhone,email,registrationUnitId:input.unitId,active:true,
    legacyPayload:{source:input.source,operationalProfile:input.clientProfile||{}} as Prisma.InputJsonValue,
   }});
   return client;
  }

  // Public booking cannot enrich an existing dossier without authenticated client-management permission.
  if(input.source==='website')return client;
  const old=obj(client.legacyPayload);
  const oldProfile=obj(old.operationalProfile);
  const incoming=input.clientProfile||{};
  const merged={...oldProfile,...Object.fromEntries(Object.entries(incoming).filter(([k,v])=>v!==undefined&&v!==''&&oldProfile[k]===undefined))};
  if((!client.email&&email)||Object.keys(incoming).length){
   client=await tx.client.update({where:{id:client.id},data:{
    email:client.email||email,
    legacyPayload:{...old,source:old.source||input.source,operationalProfile:merged},
   }});
  }
  return client;
 }
}
