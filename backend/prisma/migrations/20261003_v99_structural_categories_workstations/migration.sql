CREATE TABLE "Workstation" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "allowedCategoryIds" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "legacyPayload" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workstation_unitId_name_key" ON "Workstation"("unitId", "name");
CREATE INDEX "Workstation_unitId_active_idx" ON "Workstation"("unitId", "active");

ALTER TABLE "Workstation"
ADD CONSTRAINT "Workstation_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
