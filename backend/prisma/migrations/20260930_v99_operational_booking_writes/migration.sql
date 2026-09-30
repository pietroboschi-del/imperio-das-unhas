ALTER TABLE "Booking"
  ADD COLUMN "startAt" TIMESTAMP(3),
  ADD COLUMN "serviceId" TEXT,
  ADD COLUMN "professionalId" TEXT,
  ADD COLUMN "notes" TEXT;

CREATE INDEX "Booking_unitId_startAt_idx" ON "Booking"("unitId", "startAt");
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");
CREATE INDEX "Booking_professionalId_idx" ON "Booking"("professionalId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
