ALTER TYPE "MovementReason" ADD VALUE 'WARRANTY_REPLACEMENT';

CREATE TYPE "RmaStatus" AS ENUM ('SUBMITTED', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'SENT_FOR_REPAIR', 'READY_FOR_COLLECTION', 'REPLACED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RmaCoverage" AS ENUM ('IN_WARRANTY', 'OUT_OF_WARRANTY', 'GOODWILL', 'UNKNOWN_PROOF_OF_PURCHASE');
CREATE TYPE "RmaCustody" AS ENUM ('WITH_CUSTOMER', 'RECEIVED_BY_SHOP', 'WITH_TECHNICIAN', 'SENT_TO_SUPPLIER', 'READY_FOR_COLLECTION', 'RETURNED_TO_CUSTOMER', 'RETAINED_BY_SHOP');
CREATE TYPE "SupplierWarrantyStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'REPAIRED', 'REPLACED', 'CREDITED', 'RETURNED', 'CLOSED');

CREATE TABLE "document_sequences" (
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "warranty_claims" (
  "id" TEXT NOT NULL,
  "claimNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "saleMovementId" TEXT NOT NULL,
  "claimantName" TEXT,
  "claimantPhone" TEXT,
  "reportedIssue" TEXT NOT NULL,
  "physicalCondition" TEXT,
  "status" "RmaStatus" NOT NULL DEFAULT 'SUBMITTED',
  "coverage" "RmaCoverage" NOT NULL,
  "custody" "RmaCustody" NOT NULL DEFAULT 'RECEIVED_BY_SHOP',
  "resolution" TEXT,
  "openedById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warranty_claim_events" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fromStatus" "RmaStatus",
  "toStatus" "RmaStatus",
  "fromCustody" "RmaCustody",
  "toCustody" "RmaCustody",
  "note" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warranty_claim_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_warranty_cases" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "reference" TEXT,
  "status" "SupplierWarrantyStatus" NOT NULL DEFAULT 'DRAFT',
  "coverage" "RmaCoverage" NOT NULL DEFAULT 'UNKNOWN_PROOF_OF_PURCHASE',
  "resolution" TEXT,
  "sentAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_warranty_cases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements" ADD COLUMN "warrantyClaimId" TEXT;

CREATE UNIQUE INDEX "warranty_claims_claimNumber_key" ON "warranty_claims"("claimNumber");
CREATE UNIQUE INDEX "warranty_claims_idempotencyKey_key" ON "warranty_claims"("idempotencyKey");
CREATE INDEX "warranty_claims_unitId_openedAt_idx" ON "warranty_claims"("unitId", "openedAt");
CREATE INDEX "warranty_claims_status_openedAt_idx" ON "warranty_claims"("status", "openedAt");
CREATE INDEX "warranty_claims_assignedToId_status_idx" ON "warranty_claims"("assignedToId", "status");
CREATE INDEX "warranty_claim_events_claimId_createdAt_idx" ON "warranty_claim_events"("claimId", "createdAt");
CREATE UNIQUE INDEX "warranty_claim_events_idempotencyKey_key" ON "warranty_claim_events"("idempotencyKey");
CREATE INDEX "warranty_claim_events_actorId_createdAt_idx" ON "warranty_claim_events"("actorId", "createdAt");
CREATE UNIQUE INDEX "supplier_warranty_cases_claimId_key" ON "supplier_warranty_cases"("claimId");
CREATE INDEX "supplier_warranty_cases_supplierId_status_idx" ON "supplier_warranty_cases"("supplierId", "status");
CREATE INDEX "stock_movements_warrantyClaimId_idx" ON "stock_movements"("warrantyClaimId");

ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_saleMovementId_fkey" FOREIGN KEY ("saleMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "warranty_claim_events" ADD CONSTRAINT "warranty_claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "warranty_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranty_claim_events" ADD CONSTRAINT "warranty_claim_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_warranty_cases" ADD CONSTRAINT "supplier_warranty_cases_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "warranty_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_warranty_cases" ADD CONSTRAINT "supplier_warranty_cases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warrantyClaimId_fkey" FOREIGN KEY ("warrantyClaimId") REFERENCES "warranty_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
