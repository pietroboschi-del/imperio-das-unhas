-- WA2 — inbound Evolution persistente. Migration estritamente aditiva.
CREATE TYPE "MessagingInboundType" AS ENUM ('TEXT','IMAGE','DOCUMENT','UNKNOWN');
CREATE TYPE "MessagingInboundProcessingStatus" AS ENUM ('RECEIVED','PROCESSED','IGNORED','FAILED');

CREATE TABLE "MessagingInbound" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "channelId" TEXT,
  "providerMessageId" TEXT NOT NULL,
  "providerConversationId" TEXT,
  "senderPhone" TEXT NOT NULL,
  "recipientInstance" TEXT NOT NULL,
  "messageType" "MessagingInboundType" NOT NULL,
  "textBody" TEXT,
  "mediaMetadata" JSONB,
  "providerTimestamp" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawMetadata" JSONB NOT NULL,
  "processingStatus" "MessagingInboundProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "unitId" TEXT,
  "clientId" TEXT,
  "bookingId" TEXT,
  "commandId" TEXT,
  "threadRef" TEXT,
  "deduplicationKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  CONSTRAINT "MessagingInbound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessagingInbound_deduplicationKey_key" ON "MessagingInbound"("deduplicationKey");
CREATE INDEX "MessagingInbound_provider_providerMessageId_idx" ON "MessagingInbound"("provider","providerMessageId");
CREATE INDEX "MessagingInbound_channelId_receivedAt_idx" ON "MessagingInbound"("channelId","receivedAt");
CREATE INDEX "MessagingInbound_senderPhone_receivedAt_idx" ON "MessagingInbound"("senderPhone","receivedAt");
CREATE INDEX "MessagingInbound_clientId_receivedAt_idx" ON "MessagingInbound"("clientId","receivedAt");
CREATE INDEX "MessagingInbound_bookingId_idx" ON "MessagingInbound"("bookingId");
CREATE INDEX "MessagingInbound_commandId_idx" ON "MessagingInbound"("commandId");
CREATE INDEX "MessagingInbound_processingStatus_receivedAt_idx" ON "MessagingInbound"("processingStatus","receivedAt");
CREATE UNIQUE INDEX "MessagingOutbox_channelId_providerMessageId_key" ON "MessagingOutbox"("channelId","providerMessageId");
ALTER TABLE "MessagingInbound" ADD CONSTRAINT "MessagingInbound_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MessagingChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
