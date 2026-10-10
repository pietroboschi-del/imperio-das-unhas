import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { CoreReadController } from './core-read.controller';
import { ClientSourceConfigController } from './client-source-config.controller';
import { CoreWriteController } from './core-write.controller';
import { FinanceWriteController } from './finance-write.controller';
import { PublicBookingController } from './public-booking.controller';
import { CatalogConfigController } from './catalog-config.controller';
import { StructuralConfigController } from './structural-config.controller';
import { UnitPublicProfileController } from './unit-public-profile.controller';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingCreationService } from './booking-creation.service';
import { WhatsappAgentController } from './whatsapp-agent.controller';
import { WhatsappAgentGuard } from './whatsapp-agent.guard';
import { WaitlistService } from './waitlist.service';
import { WaitlistOpportunityService } from './waitlist-opportunity.service';
import { WaitlistTraceService } from './waitlist-trace.service';
import { WaitlistController } from './waitlist.controller';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
@Module({
 imports:[MessagingModule],
 controllers:[ClientSourceConfigController,CoreReadController,CoreWriteController,FinanceWriteController,PublicBookingController,CatalogConfigController,StructuralConfigController,UnitPublicProfileController,WhatsappAgentController,WaitlistController,StockController],
 providers:[BookingAvailabilityService,BookingCreationService,WhatsappAgentGuard,WaitlistService,WaitlistOpportunityService,WaitlistTraceService,StockService],
})
export class CoreModule {}
