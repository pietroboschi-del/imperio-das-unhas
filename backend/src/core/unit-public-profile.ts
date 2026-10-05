import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export const UNIT_PUBLIC_PROFILE_DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
export type UnitPublicProfileDay=typeof UNIT_PUBLIC_PROFILE_DAYS[number];
export type OpeningDayStatus='OPEN'|'CLOSED'|'UNSET';
export type OpeningDay={status:OpeningDayStatus;open:string;close:string};
export type OpeningHours=Record<UnitPublicProfileDay,OpeningDay>;
export type UnitPublicProfile={
  publicName:string;
  fullAddress:string;
  mapsQuery:string;
  mapsUrl:string;
  locationHint:string;
  phone:string;
  whatsapp:string;
  showOnWebsite:boolean;
  openingHours:OpeningHours;
};

const CANONICAL_IDS=['centro','big','shopping-contagem'] as const;
export type CanonicalUnitId=typeof CANONICAL_IDS[number];
const DAY_SET=new Set<string>(UNIT_PUBLIC_PROFILE_DAYS);
const CANONICAL_SET=new Set<string>(CANONICAL_IDS);
const blankDay=():OpeningDay=>({status:'UNSET',open:'',close:''});
const openDay=(open:string,close:string):OpeningDay=>({status:'OPEN',open,close});
const closedDay=():OpeningDay=>({status:'CLOSED',open:'',close:''});
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

function week(entries:Partial<OpeningHours>={}):OpeningHours{
  return Object.fromEntries(UNIT_PUBLIC_PROFILE_DAYS.map(day=>[day,{...blankDay(),...(entries[day]||{})}])) as OpeningHours;
}

export function isCanonicalUnitId(value:string):value is CanonicalUnitId{return CANONICAL_SET.has(String(value||''));}

export function defaultUnitPublicProfile(unitId:CanonicalUnitId):UnitPublicProfile{
  const contact={phone:'(31) 98351-4216',whatsapp:'5531983514216'};
  if(unitId==='big')return {
    publicName:'Império das Unhas — Big Shopping',fullAddress:'',mapsQuery:'',mapsUrl:'',
    locationHint:'1º andar, em frente à Leitura',...contact,showOnWebsite:true,
    openingHours:week({
      monday:openDay('10:00','22:00'),tuesday:openDay('10:00','22:00'),wednesday:openDay('10:00','22:00'),
      thursday:openDay('10:00','22:00'),friday:openDay('10:00','22:00'),saturday:openDay('10:00','22:00'),
      sunday:openDay('12:00','18:00'),
    }),
  };
  if(unitId==='shopping-contagem')return {
    publicName:'Império das Unhas — Shopping Contagem',fullAddress:'',mapsQuery:'',mapsUrl:'',
    locationHint:'1º andar, em frente à TIM',...contact,showOnWebsite:true,
    openingHours:week({
      monday:openDay('10:00','22:00'),tuesday:openDay('10:00','22:00'),wednesday:openDay('10:00','22:00'),
      thursday:openDay('10:00','22:00'),friday:openDay('10:00','22:00'),saturday:openDay('10:00','22:00'),
      sunday:openDay('14:00','20:00'),
    }),
  };
  return {
    publicName:'Império das Unhas — Centro de Contagem',fullAddress:'',mapsQuery:'',mapsUrl:'',
    locationHint:'Na galeria ao lado da Caixa d’Água, marco de Contagem',...contact,showOnWebsite:true,
    openingHours:week({monday:closedDay(),sunday:closedDay()}),
  };
}

export function normalizeWhatsapp(value:unknown){
  let d=String(value??'').replace(/\D/g,'');
  if(!d)return '';
  if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
  return d;
}

function timeMinute(value:unknown){
  const m=String(value??'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m?Number(m[1])*60+Number(m[2]):Number.NaN;
}

function normalizeDay(value:unknown,base:OpeningDay):OpeningDay{
  const raw=obj(value),status=String(raw.status??base.status??'UNSET').toUpperCase() as OpeningDayStatus;
  if(!['OPEN','CLOSED','UNSET'].includes(status))throw new BadRequestException('Status de horário inválido');
  if(status!=='OPEN')return {status,open:'',close:''};
  const open=String(raw.open??base.open??'').trim(),close=String(raw.close??base.close??'').trim();
  const a=timeMinute(open),z=timeMinute(close);
  if(!Number.isFinite(a)||!Number.isFinite(z))throw new BadRequestException('Dia aberto exige horários no formato HH:mm');
  if(z<=a)throw new BadRequestException('Horário de fechamento deve ser posterior ao de abertura');
  return {status,open,close};
}

function safeMapsUrl(value:unknown){
  const text=String(value??'').trim();if(!text)return '';
  let parsed:URL;try{parsed=new URL(text)}catch{throw new BadRequestException('URL do mapa inválida')}
  if(!['http:','https:'].includes(parsed.protocol))throw new BadRequestException('URL do mapa deve usar http ou https');
  return parsed.toString();
}

export function normalizeUnitPublicProfile(value:unknown,unitId:CanonicalUnitId):UnitPublicProfile{
  const base=defaultUnitPublicProfile(unitId),raw=obj(value),rawHours=obj(raw.openingHours),openingHours={} as OpeningHours;
  for(const day of UNIT_PUBLIC_PROFILE_DAYS)openingHours[day]=normalizeDay(rawHours[day],base.openingHours[day]);
  const whatsapp=normalizeWhatsapp(raw.whatsapp??base.whatsapp);
  if(whatsapp&&!/^55\d{10,11}$/.test(whatsapp))throw new BadRequestException('WhatsApp inválido');
  return {
    publicName:String(raw.publicName??base.publicName).trim(),
    fullAddress:String(raw.fullAddress??base.fullAddress).trim(),
    mapsQuery:String(raw.mapsQuery??base.mapsQuery).trim(),
    mapsUrl:safeMapsUrl(raw.mapsUrl??base.mapsUrl),
    locationHint:String(raw.locationHint??base.locationHint).trim(),
    phone:String(raw.phone??base.phone).trim(),
    whatsapp,
    showOnWebsite:raw.showOnWebsite===undefined?base.showOnWebsite:raw.showOnWebsite===true,
    openingHours,
  };
}

export function mergeUnitPublicProfile(current:UnitPublicProfile,input:unknown,unitId:CanonicalUnitId):UnitPublicProfile{
  const incoming=obj(input),hours=obj(incoming.openingHours);
  for(const key of Object.keys(hours))if(!DAY_SET.has(key))throw new BadRequestException('Dia da semana inválido: '+key);
  const mergedHours:Record<string,unknown>={...current.openingHours};
  for(const day of UNIT_PUBLIC_PROFILE_DAYS)if(hours[day]!==undefined)mergedHours[day]={...current.openingHours[day],...obj(hours[day])};
  return normalizeUnitPublicProfile({...current,...incoming,openingHours:mergedHours},unitId);
}

export function publicDirectionsUrl(profile:UnitPublicProfile){
  if(profile.mapsUrl)return profile.mapsUrl;
  const query=profile.mapsQuery||profile.fullAddress;
  return query?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query):'';
}
export function publicWhatsappUrl(profile:UnitPublicProfile){return profile.whatsapp?'https://wa.me/'+profile.whatsapp:'';}

