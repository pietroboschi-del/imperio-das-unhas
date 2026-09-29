import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { payloadHash } from '../migration/hash';

type SnapshotHeaders = { instanceId:string; revision:number; dataHash:string };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(k=>[k,stableValue((value as Record<string,unknown>)[k])]));
  return value;
}
function stableHash(value: unknown){ return payloadHash(stableValue(value)); }
function aggregateRows(rows:any[]){
  const pairs=rows.map((row,i)=>[String(row?.id||`__index_${i}`),stableHash(row)]).sort((a,b)=>a[0].localeCompare(b[0]));
  return payloadHash(pairs);
}

@Injectable()
export class ReadThroughService {
  constructor(private readonly prisma:PrismaService) {}
  enabled(){ return String(process.env.READ_THROUGH_ENABLED||'false')==='true'; }
  writesEnabled(){ return String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true'; }
  assertSafeMode(){
    if(!this.enabled()) throw new ForbiddenException('Read-through desabilitado no ambiente');
    if(this.writesEnabled()) throw new ServiceUnavailableException('V97 bloqueia read-through quando escrita operacional remota está habilitada');
  }
  parseHeaders(headers:Record<string,unknown>):SnapshotHeaders{
    const instanceId=String(headers['x-imperio-instance-id']||'').trim();
    const revision=Number(headers['x-imperio-revision']);
    const dataHash=String(headers['x-imperio-data-hash']||'').trim();
    if(!instanceId) throw new BadRequestException('X-Imperio-Instance-Id obrigatório');
    if(!Number.isFinite(revision)||revision<0) throw new BadRequestException('X-Imperio-Revision inválido');
    if(!dataHash) throw new BadRequestException('X-Imperio-Data-Hash obrigatório');
    return {instanceId,revision,dataHash};
  }
  async assertExactEnvelope(headers:Record<string,unknown>){
    this.assertSafeMode();
    const snapshot=this.parseHeaders(headers);
    const env=await this.prisma.migrationEnvelope.findFirst({where:{instanceId:snapshot.instanceId,revision:snapshot.revision,dataHash:snapshot.dataHash,status:ImportStatus.IMPORTED},select:{id:true,instanceId:true,revision:true,schemaVersion:true,dataHash:true,importedAt:true}});
    if(!env) throw new ServiceUnavailableException('Backend não possui envelope importado exatamente igual à revisão local atual');
    return env;
  }
  private manifest(data:Record<string,any[]>){
    return {counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),fingerprints:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,aggregateRows(v)]))};
  }
  async status(){
    return {release:'V97',readThroughEnabled:this.enabled(),operationalWritesEnabled:this.writesEnabled(),sourceOfTruth:'local_with_verified_remote_read_fallback',catalogOperationalReadThrough:true,unitOperationalReadThrough:false};
  }
  async catalog(headers:Record<string,unknown>){
    const envelope=await this.assertExactEnvelope(headers);
    const [categories,services]=await Promise.all([
      this.prisma.serviceCategory.findMany({orderBy:{id:'asc'}}),
      this.prisma.service.findMany({orderBy:{id:'asc'}}),
    ]);
    const data={
      categories:categories.map(x=>x.legacyPayload||{id:x.id,name:x.name,description:x.description,sortOrder:x.sortOrder,active:x.active}),
      services:services.map(x=>x.legacyPayload||{id:x.id,category:x.categoryId,name:x.name,price:Number(x.price),duration:x.durationMin,active:x.active}),
    };
    return {release:'V97',source:'postgresql_verified_read_through',envelope,data,...this.manifest(data)};
  }
  async unitPreview(headers:Record<string,unknown>,unitId:string,date?:string){
    const envelope=await this.assertExactEnvelope(headers);
    const bookingWhere:Prisma.BookingWhereInput={unitId};
    if(date){ if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date deve estar em YYYY-MM-DD'); bookingWhere.serviceDate=new Date(`${date}T00:00:00.000Z`); }
    const [pros,clients,bookings]=await Promise.all([
      this.prisma.professional.findMany({where:{units:{some:{unitId,active:true}}},orderBy:{id:'asc'}}),
      this.prisma.client.findMany({where:{unitLinks:{some:{unitId,active:true}}},orderBy:{id:'asc'},take:5000}),
      this.prisma.booking.findMany({where:bookingWhere,orderBy:{id:'asc'},take:5000}),
    ]);
    const data={pros:pros.map(x=>x.legacyPayload||{id:x.id,name:x.name,active:x.active}),clients:clients.map(x=>x.legacyPayload||{id:x.id,name:x.name,phone:x.phone,email:x.email}),bookings:bookings.map(x=>x.legacyPayload)};
    return {release:'V97',source:'postgresql_verified_preview_only',unitId,date:date||null,envelope,data,...this.manifest(data)};
  }
}
