import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Req } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Public } from '../common/public.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { isCanonicalUnitId, mergeUnitPublicProfile, normalizeUnitPublicProfile, openingStatus, publicDirectionsUrl, publicWhatsappUrl } from './unit-public-profile';

const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

class UnitPublicProfileDto{
  @IsOptional() @IsString() publicName?:string;
  @IsOptional() @IsString() fullAddress?:string;
  @IsOptional() @IsString() mapsQuery?:string;
  @IsOptional() @IsString() mapsUrl?:string;
  @IsOptional() @IsString() locationHint?:string;
  @IsOptional() @IsString() phone?:string;
  @IsOptional() @IsString() whatsapp?:string;
  @IsOptional() @IsBoolean() showOnWebsite?:boolean;
  @IsOptional() @IsObject() openingHours?:Record<string,unknown>;
}

@Controller('api/v1')
export class UnitPublicProfileController{
  constructor(private readonly prisma:PrismaService){}

  private canonical(id:string){
    const unitId=String(id||'').trim();
    if(!isCanonicalUnitId(unitId))throw new NotFoundException('Unidade canônica não encontrada');
    return unitId;
  }
  private async unit(id:string,db:any=this.prisma){
    const unitId=this.canonical(id);
    const row=await db.unit.findUnique({where:{id:unitId},select:{id:true,name:true,timezone:true,active:true,version:true,legacyPayload:true,updatedAt:true}});
    if(!row)throw new NotFoundException('Unidade não encontrada');
    return row;
  }
  private view(row:any){
    const legacy=obj(row.legacyPayload),profile=normalizeUnitPublicProfile(legacy.publicProfile,row.id);
    return {id:row.id,name:row.name,timezone:row.timezone,active:row.active,version:row.version,updatedAt:row.updatedAt,profile};
  }

  @Get('config/units/:id/public-profile')
  @UnitScoped()
  @RequirePermissions('catalog.manage')
  async adminProfile(@Param('id') id:string,@Req() req:ImperioRequest){
    const unitId=this.canonical(id);
    if(req.unitId!==unitId)throw new ConflictException('Unidade do perfil diverge do contexto autorizado');
    return this.view(await this.unit(unitId));
  }

  @Patch('config/units/:id/public-profile')
  @UnitScoped()
  @RequirePermissions('catalog.manage')
  async updateProfile(@Param('id') id:string,@Body() dto:UnitPublicProfileDto,@Req() req:ImperioRequest){
    const unitId=this.canonical(id);
    if(req.unitId!==unitId)throw new ConflictException('Unidade do perfil diverge do contexto autorizado');
    return this.prisma.$transaction(async tx=>{
      const row=await this.unit(unitId,tx),legacy=obj(row.legacyPayload);
      const before=normalizeUnitPublicProfile(legacy.publicProfile,unitId),after=mergeUnitPublicProfile(before,dto,unitId);
      const updated=await tx.unit.update({where:{id:unitId},data:{legacyPayload:{...legacy,publicProfile:after} as Prisma.InputJsonValue,version:{increment:1}},select:{id:true,name:true,timezone:true,active:true,version:true,legacyPayload:true,updatedAt:true}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal?.userId||null,unitId,action:'unit.public_profile.updated',entityType:'Unit',entityId:unitId,legacyPayload:{before,after} as Prisma.InputJsonValue,occurredAt:new Date()}});
      return this.view(updated);
    });
  }

  @Public()
  @Get('public/units')
  async publicUnits(){
    const rows=await this.prisma.unit.findMany({where:{id:{in:['centro','big','shopping-contagem']},active:true},select:{id:true,name:true,timezone:true,active:true,version:true,legacyPayload:true,updatedAt:true}});
    const order=new Map([['centro',0],['big',1],['shopping-contagem',2]]);
    return rows.sort((a,b)=>(order.get(a.id)??99)-(order.get(b.id)??99)).map(row=>{
      const view=this.view(row),profile=view.profile;
      return {...view,profile:{...profile,directionsUrl:publicDirectionsUrl(profile),whatsappUrl:publicWhatsappUrl(profile),openingStatus:openingStatus(profile,new Date(),view.timezone)}};
    }).filter(x=>x.profile.showOnWebsite);
  }
}
