import { Body, ConflictException, Controller, Get, Headers, NotFoundException, Post, Query } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';
import { assertOperationalWriteEnabled, operationalWriteStatus } from '../common/operational-write-gate';
import { PublicBookingDto, PublicBookingItemDto } from './public-booking.dto';

const TERMINAL=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

@Controller('api/v1/public')
export class PublicBookingController {
 constructor(private readonly prisma:PrismaService){}
 private id(scope:string,key?:string){const k=String(key||'').trim();return k?'pub_'+createHash('sha256').update(scope+'|'+k).digest('hex').slice(0,40):randomUUID()}
 private startAt(value:string){const iso=value.length===16?value+':00-03:00':value+'-03:00';const date=new Date(iso);if(Number.isNaN(date.getTime()))throw new ConflictException('Horário inválido');return date}
 private normName(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
 private phone(value:string){const d=String(value||'').replace(/\D/g,'');if(!d)throw new ConflictException('Celular inválido');if(d.startsWith('55')&&d.length>=12)return '+'+d;if(d.length===10||d.length===11)return '+55'+d;return '+'+d}
 private canDo(proLegacy:any,serviceLegacy:any,professionalId:string,serviceId:string){const services=Array.isArray(proLegacy?.services)?proLegacy.services.map(String):[],rule=serviceLegacy?.proRules&&typeof serviceLegacy.proRules==='object'?serviceLegacy.proRules[professionalId]:undefined;if(rule?.enabled===false)return false;if(rule?.enabled===true)return true;return services.length?services.includes(serviceId):true}
 private profile(row:any){const legacy=row?.legacyPayload&&typeof row.legacyPayload==='object'&&!Array.isArray(row.legacyPayload)?row.legacyPayload:{};return legacy?.operationalProfile&&typeof legacy.operationalProfile==='object'?legacy.operationalProfile:legacy}
 private publicProfile(b:PublicBookingDto){return Object.fromEntries(Object.entries({birthDate:b.birthDate,cpf:b.cpf,cep:b.cep,neighborhood:b.neighborhood,city:b.city,source:b.source}).filter(([,v])=>v!==undefined&&v!==''))}
 private rawItems(b:PublicBookingDto):PublicBookingItemDto[]{if(b.items?.length)return b.items;if(b.serviceId&&b.professionalId&&b.startAt)return [{serviceId:b.serviceId,professionalId:b.professionalId,startAt:b.startAt}];throw new ConflictException('Informe pelo menos um serviço do agendamento')}

 private obj(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}

 @Public() @Get('catalog')
 async catalog(@Query('unitId') unitId=''){
  const requested=String(unitId||'').trim();if(!requested)throw new ConflictException('Unidade é obrigatória');
  const unit=await this.prisma.unit.findFirst({where:{id:requested,active:true},select:{id:true,name:true,timezone:true}});if(!unit)throw new NotFoundException('Unidade indisponível');
  const [serviceRows,links]=await Promise.all([
   this.prisma.service.findMany({where:{active:true},select:{id:true,name:true,price:true,durationMin:true,categoryId:true,legacyPayload:true,category:{select:{id:true,name:true,active:true}}},orderBy:{name:'asc'}}),
   this.prisma.professionalUnit.findMany({where:{unitId:requested,active:true,professional:{active:true}},select:{professional:{select:{id:true,name:true,publicName:true,legacyPayload:true}}},orderBy:{professionalId:'asc'}}),
  ]);
  const services=serviceRows.map(s=>({row:s,config:this.obj(s.legacyPayload)}))
   .filter(x=>x.config.show!==false&&x.config.online!==false)
   .sort((a,b)=>(Number(a.config.websiteOrder||0)-Number(b.config.websiteOrder||0))||a.row.name.localeCompare(b.row.name))
   .map(({row:s,config})=>({
    id:s.id,name:s.name,categoryId:s.categoryId||null,category:s.category&&s.category.active?{id:s.category.id,name:s.category.name}:null,
    price:config.showPrice===false?null:Number(s.price),durationMin:s.durationMin,showPrice:config.showPrice!==false,
    priceMode:String(config.priceMode||'fixed'),publicDescription:String(config.publicDescription||config.description||''),
    coverImage:String(config.coverImage||''),gallery:Array.isArray(config.gallery)?config.gallery.filter((x:any)=>typeof x==='string'):[],
    websiteOrder:Number(config.websiteOrder||0),clientArea:String(config.clientArea||'none'),
   }));
  const publicServiceIds=new Set(services.map(s=>s.id));
  const professionals=links.map(({professional:p})=>{
   const config=this.obj(p.legacyPayload);if(config.show===false||config.online===false)return null;
   const ownServices=Array.isArray(config.services)?config.services.map(String):[],schedule=Object.fromEntries(Object.entries(this.obj(config.schedule)).filter(([key])=>key.startsWith(requested+'-')));
   const serviceRules:Record<string,{durationMin:number;price:number|null}>={};
   for(const service of serviceRows){
    if(!publicServiceIds.has(service.id))continue;
    const serviceConfig=this.obj(service.legacyPayload),rules=this.obj(serviceConfig.proRules),r=this.obj(rules[p.id]);
    const enabled=r.enabled===true||(r.enabled!==false&&(!ownServices.length||ownServices.includes(service.id)));if(!enabled||r.online===false)continue;
    serviceRules[service.id]={durationMin:Math.max(1,Number(r.duration??service.durationMin)),price:serviceConfig.showPrice===false?null:Number(r.price??service.price)};
   }
   const serviceIds=Object.keys(serviceRules);if(!serviceIds.length)return null;
   return {id:p.id,name:p.publicName||p.name,publicName:p.publicName||p.name,specialty:String(config.specialty||''),bio:String(config.bio||''),photo:String(config.photo||''),schedule,serviceIds,serviceRules};
  }).filter(Boolean).sort((a:any,b:any)=>String(a.publicName).localeCompare(String(b.publicName)));
  return {unit,bookingEnabled:operationalWriteStatus(requested).unitEnabled,services,professionals};
 }

 @Public() @Get('occupancy')
 async occupancy(@Query('unitId') unitId='',@Query('date') date=''){
  if(!unitId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ConflictException('Unidade e data são obrigatórias');
  const unit=await this.prisma.unit.findFirst({where:{id:unitId,active:true},select:{id:true}});if(!unit)throw new NotFoundException('Unidade indisponível');
  return this.prisma.booking.findMany({
   where:{unitId,serviceDate:new Date(date+'T00:00:00.000Z'),status:{notIn:TERMINAL}},
   select:{id:true,status:true,blockAllDay:true,items:{orderBy:{sortOrder:'asc'},select:{professionalId:true,serviceId:true,startAt:true,durationMin:true}}},
   orderBy:{startAt:'asc'},take:1000,
  });
 }

 @Public() @Post('bookings')
 async book(@Body() b:PublicBookingDto,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(b.unitId,'Agendamento online central ainda não habilitado neste ambiente');const raw=this.rawItems(b),firstDate=raw[0].startAt.slice(0,10);if(raw.some(x=>x.startAt.slice(0,10)!==firstDate))throw new ConflictException('Todos os serviços da visita devem ocorrer na mesma data');
  const serviceDate=new Date(firstDate+'T00:00:00.000Z'),bookingId=this.id(b.unitId+'|site-booking',key);
  return this.prisma.$transaction(async tx=>{
   const prior=await tx.booking.findUnique({where:{id:bookingId},include:{items:true}});if(prior)return prior;
   const unit=await tx.unit.findFirst({where:{id:b.unitId,active:true}});if(!unit)throw new NotFoundException('Unidade indisponível');
   const prepared:any[]=[];
   for(let i=0;i<raw.length;i++){
    const it=raw[i],startAt=this.startAt(it.startAt);
    const [service,pro]=await Promise.all([
     tx.service.findFirst({where:{id:it.serviceId,active:true},select:{id:true,price:true,durationMin:true,legacyPayload:true}}),
     tx.professionalUnit.findFirst({where:{unitId:b.unitId,professionalId:it.professionalId,active:true,professional:{active:true}},select:{professional:{select:{legacyPayload:true}}}}),
    ]);
    if(!service)throw new NotFoundException('Serviço indisponível');
    if(!pro)throw new NotFoundException('Profissional indisponível nesta unidade');
    if(!this.canDo(pro.professional.legacyPayload,service.legacyPayload,it.professionalId,it.serviceId))throw new ConflictException('Profissional não executa este serviço');
    const rule=(service.legacyPayload as any)?.proRules?.[it.professionalId],duration=Math.max(1,Number(rule?.duration??service.durationMin??30)),unitPrice=new Prisma.Decimal(Number(rule?.price??service.price??0).toFixed(2));
    prepared.push({id:'bi_'+createHash('sha256').update(bookingId+'|'+i).digest('hex').slice(0,40),bookingId,unitId:b.unitId,serviceId:it.serviceId,professionalId:it.professionalId,startAt,durationMin:duration,unitPrice,preference:false,forceFit:false,sortOrder:i,legacyPayload:{source:'website'}});
   }
   const lockKeys=[...new Set(prepared.map(x=>x.professionalId+'|'+firstDate))].sort();for(const lock of lockKeys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${b.unitId}), hashtext(${lock}))`;
   for(let i=0;i<prepared.length;i++){
    const item=prepared[i],start=item.startAt.getTime(),end=start+item.durationMin*60000;
    for(let j=0;j<i;j++){const other=prepared[j],os=other.startAt.getTime(),oe=os+other.durationMin*60000;if(other.professionalId===item.professionalId&&os<end&&oe>start)throw new ConflictException('Os serviços selecionados estão sobrepostos para a mesma profissional')}
    const candidates=await tx.bookingItem.findMany({where:{unitId:b.unitId,professionalId:item.professionalId,startAt:{gte:new Date(start-12*60*60*1000),lt:new Date(end)},booking:{status:{notIn:TERMINAL}}},select:{startAt:true,durationMin:true}});
    for(const x of candidates){const xs=x.startAt.getTime(),xe=xs+x.durationMin*60000;if(xs<end&&xe>start)throw new ConflictException('Horário não está mais disponível')}
   }
   const phone=this.phone(b.clientPhone),samePhone=await tx.client.findMany({where:{phone,active:true},take:30});let client=samePhone.find(x=>{if(this.normName(x.name)!==this.normName(b.clientName))return false;const p=this.profile(x);return !(b.birthDate&&p?.birthDate&&String(p.birthDate)!==b.birthDate)});
   const incomingProfile=this.publicProfile(b);
   if(!client)client=await tx.client.create({data:{id:randomUUID(),name:b.clientName.trim(),phone,email:b.clientEmail?.trim().toLowerCase()||null,registrationUnitId:b.unitId,active:true,legacyPayload:{source:'website',operationalProfile:incomingProfile}}});
   else{
    const old=client.legacyPayload&&typeof client.legacyPayload==='object'&&!Array.isArray(client.legacyPayload)?client.legacyPayload as any:{},profile={...(old.operationalProfile&&typeof old.operationalProfile==='object'?old.operationalProfile:{}),...Object.fromEntries(Object.entries(incomingProfile).filter(([k,v])=>v!==undefined&&v!==''&&!old.operationalProfile?.[k]))};
    if((!client.email&&b.clientEmail)||Object.keys(profile).length)client=await tx.client.update({where:{id:client.id},data:{email:client.email||b.clientEmail?.trim().toLowerCase()||null,legacyPayload:{...old,source:old.source||'website',operationalProfile:profile}}});
   }
   await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:client.id,unitId:b.unitId}},create:{clientId:client.id,unitId:b.unitId,source:'website',active:true},update:{active:true}});
   const first=prepared[0],row=await tx.booking.create({data:{id:bookingId,unitId:b.unitId,clientId:client.id,serviceDate,startAt:first.startAt,serviceId:first.serviceId,professionalId:first.professionalId,status:'Aguardando confirmação',notes:null,legacyPayload:{source:'website',authorType:'CLIENT',multiItem:true},items:{create:prepared.map(({bookingId,...x})=>x)}},include:{items:true}});
   await tx.auditEvent.create({data:{id:randomUUID(),unitId:b.unitId,action:'booking.created_online',entityType:'Booking',entityId:row.id,legacyPayload:{source:'website',clientId:client.id,itemCount:prepared.length,serviceIds:prepared.map(x=>x.serviceId),professionalIds:prepared.map(x=>x.professionalId)},occurredAt:new Date()}});
   return row;
  });
 }
}
