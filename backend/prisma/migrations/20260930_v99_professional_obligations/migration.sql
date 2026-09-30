CREATE TABLE "ProfessionalObligation" (
 "id" TEXT NOT NULL, "professionalId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
 "commandId" TEXT, "commandItemId" TEXT, "kind" TEXT NOT NULL,
 "competenceDate" DATE NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
 "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'OPEN',
 "legacyPayload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProfessionalObligation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfessionalObligation_commandItemId_kind_key" ON "ProfessionalObligation"("commandItemId","kind");
CREATE INDEX "ProfessionalObligation_professionalId_unitId_competenceDate_idx" ON "ProfessionalObligation"("professionalId","unitId","competenceDate");
CREATE INDEX "ProfessionalObligation_unitId_status_idx" ON "ProfessionalObligation"("unitId","status");
CREATE TABLE "ProfessionalSettlement" (
 "id" TEXT NOT NULL, "professionalId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
 "amount" DECIMAL(14,2) NOT NULL, "paidAt" TIMESTAMP(3) NOT NULL,
 "paidByUserId" TEXT NOT NULL, "legacyPayload" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProfessionalSettlement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProfessionalSettlement_professionalId_unitId_paidAt_idx" ON "ProfessionalSettlement"("professionalId","unitId","paidAt");
