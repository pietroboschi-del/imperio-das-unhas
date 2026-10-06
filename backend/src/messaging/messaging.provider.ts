import type { MessagingChannelId } from './messaging-channels';

export const MESSAGING_PROVIDER=Symbol('MESSAGING_PROVIDER');

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

export class MessagingProviderError extends Error {
  constructor(
    readonly code:string,
    safeMessage:string,
    readonly retryable=true,
  ){
    super(safeMessage);
    this.name='MessagingProviderError';
  }
}
