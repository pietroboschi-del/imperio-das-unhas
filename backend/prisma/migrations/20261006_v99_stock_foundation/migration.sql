-- THREE-UNIT STOCK FOUNDATION
-- Additive operational stock schema. StockBalanceOpening remains migration-only.
CREATE TYPE "StockLocationKind" AS ENUM ('CENTRAL','UNIT');

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "groupName" TEXT,
  "familyId" TEXT,
  "brand" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'un',
  "packageQty" DECIMAL(18,4),
  "baseUnit" TEXT,
  "defaultCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "salePrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "minStock" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "supplier" TEXT,
  "allocations" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockLocation" (
  "id" TEXT NOT NULL,
  "kind" "StockLocationKind" NOT NULL,
  "unitId" TEXT,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockBalance" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "sourceLocationId" TEXT,
  "destinationLocationId" TEXT,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "beforeQty" DECIMAL(18,4) NOT NULL,
  "afterQty" DECIMAL(18,4) NOT NULL,
  "performedByUserId" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockPurchase" (
  "id" TEXT NOT NULL,
  "destinationLocationId" TEXT NOT NULL,
  "purchaseDate" DATE NOT NULL,
  "supplier" TEXT NOT NULL,
  "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "goodsTotal" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "note" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockPurchaseItem" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "freightShare" DECIMAL(14,4) NOT NULL,
  "landedUnitCost" DECIMAL(14,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "StockPurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "sourceLocationId" TEXT NOT NULL,
  "destinationLocationId" TEXT NOT NULL,
  "transferDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SEPARATED',
  "note" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "sentByUserId" TEXT,
  "receivedByUserId" TEXT,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(14,4),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_active_type_idx" ON "Product"("active","type");
CREATE INDEX "Product_familyId_idx" ON "Product"("familyId");
CREATE UNIQUE INDEX "StockLocation_unitId_key" ON "StockLocation"("unitId");
CREATE INDEX "StockLocation_kind_active_idx" ON "StockLocation"("kind","active");
CREATE UNIQUE INDEX "StockBalance_productId_locationId_key" ON "StockBalance"("productId","locationId");
CREATE INDEX "StockBalance_locationId_idx" ON "StockBalance"("locationId");
CREATE UNIQUE INDEX "StockMovement_operationKey_key" ON "StockMovement"("operationKey");
CREATE INDEX "StockMovement_locationId_createdAt_idx" ON "StockMovement"("locationId","createdAt");
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId","createdAt");
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType","referenceId");
CREATE UNIQUE INDEX "StockPurchase_idempotencyKey_key" ON "StockPurchase"("idempotencyKey");
CREATE INDEX "StockPurchase_destinationLocationId_purchaseDate_idx" ON "StockPurchase"("destinationLocationId","purchaseDate");
CREATE INDEX "StockPurchaseItem_purchaseId_sortOrder_idx" ON "StockPurchaseItem"("purchaseId","sortOrder");
CREATE INDEX "StockPurchaseItem_productId_idx" ON "StockPurchaseItem"("productId");
CREATE UNIQUE INDEX "StockTransfer_idempotencyKey_key" ON "StockTransfer"("idempotencyKey");
CREATE INDEX "StockTransfer_sourceLocationId_status_idx" ON "StockTransfer"("sourceLocationId","status");
CREATE INDEX "StockTransfer_destinationLocationId_status_idx" ON "StockTransfer"("destinationLocationId","status");
CREATE INDEX "StockTransferItem_transferId_sortOrder_idx" ON "StockTransferItem"("transferId","sortOrder");
CREATE INDEX "StockTransferItem_productId_idx" ON "StockTransferItem"("productId");

ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceLocationId_fkey"
  FOREIGN KEY ("sourceLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockPurchase" ADD CONSTRAINT "StockPurchase_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "StockPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_fkey"
  FOREIGN KEY ("sourceLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey"
  FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Central is a stock-only location and never a Unit.
INSERT INTO "StockLocation" ("id","kind","unitId","name","active","updatedAt")
VALUES ('central','CENTRAL',NULL,'Estoque Central',true,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Unit locations use the same canonical id only as StockLocation.id; the FK remains explicit in unitId.
INSERT INTO "StockLocation" ("id","kind","unitId","name","active","updatedAt")
SELECT u."id",'UNIT',u."id",u."name",u."active",CURRENT_TIMESTAMP
FROM "Unit" u
WHERE u."id" IN ('centro','big','shopping-contagem')
ON CONFLICT ("id") DO NOTHING;
