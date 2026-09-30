import { Module } from '@nestjs/common';
import { CoreReadController } from './core-read.controller';
import { CoreWriteController } from './core-write.controller';
@Module({controllers:[CoreReadController,CoreWriteController]})
export class CoreModule {}
