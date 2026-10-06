-- WA5.1 — contrato e persistência do motor de automações.
-- Estritamente aditiva: sem backfill, sem alteração de dados/tabelas existentes e sem integração com Outbox.
CREATE TYPE "MessagingAutomationStatus" AS ENUM (
  'PENDING',
  'READY',
  'ENQUEUED',
  'DONE',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "MessagingAutomation" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "clientId" TEXT,
  "bookingId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "automationType" TEXT NOT NULL,
  "status" "MessagingAutomationStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "logicalKey" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "doneAt" TIMESTAMP(3),
  CONSTRAINT "MessagingAutomation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingAutomation_idempotencyKey_key" ON "MessagingAutomation"("idempotencyKey");
CREATE UNIQUE INDEX "MessagingAutomation_logicalKey_generation_key" ON "MessagingAutomation"("logicalKey","generation");
CREATE INDEX "MessagingAutomation_status_scheduledAt_idx" ON "MessagingAutomation"("status","scheduledAt");
CREATE INDEX "MessagingAutomation_unitId_status_scheduledAt_idx" ON "MessagingAutomation"("unitId","status","scheduledAt");
CREATE INDEX "MessagingAutomation_bookingId_status_idx" ON "MessagingAutomation"("bookingId","status");
CREATE INDEX "MessagingAutomation_clientId_createdAt_idx" ON "MessagingAutomation"("clientId","createdAt");
CREATE INDEX "MessagingAutomation_sourceType_sourceId_idx" ON "MessagingAutomation"("sourceType","sourceId");
CREATE INDEX "MessagingAutomation_logicalKey_status_idx" ON "MessagingAutomation"("logicalKey","status");
