CREATE TABLE "BookingItem" (
 "id" TEXT NOT NULL,
 "bookingId" TEXT NOT NULL,
 "unitId" TEXT NOT NULL,
 "serviceId" TEXT,
 "professionalId" TEXT NOT NULL,
 "startAt" TIMESTAMP(3) NOT NULL,
 "durationMin" INTEGER NOT NULL,
 "unitPrice" DECIMAL(14,2) NOT NULL,
 "preference" BOOLEAN NOT NULL DEFAULT false,
 "forceFit" BOOLEAN NOT NULL DEFAULT false,
 "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "legacyPayload" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingItem_bookingId_sortOrder_idx" ON "BookingItem"("bookingId","sortOrder");
CREATE INDEX "BookingItem_unitId_startAt_idx" ON "BookingItem"("unitId","startAt");
CREATE INDEX "BookingItem_professionalId_startAt_idx" ON "BookingItem"("professionalId","startAt");
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
