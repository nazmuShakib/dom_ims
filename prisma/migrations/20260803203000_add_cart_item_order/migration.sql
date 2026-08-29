ALTER TABLE "cart_items"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cartId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "position"
  FROM "cart_items"
)
UPDATE "cart_items" AS item
SET "position" = ranked."position"
FROM ranked
WHERE item."id" = ranked."id";

DROP INDEX IF EXISTS "cart_items_cartId_idx";
CREATE INDEX "cart_items_cartId_position_idx"
ON "cart_items"("cartId", "position");

ALTER TABLE "sale_items"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "saleId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "position"
  FROM "sale_items"
)
UPDATE "sale_items" AS item
SET "position" = ranked."position"
FROM ranked
WHERE item."id" = ranked."id";

DROP INDEX IF EXISTS "sale_items_saleId_idx";
CREATE INDEX "sale_items_saleId_position_idx"
ON "sale_items"("saleId", "position");