const partsAt=(at:Date,timeZone:string)=>{
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(formatter.formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:String(p.weekday||'').toLowerCase() as UnitPublicProfileDay,date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
};
const shortTime=(value:string)=>{const [h,m]=value.split(':');return m==='00'?`${Number(h)}h`:`${Number(h)}h${m}`;};
const weekdayPt:Record<UnitPublicProfileDay,string>={monday:'segunda',tuesday:'terça',wednesday:'quarta',thursday:'quinta',friday:'sexta',saturday:'sábado',sunday:'domingo'};

function futureOpening(profile:UnitPublicProfile,at:Date,timeZone:string){
  const today=partsAt(at,timeZone);
  for(let offset=1;offset<=7;offset++){
    const p=partsAt(new Date(at.getTime()+offset*86400000),timeZone),rule=profile.openingHours[p.day];
    if(rule.status==='UNSET')return null;
    if(rule.status!=='OPEN')continue;
    return {date:p.date,day:p.day,time:rule.open,label:offset===1?`amanhã às ${shortTime(rule.open)}`:`${weekdayPt[p.day]} às ${shortTime(rule.open)}`};
  }
  return null;
}

export function openingStatus(profile:UnitPublicProfile,at=new Date(),timeZone='America/Sao_Paulo'){
  const p=partsAt(at,timeZone),rule=profile.openingHours[p.day];
  if(!rule||rule.status==='UNSET')return {state:'UNINFORMED' as const,message:'Horário não informado',day:p.day,date:p.date,closesAt:null,nextOpen:null};
  if(rule.status==='CLOSED')return {state:'CLOSED' as const,message:'Fechado hoje',day:p.day,date:p.date,closesAt:null,nextOpen:futureOpening(profile,at,timeZone)};
  const open=timeMinute(rule.open),close=timeMinute(rule.close);
  if(p.minute>=open&&p.minute<close)return {state:'OPEN' as const,message:`Aberto agora • até ${shortTime(rule.close)}`,day:p.day,date:p.date,closesAt:rule.close,nextOpen:null};
  if(p.minute<open)return {state:'CLOSED' as const,message:`Fechado agora • abre hoje às ${shortTime(rule.open)}`,day:p.day,date:p.date,closesAt:null,nextOpen:{date:p.date,day:p.day,time:rule.open,label:`hoje às ${shortTime(rule.open)}`}};
  const next=futureOpening(profile,at,timeZone);
  return {state:'CLOSED' as const,message:next?`Fechado agora • abre ${next.label}`:'Fechado agora',day:p.day,date:p.date,closesAt:null,nextOpen:next};
}

export async function ensureCanonicalUnitPublicProfiles(prisma:any){
  const initializedIds:string[]=[];
  for(const unitId of CANONICAL_IDS){
    const row=await prisma.unit.findUnique({where:{id:unitId},select:{id:true,legacyPayload:true}});
    if(!row)continue;
    const legacy=obj(row.legacyPayload);
    if(Object.prototype.hasOwnProperty.call(legacy,'publicProfile'))continue;
    const profile=defaultUnitPublicProfile(unitId);
    await prisma.$transaction(async (tx:any)=>{
      await tx.unit.update({where:{id:unitId},data:{legacyPayload:{...legacy,publicProfile:profile} as Prisma.InputJsonValue,version:{increment:1}}});
      await tx.auditEvent.create({data:{id:randomUUID(),unitId,userId:null,action:'unit.public_profile.initialized',entityType:'Unit',entityId:unitId,legacyPayload:{source:'canonical_seed',publicProfile:profile} as Prisma.InputJsonValue,occurredAt:new Date()}});
    });
    initializedIds.push(unitId);
  }
  return {initializedIds};
}
