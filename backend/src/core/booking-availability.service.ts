import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { operationalWriteStatus } from '../common/operational-write-gate';

export const PUBLIC_BOOKING_SLOT_MINUTES=15;
const TERMINAL_BOOKING_STATUSES=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

type AvailabilityQuery={unitId:string;date:string;serviceId:string;professionalId?:string};

function obj(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function clockMinute(value:string){
  const m=String(value||'').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!m)return Number.NaN;
  const h=Number(m[1]),min=Number(m[2]),sec=Number(m[3]||0);
  return h<=23&&min<=59&&sec<=59?h*60+min+sec/60:Number.NaN;
}
function minuteClock(value:number){
  const n=Math.max(0,Math.min(1439,Math.trunc(value)));
  return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
}
function scheduleDay(date:string){
  const d=new Date(date+'T12:00:00.000Z');
  return Number.isNaN(d.getTime())?-1:d.getUTCDay();
}
function validDateText(date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const d=new Date(date+'T12:00:00.000Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
}
function workingSchedule(schedule:any){
  return Object.values(obj(schedule)).some(v=>{
    const r=obj(v),a=clockMinute(String(r.start||'')),z=clockMinute(String(r.end||''));
    return r.work===true&&Number.isFinite(a)&&Number.isFinite(z)&&z>a;
  });
}
function zonedParts(value:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(value);
  const read=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:read('year'),month:read('month'),day:read('day'),hour:read('hour'),minute:read('minute'),second:read('second')};
}
function localDateTimeToUtc(date:string,time:string,timeZone:string){
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
  const desired=Date.UTC(year,month-1,day,hour,minute,0);
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
function localNow(timeZone:string){
  const p=zonedParts(new Date(),timeZone);
  return {
    date:String(p.year).padStart(4,'0')+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0'),
    minute:p.hour*60+p.minute+(p.second>0?1:0),
  };
}

@Injectable()
export class BookingAvailabilityService {
  constructor(private readonly prisma:PrismaService){}

  async catalog(unitId:string){
    const requested=String(unitId||'').trim();
    if(!requested)throw new ConflictException('Unidade é obrigatória');
    const unit=await this.prisma.unit.findFirst({where:{id:requested,active:true},select:{id:true,name:true,timezone:true}});
    if(!unit)throw new NotFoundException('Unidade indisponível');
    const [serviceRows,links]=await Promise.all([
      this.prisma.service.findMany({
        where:{active:true},
        select:{id:true,name:true,price:true,durationMin:true,categoryId:true,legacyPayload:true,category:{select:{id:true,name:true,active:true}}},
        orderBy:{name:'asc'},
      }),
      this.prisma.professionalUnit.findMany({
        where:{unitId:requested,active:true,professional:{active:true}},
        select:{professional:{select:{id:true,name:true,publicName:true,legacyPayload:true}}},
        orderBy:{professionalId:'asc'},
      }),
    ]);
    const services=serviceRows.map(s=>({row:s,config:obj(s.legacyPayload)}))
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
      const config=obj(p.legacyPayload);
      if(config.show===false||config.online===false)return null;
      const ownServices=Array.isArray(config.services)?config.services.map(String):[];
      const schedule=Object.fromEntries(Object.entries(obj(config.schedule)).filter(([key])=>key.startsWith(requested+'-')));
      const serviceRules:Record<string,{durationMin:number;price:number|null}>={};
      for(const service of serviceRows){
        if(!publicServiceIds.has(service.id))continue;
        const serviceConfig=obj(service.legacyPayload),rules=obj(serviceConfig.proRules),r=obj(rules[p.id]);
        const enabled=Object.prototype.hasOwnProperty.call(r,'enabled')?r.enabled===true:ownServices.includes(service.id);
        if(!enabled||r.online===false)continue;
        serviceRules[service.id]={
          durationMin:Math.max(1,Number(r.duration??service.durationMin)),
          price:serviceConfig.showPrice===false?null:Number(r.price??service.price),
        };
      }
      const serviceIds=Object.keys(serviceRules);
      if(!serviceIds.length)return null;
      return {
        id:p.id,name:p.publicName||p.name,publicName:p.publicName||p.name,
        specialty:String(config.specialty||''),bio:String(config.bio||''),photo:String(config.photo||''),
        schedule,serviceIds,serviceRules,
      };
    }).filter(Boolean).sort((a:any,b:any)=>String(a.publicName).localeCompare(String(b.publicName)));
    const bookingEnabled=operationalWriteStatus(requested).unitEnabled&&professionals.some((p:any)=>workingSchedule(p.schedule));
    return {unit,bookingEnabled,services,professionals};
  }

  async activeUnits(){
    const rows=await this.prisma.unit.findMany({where:{active:true},select:{id:true,name:true,timezone:true},orderBy:{name:'asc'}});
    return Promise.all(rows.map(async unit=>{
      const catalog=await this.catalog(unit.id);
      return {...unit,bookingEnabled:catalog.bookingEnabled};
    }));
  }

  async availability(input:AvailabilityQuery){
    const unitId=String(input.unitId||'').trim(),date=String(input.date||'').trim(),serviceId=String(input.serviceId||'').trim();
    const professionalId=String(input.professionalId||'').trim()||undefined;
    if(!unitId||!date||!serviceId)throw new ConflictException('unitId, date e serviceId são obrigatórios');
    if(!validDateText(date))throw new ConflictException('Data inválida');

    const catalog=await this.catalog(unitId);
    const service=catalog.services.find(s=>s.id===serviceId);
    if(!service)throw new NotFoundException('Serviço indisponível para agendamento online');

    const base={
      unitId,date,serviceId,professionalId:professionalId||null,
      bookingEnabled:catalog.bookingEnabled,
      timezone:catalog.unit.timezone,
      slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,
    };
    if(!catalog.bookingEnabled)return {...base,slots:[]};

    const now=localNow(catalog.unit.timezone);
    if(date<now.date)return {...base,slots:[]};

    const day=scheduleDay(date);
    const eligible=(catalog.professionals as any[]).filter(p=>
      (!professionalId||p.id===professionalId)&&
      p.serviceRules?.[serviceId]
    );
    if(!eligible.length)return {...base,slots:[]};

    const serviceDate=new Date(date+'T00:00:00.000Z');
    const professionalIds=eligible.map(p=>p.id);
    const [items,allDayBlocks]=await Promise.all([
      this.prisma.bookingItem.findMany({
        where:{
          unitId,
          professionalId:{in:professionalIds},
          booking:{serviceDate,status:{notIn:TERMINAL_BOOKING_STATUSES}},
        },
        select:{professionalId:true,startAt:true,durationMin:true},
      }),
      this.prisma.booking.findMany({
        where:{
          unitId,serviceDate,blockAllDay:true,status:{notIn:TERMINAL_BOOKING_STATUSES},
          OR:[
            {professionalId:{in:professionalIds}},
            {items:{some:{professionalId:{in:professionalIds}}}},
          ],
        },
        select:{professionalId:true,items:{select:{professionalId:true}}},
      }),
    ]);

    const blocked=new Set<string>();
    for(const row of allDayBlocks){
      if(row.professionalId)blocked.add(row.professionalId);
      for(const item of row.items)blocked.add(item.professionalId);
    }
    const occupied=new Map<string,Array<{start:number;end:number}>>();
    for(const id of professionalIds)occupied.set(id,[]);
    for(const item of items){
      const start=item.startAt.getTime(),end=start+item.durationMin*60_000;
      occupied.get(item.professionalId)?.push({start,end});
    }

    const slots:any[]=[];
    for(const pro of eligible){
      if(blocked.has(pro.id))continue;
      const schedule=obj(pro.schedule)[unitId+'-'+day],start=clockMinute(String(schedule?.start||'')),end=clockMinute(String(schedule?.end||''));
      if(schedule?.work!==true||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
      const rule=pro.serviceRules[serviceId],durationMin=Math.max(1,Number(rule.durationMin||service.durationMin));
      let first=Math.ceil(start/PUBLIC_BOOKING_SLOT_MINUTES)*PUBLIC_BOOKING_SLOT_MINUTES;
      if(date===now.date)first=Math.max(first,Math.ceil(now.minute/PUBLIC_BOOKING_SLOT_MINUTES)*PUBLIC_BOOKING_SLOT_MINUTES);
      for(let minute=first;minute+durationMin<=end;minute+=PUBLIC_BOOKING_SLOT_MINUTES){
        const localStart=minuteClock(minute),localEnd=minuteClock(minute+durationMin);
        const startAt=localDateTimeToUtc(date,localStart,catalog.unit.timezone);
        const endAt=localDateTimeToUtc(date,localEnd,catalog.unit.timezone);
        const startMs=startAt.getTime(),endMs=endAt.getTime();
        const conflict=(occupied.get(pro.id)||[]).some(x=>x.start<endMs&&x.end>startMs);
        if(conflict)continue;
        slots.push({
          startAt:startAt.toISOString(),
          endAt:endAt.toISOString(),
          localStart,
          localEnd,
          professionalId:pro.id,
          professionalName:pro.publicName||pro.name,
          durationMin,
          price:rule.price,
        });
      }
    }
    slots.sort((a,b)=>a.startAt.localeCompare(b.startAt)||String(a.professionalName).localeCompare(String(b.professionalName))||a.professionalId.localeCompare(b.professionalId));
    return {...base,slots};
  }
}
