import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { UnitScoped } from '../common/unit-scope.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import type { ImperioRequest } from '../common/request-context';
import { WaitlistTraceService } from './waitlist-trace.service';
import { WaitlistConvertDto, WaitlistOpportunityStateDto } from './waitlist.dto';

@Controller('api/v1/waitlist')
export class WaitlistController {
 constructor(private readonly trace:WaitlistTraceService){}

 @Patch(':requestId/opportunities/:opportunityId/state')
 @UnitScoped()
 @RequirePermissions('agenda.manage')
 setState(@Req() req:ImperioRequest,@Param('requestId') requestId:string,@Param('opportunityId') opportunityId:string,@Body() body:WaitlistOpportunityStateDto){
  return this.trace.setState(req.unitId!,requestId,opportunityId,body.state,req.principal!.userId);
 }

 @Post(':requestId/opportunities/:opportunityId/convert')
 @UnitScoped()
 @RequirePermissions('agenda.manage')
 convert(@Req() req:ImperioRequest,@Param('requestId') requestId:string,@Param('opportunityId') opportunityId:string,@Body() body:WaitlistConvertDto){
  return this.trace.convert(req.unitId!,requestId,opportunityId,body.bookingId,req.principal!.userId);
 }
}
