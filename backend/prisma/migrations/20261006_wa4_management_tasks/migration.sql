CREATE TABLE "ManagementTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueDate" DATE,
  "priority" TEXT NOT NULL DEFAULT 'high',
  "category" TEXT NOT NULL DEFAULT 'general',
  "unitId" TEXT NOT NULL,
  "assignedUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "legacyPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagementTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManagementTask_sourceType_sourceId_assignedUserId_key" ON "ManagementTask"("sourceType","sourceId","assignedUserId");
CREATE INDEX "ManagementTask_unitId_status_idx" ON "ManagementTask"("unitId","status");
CREATE INDEX "ManagementTask_assignedUserId_status_idx" ON "ManagementTask"("assignedUserId","status");
