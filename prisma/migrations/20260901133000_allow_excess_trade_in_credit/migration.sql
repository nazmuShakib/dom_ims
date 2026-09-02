-- Regular sales may pay the excess when trade-in credit is greater than the
-- sale total. Keep the database-level non-negative guard, but remove the old
-- upper bound that predates TRADE_IN_PAYOUT settlements.
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_tradeInCredit_nonnegative_check"
  CHECK ("tradeInCredit" >= 0) NOT VALID;

ALTER TABLE "sales"
  VALIDATE CONSTRAINT "sales_tradeInCredit_nonnegative_check";

ALTER TABLE "sales"
  DROP CONSTRAINT IF EXISTS "sales_tradeInCredit_check";

ALTER TABLE "sales"
  RENAME CONSTRAINT "sales_tradeInCredit_nonnegative_check" TO "sales_tradeInCredit_check";
