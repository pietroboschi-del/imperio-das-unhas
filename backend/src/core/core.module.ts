import { Module } from '@nestjs/common';
import { CoreReadController } from './core-read.controller';
import { CoreWriteController } from './core-write.controller';
import { FinanceWriteController } from './finance-write.controller';
import { PublicBookingController } from './public-booking.controller';
import { CatalogConfigController } from './catalog-config.controller';
import { StructuralConfigController } from './structural-config.controller';
import { UnitPublicProfileController } from './unit-public-profile.controller';
import { BookingAvailabilityService } from './booking-availability.service';
import { WhatsappAgentController } from './whatsapp-agent.controller';
import { WhatsappAgentGuard } from './whatsapp-agent.guard';
@Module({
 controllers:[CoreReadController,CoreWriteController,FinanceWriteController,PublicBookingController,CatalogConfigController,StructuralConfigController,UnitPublicProfileController,WhatsappAgentController],
 providers:[BookingAvailabilityService,WhatsappAgentGuard],
})
export class CoreModule {}
