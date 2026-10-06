import type { MessagingChannelId } from './messaging-channels';

export type ProviderOutboundMessage={
  outboxId:string;
  channelId:MessagingChannelId;
  unitId:string|null;
  idempotencyKey:string;
  payload:unknown;
};

export type ProviderSendResult={
  providerMessageId:string;
  acceptedAt?:Date;
};

export interface MessagingProvider {
  readonly providerName:string;
  send(message:ProviderOutboundMessage):Promise<ProviderSendResult>;
}
