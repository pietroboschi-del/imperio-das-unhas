import { Controller, Get, Query, Req } from '@nestjs/common';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { ReadThroughService } from './read-through.service';

@Controller('api/v1/read-through')
@NetworkAdmin()
export class ReadThroughController {
  constructor(private readonly service:ReadThroughService) {}
  @Get('status') @NetworkAdmin() status(){ return this.service.status(); }
  @Get('catalog') catalog(@Req() req:ImperioRequest){ return this.service.catalog(req.headers as Record<string,unknown>); }
  @Get('unit-preview') @UnitScoped() unitPreview(@Req() req:ImperioRequest,@Query('date') date?:string){ return this.service.unitPreview(req.headers as Record<string,unknown>,req.unitId!,date); }
}
