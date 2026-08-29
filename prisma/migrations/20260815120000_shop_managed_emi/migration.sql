CREATE TYPE "CustomerIdentificationType" AS ENUM ('NID', 'PASSPORT', 'BIRTH_CERTIFICATE');
CREATE TYPE "EmiContractStatus" AS ENUM ('ACTIVE', 'PAID', 'OVERDUE', 'VOIDED');
CREATE TYPE "EmiInstallmentStatus" AS ENUM ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'VOIDED');
CREATE TYPE "EmiPaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');

ALTER TABLE "customers"
  ADD COLUMN "identificationType" "CustomerIdentificationType",
  ADD COLUMN "identificationNumber" TEXT;

ALTER TABLE "cart_drafts"
  ADD COLUMN "isEmi" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emiTermMonths" INTEGER,
  ADD COLUMN "emiDownPayment" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emiFirstDueDate" TIMESTAMP(3);

CREATE TABLE "product_emi_prices" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "termMonths" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "configuredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_emi_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_unit_emi_prices" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "termMonths" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "configuredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_unit_emi_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emi_contracts" (
  "id" TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "EmiContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "termMonths" INTEGER NOT NULL,
  "normalPrice" INTEGER NOT NULL,
  "emiTotal" INTEGER NOT NULL,
  "downPayment" INTEGER NOT NULL DEFAULT 0,
  "tradeInCredit" INTEGER NOT NULL DEFAULT 0,
  "financedAmount" INTEGER NOT NULL,
  "firstDueDate" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  CONSTRAINT "emi_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emi_installments" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amountDue" INTEGER NOT NULL,
  "amountPaid" INTEGER NOT NULL DEFAULT 0,
  "status" "EmiInstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emi_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emi_payments" (
  "id" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "status" "EmiPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "recordedById" TEXT NOT NULL,
  "recordedByName" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reverseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emi_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emi_payment_allocations" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emi_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emi_early_settlements" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "outstandingBefore" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL,
  "finalAmount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "approvedByName" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emi_early_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_emi_prices_productId_termMonths_key" ON "product_emi_prices"("productId", "termMonths");
CREATE INDEX "product_emi_prices_termMonths_idx" ON "product_emi_prices"("termMonths");
CREATE UNIQUE INDEX "product_unit_emi_prices_unitId_termMonths_key" ON "product_unit_emi_prices"("unitId", "termMonths");
CREATE INDEX "product_unit_emi_prices_termMonths_idx" ON "product_unit_emi_prices"("termMonths");
CREATE INDEX "customers_identificationType_identificationNumber_idx" ON "customers"("identificationType", "identificationNumber");
CREATE UNIQUE INDEX "emi_contracts_contractNumber_key" ON "emi_contracts"("contractNumber");
CREATE UNIQUE INDEX "emi_contracts_saleId_key" ON "emi_contracts"("saleId");
CREATE INDEX "emi_contracts_customerId_status_idx" ON "emi_contracts"("customerId", "status");
CREATE INDEX "emi_contracts_status_firstDueDate_idx" ON "emi_contracts"("status", "firstDueDate");
CREATE INDEX "emi_contracts_createdAt_idx" ON "emi_contracts"("createdAt");
CREATE UNIQUE INDEX "emi_installments_contractId_sequence_key" ON "emi_installments"("contractId", "sequence");
CREATE INDEX "emi_installments_status_dueDate_idx" ON "emi_installments"("status", "dueDate");
CREATE UNIQUE INDEX "emi_payments_receiptNumber_key" ON "emi_payments"("receiptNumber");
CREATE UNIQUE INDEX "emi_payments_idempotencyKey_key" ON "emi_payments"("idempotencyKey");
CREATE INDEX "emi_payments_contractId_paidAt_idx" ON "emi_payments"("contractId", "paidAt");
CREATE INDEX "emi_payments_status_paidAt_idx" ON "emi_payments"("status", "paidAt");
CREATE UNIQUE INDEX "emi_payment_allocations_paymentId_installmentId_key" ON "emi_payment_allocations"("paymentId", "installmentId");
CREATE INDEX "emi_payment_allocations_installmentId_idx" ON "emi_payment_allocations"("installmentId");
CREATE UNIQUE INDEX "emi_early_settlements_contractId_key" ON "emi_early_settlements"("contractId");

ALTER TABLE "product_emi_prices" ADD CONSTRAINT "product_emi_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_emi_prices" ADD CONSTRAINT "product_emi_prices_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_unit_emi_prices" ADD CONSTRAINT "product_unit_emi_prices_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_unit_emi_prices" ADD CONSTRAINT "product_unit_emi_prices_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_contracts" ADD CONSTRAINT "emi_contracts_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_contracts" ADD CONSTRAINT "emi_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_contracts" ADD CONSTRAINT "emi_contracts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_installments" ADD CONSTRAINT "emi_installments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "emi_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_payments" ADD CONSTRAINT "emi_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "emi_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_payments" ADD CONSTRAINT "emi_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_payment_allocations" ADD CONSTRAINT "emi_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "emi_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_payment_allocations" ADD CONSTRAINT "emi_payment_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "emi_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_early_settlements" ADD CONSTRAINT "emi_early_settlements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "emi_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emi_early_settlements" ADD CONSTRAINT "emi_early_settlements_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_emi_prices" ADD CONSTRAINT "product_emi_prices_term_check" CHECK ("termMonths" IN (3, 6, 9, 12));
ALTER TABLE "product_emi_prices" ADD CONSTRAINT "product_emi_prices_price_check" CHECK ("price" > 0);
ALTER TABLE "product_unit_emi_prices" ADD CONSTRAINT "product_unit_emi_prices_term_check" CHECK ("termMonths" IN (3, 6, 9, 12));
ALTER TABLE "product_unit_emi_prices" ADD CONSTRAINT "product_unit_emi_prices_price_check" CHECK ("price" > 0);
ALTER TABLE "emi_contracts" ADD CONSTRAINT "emi_contracts_term_check" CHECK ("termMonths" IN (3, 6, 9, 12));
ALTER TABLE "emi_contracts" ADD CONSTRAINT "emi_contracts_amounts_check" CHECK ("normalPrice" >= 0 AND "emiTotal" > 0 AND "downPayment" >= 0 AND "tradeInCredit" >= 0 AND "financedAmount" >= 0);
ALTER TABLE "emi_installments" ADD CONSTRAINT "emi_installments_amounts_check" CHECK ("amountDue" >= 0 AND "amountPaid" >= 0 AND "amountPaid" <= "amountDue");
ALTER TABLE "emi_payments" ADD CONSTRAINT "emi_payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "emi_payment_allocations" ADD CONSTRAINT "emi_payment_allocations_amount_check" CHECK ("amount" > 0);
