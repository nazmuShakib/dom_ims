-- A completed checkout deletes its draft cart, so this is intentionally not a
-- foreign key. It is an immutable ownership/idempotency binding and guarantees
-- that one cart cannot produce more than one sale.
ALTER TABLE "sales"
  ADD COLUMN "checkoutCartId" TEXT;

CREATE UNIQUE INDEX "sales_checkoutCartId_key" ON "sales"("checkoutCartId");
