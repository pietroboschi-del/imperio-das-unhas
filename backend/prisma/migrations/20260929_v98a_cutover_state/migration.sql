-- V98a · estado operacional vigente da DEC-011.
CREATE TABLE "OpenCommand" (
 "id" TEXT NOT NULL, "unitId" TEXT NOT NULL, "clientId" TEXT, "serviceDate" DATE NOT NULL, "status" TEXT NOT NULL,
 "grossAmount" DECIMAL(14,2) NOT NULL, "discountAmount" DECIMAL(14,2) NOT NULL, "appliedSignalAmount" DECIMAL(14,2) NOT NULL,
 "appliedCreditAmount" DECIMAL(14,2) NOT NULL, "customerFeeAmount" DECIMAL(14,2) NOT NULL, "remainingAmount" DECIMAL(14,2) NOT NULL,
 "legacyPayload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "OpenCommand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OpenCommand_unitId_serviceDate_idx" ON "OpenCommand"("unitId","serviceDate");
CREATE INDEX "OpenCommand_clientId_idx" ON "OpenCommand"("clientId");
CREATE TABLE "ClientCreditOpening" ("id" TEXT NOT NULL,"clientId" TEXT NOT NULL,"amount" DECIMAL(14,2) NOT NULL,"currency" TEXT NOT NULL DEFAULT 'BRL',"source" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ClientCreditOpening_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ClientCreditOpening_clientId_idx" ON "ClientCreditOpening"("clientId");
CREATE TABLE "ClientPackageOpening" ("id" TEXT NOT NULL,"clientId" TEXT NOT NULL,"name" TEXT NOT NULL,"remainingUnits" DECIMAL(14,4) NOT NULL,"totalUnits" DECIMAL(14,4) NOT NULL,"expiresAt" DATE,"status" TEXT NOT NULL,"legacyPayload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ClientPackageOpening_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ClientPackageOpening_clientId_status_idx" ON "ClientPackageOpening"("clientId","status");
CREATE TABLE "ReceivableOpening" ("id" TEXT NOT NULL,"clientId" TEXT,"unitId" TEXT,"sourceDate" DATE,"dueDate" DATE,"originalAmount" DECIMAL(14,2) NOT NULL,"balance" DECIMAL(14,2) NOT NULL,"status" TEXT NOT NULL,"legacyPayload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ReceivableOpening_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ReceivableOpening_unitId_status_idx" ON "ReceivableOpening"("unitId","status");
CREATE INDEX "ReceivableOpening_clientId_status_idx" ON "ReceivableOpening"("clientId","status");
CREATE TABLE "StockBalanceOpening" ("id" TEXT NOT NULL,"productId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"qty" DECIMAL(18,4) NOT NULL,"avgCost" DECIMAL(14,4) NOT NULL,"legacyPayload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "StockBalanceOpening_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "StockBalanceOpening_productId_locationId_key" ON "StockBalanceOpening"("productId","locationId");
CREATE INDEX "StockBalanceOpening_locationId_idx" ON "StockBalanceOpening"("locationId");
CREATE TABLE "ProfessionalPayableOpening" ("id" TEXT NOT NULL,"kind" TEXT NOT NULL,"professionalId" TEXT NOT NULL,"unitId" TEXT,"amount" DECIMAL(14,2) NOT NULL,"sourceId" TEXT,"legacyPayload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ProfessionalPayableOpening_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ProfessionalPayableOpening_unitId_kind_idx" ON "ProfessionalPayableOpening"("unitId","kind");
CREATE INDEX "ProfessionalPayableOpening_professionalId_kind_idx" ON "ProfessionalPayableOpening"("professionalId","kind");
CREATE TABLE "FiscalPendingDocument" ("id" TEXT NOT NULL,"unitId" TEXT NOT NULL,"commandId" TEXT,"clientId" TEXT,"documentType" TEXT,"status" TEXT NOT NULL,"amount" DECIMAL(14,2) NOT NULL,"referenceDate" DATE,"transmissionState" TEXT,"legacyPayload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "FiscalPendingDocument_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FiscalPendingDocument_unitId_status_idx" ON "FiscalPendingDocument"("unitId","status");
CREATE INDEX "FiscalPendingDocument_clientId_idx" ON "FiscalPendingDocument"("clientId");
