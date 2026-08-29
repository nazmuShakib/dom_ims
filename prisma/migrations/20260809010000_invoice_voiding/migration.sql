ALTER TYPE "SaleStatus" ADD VALUE 'VOIDED';

ALTER TABLE "sales"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedByName" TEXT,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "refundAmount" INTEGER,
  ADD COLUMN "refundMethod" "PaymentMethod",
  ADD COLUMN "voidIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "sales_voidIdempotencyKey_key"
  ON "sales"("voidIdempotencyKey");
