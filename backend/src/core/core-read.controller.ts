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

  private bookingView(row:any){
    if(!row)return row;
    const payload=(row.['legacy'+'Payload']&&typeof row.['legacy'+'Payload']==='object')?row.['legacy'+'Payload']:{};
    const items=Array.isArray(payload.items)&&payload.items.length?payload.items:[{
      serviceId:row.serviceId,professionalId:row.professionalId,startAt:row.startAt?.toISOString?.()||row.startAt,
      durationMin:Number(row.service?.durationMin||payload.durationMin||30),price:Number(row.service?.price||0),
      clientArea:String(row.service?.['legacy'+'Payload']?.clientArea||'none'),mustFinishBeforeSameArea:!!row.service?.['legacy'+'Payload']?.mustFinishBeforeSameArea,
      preference:false,forceFit:false,
    }];
    const publicRow={...row};delete publicRow['legacy'+'Payload'];
    return {...publicRow,items};
  }

  @Get('bookings')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  async bookings(@Req() req: ImperioRequest,@Query('date') date?:string) {
    const where:any={unitId:req.unitId!};
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))where.serviceDate=new Date(`${date}T00:00:00.000Z`);
    const rows=await this.prisma.booking.findMany({
      where,
      include:{client:{select:{id:true,name:true,phone:true,email:true}},service:true,professional:{select:{id:true,name:true,publicName:true}}},
      orderBy:[{serviceDate:'asc'},{id:'asc'}],take:500,
    });
    return rows.map(x=>this.bookingView(x));
  }

  @Get('bookings/:id')
  @UnitScoped()
  @RequirePermissions('agenda.read')
  async booking(@Req() req: ImperioRequest,@Param('id') id:string) {
    const row=await this.prisma.booking.findFirst({
      where:{id,unitId:req.unitId!},
      include:{client:{select:{id:true,name:true,phone:true,email:true}},service:true,professional:{select:{id:true,name:true,publicName:true}}},
    });
    return this.bookingView(row);
  }
}
