import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';

@Controller('api/v1')
export class CoreReadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('units')
  async units(@Req() req: ImperioRequest) {
    const p=req.principal!;
    return this.prisma.unit.findMany({where:p.networkAdmin?{}:{id:{in:p.unitIds}},orderBy:{name:'asc'}});
  }

  @Get('services')
  services() { return this.prisma.service.findMany({ where:{active:true}, include:{category:true}, orderBy:{name:'asc'} }); }

  @Get('professionals')
  @UnitScoped()
  professionals(@Req() req: ImperioRequest) {
    return this.prisma.professional.findMany({where:{active:true,units:{some:{unitId:req.unitId!,active:true}}},include:{units:{where:{unitId:req.unitId!}}},orderBy:{name:'asc'}});
  }

  @Get('clients')
  @UnitScoped()
  clients(@Req() req: ImperioRequest,@Query('q') q='') {
    const term=String(q||'').trim();
    return this.prisma.client.findMany({where:{unitLinks:{some:{unitId:req.unitId!,active:true}},...(term?{AND:[{OR:[{name:{contains:term,mode:'insensitive'}},{phone:{contains:term}},{email:{contains:term,mode:'insensitive'}}]}]}:{})},orderBy:{name:'asc'},take:100});
  }

  @Get('bookings')
  @UnitScoped()
  bookings(@Req() req: ImperioRequest,@Query('date') date?:string) {
    const where:any={unitId:req.unitId!};
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))where.serviceDate=new Date(`${date}T00:00:00.000Z`);
    return this.prisma.booking.findMany({where,include:{client:true},orderBy:[{serviceDate:'asc'},{id:'asc'}],take:500});
  }

  @Get('bookings/:id')
  @UnitScoped()
  async booking(@Req() req: ImperioRequest,@Param('id') id:string) {
    return this.prisma.booking.findFirst({where:{id,unitId:req.unitId!},include:{client:true}});
  }
}
