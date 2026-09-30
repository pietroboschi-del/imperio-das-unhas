ALTER TABLE "OpenCommand" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "CashSession" (
 "id" TEXT NOT NULL,
 "unitId" TEXT NOT NULL,
 "businessDate" DATE NOT NULL,
 "status" TEXT NOT NULL,
 "openingAmount" DECIMAL(14,2) NOT NULL,
 "closingAmount" DECIMAL(14,2),
 "openedByUserId" TEXT NOT NULL,
 "closedByUserId" TEXT,
 "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "closedAt" TIMESTAMP(3),
 "version" INTEGER NOT NULL DEFAULT 1,
 "legacyPayload" JSONB,
 CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashSession_unitId_businessDate_status_idx" ON "CashSession"("unitId","businessDate","status");

CREATE TABLE "CommandPayment" (
 "id" TEXT NOT NULL,
 "commandId" TEXT NOT NULL,
 "cashSessionId" TEXT,
 "unitId" TEXT NOT NULL,
 "method" TEXT NOT NULL,
 "amount" DECIMAL(14,2) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
 "receivedByUserId" TEXT NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "legacyPayload" JSONB,
 CONSTRAINT "CommandPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommandPayment_unitId_receivedAt_idx" ON "CommandPayment"("unitId","receivedAt");
CREATE INDEX "CommandPayment_commandId_status_idx" ON "CommandPayment"("commandId","status");
CREATE INDEX "CommandPayment_cashSessionId_idx" ON "CommandPayment"("cashSessionId");
ALTER TABLE "CommandPayment" ADD CONSTRAINT "CommandPayment_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "OpenCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommandPayment" ADD CONSTRAINT "CommandPayment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
