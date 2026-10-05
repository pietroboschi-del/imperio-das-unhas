-- Persist the explicit central client selected by human review for MULTIPLE_STRONG_MATCHES.
ALTER TABLE "ClientDuplicateReview"
ADD COLUMN "targetClientId" TEXT;
