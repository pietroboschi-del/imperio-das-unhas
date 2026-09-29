import { Module } from '@nestjs/common';
import { CoreReadController } from './core-read.controller';
@Module({controllers:[CoreReadController]})
export class CoreModule {}
