'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileDown, FileText } from 'lucide-react';

import { useI18n } from '@/components/i18n/I18nProvider';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Badge, Button, Card, EmptyState, Field, Input, Select, TableViewport } from '@/components/ui';
import { formatBDT } from '@/lib/money';
import type { Brand, Category, Product, Supplier } from '@/domain/types';
import type { SupplierAnalyticsFilters, SupplierAnalyticsResult } from '@/services/supplier-analytics';

const UNKNOWN_SUPPLIER_ID = '__supplier_not_recorded__';

type FilterValues = Record<'from' | 'to' | 'supplierId' | 'productId' | 'categoryId' | 'brandId' | 'status' | 'activity' | 'order', string> & {
  onlyWithPurchases: boolean;
  onlyWithReturns: boolean;
};

function valuesFrom(filters: SupplierAnalyticsFilters): FilterValues {
  return { from: filters.from ?? '', to: filters.to ?? '', supplierId: filters.supplierId ?? '', productId: filters.productId ?? '', categoryId: filters.categoryId ?? '', brandId: filters.brandId ?? '', status: filters.status, activity: filters.activity, order: filters.order, onlyWithPurchases: filters.onlyWithPurchases, onlyWithReturns: filters.onlyWithReturns };
}

function analyticsUrl(values: FilterValues): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value === true || (typeof value === 'string' && value)) params.set(key, String(value)); });
  const query = params.toString();
  return query ? `/suppliers/analytics?${query}` : '/suppliers/analytics';
}

function resetValues(): FilterValues {
  return { from: '', to: '', supplierId: '', productId: '', categoryId: '', brandId: '', status: 'all', activity: 'all', order: 'purchase-desc', onlyWithPurchases: false, onlyWithReturns: false };
}

function displayDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function displayFilterDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
}

