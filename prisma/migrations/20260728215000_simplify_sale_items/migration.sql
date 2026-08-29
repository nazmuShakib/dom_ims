DROP INDEX "sale_items_productId_idx";
DROP INDEX "sale_items_unitId_idx";

ALTER TABLE "sale_items"
  DROP CONSTRAINT "sale_items_productId_fkey",
  DROP CONSTRAINT "sale_items_unitId_fkey",
  DROP CONSTRAINT "sale_items_quantity_positive",
  DROP CONSTRAINT "sale_items_money_nonnegative";

ALTER TABLE "sale_items"
  DROP COLUMN "productId",
  DROP COLUMN "unitId",
  DROP COLUMN "quantity",
  DROP COLUMN "actualUnitPrice",
  DROP COLUMN "discount",
  DROP COLUMN "lineTotal",
  DROP COLUMN "unitCost";

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_list_price_nonnegative" CHECK ("listUnitPrice" >= 0);
