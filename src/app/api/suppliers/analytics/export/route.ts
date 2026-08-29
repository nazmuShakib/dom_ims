import { NextResponse } from 'next/server';

import { hasPermission } from '@/lib/permissions';
import { reportToCsv } from '@/lib/report-export';
import { reportToPdf } from '@/lib/report-pdf';
import { getOptionalSession } from '@/lib/session';
import { getSupplierAnalytics, parseSupplierAnalyticsFilters, supplierAnalyticsDateLabel } from '@/services/supplier-analytics';
import type { ReportResult } from '@/services/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_REPORTS')) return NextResponse.json({ error: 'Supplier analytics require manager access' }, { status: 403 });
  const url = new URL(request.url); const raw = Object.fromEntries(url.searchParams.entries());
  const filters = parseSupplierAnalyticsFilters(raw); const result = await getSupplierAnalytics(filters);
  const report: ReportResult = {
    kind: 'purchases', title: 'Supplier financial analytics',
    description: `Purchase, return and confirmed recovery metrics · ${supplierAnalyticsDateLabel(filters)}`,
    generatedAt: new Date().toISOString(),
    columns: [
      { key: 'supplier', label: 'Supplier', type: 'text' }, { key: 'units', label: 'Units received', type: 'number' },
      { key: 'products', label: 'Products supplied', type: 'number' }, { key: 'gross', label: 'Gross purchase cost', type: 'money' },
      { key: 'returnedUnits', label: 'Returned units', type: 'number' },
      { key: 'returnedCost', label: 'Returned stock cost', type: 'money' }, { key: 'recovered', label: 'Confirmed recovery', type: 'money' },
      { key: 'difference', label: 'Recovery surplus / deficit', type: 'money' }, { key: 'net', label: 'Net retained purchase cost', type: 'money' },
      { key: 'returnRate', label: 'Return rate %', type: 'number' }, { key: 'lastPurchase', label: 'Last purchase', type: 'date' },
    ],
    rows: result.rows.map((row) => ({ id: row.supplierId, cells: { supplier: row.supplierName, units: row.unitsReceived, products: row.distinctProducts, gross: row.grossPurchaseCost, returnedUnits: row.returnedUnits, returnedCost: row.returnedStockCost, recovered: row.recoveredAmount, difference: row.recoveryDifference, net: row.netRetainedPurchaseCost, returnRate: row.returnRate, lastPurchase: row.lastPurchaseAt } })),
    totals: { units: result.totals.unitsReceived, products: result.totals.distinctProducts, gross: result.totals.grossPurchaseCost, returnedUnits: result.totals.returnedUnits, returnedCost: result.totals.returnedStockCost, recovered: result.totals.recoveredAmount, difference: result.totals.recoveryDifference, net: result.totals.netRetainedPurchaseCost },
  };
  const format = raw.format === 'pdf' ? 'pdf' : 'csv'; const filename = `supplier-analytics-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === 'pdf') {
    const content = await reportToPdf(report);
    return new Response(new Uint8Array(content), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  }
  return new Response(`\uFEFF${reportToCsv(report)}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