export function SupplierAnalyticsWorkspace({ filters, result, suppliers, products, categories, brands, resultVersion }: {
  filters: SupplierAnalyticsFilters;
  result: SupplierAnalyticsResult;
  suppliers: Supplier[];
  products: Product[];
  categories: Category[];
  brands: Brand[];
  resultVersion: string;
}) {
  const { t } = useI18n(); const router = useRouter();
  const [values, setValues] = useState(() => valuesFrom(filters));
  const [filtering, setFiltering] = useState(false); const [refreshing, startRefresh] = useTransition();
  const pending = filtering || refreshing;
  useEffect(() => { setValues(valuesFrom(filters)); setFiltering(false); }, [filters, resultVersion]);
  const update = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  function navigate(next: FilterValues) {
    setValues(next); setFiltering(true);
    window.history.pushState(null, '', analyticsUrl(next));
    startRefresh(() => router.refresh());
  }
  const exportQuery = analyticsUrl(values).split('?')[1] ?? '';
  const periodLabel = !values.from && !values.to
    ? t('supplierAnalytics.allTime')
    : values.from && values.to
      ? `${displayFilterDate(values.from)} – ${displayFilterDate(values.to)}`
      : values.from
        ? t('supplierAnalytics.fromDate', { date: displayFilterDate(values.from) })
        : t('supplierAnalytics.toDate', { date: displayFilterDate(values.to) });

  return <>
    <header className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="text-[22px] font-semibold tracking-[-0.01em]">{t('supplierAnalytics.title')}</h1><p className="mt-0.5 text-[12px] text-graphite">{t('supplierAnalytics.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2">
        <a className="inline-flex h-9 items-center rounded-[3px] border border-emerald-700 bg-emerald-700 px-3.5 text-[13px] font-medium text-white hover:bg-emerald-800" href={`/api/suppliers/analytics/export?${exportQuery}&format=csv`}><FileDown className="mr-1.5 size-4" />{t('expenses.exportCsv')}</a>
        <a className="inline-flex h-9 items-center rounded-[3px] border border-rose-700 bg-rose-700 px-3.5 text-[13px] font-medium text-white hover:bg-rose-800" href={`/api/suppliers/analytics/export?${exportQuery}&format=pdf`}><FileText className="mr-1.5 size-4" />{t('expenses.exportPdf')}</a>
      </div>
    </header>
    <Card className="mb-4 p-4"><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); navigate(values); }}>
      <Field label={t('expenses.from')}><Input type="date" value={values.from} onChange={(event) => update('from', event.target.value)} /></Field>
      <Field label={t('expenses.to')}><Input type="date" value={values.to} onChange={(event) => update('to', event.target.value)} /></Field>
      <Field label={t('common.supplier')}><Select value={values.supplierId} onChange={(event) => update('supplierId', event.target.value)}><option value="">{t('supplierAnalytics.allSuppliers')}</option><option value={UNKNOWN_SUPPLIER_ID}>{t('supplierAnalytics.notRecorded')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label={t('common.product')}><Select value={values.productId} onChange={(event) => update('productId', event.target.value)}><option value="">{t('reports.allProducts')}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</Select></Field>
      <Field label={t('common.category')}><Select value={values.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">{t('reports.allCategories')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label={t('common.brand')}><Select value={values.brandId} onChange={(event) => update('brandId', event.target.value)}><option value="">{t('reports.allBrands')}</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label={t('supplierAnalytics.supplierStatus')}><Select value={values.status} onChange={(event) => update('status', event.target.value)}><option value="all">{t('supplierAnalytics.allStatuses')}</option><option value="active">{t('common.active')}</option><option value="removed">{t('supplierAnalytics.removed')}</option></Select></Field>
      <Field label={t('supplierAnalytics.activity')}><Select value={values.activity} onChange={(event) => update('activity', event.target.value)}><option value="all">{t('common.all')}</option><option value="purchases">{t('supplierAnalytics.purchases')}</option><option value="returns">{t('supplierAnalytics.returns')}</option><option value="settlements">{t('supplierAnalytics.settlements')}</option></Select></Field>
      <Field label={t('expenses.orderBy')}><Select value={values.order} onChange={(event) => update('order', event.target.value)}>{ORDER_OPTIONS.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</Select></Field>
      <div className="flex flex-wrap items-end gap-4 sm:col-span-2 xl:col-span-3">
        <label className="inline-flex w-fit items-center gap-2 text-[12px]"><input type="checkbox" checked={values.onlyWithPurchases} onChange={(event) => update('onlyWithPurchases', event.target.checked)} />{t('supplierAnalytics.onlyPurchases')}</label>
        <label className="inline-flex w-fit items-center gap-2 text-[12px]"><input type="checkbox" checked={values.onlyWithReturns} onChange={(event) => update('onlyWithReturns', event.target.checked)} />{t('supplierAnalytics.onlyReturns')}</label>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4"><Button disabled={pending}>{t('common.applyFilters')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => navigate(resetValues())}>{t('common.reset')}</Button><span className="tnum ml-auto text-[11px] text-graphite">{periodLabel}</span></div>
    </form></Card>

    {pending ? <Card><LoadingScreen compact label={t('supplierAnalytics.filtering')} /></Card> : <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label={t('supplierAnalytics.grossPurchases')} value={formatBDT(result.totals.grossPurchaseCost)} />
        <Summary label={t('supplierAnalytics.netRetained')} value={formatBDT(result.totals.netRetainedPurchaseCost)} />
        <Summary label={t('supplierAnalytics.unitsReceived')} value={String(result.totals.unitsReceived)} />
        <Summary label={t('supplierAnalytics.returnedCost')} value={formatBDT(result.totals.returnedStockCost)} />
        <Summary label={t('supplierAnalytics.recovered')} value={formatBDT(result.totals.recoveredAmount)} />
        <Summary label={t('supplierAnalytics.recoveryDifference')} value={formatBDT(result.totals.recoveryDifference)} tone={result.totals.recoveryDifference < 0 ? 'loss' : result.totals.recoveryDifference > 0 ? 'gain' : undefined} />
        <Summary label={t('supplierAnalytics.returnRate')} value={`${result.totals.returnRate.toFixed(2)}%`} />
      </div>
      <Card>{result.rows.length === 0 ? <EmptyState title={t('supplierAnalytics.empty')} /> : <TableViewport><table className="w-full min-w-[1160px] border-collapse text-[12px] [&_td]:text-center [&_th]:text-center"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">
        <th className="eyebrow px-3 py-2.5">{t('common.supplier')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.unitsReceived')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.productsSupplied')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.grossPurchases')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.returnedUnits')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.returnedCost')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.recovered')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.netRetained')}</th><th className="eyebrow px-3 py-2.5">{t('supplierAnalytics.lastPurchase')}</th>
      </tr></thead><tbody>{result.rows.map((row) => <tr key={row.supplierId} className="border-b border-rule-soft hover:bg-plate/60">
        <td className="px-3 py-3 text-left"><div className="flex items-center justify-center gap-2"><Link className="font-medium text-signal hover:underline" href={`/suppliers/analytics/${row.supplierId}?${exportQuery}`}>{row.supplierId === UNKNOWN_SUPPLIER_ID ? t('supplierAnalytics.notRecorded') : row.supplierName}</Link>{row.supplierId !== UNKNOWN_SUPPLIER_ID && !row.supplierActive && <Badge>{t('supplierAnalytics.removed')}</Badge>}</div></td><td className="tnum px-3 py-3">{row.unitsReceived}</td><td className="tnum px-3 py-3">{row.distinctProducts}</td><td className="tnum px-3 py-3">{formatBDT(row.grossPurchaseCost)}</td><td className="tnum px-3 py-3">{row.returnedUnits}</td><td className="tnum px-3 py-3">{formatBDT(row.returnedStockCost)}</td><td className="tnum px-3 py-3">{formatBDT(row.recoveredAmount)}</td><td className="tnum px-3 py-3 font-medium">{formatBDT(row.netRetainedPurchaseCost)}</td><td className="tnum px-3 py-3">{displayDate(row.lastPurchaseAt)}</td>
      </tr>)}</tbody></table></TableViewport>}</Card>
    </>}
  </>;
}

const ORDER_OPTIONS = [
  ['purchase-desc', 'supplierAnalytics.orderPurchaseHigh'], ['purchase-asc', 'supplierAnalytics.orderPurchaseLow'],
  ['units-desc', 'supplierAnalytics.orderUnitsHigh'], ['units-asc', 'supplierAnalytics.orderUnitsLow'],
  ['products-desc', 'supplierAnalytics.orderProductsHigh'], ['products-asc', 'supplierAnalytics.orderProductsLow'],
  ['returns-desc', 'supplierAnalytics.orderReturnsHigh'], ['surplus-desc', 'supplierAnalytics.orderSurplus'],
  ['deficit-desc', 'supplierAnalytics.orderDeficit'], ['return-rate-desc', 'supplierAnalytics.orderReturnRate'],
  ['newest', 'supplierAnalytics.orderNewest'], ['oldest', 'supplierAnalytics.orderOldest'],
  ['name-asc', 'supplierAnalytics.orderNameAsc'], ['name-desc', 'supplierAnalytics.orderNameDesc'],
] as const;

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return <Card className="p-4"><p className="eyebrow">{label}</p><p className={`tnum mt-2 text-[19px] font-semibold ${tone === 'gain' ? 'text-ok' : tone === 'loss' ? 'text-out' : ''}`}>{value}</p></Card>;
}
