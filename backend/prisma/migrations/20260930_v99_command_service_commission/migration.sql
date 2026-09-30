CREATE TABLE "CommandServiceItem" (
 "id" TEXT NOT NULL,
 "commandId" TEXT NOT NULL,
 "unitId" TEXT NOT NULL,
 "serviceId" TEXT NOT NULL,
 "professionalId" TEXT NOT NULL,
 "unitPrice" DECIMAL(14,2) NOT NULL,
 "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "netServiceAmount" DECIMAL(14,2) NOT NULL,
 "commissionPercent" DECIMAL(7,4),
 "commissionFixedAmount" DECIMAL(14,2),
 "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CommandServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommandServiceItem_commandId_idx" ON "CommandServiceItem"("commandId");
CREATE INDEX "CommandServiceItem_unitId_professionalId_idx" ON "CommandServiceItem"("unitId","professionalId");
CREATE INDEX "CommandServiceItem_serviceId_idx" ON "CommandServiceItem"("serviceId");
ALTER TABLE "CommandServiceItem" ADD CONSTRAINT "CommandServiceItem_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "OpenCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
