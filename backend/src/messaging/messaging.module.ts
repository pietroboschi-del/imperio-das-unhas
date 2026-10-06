import { Module } from '@nestjs/common';
import { MessagingFoundationService } from './messaging-foundation.service';
import { MessagingDispatchService } from './messaging-dispatch.service';
import { MessagingInboundService } from './messaging-inbound.service';
import { EvolutionInstanceResolver } from './evolution-config';
import { EvolutionMessagingProvider } from './evolution-messaging.provider';
import { EvolutionWebhookParser } from './evolution-webhook.parser';
import { EvolutionWebhookGuard } from './evolution-webhook.guard';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import { MESSAGING_PROVIDER } from './messaging.provider';

@Module({
  controllers:[EvolutionWebhookController],
  providers:[
    MessagingFoundationService,
    MessagingDispatchService,
    MessagingInboundService,
    EvolutionInstanceResolver,
    EvolutionMessagingProvider,
    EvolutionWebhookParser,
    EvolutionWebhookGuard,
    {provide:MESSAGING_PROVIDER,useExisting:EvolutionMessagingProvider},
  ],
  exports:[MessagingFoundationService,MessagingDispatchService,MessagingInboundService],
})
export class MessagingModule {}
