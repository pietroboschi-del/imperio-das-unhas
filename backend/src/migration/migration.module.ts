import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { MigrationController } from './migration.controller';
import { ClientBatchService } from './client-batch.service';
@Module({ controllers:[MigrationController], providers:[ImportService,ClientBatchService], exports:[ImportService,ClientBatchService] })
export class MigrationModule {}
