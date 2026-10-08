import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Configured workstations are shared across all professional booking channels.
// No workstation configuration retains the existing professional-only mode.
export async function assertBookingResourceCapacity(tx:Prisma.TransactionClient,unitId:string,date:string,items:any[],excludeBookingId?:string|null){
 const stations=await tx.workstation.findMany({where:{unitId,active:true},select:{id:true,allowedCategoryIds:true},orderBy:{id:'asc'}});
 if(!stations.length)return;
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}), hashtext(${'physical|'+date}))`;
 const services=await tx.service.findMany({where:{id:{in:[...new Set(items.map(x=>x.serviceId).filter(Boolean))]}},select:{id:true,categoryId:true}});
 const categories=new Map(services.map(s=>[s.id,s.categoryId]));
 const existing=await tx.bookingItem.findMany({where:{unitId,...(excludeBookingId?{bookingId:{not:excludeBookingId}}:{}),booking:{serviceDate:new Date(date+'T00:00:00.000Z'),status:{notIn:['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou','Bloqueado']}}},select:{id:true,startAt:true,durationMin:true,service:{select:{categoryId:true}}}});
 const demands=[...existing.map(x=>({...x,categoryId:x.service?.categoryId})),...items.map(x=>({...x,categoryId:categories.get(x.serviceId)}))].map(x=>{
  if(x.durationMin==null)throw new ConflictException('Agenda contém item histórico sem duração confiável para capacidade');
  return {start:new Date(x.startAt).getTime(),end:new Date(x.startAt).getTime()+Number(x.durationMin)*60000,categoryId:x.categoryId};
 });
 const marks=[...new Set(demands.flatMap(x=>[x.start,x.end]))].sort((a,b)=>a-b);
 for(let m=0;m<marks.length-1;m++){
  const active=demands.filter(d=>d.start<marks[m+1]&&d.end>marks[m]);
  // Only intervals touched by the candidate are relevant to this write.
  if(!items.some(x=>new Date(x.startAt).getTime()<marks[m+1]&&new Date(x.startAt).getTime()+Number(x.durationMin)*60000>marks[m]))continue;
  const choices=active.map(d=>stations.filter(s=>Array.isArray(s.allowedCategoryIds)&&s.allowedCategoryIds.includes(d.categoryId as any)).map(s=>s.id));
  const occupied=new Map<string,number>();
  const assign=(i:number,seen:Set<string>):boolean=>{for(const id of choices[i]){if(seen.has(id))continue;seen.add(id);const prior=occupied.get(id);if(prior===undefined||assign(prior,seen)){occupied.set(id,i);return true}}return false};
  for(let i=0;i<active.length;i++)if(!assign(i,new Set()))throw new ConflictException('Capacidade física da unidade esgotada: não há estação/recurso compatível');
 }
}
