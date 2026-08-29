-- Preserve exact day-based warranties for used phones while retaining the
-- existing calendar-month warranty behavior for month-based coverage.
ALTER TABLE "product_units" ADD COLUMN "warrantyDays" INTEGER;
ALTER TABLE "sale_items" ADD COLUMN "warrantyDays" INTEGER;
