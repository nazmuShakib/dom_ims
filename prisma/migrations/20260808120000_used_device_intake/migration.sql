CREATE TYPE "UsedDeviceGrade" AS ENUM ('GRADE_A', 'GRADE_B', 'GRADE_C', 'REFURBISHED');
CREATE TYPE "UsedAcquisitionType" AS ENUM ('DIRECT_PURCHASE', 'TRADE_IN');

ALTER TYPE "MovementReason" ADD VALUE 'TRADE_IN' AFTER 'PURCHASE';

ALTER TABLE "product_units"
  ADD COLUMN "usedGrade" "UsedDeviceGrade",
  ADD COLUMN "batteryHealth" INTEGER,
  ADD COLUMN "inspectionResults" JSONB,
  ADD COLUMN "knownDefects" TEXT,
  ADD COLUMN "includedAccessories" TEXT,
  ADD COLUMN "askingPrice" INTEGER;

ALTER TABLE "cart_drafts" ADD COLUMN "tradeInAcquisitionId" TEXT;
ALTER TABLE "sales" ADD COLUMN "tradeInCredit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sale_items"
  ADD COLUMN "usedGrade" "UsedDeviceGrade",
  ADD COLUMN "knownDefects" TEXT;

CREATE TABLE "used_device_acquisitions" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "type" "UsedAcquisitionType" NOT NULL,
  "sellerName" TEXT NOT NULL,
  "sellerPhone" TEXT NOT NULL,
  "identificationType" TEXT,
  "identificationNumber" TEXT,
  "acquisitionValue" INTEGER NOT NULL,
  "ownershipConfirmed" BOOLEAN NOT NULL,
  "acceptedById" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tradeInSaleId" TEXT,
  CONSTRAINT "used_device_acquisitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refurbishment_expenses" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refurbishment_expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "used_device_acquisitions_unitId_key" ON "used_device_acquisitions"("unitId");
CREATE UNIQUE INDEX "used_device_acquisitions_idempotencyKey_key" ON "used_device_acquisitions"("idempotencyKey");
CREATE UNIQUE INDEX "used_device_acquisitions_tradeInSaleId_key" ON "used_device_acquisitions"("tradeInSaleId");
CREATE INDEX "used_device_acquisitions_type_acquiredAt_idx" ON "used_device_acquisitions"("type", "acquiredAt");
CREATE INDEX "used_device_acquisitions_sellerPhone_idx" ON "used_device_acquisitions"("sellerPhone");
CREATE INDEX "used_device_acquisitions_acceptedById_acquiredAt_idx" ON "used_device_acquisitions"("acceptedById", "acquiredAt");
CREATE INDEX "refurbishment_expenses_unitId_createdAt_idx" ON "refurbishment_expenses"("unitId", "createdAt");
CREATE INDEX "refurbishment_expenses_actorId_createdAt_idx" ON "refurbishment_expenses"("actorId", "createdAt");
CREATE UNIQUE INDEX "cart_drafts_tradeInAcquisitionId_key" ON "cart_drafts"("tradeInAcquisitionId");

ALTER TABLE "used_device_acquisitions"
  ADD CONSTRAINT "used_device_acquisitions_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "used_device_acquisitions"
  ADD CONSTRAINT "used_device_acquisitions_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "used_device_acquisitions"
  ADD CONSTRAINT "used_device_acquisitions_tradeInSaleId_fkey"
  FOREIGN KEY ("tradeInSaleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refurbishment_expenses"
  ADD CONSTRAINT "refurbishment_expenses_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refurbishment_expenses"
  ADD CONSTRAINT "refurbishment_expenses_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_drafts"
  ADD CONSTRAINT "cart_drafts_tradeInAcquisitionId_fkey"
  FOREIGN KEY ("tradeInAcquisitionId") REFERENCES "used_device_acquisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_units"
  ADD CONSTRAINT "product_units_batteryHealth_check"
  CHECK ("batteryHealth" IS NULL OR ("batteryHealth" >= 0 AND "batteryHealth" <= 100));
ALTER TABLE "product_units"
  ADD CONSTRAINT "product_units_askingPrice_check"
  CHECK ("askingPrice" IS NULL OR "askingPrice" >= 0);
ALTER TABLE "used_device_acquisitions"
  ADD CONSTRAINT "used_device_acquisitions_value_check" CHECK ("acquisitionValue" >= 0);
ALTER TABLE "refurbishment_expenses"
  ADD CONSTRAINT "refurbishment_expenses_amount_check" CHECK ("amount" > 0);
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_tradeInCredit_check" CHECK ("tradeInCredit" >= 0 AND "tradeInCredit" <= "total");
