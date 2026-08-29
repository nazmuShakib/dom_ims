-- Ordinary checkout drafts now live in browser localStorage. The server keeps
-- only the protected trade-in staging envelope until the atomic checkout.
DROP TABLE "cart_items";

DROP INDEX IF EXISTS "cart_drafts_customerId_idx";
DROP INDEX IF EXISTS "cart_drafts_tradeInAcquisitionId_key";

ALTER TABLE "cart_drafts"
  DROP CONSTRAINT IF EXISTS "cart_drafts_customerId_fkey",
  DROP CONSTRAINT IF EXISTS "cart_drafts_tradeInAcquisitionId_fkey";

ALTER TABLE "cart_drafts"
  DROP COLUMN "customerId",
  DROP COLUMN "paymentMethod",
  DROP COLUMN "paymentStatus",
  DROP COLUMN "reference",
  DROP COLUMN "note",
  DROP COLUMN "tradeInAcquisitionId",
  DROP COLUMN "isEmi",
  DROP COLUMN "emiTermMonths",
  DROP COLUMN "emiDownPayment",
  DROP COLUMN "emiFirstDueDate";
