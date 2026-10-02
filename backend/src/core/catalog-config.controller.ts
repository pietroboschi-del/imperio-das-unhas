import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import type { ImperioRequest } from '../common/request-context';

const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const rule=(v:unknown)=>{
  const x=obj(v);
  return {
    enabled:x.enabled===true,
    duration:x.duration===null||x.duration===undefined||x.duration===''?null:Math.max(1,Number(x.duration)),
    commission:x.commission===null||x.commission===undefined||x.commission===''?null:Math.max(0,Math.min(100,Number(x.commission))),
    price:x.price===null||x.price===undefined||x.price===''?null:Math.max(0,Number(x.price)),
    online:x.online!==false,
  };
};

class ServiceConfigDto{
  @IsOptional() @IsString() id?:string;
  @IsString() @MinLength(1) name!:string;
  @IsOptional() @IsString() categoryId?:string;
  @IsOptional() @IsString() categoryName?:string;
  @IsNumber() @Min(0) price!:number;
  @IsInt() @Min(1) durationMin!:number;
  @IsBoolean() active!:boolean;
  @IsOptional() @IsObject() config?:Record<string,unknown>;
}
class ProfessionalConfigDto{
  @IsOptional() @IsString() id?:string;
  @IsString() @MinLength(1) name!:string;
  @IsOptional() @IsString() publicName?:string;
  @IsBoolean() active!:boolean;
  @IsArray() @ArrayMinSize(1) @IsString({each:true}) unitIds!:string[];
  @IsOptional() @IsObject() config?:Record<string,unknown>;
  @IsOptional() @IsObject() serviceRules?:Record<string,unknown>;
}
class ActiveDto{ @IsBoolean() active!:boolean; }

@Controller('api/v1/config')
export class CatalogConfigController{
  constructor(private readonly prisma:PrismaService){}

