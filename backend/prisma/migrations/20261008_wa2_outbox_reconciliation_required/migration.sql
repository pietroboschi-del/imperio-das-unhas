-- Additive WA2 safety state. No historical Outbox rows are rewritten.
ALTER TYPE "MessagingOutboxStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';
