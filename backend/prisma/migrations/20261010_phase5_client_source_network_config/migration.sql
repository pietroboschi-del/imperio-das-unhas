-- Additive only. No existing client, booking, professional or account records are changed.
CREATE TABLE "ClientSourceConfig" (
    "id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientSourceConfig_pkey" PRIMARY KEY ("id")
);
