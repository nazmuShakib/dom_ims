CREATE TYPE "SupplierReturnStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');
CREATE TYPE "SupplierReturnReason" AS ENUM ('SLOW_MOVING', 'EXCESS_STOCK', 'WRONG_ITEM', 'DEFECTIVE', 'RECALL', 'OTHER');
CREATE TYPE "SupplierRecoveryMethod" AS ENUM ('CASH', 'MOBILE_BANKING', 'BANK_TRANSFER', 'SUPPLIER_CREDIT', 'MIXED', 'OTHER', 'NO_RECOVERY');

CREATE TABLE "supplier_returns" (
  "id" TEXT NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "reason" "SupplierReturnReason" NOT NULL,
  "status" "SupplierReturnStatus" NOT NULL DEFAULT 'PENDING',
  "recoveredAmount" INTEGER,
  "recoveryMethod" "SupplierRecoveryMethod",
  "settlementReference" TEXT,
  "settlementNote" TEXT,
  "createdById" TEXT NOT NULL,
  "settledById" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_returns_returnNumber_key" ON "supplier_returns"("returnNumber");
CREATE UNIQUE INDEX "supplier_returns_movementId_key" ON "supplier_returns"("movementId");
CREATE INDEX "supplier_returns_supplierId_status_idx" ON "supplier_returns"("supplierId", "status");
CREATE INDEX "supplier_returns_status_sentAt_idx" ON "supplier_returns"("status", "sentAt");

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve serialized supplier returns recorded before this workflow existed.
-- The movement remains the source of quantity and cost; this only creates a pending case.
INSERT INTO "supplier_returns" (
  "id", "returnNumber", "movementId", "supplierId", "reason", "status",
  "createdById", "sentAt", "createdAt", "updatedAt"
)
SELECT
  m."id",
  'SRT-LEGACY-' || upper(substr(replace(m."id", '-', ''), 1, 12)),
  m."id",
  COALESCE(m."supplierId", u."supplierId"),
  'OTHER'::"SupplierReturnReason",
  'PENDING'::"SupplierReturnStatus",
  m."actorId",
  m."createdAt",
  m."createdAt",
  m."createdAt"
FROM "stock_movements" m
LEFT JOIN "product_units" u ON u."id" = m."unitId"
WHERE m."reason" = 'RETURN_TO_SUPPLIER'
  AND m."actorId" IS NOT NULL
  AND COALESCE(m."supplierId", u."supplierId") IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "stock_movements" correction
    WHERE correction."reversesId" = m."id"
  );
