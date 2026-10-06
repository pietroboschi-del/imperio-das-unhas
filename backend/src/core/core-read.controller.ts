import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';

@Controller('api/v1')
export class CoreReadController {
  constructor(private readonly prisma: PrismaService) {}
  private clientView(row:any){
    const legacy=row?.legacyPayload&&typeof row.legacyPayload==='object'?row.legacyPayload:{};
    const p=legacy?.operationalProfile&&typeof legacy.operationalProfile==='object'?legacy.operationalProfile:legacy;
    const {legacyPayload,...base}=row;
    return {...base,cpf:p?.cpf||'',birthDate:p?.birthDate||'',cep:p?.cep||'',neighborhood:p?.neighborhood||'',city:p?.city||'',profession:p?.profession||'',source:p?.source||'',notes:p?.notes||''};
  }
  private bookingSelect(){
    return {id:true,unitId:true,clientId:true,serviceDate:true,startAt:true,serviceId:true,professionalId:true,notes:true,status:true,blockAllDay:true,blockSeriesId:true,blockRecurrence:true,blockException:true,version:true,client:{select:{id:true,name:true,phone:true,email:true}},service:{select:{id:true,name:true,price:true,durationMin:true}},professional:{select:{id:true,name:true,publicName:true}},items:{orderBy:{sortOrder:'asc' as const},select:{id:true,serviceId:true,professionalId:true,startAt:true,durationMin:true,unitPrice:true,preference:true,forceFit:true,sortOrder:true,clientAreaSnapshot:true,mustFinishBeforeSameAreaSnapshot:true,service:{select:{id:true,name:true,price:true,durationMin:true}},professional:{select:{id:true,name:true,publicName:true}}}}};
  }

  @Get('units')
  @RequirePermissions('units.read')
  async units(@Req() req: ImperioRequest) {
    const p=req.principal!;
    return this.prisma.unit.findMany({where:p.networkAdmin?{}:{id:{in:p.unitIds}},select:{id:true,name:true,timezone:true,active:true,version:true},orderBy:{name:'asc'}});
  }

  @Get('services')
  @RequirePermissions('catalog.read')
  services() {
    return this.prisma.service.findMany({where:{active:true},select:{id:true,name:true,price:true,durationMin:true,active:true,version:true,category:{select:{id:true,name:true,active:true,sortOrder:true}}},orderBy:{name:'asc'}});
  }

  @Get('professionals')
  @UnitScoped()
  @RequirePermissions('professionals.read')
  professionals(@Req() req: ImperioRequest) {
    return this.prisma.professional.findMany({where:{active:true,units:{some:{unitId:req.unitId!,active:true}}},select:{id:true,name:true,publicName:true,active:true,version:true,units:{where:{unitId:req.unitId!,active:true},select:{unitId:true,active:true}}},orderBy:{name:'asc'}});
  }

  // DEC-004: cliente é cadastro de rede; X-Unit-Id autoriza a operação, não restringe a busca.
  @Get('clients')
  @UnitScoped()
  @RequirePermissions('clients.read')
  async clients(@Query('q') q='') {
    const term=String(q||'').trim();
    const rows=await this.prisma.client.findMany({where:{active:true,...(term?{AND:[{OR:[{name:{contains:term,mode:'insensitive'}},{phone:{contains:term}},{email:{contains:term,mode:'insensitive'}}]}]}:{})},select:{id:true,name:true,active:true,phone:true,email:true,registrationUnitId:true,version:true,legacyPayload:true,unitLinks:{where:{active:true},select:{unitId:true,source:true}}},orderBy:{name:'asc'},take:100});
    return rows.map(x=>this.clientView(x));
  }

  @Get('waitlist')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  async waitlist(@Req() req:ImperioRequest){
    const rows=await this.prisma.waitlistRequest.findMany({
      where:{unitId:req.unitId!},
      orderBy:[{createdAt:'asc'},{id:'asc'}],
      take:500,
    });
    const clientIds=[...new Set(rows.map(x=>x.clientId).filter(Boolean))] as string[];
    const clients=clientIds.length?await this.prisma.client.findMany({where:{id:{in:clientIds}},select:{id:true,name:true,phone:true}}):[];
    const byClient=new Map(clients.map(x=>[x.id,x]));
    return rows.map(row=>{
      const legacy=(row.legacyPayload&&typeof row.legacyPayload==='object'&&!Array.isArray(row.legacyPayload)?row.legacyPayload:{}) as Record<string,unknown>;
      const c=row.clientId?byClient.get(row.clientId):null;
      return {id:row.id,unitId:row.unitId,clientId:row.clientId,status:row.status,version:row.version,createdAt:row.createdAt,updatedAt:row.updatedAt,clientName:c?.name||null,clientPhone:c?.phone||null,legacyPayload:legacy};
    });
  }

  @Get('tasks')
  @UnitScoped()
  @RequirePermissions('tasks.read')
  tasks(@Req() req:ImperioRequest){
    return this.prisma.managementTask.findMany({
      where:{unitId:req.unitId!,...(req.principal!.networkAdmin?{}:{assignedUserId:req.principal!.userId})},
      orderBy:[{status:'asc'},{createdAt:'desc'}],
      take:200,
    });
  }

  @Get('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  bookings(@Req() req: ImperioRequest,@Query('date') date?:string) {
    const where:any={unitId:req.unitId!};if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))where.serviceDate=new Date(`${date}T00:00:00.000Z`);
    return this.prisma.booking.findMany({where,select:this.bookingSelect(),orderBy:[{serviceDate:'asc'},{id:'asc'}],take:500});
  }

  @Get('bookings/:id')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  booking(@Req() req: ImperioRequest,@Param('id') id:string) {
    return this.prisma.booking.findFirst({where:{id,unitId:req.unitId!},select:this.bookingSelect()});
  }
}
