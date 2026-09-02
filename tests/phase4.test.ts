import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { OperatingExpense, Product, ProductUnit, RefurbishmentExpense, Sale, StockMovement, Supplier, User } from '@/domain/types';
import { searchInventory } from '@/lib/search';
import type { Repositories } from '@/repositories';
import { getDashboard } from '@/services/dashboard';

const now = new Date('2026-07-18T06:00:00.000Z');

const serialProduct: Product = {
  id: 'serial-product', sku: 'PHONE-1', barcode: '10001', name: 'Test Phone', description: null,
  model: 'T1', trackingType: 'SERIAL', categoryId: 'phones', brandId: null,
  defaultCostPrice: 500, defaultSalePrice: 800, taxRate: 0, reorderPoint: 2,
  quantityOnHand: 0, avgCostPrice: 0, imageUrl: null, isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const bulkProduct: Product = {
  ...serialProduct, id: 'bulk-product', sku: 'CABLE-1', barcode: '20002', name: 'Test Cable',
  model: null, trackingType: 'QUANTITY', defaultCostPrice: 100, defaultSalePrice: 200,
  quantityOnHand: 10, avgCostPrice: 100, reorderPoint: 3,
};

const units: ProductUnit[] = [
  {
    id: 'unit-in', serialNo: 'IMEI-EXACT', productId: serialProduct.id, status: 'IN_STOCK',
    costPrice: 500, salePrice: null, supplierId: 'supplier-1', receivedAt: '2026-06-01T00:00:00.000Z',
    soldAt: null, warrantyMonths: 12, warrantyExpiresAt: '2027-06-01T00:00:00.000Z',
    location: 'A1', note: null, usedGrade: 'GRADE_B', batteryHealth: 90,
    inspectionResults: null, knownDefects: null, includedAccessories: null, askingPrice: 900,
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'unit-sold', serialNo: 'IMEI-SOLD', productId: serialProduct.id, status: 'SOLD',
    costPrice: 500, salePrice: 800, supplierId: 'supplier-1', receivedAt: '2026-05-01T00:00:00.000Z',
    soldAt: '2026-07-05T00:00:00.000Z', warrantyMonths: 12, warrantyExpiresAt: '2027-05-01T00:00:00.000Z',
    location: null, note: null, usedGrade: null, batteryHealth: null,
    inspectionResults: null, knownDefects: null, includedAccessories: null, askingPrice: null,
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z',
  },
];

const movement = (patch: Partial<StockMovement> & Pick<StockMovement, 'id'>): StockMovement => ({
  id: patch.id, type: 'OUT', reason: 'SALE', productId: serialProduct.id, unitId: null,
  quantity: -1, unitCost: 500, unitPrice: 800, supplierId: null, customerName: null,
  customerPhone: null, reference: null, note: null, actorId: 'user-1', idempotencyKey: patch.id,
  reversesId: null, createdAt: '2026-07-05T00:00:00.000Z', ...patch,
});

const movements: StockMovement[] = [
  movement({ id: 'serial-sale', unitId: 'unit-sold' }),
  movement({ id: 'bulk-sale', productId: bulkProduct.id, quantity: -2, unitCost: 100, unitPrice: 200 }),
  movement({
    id: 'bulk-correction', type: 'ADJUST', reason: 'CORRECTION', productId: bulkProduct.id,
    quantity: 2, unitCost: 100, unitPrice: 200, reversesId: 'bulk-sale',
  }),
];

const supplier: Supplier = {
  id: 'supplier-1', name: 'Supplier One', phone: null, email: null, address: null, note: null,
  isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const user: User = {
  id: 'user-1', name: 'Test User', email: 'test@example.com', emailVerified: true,
  phoneNumber: null, phoneNumberVerified: false, image: null,
  role: 'ADMIN', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const operatingExpense: OperatingExpense = {
  id: 'expense-1', expenseNumber: 'EXP-2026-000001', expenseDate: '2026-07-10T18:00:00.000Z',
  categoryId: 'rent', description: 'Shop rent', amount: 100, paidTo: null, paymentMethod: 'CASH',
  reference: null, note: null, status: 'ACTIVE', recordedById: user.id, updatedById: user.id,
  voidedById: null, voidedAt: null, voidReason: null, createdAt: '2026-07-10T18:00:00.000Z',
  updatedAt: '2026-07-10T18:00:00.000Z',
};

const refurbishmentExpense: RefurbishmentExpense = {
  id: 'refurbishment-1', unitId: 'unit-in', description: 'Replacement display', amount: 200,
  actorId: user.id, createdAt: '2026-07-17T06:00:00.000Z',
};

function repositories(search = vi.fn(async () => [serialProduct, bulkProduct])): Repositories {
  return {
    products: {
      findAll: vi.fn(async () => [serialProduct, bulkProduct]),
      findById: vi.fn(async (id: string) => [serialProduct, bulkProduct].find((p) => p.id === id) ?? null),
      findByBarcode: vi.fn(async (barcode: string) => [serialProduct, bulkProduct].find((p) => p.barcode === barcode) ?? null),
      findBySku: vi.fn(async (sku: string) => [serialProduct, bulkProduct].find((p) => p.sku === sku) ?? null),
      search,
    },
    units: {
      findBySerial: vi.fn(async (serial: string) => units.find((unit) => unit.serialNo === serial) ?? null),
      findByProduct: vi.fn(async (productId: string) => units.filter((unit) => unit.productId === productId)),
      countInStock: vi.fn(async (productId: string) => units.filter((unit) => unit.productId === productId && unit.status === 'IN_STOCK').length),
    },
    suppliers: { findById: vi.fn(async () => supplier) },
    users: { findAll: vi.fn(async () => [user]) },
    movements: { findByDateRange: vi.fn(async () => movements) },
    sales: { findVoidedByDateRange: vi.fn(async () => []) },
    operatingExpenses: { findAll: vi.fn(async () => [operatingExpense]) },
    refurbishmentExpenses: { findAll: vi.fn(async () => []) },
  } as unknown as Repositories;
}

describe('Phase 4 dashboard', () => {
  it('derives operational and financial KPIs from stock and the append-only ledger', async () => {
    const dashboard = await getDashboard('ADMIN', now, repositories());
    expect(dashboard.totalUnits).toBe(11);
    expect(dashboard.distinctSkus).toBe(2);
    expect(dashboard.recentActivity[0]?.actorName).toBe('Test User');
    expect(dashboard.canSeeFinancials).toBe(true);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');
    expect(dashboard.stockValueAtCost).toBe(1_500);
    expect(dashboard.stockValueAtRetail).toBe(2_900);
    expect(dashboard.potentialMargin).toBe(1_400);
    expect(dashboard.monthRevenue).toBe(800);
    expect(dashboard.monthCogs).toBe(500);
    expect(dashboard.monthGrossProfit).toBe(300);
    expect(dashboard.monthOperatingExpenses).toBe(100);
    expect(dashboard.monthShrinkage).toBe(0);
    expect(dashboard.monthInternalUseCost).toBe(0);
    expect(dashboard.monthOperatingProfit).toBe(200);
    expect(dashboard.recentActivity.some((item) => item.reason === 'CORRECTION')).toBe(true);
    expect(dashboard.dailyOperations.reduce((total, day) => total + day.stockIn, 0)).toBe(0);
    expect(dashboard.dailyOperations.reduce((total, day) => total + day.stockOut, 0)).toBe(1);
    expect(dashboard.topMovers.find((item) => item.productId === bulkProduct.id)).toBeUndefined();
    expect(dashboard.topMovers.find((item) => item.productId === serialProduct.id)?.movedUnits).toBe(1);
  });

  it('does not classify newly received, never-sold stock as dead stock', async () => {
    const newlyReceived = movement({
      id: 'new-receipt', type: 'IN', reason: 'RECEIVE', productId: bulkProduct.id,
      quantity: 5, unitCost: 100, unitPrice: null, createdAt: '2026-07-17T06:00:00.000Z',
    });
    const testRepositories = repositories();
    testRepositories.products.findAll = vi.fn(async () => [bulkProduct]);
    testRepositories.movements.findByDateRange = vi.fn(async () => [newlyReceived]);

    const dashboard = await getDashboard('STAFF', now, testRepositories);
    expect(dashboard.deadStock).toEqual([]);
  });

  it('loads every active operating expense instead of applying the list-page cap', async () => {
    const expenses = Array.from({ length: 600 }, (_, index) => ({
      ...operatingExpense,
      id: `expense-${index}`,
      expenseNumber: `EXP-2026-${String(index).padStart(6, '0')}`,
      amount: 1,
    }));
    const testRepositories = repositories();
    testRepositories.operatingExpenses.findAll = vi.fn(async () => expenses);

    const dashboard = await getDashboard('ADMIN', now, testRepositories);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');
    expect(dashboard.monthOperatingExpenses).toBe(600);
    expect(testRepositories.operatingExpenses.findAll).toHaveBeenCalledWith(expect.any(Object), null);
  });

  it('adds recorded refurbishment costs to the historical stock-value line', async () => {
    const receipt = movement({
      id: 'used-receipt', type: 'IN', reason: 'RECEIVE', quantity: 1,
      unitId: 'unit-in', unitCost: 500, unitPrice: null, createdAt: '2026-06-01T00:00:00.000Z',
    });
    const testRepositories = repositories();
    testRepositories.products.findAll = vi.fn(async () => [serialProduct]);
    testRepositories.units.findByProduct = vi.fn(async () => [{ ...units[0]!, costPrice: 700 }]);
    testRepositories.movements.findByDateRange = vi.fn(async () => [receipt]);
    testRepositories.refurbishmentExpenses.findAll = vi.fn(async () => [refurbishmentExpense]);

    const dashboard = await getDashboard('ADMIN', now, testRepositories);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');
    expect(dashboard.stockValueAtCost).toBe(700);
    expect(dashboard.dailyFinancials.at(-1)?.stockValue).toBe(700);
  });

  it('deducts damage/loss and effective shop-use or gift cost from net operating profit', async () => {
    const extraMovements: StockMovement[] = [
      movement({ id: 'damage', reason: 'DAMAGE', productId: bulkProduct.id, unitCost: 20 }),
      movement({ id: 'shop-use', reason: 'SHOP_USE', productId: bulkProduct.id, unitCost: 30 }),
      movement({ id: 'gift', reason: 'GIFT', productId: bulkProduct.id, unitCost: 40 }),
      movement({ id: 'legacy-use', reason: 'INTERNAL_USE', productId: bulkProduct.id, unitCost: 50 }),
      movement({
        id: 'legacy-use-correction', type: 'ADJUST', reason: 'CORRECTION', productId: bulkProduct.id,
        quantity: 1, unitCost: 50, unitPrice: null, reversesId: 'legacy-use',
      }),
    ];
    const testRepositories = repositories();
    testRepositories.movements.findByDateRange = vi.fn(async () => [...movements, ...extraMovements]);

    const dashboard = await getDashboard('ADMIN', now, testRepositories);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');

    expect(dashboard.monthShrinkage).toBe(20);
    expect(dashboard.monthInternalUseCost).toBe(70);
    expect(dashboard.monthOperatingProfit).toBe(110);
  });

  it('keeps voided sales out of performance lines and charts cash refunds on the void date', async () => {
    const voidedSale = {
      status: 'VOIDED',
      voidedAt: '2026-07-18T05:00:00.000Z',
      refundAmount: 650,
    } as Sale;
    const testRepositories = repositories();
    testRepositories.sales.findVoidedByDateRange = vi.fn(async () => [voidedSale]);

    const dashboard = await getDashboard('ADMIN', now, testRepositories);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');

    expect(dashboard.dailyFinancials.reduce((sum, row) => sum + row.revenue, 0)).toBe(800);
    expect(dashboard.dailyFinancials.reduce((sum, row) => sum + row.margin, 0)).toBe(300);
    expect(dashboard.dailyFinancials.reduce((sum, row) => sum + row.refunds, 0)).toBe(650);
  });

  it('excludes both a voided sale and its later correction from dashboard KPI periods', async () => {
    const originalSale = movement({
      id: 'sale-before-void',
      productId: bulkProduct.id,
      quantity: -1,
      unitCost: 10_000,
      unitPrice: 18_000,
      createdAt: '2026-07-17T10:00:00.000Z',
    });
    const voidCorrection = movement({
      id: 'sale-void-correction',
      type: 'ADJUST',
      reason: 'CORRECTION',
      productId: bulkProduct.id,
      quantity: 1,
      unitCost: 10_000,
      unitPrice: 18_000,
      reversesId: originalSale.id,
      createdAt: '2026-07-18T05:00:00.000Z',
    });
    const testRepositories = repositories();
    testRepositories.movements.findByDateRange = vi.fn(async () => [
      ...movements,
      originalSale,
      voidCorrection,
    ]);

    const dashboard = await getDashboard('ADMIN', now, testRepositories);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');

    expect(dashboard.periodMetrics.day.current.revenue).toBe(0);
    expect(dashboard.periodMetrics.day.current.cogs).toBe(0);
    expect(dashboard.periodMetrics.day.current.grossProfit).toBe(0);
    expect(dashboard.monthRevenue).toBe(800);
    expect(dashboard.monthCogs).toBe(500);
    expect(dashboard.monthGrossProfit).toBe(300);
  });

  it('never serializes financial or cost fields for STAFF', async () => {
    const dashboard = await getDashboard('STAFF', now, repositories());
    expect(dashboard.canSeeFinancials).toBe(false);
    const payload = JSON.stringify(dashboard);
    for (const field of ['stockValueAtCost', 'stockValueAtRetail', 'potentialMargin', 'monthRevenue', 'monthCogs', 'monthGrossProfit', 'dailyFinancials', 'unitCost', 'costPrice']) {
      expect(payload).not.toContain(field);
    }
  });

  it('gives each dashboard KPI a distinct semantic card tone', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/page.tsx'), 'utf8');
    const kpis = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardKpis.tsx'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    for (const tone of ['units', 'low', 'stock', 'revenue', 'cogs']) {
      expect(kpis).toContain(`tone="${tone}"`);
    }
    expect(kpis).toContain("dashboard.potentialMargin < 0 ? 'marginLoss' : 'margin'");
    expect(kpis).toContain("metrics.grossProfit === 0 ? 'neutral' : 'profit'");
    expect(kpis).toContain("t('dashboard.breakEvenPeriod')");
    expect(css).toContain('--color-metric-margin-loss: #9f1239');
    expect(css).toContain('--color-metric-profit-loss: #b3261e');
    expect(css).toContain('--color-metric-internal-use: #be185d');
    expect(css).toContain('.dashboard-kpi-internal-use-wash');
    expect(kpis).toContain('tone="internalUse"');
    expect(kpis).toContain('relative overflow-visible border-t-[3px]');
    expect(kpis).toContain('sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]');
    expect(kpis).toContain('flex min-h-7 items-start');
    expect(kpis).toContain("note={t('dashboard.revenueHelp')}");
    expect(kpis).toContain("note={t('dashboard.cogsHelp')}");
    expect(kpis).toContain("note={t('dashboard.operatingExpensesHelp')}");
    expect(kpis).toContain('changePreference="lower-better"');
    expect(kpis).toContain("t('dashboard.fromZero')");
    expect(kpis).not.toContain('overflow-hidden border-t-[3px]');
  });

  it('renders daily stock movement as signed bars with a net line', () => {
    const charts = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardCharts.tsx'), 'utf8');
    expect(charts).toContain('stockOut: -point.stockOut');
    expect(charts).toContain('net: point.stockIn - point.stockOut');
    expect(charts).toContain('<ComposedChart');
    expect(charts).toContain('stackOffset="sign"');
    expect(charts).toContain('<ReferenceLine y={0}');
    expect(charts).toContain('<Bar dataKey="stockInPlot"');
    expect(charts).toContain('<Bar dataKey="stockOutPlot"');
    expect(charts.match(/stackId="movement"/g)).toHaveLength(2);
    expect(charts.match(/maxBarSize=\{22\}/g)).toHaveLength(2);
    expect(charts).toContain('<Line type="linear" dataKey="netPlot"');
    expect(charts).toContain('splitSignedIntegerAxis');
    expect(charts).toContain('operationsData.flatMap((point) => [point.stockIn, point.stockOut, point.net]),\n    2,');
    expect(charts).toContain('domain={operationsAxis.domain}');
    expect(charts).toContain('ticks={operationsAxis.ticks}');
    expect(charts).toContain('tickFormatter={operationsAxis.formatTick}');
    expect(charts).toContain('interval={0}');
    expect(charts).toContain('splitSignedNiceAxis');
    expect(charts).toContain('salesData?.flatMap((point) => [point.revenue, point.margin, point.refunds]) ?? [0],\n    8,');
    expect(charts).toContain('dataKey="revenuePlot"');
    expect(charts).toContain('dataKey="marginPlot"');
    expect(charts).toContain('dataKey="refundsPlot"');
    expect(charts).not.toContain('yAxisId="marginRate"');
    expect(charts).not.toContain('dataKey="marginRate"');
    expect(charts).toContain('<AccessibleChartTable');
    expect(charts).toContain('<div className="sr-only">');
    expect(charts).not.toContain('<table className="sr-only">');
    expect(charts).toContain('aria-hidden="true"');
    expect(charts).toContain("dot={period === 'day'}");
    expect(charts).not.toContain('Math.abs(Number(value)).toLocaleString');
    expect(charts).not.toContain('<AreaChart data={operations}');
  });

  it('places alerts below charts and limits charts to two columns', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/page.tsx'), 'utf8');
    const charts = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardCharts.tsx'), 'utf8');
    expect(page.indexOf('<DashboardCharts')).toBeLessThan(page.indexOf("t('dashboard.lowStockAlerts')"));
    expect(page.indexOf('<DashboardCharts')).toBeLessThan(page.indexOf("t('dashboard.deadStock')"));
    expect(charts).toContain('className="grid gap-4 lg:grid-cols-2"');
    expect(charts).not.toContain('2xl:grid-cols-3');
  });

  it('uses one calendar period for cards, charts, movers and recent activity', () => {
    const service = readFileSync(resolve(process.cwd(), 'src/services/dashboard.ts'), 'utf8');
    const charts = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardCharts.tsx'), 'utf8');
    const context = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardPeriodContext.tsx'), 'utf8');
    const kpis = readFileSync(resolve(process.cwd(), 'src/components/dashboard/DashboardKpis.tsx'), 'utf8');
    expect(service).toContain('Array.from({ length: 62 }');
    expect(context).toContain("{ value: 'day'");
    expect(context).toContain("{ value: 'week'");
    expect(context).toContain("{ value: 'month'");
    expect(charts).toContain('operations.filter((point) => point.date >= periodStart)');
    expect(charts).toContain('moneyData?.filter((point) => point.date >= periodStart)');
    expect(kpis).toContain('dashboard.periodMetrics[key]');
    expect(kpis).toContain('flex items-center justify-between gap-3');
    expect(kpis).toContain("'dashboard.vsYesterday'");
    expect(charts).not.toContain('revenueChange');
  });

  it('starts the dashboard week on Friday in Asia/Dhaka', () => {
    const service = readFileSync(resolve(process.cwd(), 'src/services/dashboard.ts'), 'utf8');
    expect(service).toContain('const daysSinceFriday = (dayOfWeek - 5 + 7) % 7');
    expect(service).toContain('today.getTime() - daysSinceFriday * DAY_MS');
  });
});

