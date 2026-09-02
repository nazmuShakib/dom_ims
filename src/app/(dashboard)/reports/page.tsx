import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { Card, EmptyState, Input, Money, PageHeader, Select, TableViewport } from '@/components/ui';
import { MOVEMENT_REASONS, MOVEMENT_TYPES } from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { getAuthUserNames, getSession, requirePageCapability } from '@/lib/session';
import { createTranslator, type MessageKey } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';
import { db } from '@/repositories';
import {
  getReport,
  getReportActorIds,
  parseReportFilters,
  REPORT_KINDS,
  type ReportCell,
  type ReportColumn,
  type ReportKind,
} from '@/services/reports';

export const dynamic = 'force-dynamic';

const REPORT_LABEL_KEYS: Record<ReportKind, MessageKey> = {
  valuation: 'reports.valuation',
  sales: 'reports.sales',
  profit: 'reports.profit',
  purchases: 'reports.purchases',
  aging: 'reports.aging',
  shrinkage: 'reports.shrinkage',
  movements: 'reports.movements',
};

const REPORTS = REPORT_KINDS.map((id) => ({ id, label: REPORT_LABEL_KEYS[id] }));

type Translator = ReturnType<typeof createTranslator>;

const REPORT_TITLE_KEYS: Record<ReportKind, MessageKey> = {
  valuation: 'reports.titleValuation',
  sales: 'reports.titleSales',
  profit: 'reports.titleProfit',
  purchases: 'reports.titlePurchases',
  aging: 'reports.titleAging',
  shrinkage: 'reports.titleShrinkage',
  movements: 'reports.titleMovements',
};

function reportDescription(t: Translator, filters: ReturnType<typeof parseReportFilters>): string {
  if (filters.report === 'valuation') {
    return t('reports.descriptionValuation', {
      group: t(filters.groupBy === 'brand' ? 'common.brand' : 'common.category'),
    });
  }
  if (filters.report === 'sales') {
    const group = filters.groupBy ?? 'day';
    const key: MessageKey = group === 'brand'
      ? 'common.brand'
      : group === 'category'
        ? 'common.category'
        : group === 'month'
          ? 'reports.month'
          : 'reports.day';
    return t('reports.descriptionSales', { group: t(key) });
  }
  const keys: Record<Exclude<ReportKind, 'valuation' | 'sales'>, MessageKey> = {
    profit: 'reports.descriptionProfit',
    purchases: 'reports.descriptionPurchases',
    aging: 'reports.descriptionAging',
    shrinkage: 'reports.descriptionShrinkage',
    movements: 'reports.descriptionMovements',
  };
  return t(keys[filters.report]);
}

function columnLabel(t: Translator, report: ReportKind, column: ReportColumn): string {
  const generic: Record<string, MessageKey> = {
    product: 'common.product',
    sku: 'term.productCode',
    revenue: 'dashboard.revenue',
    cogs: 'reports.cogs',
    profit: 'reports.salesProfit',
    margin: 'reports.marginPercent',
    supplier: 'common.supplier',
    spend: 'reports.spend',
    bucket: 'reports.age',
    damage: 'reports.damage',
    loss: 'reports.loss',
    date: 'common.date',
    type: 'reports.type',
    reason: 'stock.reason',
    unitCost: 'reports.unitCost',
    unitPrice: 'reports.unitPrice',
    actor: 'reports.actor',
    reference: 'common.reference',
  };
  if (column.key === 'group') {
    return report === 'valuation'
      ? t(column.label === 'Brand' ? 'common.brand' : 'common.category')
      : t('reports.periodGroup');
  }
  if (column.key === 'quantity') {
    return t(report === 'sales' || report === 'profit' ? 'reports.unitsSold' : 'reports.units');
  }
  if (column.key === 'value') {
    return t(report === 'shrinkage' ? 'common.total' : 'reports.valueAtCost');
  }
  const key = generic[column.key];
  return key ? t(key) : column.label;
}

