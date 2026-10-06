import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { operationalWriteStatus } from '../common/operational-write-gate';

export const PUBLIC_BOOKING_SLOT_MINUTES=15;
const TERMINAL_BOOKING_STATUSES=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

type AvailabilityQuery={unitId:string;date:string;serviceId:string;professionalId?:string};
export type MultiServicePreferenceMode='preferred'|'required';
export type MultiServiceSpec={serviceId:string;professionalId?:string;preferenceMode?:MultiServicePreferenceMode};
export type MultiAvailabilityQuery={unitId:string;date:string;services:MultiServiceSpec[]};

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
        mustFinishBeforeSameArea:config.mustFinishBeforeSameArea===true,
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

  async multiAvailability(input:MultiAvailabilityQuery){
    const unitId=String(input.unitId||'').trim(),date=String(input.date||'').trim();
    if(!unitId||!validDateText(date))throw new ConflictException('unitId e date válidos são obrigatórios');
    if(!Array.isArray(input.services)||input.services.length<2||input.services.length>5)throw new ConflictException('Informe entre 2 e 5 serviços');
    const catalog=await this.catalog(unitId);
    if(!catalog.bookingEnabled)return {unitId,date,bookingEnabled:false,timezone:catalog.unit.timezone,slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,visits:[]};
    const ids=input.services.map(x=>String(x.serviceId||''));
    if(new Set(ids).size!==ids.length)throw new ConflictException('Não repita o mesmo serviço na composição');
    const serviceMap=new Map(catalog.services.map(x=>[x.id,x]));
    for(const id of ids)if(!serviceMap.has(id))throw new NotFoundException('Serviço indisponível para agendamento online: '+id);
    const day=scheduleDay(date),now=localNow(catalog.unit.timezone),serviceDate=new Date(date+'T00:00:00.000Z');
    if(date<now.date)return {unitId,date,bookingEnabled:true,timezone:catalog.unit.timezone,slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,visits:[]};

    const workstations=await this.prisma.workstation.findMany({where:{unitId,active:true},select:{id:true,name:true,allowedCategoryIds:true},orderBy:{id:'asc'}});
    const stationRows=workstations.map(w=>({id:w.id,name:w.name,categories:Array.isArray(w.allowedCategoryIds)?w.allowedCategoryIds.map(String):[]}));
    const existing=await this.prisma.bookingItem.findMany({
      where:{unitId,booking:{serviceDate,status:{notIn:TERMINAL_BOOKING_STATUSES}}},
      select:{id:true,professionalId:true,startAt:true,durationMin:true,service:{select:{id:true,categoryId:true}}},
    });
    const allDay=await this.prisma.booking.findMany({where:{unitId,serviceDate,blockAllDay:true,status:{notIn:TERMINAL_BOOKING_STATUSES}},select:{professionalId:true,items:{select:{professionalId:true}}}});
    const blocked=new Set<string>();for(const b of allDay){if(b.items.length)for(const x of b.items)blocked.add(x.professionalId);else if(b.professionalId)blocked.add(b.professionalId)}
    const occupied=new Map<string,Array<{start:number;end:number}>>();
    for(const x of existing){if(x.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável; revise antes de calcular disponibilidade');const a=x.startAt.getTime(),z=a+x.durationMin*60000;if(!occupied.has(x.professionalId))occupied.set(x.professionalId,[]);occupied.get(x.professionalId)!.push({start:a,end:z})}

    const specs=input.services.map((request,index)=>{
      const service=serviceMap.get(request.serviceId)!;
      let pros=(catalog.professionals as any[]).filter(p=>p.serviceRules?.[request.serviceId]&&!blocked.has(p.id));
      const mode=request.preferenceMode||'preferred',preferred=String(request.professionalId||'');
      if(mode==='required'&&preferred)pros=pros.filter(p=>p.id===preferred);
      pros.sort((a,b)=>(preferred?(a.id===preferred?-1:b.id===preferred?1:0):0)||String(a.publicName).localeCompare(String(b.publicName))||a.id.localeCompare(b.id));
      return {request,index,service,pros,mode,preferred};
    }).sort((a,b)=>Number(b.service.mustFinishBeforeSameArea)-Number(a.service.mustFinishBeforeSameArea)||a.index-b.index);
    if(specs.some(x=>!x.pros.length))return {unitId,date,bookingEnabled:true,timezone:catalog.unit.timezone,slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,visits:[]};

    const windows:any[]=[];for(const sp of specs)for(const p of sp.pros){const r=obj(p.schedule)[unitId+'-'+day],a=clockMinute(String(r?.start||'')),z=clockMinute(String(r?.end||''));if(r?.work===true&&Number.isFinite(a)&&Number.isFinite(z)&&z>a)windows.push({a,z})}
    if(!windows.length)return {unitId,date,bookingEnabled:true,timezone:catalog.unit.timezone,slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,visits:[]};
    let searchStart=Math.min(...windows.map(x=>x.a)),searchEnd=Math.max(...windows.map(x=>x.z));
    if(date===now.date)searchStart=Math.max(searchStart,Math.ceil(now.minute/PUBLIC_BOOKING_SLOT_MINUTES)*PUBLIC_BOOKING_SLOT_MINUTES);

    const compatibleClient=(assigned:any[],candidate:any)=>{
      for(const a of assigned){
        if(a.clientArea==='none'||candidate.clientArea==='none'||a.clientArea!==candidate.clientArea)continue;
        const overlap=a.startMin<candidate.endMin&&a.endMin>candidate.startMin;
        if(a.mustFinishBeforeSameArea&&!candidate.mustFinishBeforeSameArea&&candidate.startMin<a.endMin)return false;
        if(candidate.mustFinishBeforeSameArea&&!a.mustFinishBeforeSameArea&&a.startMin<candidate.endMin)return false;
        if(overlap)return false;
      }return true;
    };
    const capacityOk=(assigned:any[])=>{
      if(!assigned.length)return true;
      const demands=[
        ...existing.map(x=>{if(x.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável; revise antes de calcular capacidade');return {id:'existing:'+x.id,start:x.startAt.getTime(),end:x.startAt.getTime()+x.durationMin*60000,categoryId:x.service?.categoryId||''}}),
        ...assigned.map((x:any,i:number)=>({id:'candidate:'+i,start:x.startAtMs,end:x.endAtMs,categoryId:x.categoryId||''})),
      ];
      const marks=[...new Set(demands.flatMap(x=>[x.start,x.end]))].sort((a,b)=>a-b);
      for(let mi=0;mi<marks.length-1;mi++){
        const a=marks[mi],z=marks[mi+1],active=demands.filter(x=>x.start<z&&x.end>a);
        if(!active.length)continue;
        const candidates=active.map(d=>stationRows.filter(st=>st.categories.includes(d.categoryId)).map(st=>st.id));
        if(active.some((d,i)=>!d.categoryId||!candidates[i].length))return false;
        const stationToDemand=new Map<string,number>();
        const assign=(di:number,seen:Set<string>):boolean=>{for(const sid of candidates[di]){if(seen.has(sid))continue;seen.add(sid);const prev=stationToDemand.get(sid);if(prev===undefined||assign(prev,seen)){stationToDemand.set(sid,di);return true}}return false};
        const order=active.map((_,i)=>i).sort((i,j)=>candidates[i].length-candidates[j].length||active[i].id.localeCompare(active[j].id));
        let count=0;for(const di of order)if(assign(di,new Set()))count++;
        if(count<active.length)return false;
      }return true;
    };

    const visits:any[]=[];
    for(let anchor=searchStart;anchor<searchEnd;anchor+=PUBLIC_BOOKING_SLOT_MINUTES){
      let states:any[]=[{assigned:[],maxEnd:anchor,preferencePenalty:0}];
      for(let si=0;si<specs.length;si++){
        const sp=specs[si],next:any[]=[];
        for(const state of states){
          const starts:number[]=[];
          if(si===0)starts.push(anchor);else for(let m=anchor;m<searchEnd;m+=PUBLIC_BOOKING_SLOT_MINUTES)starts.push(m);
          for(const p of sp.pros){
            const rule=p.serviceRules[sp.service.id],duration=Math.max(1,Number(rule.durationMin||sp.service.durationMin));
            const sch=obj(p.schedule)[unitId+'-'+day],wa=clockMinute(String(sch?.start||'')),wz=clockMinute(String(sch?.end||''));
            if(sch?.work!==true||!Number.isFinite(wa)||!Number.isFinite(wz))continue;
            for(const m of starts){
              const end=m+duration;if(m<wa||end>wz||end>searchEnd)continue;
              const startAt=localDateTimeToUtc(date,minuteClock(m),catalog.unit.timezone),endAt=localDateTimeToUtc(date,minuteClock(end),catalog.unit.timezone),ams=startAt.getTime(),zms=endAt.getTime();
              if((occupied.get(p.id)||[]).some(x=>x.start<zms&&x.end>ams))continue;
              if(state.assigned.some((x:any)=>x.professionalId===p.id&&x.startMin<end&&x.endMin>m))continue;
              const cand={serviceId:sp.service.id,serviceName:sp.service.name,professionalId:p.id,professionalName:p.publicName||p.name,startAt:startAt.toISOString(),endAt:endAt.toISOString(),localStart:minuteClock(m),localEnd:minuteClock(end),startAtMs:ams,endAtMs:zms,startMin:m,endMin:end,durationMin:duration,price:rule.price,clientArea:sp.service.clientArea,mustFinishBeforeSameArea:sp.service.mustFinishBeforeSameArea,categoryId:sp.service.categoryId};
              if(!compatibleClient(state.assigned,cand))continue;
              const assigned=state.assigned.concat(cand);if(!capacityOk(assigned))continue;
              next.push({assigned,maxEnd:Math.max(state.maxEnd,end),preferencePenalty:state.preferencePenalty+(sp.preferred&&p.id!==sp.preferred?1:0)});
            }
          }
        }
        next.sort((a,b)=>(a.maxEnd-anchor)-(b.maxEnd-anchor)||a.preferencePenalty-b.preferencePenalty||JSON.stringify(a.assigned.map((x:any)=>[x.startMin,x.professionalId,x.serviceId])).localeCompare(JSON.stringify(b.assigned.map((x:any)=>[x.startMin,x.professionalId,x.serviceId]))));
        states=next.slice(0,80);if(!states.length)break;
      }
      if(states.length){
        const best=states[0],ordered=best.assigned.slice().sort((a:any,b:any)=>a.startMin-b.startMin||a.serviceId.localeCompare(b.serviceId));
        visits.push({visitStartAt:localDateTimeToUtc(date,minuteClock(anchor),catalog.unit.timezone).toISOString(),visitEndAt:localDateTimeToUtc(date,minuteClock(best.maxEnd),catalog.unit.timezone).toISOString(),localStart:minuteClock(anchor),localEnd:minuteClock(best.maxEnd),visitDurationMin:best.maxEnd-anchor,preferencePenalty:best.preferencePenalty,items:ordered});
      }
    }
    visits.sort((a,b)=>a.visitDurationMin-b.visitDurationMin||a.preferencePenalty-b.preferencePenalty||a.visitStartAt.localeCompare(b.visitStartAt)||JSON.stringify(a.items).localeCompare(JSON.stringify(b.items)));
    return {unitId,date,bookingEnabled:true,timezone:catalog.unit.timezone,slotMinutes:PUBLIC_BOOKING_SLOT_MINUTES,visits:visits.slice(0,60)};
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
            {items:{some:{professionalId:{in:professionalIds}}}},
            {items:{none:{}},professionalId:{in:professionalIds}},
          ],
        },
        select:{professionalId:true,items:{select:{professionalId:true}}},
      }),
    ]);

    const blocked=new Set<string>();
    for(const row of allDayBlocks){if(row.items.length)for(const item of row.items)blocked.add(item.professionalId);else if(row.professionalId)blocked.add(row.professionalId);}
    const occupied=new Map<string,Array<{start:number;end:number}>>();
    for(const id of professionalIds)occupied.set(id,[]);
    for(const item of items){
      if(item.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável; revise antes de calcular disponibilidade');
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
