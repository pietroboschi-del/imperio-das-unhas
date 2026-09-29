import { Module } from '@nestjs/common';
import { ArchitectureController } from './architecture.controller';
@Module({controllers:[ArchitectureController]})
export class ArchitectureModule {}
