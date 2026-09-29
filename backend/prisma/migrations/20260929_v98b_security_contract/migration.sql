DO $$ BEGIN
  CREATE TYPE "SystemRole" AS ENUM ('OWNER','ADMINISTRATIVE','OPERATOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CredentialTokenPurpose" AS ENUM ('ACTIVATE','RESET');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "systemRole" "SystemRole" NOT NULL DEFAULT 'OPERATOR';

CREATE TABLE IF NOT EXISTS "UserCredentialToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "CredentialTokenPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCredentialToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserCredentialToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserCredentialToken_tokenHash_key" ON "UserCredentialToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "UserCredentialToken_userId_purpose_expiresAt_idx" ON "UserCredentialToken"("userId","purpose","expiresAt");

CREATE TABLE IF NOT EXISTS "LoginRateLimit" (
  "keyHash" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("keyHash")
);