describe('Phase 4 search', () => {
  it('returns an exact serial before attempting product search', async () => {
    const productSearch = vi.fn(async () => {
      throw new Error('Product search must not run after an exact serial hit');
    });
    const result = await searchInventory('IMEI-EXACT', 'ADMIN', now, repositories(productSearch));
    expect(result.units).toHaveLength(1);
    expect(result.products).toHaveLength(0);
    expect(result.units[0]).toMatchObject({ serialNo: 'IMEI-EXACT', supplierName: 'Supplier One', costPrice: 500 });
    expect(productSearch).not.toHaveBeenCalled();
  });

  it('resolves an exact barcode before fuzzy product search', async () => {
    const productSearch = vi.fn(async () => { throw new Error('Fuzzy search must not run'); });
    const result = await searchInventory('10001', 'ADMIN', now, repositories(productSearch));
    expect(result.products[0]).toMatchObject({ id: serialProduct.id, barcode: '10001' });
    expect(productSearch).not.toHaveBeenCalled();
  });

  it('strips costs from STAFF serial and product results', async () => {
    const unitResult = await searchInventory('IMEI-EXACT', 'STAFF', now, repositories());
    expect(unitResult.units[0]).not.toHaveProperty('costPrice');

    const productResult = await searchInventory('Test', 'STAFF', now, repositories());
    expect(productResult.products).toHaveLength(2);
    for (const product of productResult.products) {
      expect(product).not.toHaveProperty('defaultCostPrice');
      expect(product).not.toHaveProperty('avgCostPrice');
    }
  });
});

