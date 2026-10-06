import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingCreationService } from './booking-creation.service';
import { WhatsappAgentBookingDto, WhatsappAgentMultiAvailabilityDto, WhatsappAgentMultiBookingDto, WhatsappAgentWaitlistDto } from './whatsapp-agent.dto';
import { WhatsappAgentGuard } from './whatsapp-agent.guard';
import { WaitlistService } from './waitlist.service';

@Controller('api/v1/integrations/whatsapp-agent')
@Public()
@UseGuards(WhatsappAgentGuard)
export class WhatsappAgentController {
  constructor(
    private readonly availability:BookingAvailabilityService,
    private readonly creation:BookingCreationService,
    private readonly waitlist:WaitlistService,
  ){}

  @Get('units')
  units(){return this.availability.activeUnits()}

  @Get('catalog')
  catalog(@Query('unitId') unitId=''){return this.availability.catalog(unitId)}

  @Get('availability')
  slots(
    @Query('unitId') unitId='',
    @Query('date') date='',
    @Query('serviceId') serviceId='',
    @Query('professionalId') professionalId='',
  ){
    return this.availability.availability({unitId,date,serviceId,professionalId:professionalId||undefined});
  }

  @Post('availability/multi')
  multiAvailability(@Body() body:WhatsappAgentMultiAvailabilityDto){
    return this.availability.multiAvailability(body);
  }

  @Post('waitlist')
  createWaitlist(@Body() body:WhatsappAgentWaitlistDto,@Headers('idempotency-key') key?:string){
    return this.waitlist.createFromWhatsapp(body,key);
  }

  @Post('bookings/multi')
  bookMulti(@Body() body:WhatsappAgentMultiBookingDto,@Headers('idempotency-key') key?:string){
    return this.creation.createAgentMultiBooking(body,key);
  }

  @Post('bookings')
  book(@Body() body:WhatsappAgentBookingDto,@Headers('idempotency-key') key?:string){
    return this.creation.createAgentBooking(body,key);
  }
}