const dateTime = (value: string, _locale: Locale = 'en') => new Date(value).toLocaleString('en-GB', {
  timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
});

function displayCell(value: ReportCell, column: ReportColumn, locale: Locale) {
  if (column.type === 'money') return <Money value={value === null ? null : Number(value)} />;
  if (column.type === 'date' && value) return <span className="tnum whitespace-nowrap text-[11px] text-graphite">{dateTime(String(value), locale)}</span>;
  if (value === null || value === '') return <span className="text-graphite">—</span>;
  return <span className={column.type === 'number' ? 'tnum' : ''}>{String(value)}</span>;
}

function queryWith(raw: Record<string, string | string[] | undefined>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const item = Array.isArray(value) ? value[0] : value;
    if (item && key !== 'format') params.set(key, item);
  }
  for (const [key, value] of Object.entries(patch)) value ? params.set(key, value) : params.delete(key);
  return params.toString();
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageCapability('VIEW_REPORTS');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const [products, categories, brands, suppliers, actorIds] = await Promise.all([
    db.products.findAll(), db.categories.findAll(), db.brands.findAll(), db.suppliers.findAll(), getReportActorIds(),
  ]);
  const actorNames = await getAuthUserNames(actorIds);
  const report = await getReport(filters, { actorNames });
  const exportQuery = queryWith(raw, { report: filters.report });
  const totals = report.columns.filter((column) => typeof report.totals[column.key] === 'number').slice(0, 4);
  const uniqueActors = [...actorNames].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <>
      <PageHeader title={t('reports.title')} count={t('reports.generated', { date: dateTime(report.generatedAt, locale) })} action={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-1.5">
          <a className="inline-flex h-9 items-center justify-center rounded-[3px] border border-emerald-700 bg-emerald-700 px-3 text-[12px] font-medium text-white transition-colors hover:border-emerald-800 hover:bg-emerald-800" href={`/api/reports/export?${exportQuery}&format=csv`}>{t('reports.exportCsv')}</a>
          <a className="inline-flex h-9 items-center justify-center rounded-[3px] border border-rose-700 bg-rose-700 px-3 text-[12px] font-medium text-white transition-colors hover:border-rose-800 hover:bg-rose-800" href={`/api/reports/export?${exportQuery}&format=pdf`}>{t('reports.exportPdf')}</a>
        </div>
      } />

      <ReportWorkspace
        tabs={REPORTS.map((item) => ({
          id: item.id,
          label: t(item.label),
          href: `/reports?report=${item.id}`,
        }))}
        confirmedReport={filters.report}
        resultVersion={crypto.randomUUID()}
      >

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
          <input type="hidden" name="report" value={filters.report} />
          {!['valuation', 'aging'].includes(filters.report) && <><label><span className="eyebrow mb-1.5 block">{t('reports.from')}</span><Input type="date" name="from" defaultValue={filters.from} /></label><label><span className="eyebrow mb-1.5 block">{t('reports.to')}</span><Input type="date" name="to" defaultValue={filters.to} /></label></>}
          <label><span className="eyebrow mb-1.5 block">{t('common.product')}</span><Select name="productId" defaultValue={filters.productId ?? ''}><option value="">{t('reports.allProducts')}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</Select></label>
          <label><span className="eyebrow mb-1.5 block">{t('common.category')}</span><Select name="categoryId" defaultValue={filters.categoryId ?? ''}><option value="">{t('reports.allCategories')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label><span className="eyebrow mb-1.5 block">{t('common.brand')}</span><Select name="brandId" defaultValue={filters.brandId ?? ''}><option value="">{t('reports.allBrands')}</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          {filters.report === 'purchases' && <label><span className="eyebrow mb-1.5 block">{t('common.supplier')}</span><Select name="supplierId" defaultValue={filters.supplierId ?? ''}><option value="">{t('reports.allSuppliers')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>}
          {['valuation', 'sales'].includes(filters.report) && <label><span className="eyebrow mb-1.5 block">{t('reports.groupBy')}</span><Select name="groupBy" defaultValue={filters.report === 'valuation' ? (filters.groupBy === 'brand' ? 'brand' : 'category') : (filters.groupBy ?? 'day')}>{filters.report === 'sales' && <><option value="day">{t('reports.day')}</option><option value="month">{t('reports.month')}</option></>}<option value="category">{t('common.category')}</option><option value="brand">{t('common.brand')}</option></Select></label>}
          {filters.report === 'profit' && <label><span className="eyebrow mb-1.5 block">{t('reports.orderBy')}</span><Select name="order" defaultValue={`${filters.sort ?? 'profit'}-${filters.direction ?? 'desc'}`}><option value="profit-desc">{t('reports.orderProfitHigh')}</option><option value="profit-asc">{t('reports.orderProfitLow')}</option><option value="revenue-desc">{t('reports.orderRevenueHigh')}</option><option value="revenue-asc">{t('reports.orderRevenueLow')}</option><option value="cogs-desc">{t('reports.orderCogsHigh')}</option><option value="cogs-asc">{t('reports.orderCogsLow')}</option><option value="margin-desc">{t('reports.orderMarginHigh')}</option><option value="margin-asc">{t('reports.orderMarginLow')}</option><option value="quantity-desc">{t('reports.orderUnitsHigh')}</option><option value="quantity-asc">{t('reports.orderUnitsLow')}</option></Select></label>}
          {filters.report === 'movements' && <><label><span className="eyebrow mb-1.5 block">{t('reports.type')}</span><Select name="type" defaultValue={filters.type ?? ''}><option value="">{t('reports.allTypes')}</option>{MOVEMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label><label><span className="eyebrow mb-1.5 block">{t('stock.reason')}</span><Select name="reason" defaultValue={filters.reason ?? ''}><option value="">{t('reports.allReasons')}</option>{MOVEMENT_REASONS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</Select></label><label><span className="eyebrow mb-1.5 block">{t('reports.actor')}</span><Select name="actorId" defaultValue={filters.actorId ?? ''}><option value="">{t('reports.allActors')}</option>{uniqueActors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label></>}
          <div className="flex items-end gap-1.5"><button className="h-9 rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white" type="submit">{t('common.applyFilters')}</button><button className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[12px]" type="button" data-report-reset>{t('common.reset')}</button></div>
        </form>
      </Card>

      <div className="contents">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.map((column) => {
            const value = report.totals[column.key] ?? 0;
            return <Card className="p-4" key={column.key}><p className="eyebrow">{t('reports.totalLabel', { label: columnLabel(t, report.kind, column) })}</p><div className="mt-2 text-[18px] font-semibold">{column.type === 'money' ? formatBDT(value) : value.toLocaleString('en-BD')}</div></Card>;
          })}
        </div>

        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[14px] font-medium">{t(REPORT_TITLE_KEYS[report.kind])}</h2><p className="mt-0.5 text-[11px] text-graphite">{reportDescription(t, filters)}</p></div>
          {report.rows.length === 0 ? <EmptyState title={t('reports.noMatch')} /> : <TableViewport><table className="w-full min-w-max"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">{report.columns.map((column) => <th key={column.key} className={`eyebrow px-4 py-2.5 ${['money', 'number'].includes(column.type) ? 'text-right' : 'text-left'}`}>{columnLabel(t, report.kind, column)}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-b border-rule-soft last:border-0">{report.columns.map((column) => <td key={column.key} className={`px-4 py-2.5 text-[12px] ${['money', 'number'].includes(column.type) ? 'text-right' : 'text-left'}`}>{displayCell(row.cells[column.key] ?? null, column, locale)}</td>)}</tr>)}</tbody></table></TableViewport>}
          {report.note && <p className="border-t border-rule bg-plate/30 px-4 py-2 text-[11px] text-graphite">{t('reports.method', { note: report.kind === 'aging' ? t('reports.agingNote') : report.note })}</p>}
        </Card>
      </div>
      </ReportWorkspace>
    </>
  );
}
