-- V98a · integridade da importação, revisão monotônica e retenção de staging.
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "canonicalDataHash" TEXT;
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT NOT NULL DEFAULT 'INSTANCE_EXPORT';
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "reconciliationId" TEXT;
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "cutoverManifest" JSONB;
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3);
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3);
ALTER TABLE "MigrationEnvelope" ADD COLUMN IF NOT EXISTS "errorSummary" JSONB;
DROP INDEX IF EXISTS "MigrationEnvelope_instanceId_revision_dataHash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MigrationEnvelope_instanceId_revision_key" ON "MigrationEnvelope"("instanceId","revision");
