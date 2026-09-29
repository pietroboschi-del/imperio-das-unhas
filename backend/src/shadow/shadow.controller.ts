import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { ShadowService } from './shadow.service';

@Controller('api/v1/shadow')
@NetworkAdmin()
export class ShadowController {
  constructor(private readonly shadow: ShadowService) {}

  @Get('status')
  @NetworkAdmin()
  status() { return this.shadow.status(); }

  @Post('compare')
  @NetworkAdmin()
  compare(@Body() body: unknown) { return this.shadow.compare(body); }

  @Get('unit-manifest')
  @UnitScoped()
  unitManifest(@Req() req: ImperioRequest, @Query('date') date?: string) {
    return this.shadow.unitManifest(req.unitId!, date);
  }
}
