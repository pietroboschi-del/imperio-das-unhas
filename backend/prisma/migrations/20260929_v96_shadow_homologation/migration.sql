-- V96 baseline de homologação. Criado para um banco PostgreSQL limpo.
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED','VALIDATED','IMPORTED','REJECTED');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE','REVOKED','EXPIRED');

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "legacyPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "passwordResetRequired" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "networkAdmin" BOOLEAN NOT NULL DEFAULT false,
  "permissions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserUnitAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "permissions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserUnitAccess_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "csrfHash" TEXT NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "ipHash" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "legacyPayload" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Service" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "durationMin" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "legacyPayload" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Professional" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publicName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "legacyPayload" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProfessionalUnit" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ProfessionalUnit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "registrationUnitId" TEXT,
  "legacyPayload" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientUnitLink" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientUnitLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "clientId" TEXT,
  "serviceDate" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "legacyPayload" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WaitlistRequest" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "clientId" TEXT,
  "status" TEXT NOT NULL,
  "legacyPayload" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WaitlistRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WaitlistOpportunity" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "requestId" TEXT,
  "status" TEXT NOT NULL,
  "bookingId" TEXT,
  "legacyPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaitlistOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "unitId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "legacyPayload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MigrationEnvelope" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "dataHash" TEXT NOT NULL,
  "sourceGeneratedAt" TIMESTAMP(3),
  "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
  "summary" JSONB,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationEnvelope_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MigrationEntity" (
  "id" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "sourceCollection" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "unitId" TEXT,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationEntity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_legacyId_key" ON "User"("legacyId");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "UserUnitAccess_userId_unitId_key" ON "UserUnitAccess"("userId","unitId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "ProfessionalUnit_professionalId_unitId_key" ON "ProfessionalUnit"("professionalId","unitId");
CREATE UNIQUE INDEX "ClientUnitLink_clientId_unitId_key" ON "ClientUnitLink"("clientId","unitId");
CREATE UNIQUE INDEX "MigrationEnvelope_instanceId_revision_dataHash_key" ON "MigrationEnvelope"("instanceId","revision","dataHash");
CREATE UNIQUE INDEX "MigrationEntity_envelopeId_sourceCollection_sourceId_key" ON "MigrationEntity"("envelopeId","sourceCollection","sourceId");

CREATE INDEX "Unit_active_idx" ON "Unit"("active");
CREATE INDEX "UserUnitAccess_unitId_active_idx" ON "UserUnitAccess"("unitId","active");
CREATE INDEX "Session_userId_status_idx" ON "Session"("userId","status");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Service_categoryId_active_idx" ON "Service"("categoryId","active");
CREATE INDEX "ProfessionalUnit_unitId_active_idx" ON "ProfessionalUnit"("unitId","active");
CREATE INDEX "Client_registrationUnitId_idx" ON "Client"("registrationUnitId");
CREATE INDEX "Client_phone_idx" ON "Client"("phone");
CREATE INDEX "ClientUnitLink_unitId_active_idx" ON "ClientUnitLink"("unitId","active");
CREATE INDEX "ClientUnitLink_clientId_active_idx" ON "ClientUnitLink"("clientId","active");
CREATE INDEX "Booking_unitId_serviceDate_idx" ON "Booking"("unitId","serviceDate");
CREATE INDEX "Booking_clientId_serviceDate_idx" ON "Booking"("clientId","serviceDate");
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
CREATE INDEX "WaitlistRequest_unitId_status_idx" ON "WaitlistRequest"("unitId","status");
CREATE INDEX "WaitlistRequest_clientId_idx" ON "WaitlistRequest"("clientId");
CREATE INDEX "WaitlistOpportunity_unitId_status_idx" ON "WaitlistOpportunity"("unitId","status");
CREATE INDEX "WaitlistOpportunity_requestId_idx" ON "WaitlistOpportunity"("requestId");
CREATE INDEX "WaitlistOpportunity_bookingId_idx" ON "WaitlistOpportunity"("bookingId");
CREATE INDEX "AuditEvent_unitId_occurredAt_idx" ON "AuditEvent"("unitId","occurredAt");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType","entityId");
CREATE INDEX "AuditEvent_userId_occurredAt_idx" ON "AuditEvent"("userId","occurredAt");
CREATE INDEX "MigrationEnvelope_status_createdAt_idx" ON "MigrationEnvelope"("status","createdAt");
CREATE INDEX "MigrationEntity_sourceCollection_sourceId_idx" ON "MigrationEntity"("sourceCollection","sourceId");
CREATE INDEX "MigrationEntity_unitId_idx" ON "MigrationEntity"("unitId");

ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfessionalUnit" ADD CONSTRAINT "ProfessionalUnit_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalUnit" ADD CONSTRAINT "ProfessionalUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_registrationUnitId_fkey" FOREIGN KEY ("registrationUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientUnitLink" ADD CONSTRAINT "ClientUnitLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientUnitLink" ADD CONSTRAINT "ClientUnitLink_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationEntity" ADD CONSTRAINT "MigrationEntity_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "MigrationEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
