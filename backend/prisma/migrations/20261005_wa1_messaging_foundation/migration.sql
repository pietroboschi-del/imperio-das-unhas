-- WA1 — fundação canônica de comunicação. Aditiva, sem credenciais e sem chamadas externas.
CREATE TYPE "MessagingOutboxStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "MessagingChannel" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'EVOLUTION',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MessagingChannel" ("id","provider","enabled")
VALUES
  ('CENTRAL','EVOLUTION',false),
  ('BIG_CENTRO','EVOLUTION',false),
  ('SHOPPING_CONTAGEM','EVOLUTION',false)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "MessagingOutbox" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "unitId" TEXT,
  "clientId" TEXT,
  "bookingId" TEXT,
  "commandId" TEXT,
  "status" "MessagingOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "MessagingOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessagingChannel_enabled_idx" ON "MessagingChannel"("enabled");
CREATE UNIQUE INDEX "MessagingOutbox_idempotencyKey_key" ON "MessagingOutbox"("idempotencyKey");
CREATE INDEX "MessagingOutbox_status_nextAttemptAt_idx" ON "MessagingOutbox"("status","nextAttemptAt");
CREATE INDEX "MessagingOutbox_channelId_status_idx" ON "MessagingOutbox"("channelId","status");
CREATE INDEX "MessagingOutbox_unitId_createdAt_idx" ON "MessagingOutbox"("unitId","createdAt");
CREATE INDEX "MessagingOutbox_clientId_createdAt_idx" ON "MessagingOutbox"("clientId","createdAt");
CREATE INDEX "MessagingOutbox_bookingId_idx" ON "MessagingOutbox"("bookingId");
CREATE INDEX "MessagingOutbox_commandId_idx" ON "MessagingOutbox"("commandId");
CREATE INDEX "MessagingOutbox_channelId_providerMessageId_idx" ON "MessagingOutbox"("channelId","providerMessageId");

ALTER TABLE "MessagingOutbox"
ADD CONSTRAINT "MessagingOutbox_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "MessagingChannel"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
