import { Module } from '@nestjs/common';
import { CoreReadController } from './core-read.controller';
import { CoreWriteController } from './core-write.controller';
import { FinanceWriteController } from './finance-write.controller';
import { PublicBookingController } from './public-booking.controller';
import { CatalogConfigController } from './catalog-config.controller';
@Module({controllers:[CoreReadController,CoreWriteController,FinanceWriteController,PublicBookingController,CatalogConfigController]})
export class CoreModule {}
