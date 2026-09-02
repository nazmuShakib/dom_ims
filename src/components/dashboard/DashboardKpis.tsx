'use client';

import { Card, HelpTerm } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useDashboardPeriod } from '@/components/dashboard/DashboardPeriodContext';
import { formatBDT } from '@/lib/money';
import type { DashboardDTO, DashboardPeriodMetrics } from '@/services/dashboard';

type KpiTone = 'units' | 'low' | 'stock' | 'margin' | 'marginLoss' | 'revenue' | 'cogs' | 'internalUse' | 'profit' | 'profitLoss' | 'neutral';
type ChangePreference = 'higher-better' | 'lower-better';
const TONES: Record<KpiTone, { border: string; wash: string; value: string; note: string }> = {
  units: { border: 'border-t-metric-units', wash: 'bg-metric-units-wash', value: 'text-metric-units', note: 'text-graphite' },
  low: { border: 'border-t-metric-low', wash: 'bg-metric-low-wash', value: 'text-metric-low', note: 'text-metric-low' },
  stock: { border: 'border-t-metric-stock', wash: 'bg-metric-stock-wash', value: 'text-metric-stock', note: 'text-metric-stock' },
  margin: { border: 'border-t-metric-margin', wash: 'bg-metric-margin-wash', value: 'text-metric-margin', note: 'text-metric-margin' },
  marginLoss: { border: 'border-t-metric-margin-loss', wash: 'bg-metric-margin-loss-wash', value: 'text-metric-margin-loss', note: 'text-metric-margin-loss' },
  revenue: { border: 'border-t-metric-revenue', wash: 'bg-metric-revenue-wash', value: 'text-metric-revenue', note: 'text-metric-revenue' },
  cogs: { border: 'border-t-metric-cogs', wash: 'bg-metric-cogs-wash', value: 'text-metric-cogs', note: 'text-metric-cogs' },
  internalUse: { border: 'dashboard-kpi-internal-use-border', wash: 'dashboard-kpi-internal-use-wash', value: 'dashboard-kpi-internal-use-text', note: 'dashboard-kpi-internal-use-text' },
  profit: { border: 'border-t-metric-profit', wash: 'bg-metric-profit-wash', value: 'text-metric-profit', note: 'text-metric-profit' },
  profitLoss: { border: 'border-t-metric-profit-loss', wash: 'bg-metric-profit-loss-wash', value: 'text-metric-profit-loss', note: 'text-metric-profit-loss' },
  neutral: { border: 'border-t-metric-neutral', wash: 'bg-metric-neutral-wash', value: 'text-metric-neutral', note: 'text-metric-neutral' },
};

function comparisonChange(current: number, previous: number) {
  if (previous === 0) {
    return { delta: current, percentage: current === 0 ? 0 : null };
  }
  return { delta: current - previous, percentage: ((current - previous) / Math.abs(previous)) * 100 };
}

function Kpi({ label, value, note, tone, current, previous, changePreference = 'higher-better' }: {
  label: React.ReactNode; value: React.ReactNode; note?: string; tone: KpiTone;
  current?: number; previous?: number; changePreference?: ChangePreference;
}) {
  const { t } = useI18n();
  const { period } = useDashboardPeriod();
  const colors = TONES[tone];
  const change = current === undefined || previous === undefined
    ? undefined
    : comparisonChange(current, previous);
  const comparison = t(period === 'day'
    ? 'dashboard.vsYesterday'
    : period === 'week'
      ? 'dashboard.vsLastWeek'
      : 'dashboard.vsLastMonth');
  return (
    <Card className={`relative overflow-visible border-t-[3px] p-0 ${colors.border}`}>
      <div className="flex h-full flex-col px-3 py-2">
        <p className="eyebrow flex min-h-7 items-start">{label}</p>
        <div className={`-mx-0.5 mt-1 flex flex-1 flex-col justify-center rounded-[2px] px-2 py-1 ${colors.wash}`}>
          <div className="flex items-center justify-between gap-3">
            <div className={`tnum min-w-0 text-[18px] font-semibold ${colors.value}`}>{value}</div>
            {change !== undefined && (
              <div className="shrink-0 text-right leading-tight">
                <div className={`tnum text-[13px] font-bold ${change.delta === 0
                  ? 'text-graphite'
                  : (changePreference === 'higher-better' ? change.delta > 0 : change.delta < 0)
                    ? 'text-ok'
                    : 'text-out'}`}>
                  {change.percentage === null
                    ? t('dashboard.fromZero')
                    : `${change.percentage > 0 ? '+' : ''}${change.percentage.toFixed(1)}%`}
                </div>
                <div className="mt-0.5 text-[9px] font-bold text-ink">{comparison}</div>
              </div>
            )}
          </div>
          {note && <p className={`mt-0.5 text-[10px] leading-[1.35] ${colors.note}`}>{note}</p>}
        </div>
      </div>
    </Card>
  );
}

