import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { BookingAvailabilityService } from './booking-availability.service';
import { WhatsappAgentGuard } from './whatsapp-agent.guard';

@Controller('api/v1/integrations/whatsapp-agent')
@Public()
@UseGuards(WhatsappAgentGuard)
export class WhatsappAgentController {
  constructor(private readonly availability:BookingAvailabilityService){}

  @Get('units')
  units(){
    return this.availability.activeUnits();
  }

  @Get('catalog')
  catalog(@Query('unitId') unitId=''){
    return this.availability.catalog(unitId);
  }

  @Get('availability')
  slots(
    @Query('unitId') unitId='',
    @Query('date') date='',
    @Query('serviceId') serviceId='',
    @Query('professionalId') professionalId='',
  ){
    return this.availability.availability({unitId,date,serviceId,professionalId:professionalId||undefined});
  }
}
