-- BookingItem becomes the functional source of truth for booking service details.
-- Historical backfill is intentionally conservative: area snapshots are NOT reconstructed
-- from the current catalog, and missing historical duration/price remain NULL.
ALTER TABLE "BookingItem" ALTER COLUMN "durationMin" DROP NOT NULL;
ALTER TABLE "BookingItem" ALTER COLUMN "unitPrice" DROP NOT NULL;
ALTER TABLE "BookingItem" ADD COLUMN "clientAreaSnapshot" TEXT;
ALTER TABLE "BookingItem" ADD COLUMN "mustFinishBeforeSameAreaSnapshot" BOOLEAN;

INSERT INTO "BookingItem" (
  "id","bookingId","unitId","serviceId","professionalId","startAt",
  "durationMin","unitPrice","preference","forceFit","sortOrder",
  "clientAreaSnapshot","mustFinishBeforeSameAreaSnapshot","legacyPayload","createdAt","updatedAt"
)
SELECT
  'bi_backfill_' || substr(md5(b."id"),1,32),
  b."id",b."unitId",b."serviceId",b."professionalId",b."startAt",
  CASE
    WHEN jsonb_typeof(b."legacyPayload"->'durationMin')='number'
      THEN (b."legacyPayload"->>'durationMin')::integer
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(b."legacyPayload"->'unitPrice')='number'
      THEN (b."legacyPayload"->>'unitPrice')::numeric(14,2)
    WHEN jsonb_typeof(b."legacyPayload"->'price')='number'
      THEN (b."legacyPayload"->>'price')::numeric(14,2)
    ELSE NULL
  END,
  false,false,0,
  NULL,NULL,
  jsonb_build_object(
    'source','booking_header_backfill',
    'historicalTuple','serviceId+professionalId+startAt',
    'durationSource',CASE WHEN jsonb_typeof(b."legacyPayload"->'durationMin')='number' THEN 'booking.legacyPayload.durationMin' ELSE 'unknown' END,
    'unitPriceSource',CASE
      WHEN jsonb_typeof(b."legacyPayload"->'unitPrice')='number' THEN 'booking.legacyPayload.unitPrice'
      WHEN jsonb_typeof(b."legacyPayload"->'price')='number' THEN 'booking.legacyPayload.price'
      ELSE 'unknown'
    END,
    'areaSnapshotSource','unknown_not_reconstructed'
  ),
  b."createdAt",CURRENT_TIMESTAMP
FROM "Booking" b
WHERE b."serviceId" IS NOT NULL
  AND b."professionalId" IS NOT NULL
  AND b."startAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "BookingItem" i WHERE i."bookingId"=b."id");

-- Intentionally no UPDATE of existing BookingItem rows.
-- Bookings whose header tuple is incomplete remain without items for explicit review.
