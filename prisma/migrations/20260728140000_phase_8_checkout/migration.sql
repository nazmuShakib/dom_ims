CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'UNPAID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'MIXED', 'OTHER');

CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "email" TEXT,
  "address" TEXT,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_drafts" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "customerId" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "unitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "listUnitPrice" INTEGER NOT NULL,
  "actualUnitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "cart_items_prices_nonnegative" CHECK ("listUnitPrice" >= 0 AND "actualUnitPrice" >= 0)
);

CREATE TABLE "sales" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "customerId" TEXT,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "customerEmail" TEXT,
  "customerAddress" TEXT,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "subtotal" INTEGER NOT NULL,
  "discount" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_totals_nonnegative" CHECK ("subtotal" >= 0 AND "total" >= 0)
);

CREATE TABLE "sale_items" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "unitId" TEXT,
  "movementId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "serialNo" TEXT,
  "quantity" INTEGER NOT NULL,
  "listUnitPrice" INTEGER NOT NULL,
  "actualUnitPrice" INTEGER NOT NULL,
  "discount" INTEGER NOT NULL,
  "lineTotal" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "warrantyMonths" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "sale_items_money_nonnegative" CHECK (
    "listUnitPrice" >= 0 AND "actualUnitPrice" >= 0 AND
    "lineTotal" >= 0 AND "unitCost" >= 0
  )
);

CREATE UNIQUE INDEX "customers_phoneNormalized_key" ON "customers"("phoneNormalized");
CREATE INDEX "customers_name_idx" ON "customers"("name");
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");
CREATE UNIQUE INDEX "cart_drafts_actorId_key" ON "cart_drafts"("actorId");
CREATE INDEX "cart_drafts_customerId_idx" ON "cart_drafts"("customerId");
CREATE UNIQUE INDEX "cart_items_cartId_unitId_key" ON "cart_items"("cartId", "unitId");
CREATE UNIQUE INDEX "cart_items_cartId_productId_unitId_key" ON "cart_items"("cartId", "productId", "unitId");
CREATE UNIQUE INDEX "cart_items_quantity_product_key" ON "cart_items"("cartId", "productId") WHERE "unitId" IS NULL;
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");
CREATE INDEX "cart_items_productId_idx" ON "cart_items"("productId");
CREATE UNIQUE INDEX "sales_invoiceNumber_key" ON "sales"("invoiceNumber");
CREATE UNIQUE INDEX "sales_idempotencyKey_key" ON "sales"("idempotencyKey");
CREATE INDEX "sales_customerId_completedAt_idx" ON "sales"("customerId", "completedAt");
CREATE INDEX "sales_actorId_completedAt_idx" ON "sales"("actorId", "completedAt");
CREATE INDEX "sales_completedAt_idx" ON "sales"("completedAt");
CREATE INDEX "sales_paymentStatus_completedAt_idx" ON "sales"("paymentStatus", "completedAt");
CREATE UNIQUE INDEX "sale_items_movementId_key" ON "sale_items"("movementId");
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "sale_items_productId_idx" ON "sale_items"("productId");
CREATE INDEX "sale_items_unitId_idx" ON "sale_items"("unitId");

ALTER TABLE "cart_drafts" ADD CONSTRAINT "cart_drafts_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_drafts" ADD CONSTRAINT "cart_drafts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "cart_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
