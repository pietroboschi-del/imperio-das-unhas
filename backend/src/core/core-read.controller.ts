import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';

@Controller('api/v1')
export class CoreReadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('units')
  @RequirePermissions('units.read')
  async units(@Req() req: ImperioRequest) {
    const p=req.principal!;
    return this.prisma.unit.findMany({
      where:p.networkAdmin?{}:{id:{in:p.unitIds}},
      select:{id:true,name:true,timezone:true,active:true,version:true},
      orderBy:{name:'asc'},
    });
  }

  @Get('services')
  @RequirePermissions('catalog.read')
  services() {
    return this.prisma.service.findMany({
      where:{active:true},
      select:{id:true,name:true,price:true,durationMin:true,active:true,version:true,category:{select:{id:true,name:true,active:true,sortOrder:true}}},
      orderBy:{name:'asc'},
    });
  }

  @Get('professionals')
  @UnitScoped()
  @RequirePermissions('professionals.read')
  professionals(@Req() req: ImperioRequest) {
    return this.prisma.professional.findMany({
      where:{active:true,units:{some:{unitId:req.unitId!,active:true}}},
      select:{id:true,name:true,publicName:true,active:true,version:true,units:{where:{unitId:req.unitId!,active:true},select:{unitId:true,active:true}}},
      orderBy:{name:'asc'},
    });
  }

  // DEC-004: cliente é cadastro de rede. A unidade atual autoriza o operador,
  // mas a busca não restringe o cliente ao ClientUnitLink.
  @Get('clients')
  @UnitScoped()
  @RequirePermissions('clients.read')
  clients(@Query('q') q='') {
    const term=String(q||'').trim();
    return this.prisma.client.findMany({
      where:{active:true,...(term?{AND:[{OR:[{name:{contains:term,mode:'insensitive'}},{phone:{contains:term}},{email:{contains:term,mode:'insensitive'}}]}]}:{})},
      select:{id:true,name:true,active:true,phone:true,email:true,registrationUnitId:true,version:true,unitLinks:{where:{active:true},select:{unitId:true,source:true}}},
      orderBy:{name:'asc'},take:100,
    });
  }

  @Get('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  bookings(@Req() req: ImperioRequest,@Query('date') date?:string) {
    const where:any={unitId:req.unitId!};
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))where.serviceDate=new Date(`${date}T00:00:00.000Z`);
    return this.prisma.booking.findMany({
      where,
      select:{id:true,unitId:true,clientId:true,serviceDate:true,status:true,version:true,client:{select:{id:true,name:true,phone:true,email:true}}},
      orderBy:[{serviceDate:'asc'},{id:'asc'}],take:500,
    });
  }

  @Get('bookings/:id')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  async booking(@Req() req: ImperioRequest,@Param('id') id:string) {
    return this.prisma.booking.findFirst({
      where:{id,unitId:req.unitId!},
      select:{id:true,unitId:true,clientId:true,serviceDate:true,status:true,version:true,client:{select:{id:true,name:true,phone:true,email:true}}},
    });
  }
}
