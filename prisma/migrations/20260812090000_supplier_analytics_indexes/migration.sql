-- Phase 10.2 supplier analytics uses supplier-scoped date ranges frequently.
CREATE INDEX "stock_movements_supplierId_createdAt_idx"
  ON "stock_movements"("supplierId", "createdAt");

CREATE INDEX "supplier_returns_supplierId_sentAt_idx"
  ON "supplier_returns"("supplierId", "sentAt");

CREATE INDEX "supplier_returns_supplierId_settledAt_idx"
  ON "supplier_returns"("supplierId", "settledAt");
