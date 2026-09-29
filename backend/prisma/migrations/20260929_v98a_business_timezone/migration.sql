-- V98a · DEC-002: timezone operacional explícito por unidade.
ALTER TABLE "Unit" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
