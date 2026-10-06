import { Body, ConflictException, Controller, Get, Headers, NotFoundException, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';
import { PublicBookingDto } from './public-booking.dto';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingCreationService } from './booking-creation.service';

const TERMINAL=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

@Controller('api/v1/public')
export class PublicBookingController {
 constructor(
  private readonly prisma:PrismaService,
  private readonly availability:BookingAvailabilityService,
  private readonly creation:BookingCreationService,
 ){}

 @Public() @Get('catalog')
 catalog(@Query('unitId') unitId=''){
  return this.availability.catalog(unitId);
 }

 @Public() @Get('availability')
 available(
  @Query('unitId') unitId='',
  @Query('date') date='',
  @Query('serviceId') serviceId='',
  @Query('professionalId') professionalId='',
 ){
  return this.availability.availability({unitId,date,serviceId,professionalId:professionalId||undefined});
 }

 @Public() @Get('occupancy')
 async occupancy(@Query('unitId') unitId='',@Query('date') date=''){
  if(!unitId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ConflictException('Unidade e data são obrigatórias');
  const unit=await this.prisma.unit.findFirst({where:{id:unitId,active:true},select:{id:true}});
  if(!unit)throw new NotFoundException('Unidade indisponível');
  return this.prisma.booking.findMany({
   where:{unitId,serviceDate:new Date(date+'T00:00:00.000Z'),status:{notIn:TERMINAL}},
   select:{id:true,status:true,blockAllDay:true,items:{orderBy:{sortOrder:'asc'},select:{professionalId:true,serviceId:true,startAt:true,durationMin:true}}},
   orderBy:{startAt:'asc'},take:1000,
  });
 }

 @Public() @Post('bookings')
 book(@Body() body:PublicBookingDto,@Headers('idempotency-key') key?:string){
  return this.creation.createPublicBooking(body,key);
 }
}
