-- STAFF discount allowances vary with the product's price and margin, so the
-- checkout floor belongs to each product rather than to one shop-wide policy.
ALTER TABLE "products"
ADD COLUMN "staffMaxDiscount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "products"
ADD CONSTRAINT "products_staffMaxDiscount_nonnegative"
CHECK ("staffMaxDiscount" >= 0);

DROP TABLE "shop_policy";
