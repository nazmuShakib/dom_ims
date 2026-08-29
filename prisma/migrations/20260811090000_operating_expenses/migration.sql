-- Phase 10.1: persistent operating expenses, deliberately separate from stock
-- movements, inventory cost, and COGS.
CREATE TYPE "OperatingExpenseStatus" AS ENUM ('ACTIVE', 'VOIDED');

CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operating_expenses" (
    "id" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidTo" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "status" "OperatingExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordedById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operating_expenses_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "operating_expenses_void_consistent" CHECK (
      ("status" = 'ACTIVE' AND "voidedById" IS NULL AND "voidedAt" IS NULL AND "voidReason" IS NULL)
      OR
      ("status" = 'VOIDED' AND "voidedById" IS NOT NULL AND "voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");
CREATE INDEX "expense_categories_isActive_name_idx" ON "expense_categories"("isActive", "name");
CREATE UNIQUE INDEX "operating_expenses_expenseNumber_key" ON "operating_expenses"("expenseNumber");
CREATE INDEX "operating_expenses_expenseDate_idx" ON "operating_expenses"("expenseDate");
CREATE INDEX "operating_expenses_categoryId_expenseDate_idx" ON "operating_expenses"("categoryId", "expenseDate");
CREATE INDEX "operating_expenses_paymentMethod_expenseDate_idx" ON "operating_expenses"("paymentMethod", "expenseDate");
CREATE INDEX "operating_expenses_status_expenseDate_idx" ON "operating_expenses"("status", "expenseDate");
CREATE INDEX "operating_expenses_recordedById_expenseDate_idx" ON "operating_expenses"("recordedById", "expenseDate");

ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Useful defaults; administrators may add, rename, or archive categories later.
INSERT INTO "expense_categories" ("id", "name", "isActive", "createdAt", "updatedAt") VALUES
  ('exp-cat-rent', 'Rent', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-utilities', 'Utilities', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-internet-mobile', 'Internet and mobile', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-salaries', 'Salaries and wages', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-allowance', 'Employee allowance and overtime', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-transport', 'Transport and delivery', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-marketing', 'Marketing and advertising', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-supplies', 'Shop supplies and consumables', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-maintenance', 'Repairs and maintenance', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-software', 'Software and subscriptions', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-payment-fees', 'Banking and payment charges', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-licences', 'Licences and government fees', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-professional', 'Professional services', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exp-cat-misc', 'Miscellaneous', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
