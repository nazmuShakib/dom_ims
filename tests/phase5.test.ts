import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { Brand, Category, Product, ProductUnit, StockMovement, Supplier, User } from '@/domain/types';
import { reportExportMatrix, reportToCsv } from '@/lib/report-export';
import type { Repositories } from '@/repositories';
import { getReport, type ReportKind } from '@/services/reports';

const now = new Date('2026-07-18T06:00:00.000Z');
const product: Product = {
  id: 'p1', sku: 'PHONE-1', barcode: null, name: 'Phone', description: null, model: null,
  trackingType: 'SERIAL', categoryId: 'c1', brandId: 'b1', defaultCostPrice: 50_000,
  defaultSalePrice: 80_000, taxRate: 0, reorderPoint: 1, quantityOnHand: 0, avgCostPrice: 0,
  imageUrl: null, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const bulk: Product = { ...product, id: 'p2', sku: 'USB-1', name: 'USB cable', trackingType: 'QUANTITY', quantityOnHand: 4, avgCostPrice: 1_000 };
const unit: ProductUnit = {
  id: 'u1', serialNo: 'IMEI-1', productId: product.id, status: 'IN_STOCK', costPrice: 50_000,
  salePrice: null, supplierId: 's1', receivedAt: '2026-06-25T00:00:00.000Z', soldAt: null,
  warrantyMonths: null, warrantyExpiresAt: null, location: null, note: null,
  createdAt: '2026-06-25T00:00:00.000Z', updatedAt: '2026-06-25T00:00:00.000Z',
};
const movement = (patch: Partial<StockMovement> & Pick<StockMovement, 'id'>): StockMovement => ({
  id: patch.id, type: 'OUT', reason: 'SALE', productId: product.id, unitId: null, quantity: -1,
  unitCost: 50_000, unitPrice: 80_000, supplierId: null, customerName: null, customerPhone: null,
  reference: null, note: null, actorId: 'auth-user', idempotencyKey: patch.id, reversesId: null,
  createdAt: '2026-07-10T06:00:00.000Z', ...patch,
});
const movements: StockMovement[] = [
  movement({ id: 'kept-sale' }),
  movement({ id: 'reversed-sale', createdAt: '2026-07-11T06:00:00.000Z' }),
  movement({ id: 'sale-correction', type: 'ADJUST', reason: 'CORRECTION', quantity: 1, reversesId: 'reversed-sale', createdAt: '2026-07-12T06:00:00.000Z' }),
  movement({ id: 'purchase', type: 'IN', reason: 'PURCHASE', productId: bulk.id, quantity: 4, unitCost: 1_000, unitPrice: null, supplierId: 's1', createdAt: '2026-06-01T06:00:00.000Z' }),
  movement({ id: 'damage', reason: 'DAMAGE', productId: bulk.id, quantity: -1, unitCost: 1_000, unitPrice: null }),
];
const category: Category = { id: 'c1', name: 'Devices', slug: 'devices', parentId: null, isActive: true, createdAt: '', updatedAt: '' };
const brand: Brand = { id: 'b1', name: 'Acme', slug: 'acme', isActive: true, createdAt: '', updatedAt: '' };
const supplier: Supplier = { id: 's1', name: 'Supplier', phone: null, email: null, address: null, note: null, isActive: true, createdAt: '', updatedAt: '' };
const user: User = { id: 'legacy-user', name: 'Legacy', email: 'legacy@example.com', emailVerified: true, phoneNumber: null, phoneNumberVerified: false, image: null, role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };

function repositories(movementRows: StockMovement[] = movements): Repositories {
  return {
    products: { findAll: vi.fn(async () => [product, bulk]) },
    units: { findByProduct: vi.fn(async (id: string) => id === product.id ? [unit] : []) },
    movements: { findByDateRange: vi.fn(async () => movementRows) },
    categories: { findAll: vi.fn(async () => [category]) },
    brands: { findAll: vi.fn(async () => [brand]) },
    suppliers: { findAll: vi.fn(async () => [supplier]) },
    users: { findAll: vi.fn(async () => [user]) },
  } as unknown as Repositories;
}

describe('Phase 5 calculations', () => {
  it('cancels a reversed sale instead of overstating revenue, COGS, or profit', async () => {
    const report = await getReport({ report: 'sales' }, { now, repositories: repositories() });
    expect(report.totals).toMatchObject({ quantity: 1, revenue: 80_000, cogs: 50_000, profit: 30_000 });
  });

  it('omits fully corrected products and suppliers from aggregate reports', async () => {
    const damageCorrection = movement({
      id: 'damage-correction', type: 'ADJUST', reason: 'CORRECTION', productId: bulk.id,
      quantity: 1, unitCost: 1_000, unitPrice: null, reversesId: 'damage',
      createdAt: '2026-07-11T06:00:00.000Z',
    });
    const purchaseCorrection = movement({
      id: 'purchase-correction', type: 'ADJUST', reason: 'CORRECTION', productId: bulk.id,
      quantity: -4, unitCost: 1_000, unitPrice: null, supplierId: 's1', reversesId: 'purchase',
      createdAt: '2026-07-11T06:00:00.000Z',
    });
    const correctedRepositories = repositories([...movements, damageCorrection, purchaseCorrection]);

    const shrinkage = await getReport({ report: 'shrinkage' }, { now, repositories: correctedRepositories });
    const purchases = await getReport({ report: 'purchases' }, { now, repositories: correctedRepositories });

    expect(shrinkage.rows).toEqual([]);
    expect(shrinkage.totals).toMatchObject({ quantity: 0, damage: 0, loss: 0, value: 0 });
    expect(purchases.rows).toEqual([]);
    expect(purchases.totals).toMatchObject({ quantity: 0, spend: 0 });
  });

  it('omits a fully corrected product from profit by product', async () => {
    const correctedRepositories = repositories([
      movements.find((item) => item.id === 'reversed-sale')!,
      movements.find((item) => item.id === 'sale-correction')!,
    ]);
    const report = await getReport({ report: 'profit' }, { now, repositories: correctedRepositories });
    expect(report.rows).toEqual([]);
    expect(report.totals).toMatchObject({ quantity: 0, revenue: 0, cogs: 0, profit: 0 });
  });

  it('values current serial and quantity inventory and assigns aging buckets', async () => {
    const valuation = await getReport({ report: 'valuation' }, { now, repositories: repositories() });
    expect(valuation.totals).toMatchObject({ quantity: 5, value: 54_000 });
    const aging = await getReport({ report: 'aging' }, { now, repositories: repositories() });
    expect(aging.totals).toMatchObject({ quantity: 5, value: 54_000 });
    expect(aging.note).toContain('FIFO');
  });

  it('builds every required report from the repository abstraction', async () => {
    const kinds: ReportKind[] = ['valuation', 'sales', 'profit', 'purchases', 'aging', 'shrinkage', 'movements'];
    for (const report of kinds) {
      const result = await getReport({ report }, { now, repositories: repositories(), actorNames: new Map([['auth-user', 'Owner']]) });
      expect(result.kind).toBe(report);
      expect(result.columns.length).toBeGreaterThan(0);
    }
  });

  it('uses the same ordered cells for CSV and PDF export input', async () => {
    const report = await getReport({ report: 'profit' }, { now, repositories: repositories() });
    const matrix = reportExportMatrix(report);
    const csv = reportToCsv(report);
    expect(csv.split('\r\n')[0]).toBe(matrix.headers.join(','));
    expect(matrix.rows).toHaveLength(report.rows.length);
  });
});

describe('Phase 5 security boundaries', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('protects both the page and export route and keeps exports uncached', () => {
    expect(source('src/app/(dashboard)/reports/page.tsx')).toContain("requirePageCapability('VIEW_REPORTS')");
    const route = source('src/app/api/reports/export/route.ts');
    expect(route).toContain("hasPermission(session.role, 'VIEW_REPORTS')");
    expect(route).toContain("status: 403");
    expect(route).toContain("'Cache-Control': 'no-store'");
  });

  it('uses the repository boundary and provides both planned export formats', () => {
    const service = source('src/services/reports.ts');
    expect(service).toContain("from '@/repositories'");
    expect(service).not.toContain('prisma.');
    const route = source('src/app/api/reports/export/route.ts');
    expect(route).toContain('reportToCsv(report)');
    expect(route).toContain('reportToPdf(report)');
  });

  it('keeps report exports and shared page spacing usable on mobile', () => {
    const reports = source('src/app/(dashboard)/reports/page.tsx');
    const layout = source('src/app/(dashboard)/layout.tsx');
    const ui = source('src/components/ui/index.tsx');
    expect(reports).toContain('grid grid-cols-2 gap-2 sm:flex');
    expect(reports).toContain('items-center justify-center');
    expect(layout).toContain('flex-1 px-3 py-4 print:p-0');
    expect(layout).toContain('w-full max-w-[1600px]');
    expect(layout).toContain('dashboard-content');
    expect(layout).not.toContain('max-w-5xl');
    expect(source('src/components/dashboard/DashboardCharts.tsx')).toContain('lg:grid-cols-2');
    expect(source('src/components/dashboard/DashboardCharts.tsx')).not.toContain('2xl:grid-cols-3');
    const css = source('src/app/globals.css');
    expect(css).toContain('@media screen and (min-width: 1440px)');
    expect(css).toContain('.dashboard-content [class~="text-[11px]"]');
    expect(css).toContain('.dashboard-content [class~="text-[22px]"]');
    expect(ui).toContain('flex flex-col items-start gap-3 sm:flex-row');
    expect(ui).toContain('w-full sm:w-auto');
  });

  it('uses separate loading scopes for report tabs and report output filters', () => {
    const page = source('src/app/(dashboard)/reports/page.tsx');
    const workspace = source('src/components/reports/ReportWorkspace.tsx');
    expect(page).toContain('<ReportWorkspace');
    expect(page).toContain('resultVersion={crypto.randomUUID()}');
    expect(page).toContain('href: `/reports?report=${item.id}`');
    expect(workspace).toContain("navigate(tab.href, tab.id, 'tab')");
    expect(workspace).toContain("navigate(`/reports?${params.toString()}`, report, 'output')");
    expect(workspace).toContain("loadingScope === 'tab'");
    expect(workspace).toContain("loadingScope === 'output'");
    expect(workspace).toContain('setSelectedReport(report)');
    expect(workspace).toContain('window.history.pushState');
    expect(workspace).toContain('router.refresh()');
  });
});
