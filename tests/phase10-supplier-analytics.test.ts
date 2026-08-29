import { describe, expect, it } from 'vitest';

import type { Product, StockMovement, Supplier, SupplierReturn } from '@/domain/types';
import { buildSupplierAnalytics, parseSupplierAnalyticsFilters } from '@/services/supplier-analytics';

const product: Product = {
  id: 'phone', sku: 'PHONE-1', barcode: null, name: 'Phone', description: null, model: null,
  trackingType: 'SERIAL', categoryId: 'phones', brandId: 'brand', defaultCostPrice: 10_000,
  defaultSalePrice: 15_000, taxRate: 0, reorderPoint: 0, quantityOnHand: 0, avgCostPrice: 0,
  imageUrl: null, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const supplier: Supplier = {
  id: 'supplier', name: 'Dhaka Supplier', phone: null, email: null, address: null, note: null,
  isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function movement(patch: Partial<StockMovement> & Pick<StockMovement, 'id' | 'reason' | 'quantity'>): StockMovement {
  return {
    id: patch.id, type: patch.quantity > 0 ? 'IN' : 'OUT', reason: patch.reason, productId: product.id,
    unitId: null, quantity: patch.quantity, unitCost: 10_000, unitPrice: null, supplierId: supplier.id,
    customerName: null, customerPhone: null, reference: null, note: null, actorId: 'admin',
    idempotencyKey: patch.id, reversesId: null, createdAt: '2026-08-01T06:00:00.000Z', ...patch,
  };
}

function supplierReturn(patch: Partial<SupplierReturn> = {}): SupplierReturn {
  return {
    id: 'return', returnNumber: 'SRT-2026-000001', movementId: 'return-movement', supplierId: supplier.id,
    reason: 'DEFECTIVE', status: 'SETTLED', recoveredAmount: 9_000, recoveryMethod: 'CASH',
    settlementReference: null, settlementNote: null, createdById: 'admin', settledById: 'admin',
    sentAt: '2026-08-05T06:00:00.000Z', settledAt: '2026-08-06T06:00:00.000Z',
    createdAt: '2026-08-05T06:00:00.000Z', updatedAt: '2026-08-06T06:00:00.000Z', ...patch,
  };
}

describe('Phase 10.2 supplier financial analytics', () => {
  it('defaults to all time and reset-compatible filters', () => {
    const filters = parseSupplierAnalyticsFilters({});
    expect(filters.from).toBeUndefined(); expect(filters.to).toBeUndefined();
    expect(filters.status).toBe('all'); expect(filters.activity).toBe('all');
    expect(filters.order).toBe('purchase-desc');
  });

  it('nets purchase corrections and derives returns, recovery, and retained cost without duplicate totals', () => {
    const movements = [
      movement({ id: 'purchase-a', reason: 'PURCHASE', quantity: 2 }),
      movement({ id: 'purchase-b', reason: 'PURCHASE', quantity: 1 }),
      movement({ id: 'purchase-b-correction', reason: 'CORRECTION', type: 'ADJUST', quantity: -1, reversesId: 'purchase-b' }),
      movement({ id: 'return-movement', reason: 'RETURN_TO_SUPPLIER', quantity: -1 }),
    ];
    const result = buildSupplierAnalytics({ suppliers: [supplier], products: [product], movements, returns: [supplierReturn()], filters: parseSupplierAnalyticsFilters({}) });
    const row = result.rows[0]!;
    expect(row.unitsReceived).toBe(2);
    expect(row.grossPurchaseCost).toBe(20_000);
    expect(row.returnedUnits).toBe(1);
    expect(row.returnedStockCost).toBe(10_000);
    expect(row.recoveredAmount).toBe(9_000);
    expect(row.recoveryDifference).toBe(-1_000);
    expect(row.netRetainedPurchaseCost).toBe(10_000);
    expect(row.returnRate).toBe(50);
  });

  it('excludes cancelled returns and does not confirm supplier credit before replacement stock arrives', () => {
    const movements = [movement({ id: 'purchase-a', reason: 'PURCHASE', quantity: 1 }), movement({ id: 'return-movement', reason: 'RETURN_TO_SUPPLIER', quantity: -1 })];
    const credit = supplierReturn({ recoveryMethod: 'SUPPLIER_CREDIT', recoveredAmount: 10_000 });
    const pendingReplacement = buildSupplierAnalytics({ suppliers: [supplier], products: [product], movements, returns: [credit], filters: parseSupplierAnalyticsFilters({}) }).rows[0]!;
    expect(pendingReplacement.recoveredAmount).toBe(0);
    const withReplacement = buildSupplierAnalytics({ suppliers: [supplier], products: [product], movements: [...movements, movement({ id: 'replacement', reason: 'PURCHASE', quantity: 1, reference: credit.returnNumber })], returns: [credit], filters: parseSupplierAnalyticsFilters({}) }).rows[0]!;
    expect(withReplacement.recoveredAmount).toBe(10_000);
    const cancelled = buildSupplierAnalytics({ suppliers: [supplier], products: [product], movements, returns: [supplierReturn({ status: 'CANCELLED', recoveredAmount: null, settledAt: null })], filters: parseSupplierAnalyticsFilters({}) }).rows[0]!;
    expect(cancelled.returnedUnits).toBe(0);
  });

  it('applies purchase and settlement dates independently', () => {
    const movements = [movement({ id: 'purchase-a', reason: 'PURCHASE', quantity: 1, createdAt: '2026-07-01T06:00:00.000Z' }), movement({ id: 'return-movement', reason: 'RETURN_TO_SUPPLIER', quantity: -1 })];
    const filters = parseSupplierAnalyticsFilters({ from: '2026-08-06', to: '2026-08-06', activity: 'settlements' });
    const result = buildSupplierAnalytics({ suppliers: [supplier], products: [product], movements, returns: [supplierReturn()], filters });
    expect(result.rows[0]?.grossPurchaseCost).toBe(0);
    expect(result.rows[0]?.returnedStockCost).toBe(0);
    expect(result.rows[0]?.recoveredAmount).toBe(9_000);
  });
});