function financialCards(metrics: DashboardPeriodMetrics, previous: DashboardPeriodMetrics, t: ReturnType<typeof useI18n>['t']) {
  return (
    <>
      <Kpi tone="revenue" label={t('dashboard.revenue')} value={formatBDT(metrics.revenue)} note={t('dashboard.revenueHelp')} current={metrics.revenue} previous={previous.revenue} />
      <Kpi tone="cogs" label={<HelpTerm description={t('term.cogsHelp')}>{t('dashboard.cogs')}</HelpTerm>} value={formatBDT(metrics.cogs)} note={t('dashboard.cogsHelp')} current={metrics.cogs} previous={previous.cogs} changePreference="lower-better" />
      <Kpi tone={metrics.grossProfit < 0 ? 'profitLoss' : metrics.grossProfit === 0 ? 'neutral' : 'profit'} label={<HelpTerm description={t('term.salesProfitHelp')}>{t('dashboard.salesProfit')}</HelpTerm>} value={formatBDT(metrics.grossProfit)} note={metrics.grossProfit < 0 ? t('dashboard.lossPeriod') : metrics.grossProfit === 0 ? t('dashboard.breakEvenPeriod') : t('dashboard.salesProfitHelp')} current={metrics.grossProfit} previous={previous.grossProfit} />
      <Kpi tone="cogs" label={t('dashboard.operatingExpenses')} value={formatBDT(metrics.operatingExpenses)} note={t('dashboard.operatingExpensesHelp')} current={metrics.operatingExpenses} previous={previous.operatingExpenses} changePreference="lower-better" />
      <Kpi tone="profitLoss" label={t('dashboard.inventoryLoss')} value={formatBDT(metrics.shrinkage)} note={t('dashboard.inventoryLossHelp')} current={metrics.shrinkage} previous={previous.shrinkage} changePreference="lower-better" />
      <Kpi tone="internalUse" label={t('dashboard.internalUse')} value={formatBDT(metrics.internalUseCost)} note={t('dashboard.internalUseHelp')} current={metrics.internalUseCost} previous={previous.internalUseCost} changePreference="lower-better" />
      <Kpi tone={metrics.operatingProfit < 0 ? 'profitLoss' : metrics.operatingProfit === 0 ? 'neutral' : 'profit'} label={t('dashboard.operatingProfit')} value={formatBDT(metrics.operatingProfit)} note={t('dashboard.operatingProfitHelp')} current={metrics.operatingProfit} previous={previous.operatingProfit} />
    </>
  );
}

export function DashboardKpis({ dashboard }: { dashboard: DashboardDTO }) {
  const { t } = useI18n();
  const { key } = useDashboardPeriod();
  return (
    <div className="mb-4 grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
      <Kpi tone="units" label={t('dashboard.unitsInStock')} value={dashboard.totalUnits.toLocaleString('en-BD')} note={t('dashboard.stockedCodes', { count: dashboard.distinctSkus })} />
      <Kpi tone="low" label={t('dashboard.lowStock')} value={dashboard.lowStockCount} note={t('dashboard.outOfStockCount', { count: dashboard.outOfStockCount })} />
      {dashboard.canSeeFinancials ? <>
        <Kpi tone="stock" label={t('dashboard.stockValueCost')} value={formatBDT(dashboard.stockValueAtCost)} note={t('dashboard.retail', { value: formatBDT(dashboard.stockValueAtRetail) })} />
        <Kpi tone={dashboard.potentialMargin < 0 ? 'marginLoss' : 'margin'} label={t('dashboard.potentialMargin')} value={formatBDT(dashboard.potentialMargin)} note={t(dashboard.potentialMargin < 0 ? 'dashboard.negativeMarginHelp' : 'dashboard.potentialMarginHelp')} />
        {financialCards(dashboard.periodMetrics[key].current, dashboard.periodMetrics[key].previous, t)}
      </> : <Kpi tone="units" label={t('dashboard.access')} value={t('dashboard.operational')} note={t('dashboard.financialRestricted')} />}
    </div>
  );
}
