import { Module } from '@nestjs/common';
import { DatabaseBackupController } from './database-backup.controller';

@Module({controllers:[DatabaseBackupController]})
export class BackupModule {}
