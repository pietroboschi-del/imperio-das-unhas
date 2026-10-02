-- Persist human duplicate-review decisions without mutating central clients.
CREATE TABLE "ClientDuplicateReview" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "reportHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "mergeTargetClusterId" TEXT,
  "note" TEXT,
  "reviewedByUserId" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientDuplicateReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientDuplicateReview_batchId_clusterId_key"
ON "ClientDuplicateReview"("batchId", "clusterId");

CREATE INDEX "ClientDuplicateReview_batchId_decision_idx"
ON "ClientDuplicateReview"("batchId", "decision");

CREATE INDEX "ClientDuplicateReview_reviewedByUserId_reviewedAt_idx"
ON "ClientDuplicateReview"("reviewedByUserId", "reviewedAt");