  private serviceView(row:any){
    return {
      id:row.id,name:row.name,categoryId:row.categoryId||null,
      category:row.category?{id:row.category.id,name:row.category.name,active:row.category.active}:null,
      price:Number(row.price),durationMin:row.durationMin,active:row.active,version:row.version,
      config:obj(row.legacyPayload),
    };
  }
  private async professionalView(id:string,db:any=this.prisma){
    const row=await db.professional.findUnique({
      where:{id},
      select:{id:true,name:true,publicName:true,active:true,version:true,legacyPayload:true,units:{where:{active:true},select:{unitId:true},orderBy:{unitId:'asc'}}},
    });
    if(!row)return null;
    const services=await db.service.findMany({select:{id:true,legacyPayload:true},orderBy:{id:'asc'}});
    const serviceRules:Record<string,unknown>={};
    for(const s of services){
      const r=obj(obj(s.legacyPayload).proRules)[row.id];
      if(r!==undefined)serviceRules[s.id]=rule(r);
    }
    return {id:row.id,name:row.name,publicName:row.publicName||row.name,active:row.active,version:row.version,unitIds:row.units.map((x:any)=>x.unitId),config:obj(row.legacyPayload),serviceRules};
  }
  private async ensureCategory(tx:Prisma.TransactionClient,id?:string,name?:string){
    const categoryId=String(id||'').trim();if(!categoryId)return null;
    const categoryName=String(name||'').trim();
    const existing=await tx.serviceCategory.findUnique({where:{id:categoryId}});
    if(!existing&&!categoryName)throw new ConflictException('Categoria não existe no banco central');
    return tx.serviceCategory.upsert({
      where:{id:categoryId},
      create:{id:categoryId,name:categoryName||categoryId,active:true},
      update:{...(categoryName?{name:categoryName}:{}),active:true},
    });
  }
  private async syncServiceProfessionalLinks(tx:Prisma.TransactionClient,serviceId:string,proRules:Record<string,unknown>){
    const ids=Object.keys(proRules);
    if(!ids.length)return;
    const found=await tx.professional.findMany({where:{id:{in:ids}},select:{id:true,legacyPayload:true}});
    if(found.length!==ids.length)throw new ConflictException('Uma ou mais profissionais informadas no serviço não existem');
    for(const pro of found){
      const legacy=obj(pro.legacyPayload),services=new Set(Array.isArray(legacy.services)?legacy.services.map(String):[]);
      if(rule(proRules[pro.id]).enabled)services.add(serviceId);else services.delete(serviceId);
      await tx.professional.update({where:{id:pro.id},data:{legacyPayload:{...legacy,services:[...services].sort()} as Prisma.InputJsonValue,version:{increment:1}}});
    }
  }
  private async writeService(dto:ServiceConfigDto,userId:string|undefined,id?:string){
    const serviceId=String(id||dto.id||randomUUID()).trim();
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.service.findUnique({where:{id:serviceId}});
      if(id&&!existing)throw new NotFoundException('Serviço não encontrado');
      if(!id&&existing)throw new ConflictException('Já existe serviço com este identificador');
      await this.ensureCategory(tx,dto.categoryId,dto.categoryName);
      const old=obj(existing?.legacyPayload),incoming=obj(dto.config),proRulesRaw=obj(incoming.proRules);
      const proRules=Object.fromEntries(Object.entries(proRulesRaw).map(([k,v])=>[k,rule(v)]));
      const legacy={...old,...incoming,...(incoming.proRules!==undefined?{proRules}:{})};
      const data={name:dto.name.trim(),categoryId:dto.categoryId||null,price:new Prisma.Decimal(Number(dto.price).toFixed(2)),durationMin:dto.durationMin,active:dto.active,legacyPayload:legacy as Prisma.InputJsonValue};
      const row=existing?await tx.service.update({where:{id:serviceId},data:{...data,version:{increment:1}},include:{category:true}}):await tx.service.create({data:{id:serviceId,...data},include:{category:true}});
      if(incoming.proRules!==undefined)await this.syncServiceProfessionalLinks(tx,serviceId,proRulesRaw);
      await tx.auditEvent.create({data:{id:randomUUID(),userId:userId||null,action:existing?'catalog.service.updated':'catalog.service.created',entityType:'Service',entityId:serviceId,legacyPayload:{structuralConfiguration:true,active:dto.active,categoryId:dto.categoryId||null},occurredAt:new Date()}});
      return this.serviceView(row);
    });
  }

  @Get('services')
  @RequirePermissions('catalog.manage')
  async services(){
    const rows=await this.prisma.service.findMany({include:{category:true},orderBy:[{name:'asc'},{id:'asc'}]});
    return rows.map(x=>this.serviceView(x));
  }
  @Post('services')
  @RequirePermissions('catalog.manage')
  createService(@Body() dto:ServiceConfigDto,@Req() req:ImperioRequest){return this.writeService(dto,req.principal?.userId);}
  @Patch('services/:id')
  @RequirePermissions('catalog.manage')
  updateService(@Param('id') id:string,@Body() dto:ServiceConfigDto,@Req() req:ImperioRequest){return this.writeService(dto,req.principal?.userId,id);}
  @Patch('services/:id/active')
  @RequirePermissions('catalog.manage')
  async serviceActive(@Param('id') id:string,@Body() dto:ActiveDto,@Req() req:ImperioRequest){
    const row=await this.prisma.service.findUnique({where:{id}});if(!row)throw new NotFoundException('Serviço não encontrado');
    const updated=await this.prisma.service.update({where:{id},data:{active:dto.active,version:{increment:1}},include:{category:true}});
    await this.prisma.auditEvent.create({data:{id:randomUUID(),userId:req.principal?.userId||null,action:'catalog.service.active_changed',entityType:'Service',entityId:id,legacyPayload:{structuralConfiguration:true,active:dto.active},occurredAt:new Date()}});
    return this.serviceView(updated);
  }

  @Get('professionals')
  @RequirePermissions('professionals.manage')
  async professionals(){
    const rows=await this.prisma.professional.findMany({select:{id:true},orderBy:[{name:'asc'},{id:'asc'}]});
    return Promise.all(rows.map(x=>this.professionalView(x.id)));
  }
  private async writeProfessional(dto:ProfessionalConfigDto,userId:string|undefined,id?:string){
    const professionalId=String(id||dto.id||randomUUID()).trim(),unitIds=[...new Set(dto.unitIds.map(String))].sort(),rules=obj(dto.serviceRules);
    const units=await this.prisma.unit.count({where:{id:{in:unitIds},active:true}});
    if(units!==unitIds.length)throw new ConflictException('Uma ou mais unidades da profissional são inválidas ou inativas');
    const serviceIds=Object.keys(rules);
    if(serviceIds.length){
      const count=await this.prisma.service.count({where:{id:{in:serviceIds}}});
      if(count!==serviceIds.length)throw new ConflictException('Um ou mais serviços vinculados não existem no banco central');
    }
    await this.prisma.$transaction(async tx=>{
      const existing=await tx.professional.findUnique({where:{id:professionalId}});
      if(id&&!existing)throw new NotFoundException('Profissional não encontrada');
      if(!id&&existing)throw new ConflictException('Já existe profissional com este identificador');
      const old=obj(existing?.legacyPayload),incoming=obj(dto.config),enabledServices=serviceIds.filter(sid=>rule(rules[sid]).enabled).sort();
      const legacy={...old,...incoming,services:enabledServices};
      if(existing)await tx.professional.update({where:{id:professionalId},data:{name:dto.name.trim(),publicName:dto.publicName?.trim()||dto.name.trim(),active:dto.active,legacyPayload:legacy as Prisma.InputJsonValue,version:{increment:1}}});
      else await tx.professional.create({data:{id:professionalId,name:dto.name.trim(),publicName:dto.publicName?.trim()||dto.name.trim(),active:dto.active,legacyPayload:legacy as Prisma.InputJsonValue}});
      await tx.professionalUnit.deleteMany({where:{professionalId}});
      await tx.professionalUnit.createMany({data:unitIds.map(unitId=>({professionalId,unitId,active:true}))});
      const services=await tx.service.findMany({select:{id:true,legacyPayload:true}});
      for(const service of services){
        const legacyService=obj(service.legacyPayload),proRules={...obj(legacyService.proRules)};
        if(rules[service.id]!==undefined)proRules[professionalId]=rule(rules[service.id]);
        else if(proRules[professionalId]!==undefined)proRules[professionalId]={...rule(proRules[professionalId]),enabled:false};
        if(rules[service.id]!==undefined||obj(legacyService.proRules)[professionalId]!==undefined){
          await tx.service.update({where:{id:service.id},data:{legacyPayload:{...legacyService,proRules} as Prisma.InputJsonValue,version:{increment:1}}});
        }
      }
      await tx.auditEvent.create({data:{id:randomUUID(),userId:userId||null,action:existing?'professional.config.updated':'professional.config.created',entityType:'Professional',entityId:professionalId,legacyPayload:{structuralConfiguration:true,unitIds,active:dto.active,serviceIds:enabledServices},occurredAt:new Date()}});
    });
    return this.professionalView(professionalId);
  }
  @Post('professionals')
  @RequirePermissions('professionals.manage')
  createProfessional(@Body() dto:ProfessionalConfigDto,@Req() req:ImperioRequest){return this.writeProfessional(dto,req.principal?.userId);}
  @Patch('professionals/:id')
  @RequirePermissions('professionals.manage')
  updateProfessional(@Param('id') id:string,@Body() dto:ProfessionalConfigDto,@Req() req:ImperioRequest){return this.writeProfessional(dto,req.principal?.userId,id);}
  @Patch('professionals/:id/active')
  @RequirePermissions('professionals.manage')
  async professionalActive(@Param('id') id:string,@Body() dto:ActiveDto,@Req() req:ImperioRequest){
    const row=await this.prisma.professional.findUnique({where:{id}});if(!row)throw new NotFoundException('Profissional não encontrada');
    await this.prisma.professional.update({where:{id},data:{active:dto.active,version:{increment:1}}});
    await this.prisma.auditEvent.create({data:{id:randomUUID(),userId:req.principal?.userId||null,action:'professional.config.active_changed',entityType:'Professional',entityId:id,legacyPayload:{structuralConfiguration:true,active:dto.active},occurredAt:new Date()}});
    return this.professionalView(id);
  }
}
