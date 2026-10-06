import { Module } from '@nestjs/common';
import { MessagingFoundationService } from './messaging-foundation.service';

@Module({
  providers:[MessagingFoundationService],
  exports:[MessagingFoundationService],
})
export class MessagingModule {}
