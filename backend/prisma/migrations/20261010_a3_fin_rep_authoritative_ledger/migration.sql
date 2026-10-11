-- A3-FIN-REP: migration only for isolated CI/staging; NOT applied to production.
CREATE TABLE "CentralFinanceAccount" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "unitId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "type" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "metadata" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "CentralFinanceAccount_unitId_active_idx" ON "CentralFinanceAccount"("unitId","active");
CREATE TABLE "CentralFinanceEntry" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "unitId" TEXT NOT NULL,
 "accountId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "sourceId" TEXT,
 "idempotencyHash" TEXT NOT NULL,
 "date" DATE NOT NULL,
 "competenceDate" DATE NOT NULL,
 "dueDate" DATE,
 "amount" DECIMAL(14,2) NOT NULL,
 "status" TEXT NOT NULL,
 "cashSessionId" TEXT,
 "clientId" TEXT,
 "category" TEXT,
 "description" TEXT,
 "metadata" JSONB,
 "createdByUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CentralFinanceEntry_kind_sourceId_key" ON "CentralFinanceEntry"("kind","sourceId");
CREATE INDEX "CentralFinanceEntry_unitId_date_status_idx" ON "CentralFinanceEntry"("unitId","date","status");
CREATE INDEX "CentralFinanceEntry_unitId_competenceDate_idx" ON "CentralFinanceEntry"("unitId","competenceDate");
CREATE INDEX "CentralFinanceEntry_cashSessionId_idx" ON "CentralFinanceEntry"("cashSessionId");
ALTER TABLE "StockPurchase" ADD COLUMN "financeUnitId" TEXT;
-- Existing purchases remain untouched; historical financial ownership requires reconciliation.
