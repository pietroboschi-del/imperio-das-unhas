import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { MigrationController } from './migration.controller';
@Module({ controllers:[MigrationController], providers:[ImportService], exports:[ImportService] })
export class MigrationModule {}
