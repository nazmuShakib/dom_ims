ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

CREATE TYPE "SaleSettlementType" AS ENUM ('CUSTOMER_COLLECTION', 'TRADE_IN_PAYOUT');

ALTER TABLE "sales" ADD COLUMN "amountPaid" INTEGER NOT NULL DEFAULT 0;

UPDATE "sales" AS sale
SET "amountPaid" = GREATEST(sale."total" - sale."tradeInCredit", 0)
WHERE sale."paymentStatus" = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM "emi_contracts" AS contract WHERE contract."saleId" = sale."id"
  );

CREATE TABLE "sale_settlements" (
  "id" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "type" "SaleSettlementType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "recordedById" TEXT NOT NULL,
  "recordedByName" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_settlements_receiptNumber_key" ON "sale_settlements"("receiptNumber");
CREATE UNIQUE INDEX "sale_settlements_idempotencyKey_key" ON "sale_settlements"("idempotencyKey");
CREATE INDEX "sale_settlements_saleId_recordedAt_idx" ON "sale_settlements"("saleId", "recordedAt");
CREATE INDEX "sale_settlements_type_recordedAt_idx" ON "sale_settlements"("type", "recordedAt");

ALTER TABLE "sale_settlements"
  ADD CONSTRAINT "sale_settlements_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_settlements"
  ADD CONSTRAINT "sale_settlements_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