describe('Phase 4 UI and API boundaries', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('protects the search route and disables caching', () => {
    const route = source('src/app/api/search/route.ts');
    expect(route).toContain('getOptionalSession()');
    expect(route).toContain("status: 401");
    expect(route).toContain("'Cache-Control': 'private, no-store'");
  });

  it('supports mouse opening, Ctrl/Cmd+K, 250 ms debounce, and Escape', () => {
    const palette = source('src/components/search/CommandPalette.tsx');
    expect(palette).toContain('onClick={() => setOpen(true)}');
    expect(palette).toContain('event.metaKey || event.ctrlKey');
    expect(palette).toContain('immediateScan.current ? 0 : 250');
    expect(palette).toContain("event.key === 'Escape'");
  });

  it('opens an exact unit, barcode, or SKU result immediately after scanning', () => {
    const palette = source('src/components/search/CommandPalette.tsx');
    expect(palette).toContain('pendingScan.current = value.trim()');
    expect(palette).toContain('unit.serialNo.toLowerCase() === scanned.toLowerCase()');
    expect(palette).toContain("product.barcode?.toLowerCase() === scanned.toLowerCase()");
    expect(palette).toContain('product.sku.toLowerCase() === scanned.toLowerCase()');
    expect(palette).toContain('go(`/products/${exactProduct.id}`)');
    expect(palette).toContain('onScan={scan}');
  });

  it('automatically retries one transient first-search server failure', () => {
    const palette = source('src/components/search/CommandPalette.tsx');
    const route = source('src/app/api/search/route.ts');
    expect(palette).toContain('response.status >= 500');
    expect(palette).toContain('window.setTimeout(resolve, 300)');
    expect(palette.match(/response = await request\(\)/g)).toHaveLength(2);
    expect(route).toContain('retryRead(');
    expect(route).toContain('attempts: 3');
    expect(route).toContain('delayMs: 250');
  });

  it('resolves movement actors from Better Auth instead of only legacy JSON users', () => {
    const ledger = source('src/app/(dashboard)/stock/movements/page.tsx');
    expect(ledger).toContain('getAuthUserNames(filteredMovements.map((movement) => movement.actorId))');
    expect(ledger).toContain('actorNameById.get(movement.actorId)');
  });
});
