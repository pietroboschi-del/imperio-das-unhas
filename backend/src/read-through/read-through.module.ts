import { Module } from '@nestjs/common';
import { ReadThroughController } from './read-through.controller';
import { ReadThroughService } from './read-through.service';
@Module({controllers:[ReadThroughController],providers:[ReadThroughService]})
export class ReadThroughModule {}
