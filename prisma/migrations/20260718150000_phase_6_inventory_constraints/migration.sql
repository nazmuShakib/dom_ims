-- Phase 6: database-enforced inventory invariants and search indexes.

-- A movement is always economically meaningful.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("quantity" <> 0);

-- A movement linked to a physical serial is exactly one item in either direction.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_serial_quantity_one"
  CHECK ("unitId" IS NULL OR "quantity" IN (1, -1));

-- Money remains non-negative integer paisa at the persistence boundary.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_unit_cost_nonnegative" CHECK ("unitCost" >= 0),
  ADD CONSTRAINT "stock_movements_unit_price_nonnegative"
    CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0);

ALTER TABLE "product_units"
  ADD CONSTRAINT "product_units_cost_price_nonnegative" CHECK ("costPrice" >= 0),
  ADD CONSTRAINT "product_units_sale_price_nonnegative"
    CHECK ("salePrice" IS NULL OR "salePrice" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_quantity_on_hand_nonnegative" CHECK ("quantityOnHand" >= 0),
  ADD CONSTRAINT "products_default_cost_nonnegative" CHECK ("defaultCostPrice" >= 0),
  ADD CONSTRAINT "products_default_sale_nonnegative" CHECK ("defaultSalePrice" >= 0),
  ADD CONSTRAINT "products_average_cost_nonnegative" CHECK ("avgCostPrice" >= 0);

-- One original movement can have at most one correction.
CREATE UNIQUE INDEX "stock_movements_reversesId_key" ON "stock_movements"("reversesId");
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_reversesId_fkey"
  FOREIGN KEY ("reversesId") REFERENCES "stock_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application identifiers are case-insensitively unique.
CREATE UNIQUE INDEX "products_sku_ci_key" ON "products" (LOWER("sku"));
CREATE UNIQUE INDEX "product_units_serial_no_ci_key" ON "product_units" (LOWER("serialNo"));

-- Prisma's contains + insensitive query compiles to ILIKE, which these trigram
-- indexes accelerate without leaking PostgreSQL details into the service layer.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "products_sku_trgm_idx" ON "products" USING GIN ("sku" gin_trgm_ops);
