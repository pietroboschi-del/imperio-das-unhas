import { Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import type { ImperioRequest } from '../common/request-context';
import { evaluateAccess } from '../auth/permission-policy';

const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

class CategoryConfigDto{
  @IsOptional() @IsString() id?:string;
  @IsString() @MinLength(1) name!:string;
  @IsOptional() @IsString() description?:string;
  @IsOptional() @IsInt() sortOrder?:number;
  @IsOptional() @IsBoolean() active?:boolean;
  @IsOptional() @IsObject() config?:Record<string,unknown>;
}
class WorkstationConfigDto{
  @IsOptional() @IsString() id?:string;
  @IsString() unitId!:string;
  @IsString() @MinLength(1) name!:string;
  @IsArray() @IsString({each:true}) allowedCategoryIds!:string[];
  @IsOptional() @IsBoolean() active?:boolean;
  @IsOptional() @IsObject() config?:Record<string,unknown>;
}
class ActiveDto{ @IsBoolean() active!:boolean; }

@Controller('api/v1/config')
export class StructuralConfigController{
  constructor(private readonly prisma:PrismaService){}

  private assertWorkstationUnitAccess(principal:ImperioRequest['principal'],unitIds:Iterable<string>){
    if(!principal)throw new ForbiddenException('Sessão não resolvida');
    const affected=[...new Set([...unitIds].map(String).map(x=>x.trim()).filter(Boolean))];
    for(const unitId of affected){
      const decision=evaluateAccess({
        networkAdmin:principal.networkAdmin,
        globalPermissions:principal.permissions,
        unitAccesses:principal.unitAccesses,
        unitScoped:true,
        unitId,
        requiredPermissions:['catalog.manage'],
      });
      if(!decision.allowed)throw new ForbiddenException('Usuário sem acesso à unidade '+unitId);
    }
  }

  private categoryView(row:any){
    return {
      id:row.id,name:row.name,description:row.description||'',sortOrder:Number(row.sortOrder||0),
      active:row.active!==false,version:row.version,config:obj(row.legacyPayload),
      createdAt:row.createdAt,updatedAt:row.updatedAt,
    };
  }

  private workstationView(row:any){
    return {
      id:row.id,unitId:row.unitId,unitName:row.unit?.name||null,name:row.name,
      allowedCategoryIds:Array.isArray(row.allowedCategoryIds)?row.allowedCategoryIds.map(String):[],
      active:row.active!==false,version:row.version,config:obj(row.legacyPayload),
      createdAt:row.createdAt,updatedAt:row.updatedAt,
    };
  }

  private async audit(tx:Prisma.TransactionClient,userId:string|undefined,action:string,entityType:string,entityId:string,unitId:string|null,payload:Record<string,unknown>){
    await tx.auditEvent.create({data:{id:randomUUID(),userId:userId||null,unitId,action,entityType,entityId,legacyPayload:payload as Prisma.InputJsonValue,occurredAt:new Date()}});
  }

  @Get('categories')
  @RequirePermissions('catalog.manage')
  async categories(){
    const rows=await this.prisma.serviceCategory.findMany({orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}]});
    return rows.map(x=>this.categoryView(x));
  }

  private async writeCategory(dto:CategoryConfigDto,userId:string|undefined,id?:string){
    const categoryId=String(id||dto.id||randomUUID()).trim();
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.serviceCategory.findUnique({where:{id:categoryId}});
      if(id&&!existing)throw new NotFoundException('Categoria não encontrada');
      const legacy={...obj(existing?.legacyPayload),...obj(dto.config)};
      const row=await tx.serviceCategory.upsert({
        where:{id:categoryId},
        create:{id:categoryId,name:dto.name.trim(),description:String(dto.description||'').trim()||null,sortOrder:Number(dto.sortOrder||0),active:dto.active!==false,legacyPayload:legacy as Prisma.InputJsonValue},
        update:{name:dto.name.trim(),description:String(dto.description||'').trim()||null,sortOrder:Number(dto.sortOrder??existing?.sortOrder??0),active:dto.active??existing?.active??true,legacyPayload:legacy as Prisma.InputJsonValue,version:{increment:1}},
      });
      await this.audit(tx,userId,existing?'catalog.category.updated':'catalog.category.created','ServiceCategory',categoryId,null,{structuralConfiguration:true,active:row.active,sortOrder:row.sortOrder});
      return this.categoryView(row);
    });
  }

  @Post('categories')
  @RequirePermissions('catalog.manage')
  createCategory(@Body() dto:CategoryConfigDto,@Req() req:ImperioRequest){return this.writeCategory(dto,req.principal?.userId);}

  @Patch('categories/:id')
  @RequirePermissions('catalog.manage')
  updateCategory(@Param('id') id:string,@Body() dto:CategoryConfigDto,@Req() req:ImperioRequest){return this.writeCategory(dto,req.principal?.userId,id);}

  @Patch('categories/:id/active')
  @RequirePermissions('catalog.manage')
  async categoryActive(@Param('id') id:string,@Body() dto:ActiveDto,@Req() req:ImperioRequest){
    return this.prisma.$transaction(async tx=>{
      const current=await tx.serviceCategory.findUnique({where:{id}});if(!current)throw new NotFoundException('Categoria não encontrada');
      const row=await tx.serviceCategory.update({where:{id},data:{active:dto.active,version:{increment:1}}});
      await this.audit(tx,req.principal?.userId,'catalog.category.active_changed','ServiceCategory',id,null,{structuralConfiguration:true,active:dto.active});
      return this.categoryView(row);
    });
  }

  @Get('workstations')
  @RequirePermissions('catalog.manage')
  async workstations(){
    const rows=await this.prisma.workstation.findMany({include:{unit:true},orderBy:[{unitId:'asc'},{name:'asc'},{id:'asc'}]});
    return rows.map(x=>this.workstationView(x));
  }

  private async writeWorkstation(dto:WorkstationConfigDto,principal:ImperioRequest['principal'],id?:string){
    const workstationId=String(id||dto.id||randomUUID()).trim(),unitId=String(dto.unitId||'').trim(),categoryIds=[...new Set((dto.allowedCategoryIds||[]).map(String).filter(Boolean))];
    if(!unitId)throw new ConflictException('Selecione uma unidade válida');
    if(!categoryIds.length)throw new ConflictException('Selecione pelo menos uma categoria compatível');
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.workstation.findUnique({where:{id:workstationId}});
      if(id&&!existing)throw new NotFoundException('Estação não encontrada');
      this.assertWorkstationUnitAccess(principal,[...(existing?[existing.unitId]:[]),unitId]);
      const [unit,categories]=await Promise.all([
        tx.unit.findUnique({where:{id:unitId},select:{id:true,active:true}}),
        tx.serviceCategory.count({where:{id:{in:categoryIds}}}),
      ]);
      if(!unit?.active)throw new ConflictException('Unidade inválida ou inativa');
      if(categories!==categoryIds.length)throw new ConflictException('Uma ou mais categorias não existem no banco central');
      const duplicate=await tx.workstation.findFirst({where:{unitId,name:dto.name.trim(),id:{not:workstationId}},select:{id:true}});
      if(duplicate)throw new ConflictException('Já existe uma estação com esse nome nesta unidade');
      const legacy={...obj(existing?.legacyPayload),...obj(dto.config)};
      const row=await tx.workstation.upsert({
        where:{id:workstationId},
        create:{id:workstationId,unitId,name:dto.name.trim(),allowedCategoryIds:categoryIds as Prisma.InputJsonValue,active:dto.active!==false,legacyPayload:legacy as Prisma.InputJsonValue},
        update:{unitId,name:dto.name.trim(),allowedCategoryIds:categoryIds as Prisma.InputJsonValue,active:dto.active??existing?.active??true,legacyPayload:legacy as Prisma.InputJsonValue,version:{increment:1}},
        include:{unit:true},
      });
      await this.audit(tx,principal?.userId,existing?'workstation.config.updated':'workstation.config.created','Workstation',workstationId,unitId,{structuralConfiguration:true,active:row.active,allowedCategoryIds:categoryIds});
      return this.workstationView(row);
    });
  }
  @Post('workstations')
  @RequirePermissions('catalog.manage')
  createWorkstation(@Body() dto:WorkstationConfigDto,@Req() req:ImperioRequest){return this.writeWorkstation(dto,req.principal);}

  @Patch('workstations/:id')
  @RequirePermissions('catalog.manage')
  updateWorkstation(@Param('id') id:string,@Body() dto:WorkstationConfigDto,@Req() req:ImperioRequest){return this.writeWorkstation(dto,req.principal,id);}

  @Patch('workstations/:id/active')
  @RequirePermissions('catalog.manage')
  async workstationActive(@Param('id') id:string,@Body() dto:ActiveDto,@Req() req:ImperioRequest){
    return this.prisma.$transaction(async tx=>{
      const current=await tx.workstation.findUnique({where:{id},include:{unit:true}});if(!current)throw new NotFoundException('Estação não encontrada');
      this.assertWorkstationUnitAccess(req.principal,[current.unitId]);
      const row=await tx.workstation.update({where:{id},data:{active:dto.active,version:{increment:1}},include:{unit:true}});
      await this.audit(tx,req.principal?.userId,'workstation.config.active_changed','Workstation',id,row.unitId,{structuralConfiguration:true,active:dto.active});
      return this.workstationView(row);
    });
  }
}
