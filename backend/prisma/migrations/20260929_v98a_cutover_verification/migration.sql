-- V98a · persiste evidência automática de conferência do estado vigente.
ALTER TABLE "MigrationEnvelope" ADD COLUMN "cutoverVerification" JSONB;
ALTER TABLE "MigrationEnvelope" ADD COLUMN "cutoverVerifiedAt" TIMESTAMP(3);
