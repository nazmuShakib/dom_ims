'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DailyFinancialPoint, DailyOperationsPoint } from '@/services/dashboard';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useDashboardPeriod } from '@/components/dashboard/DashboardPeriodContext';

const chartDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return `${day} ${monthName}, ${year}`;
};
const taka = (value: number) => Math.round(value / 100);
const moneyTick = (value: number) => `৳${Math.round(value / 1000)}k`;

function RefundDot({ cx, cy, value }: { cx?: number; cy?: number; value?: number }) {
  if (cx === undefined || cy === undefined || !value) return null;
  return <circle cx={cx} cy={cy} r={2.5} fill="#b3261e" stroke="#b3261e" opacity={0.7} />;
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[3px] border border-rule bg-card p-3">
      <h2 className="mb-2 text-[13px] font-medium">{title}</h2>
      <div className="h-72">{children}</div>
    </section>
  );
}

export function DashboardCharts({
  operations,
  financials,
}: {
  operations: DailyOperationsPoint[];
  financials?: DailyFinancialPoint[];
}) {
  const { t } = useI18n();
  const { period, periodStart } = useDashboardPeriod();
  const periodLabel = t(period === 'day' ? 'dashboard.today' : period === 'week' ? 'dashboard.thisWeek' : 'dashboard.thisMonth');
  const moneyData = financials?.map((point) => ({
    ...point,
    stockValue: taka(point.stockValue),
    revenue: taka(point.revenue),
    margin: taka(point.margin),
    refunds: -taka(point.refunds),
  }));
  const stockValueData = moneyData?.filter((point) => point.date >= periodStart);
  const salesData = moneyData?.filter((point) => point.date >= periodStart);
  const maximumSalesValue = Math.max(
    1,
    ...(salesData?.flatMap((point) => [point.revenue, point.margin]) ?? [1]),
  );
  const minimumRefund = Math.min(0, ...(salesData?.map((point) => point.refunds) ?? [0]));
  const salesAxisMaximum = Math.ceil(maximumSalesValue + 5_000);
  const salesAxisMinimum = minimumRefund < 0 ? Math.floor(minimumRefund - 5_000) : 0;
  const operationsData = operations.filter((point) => point.date >= periodStart).map((point) => ({
    ...point,
    stockOut: -point.stockOut,
    net: point.stockIn - point.stockOut,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartShell title={`${t('dashboard.chartMovementBase')} · ${periodLabel}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={operationsData}
            margin={{ left: -20, right: 8, top: 4, bottom: 0 }}
            barCategoryGap="20%"
            stackOffset="sign"
          >
            <CartesianGrid stroke="#e6e9eb" vertical={false} />
            <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip
              labelFormatter={(label) => chartDate(String(label))}
              formatter={(value, name) => [Math.abs(Number(value)).toLocaleString('en-BD'), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#9ca3af" />
            <Bar dataKey="stockIn" name={t('dashboard.stockIn')} fill="#1b7f5c" stackId="movement" maxBarSize={22} />
            <Bar dataKey="stockOut" name={t('dashboard.stockOut')} fill="#b3261e" stackId="movement" maxBarSize={22} />
            <Line type="monotone" dataKey="net" name={t('dashboard.net')} stroke="#626c76" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartShell>

      {moneyData && (
        <ChartShell title={`${t('dashboard.chartStockValueBase')} · ${periodLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stockValueData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} width={54} />
              <Tooltip labelFormatter={(label) => chartDate(String(label))} formatter={(value) => `৳${Number(value).toLocaleString('en-BD')}`} />
              <Line type="monotone" dataKey="stockValue" name={t('dashboard.stockValue')} stroke="#2e4bd8" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      )}

      {moneyData && (
        <ChartShell title={`${t('dashboard.chartRevenue')} · ${periodLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={salesData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
              <YAxis
                domain={[salesAxisMinimum, salesAxisMaximum]}
                tickFormatter={moneyTick}
                tick={{ fontSize: 10 }}
                width={54}
              />
              <Tooltip labelFormatter={(label) => chartDate(String(label))} formatter={(value) => `৳${Math.abs(Number(value)).toLocaleString('en-BD')}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Line
                type="linear"
                dataKey="refunds"
                name={t('dashboard.cashRefunds')}
                stroke="#b3261e"
                strokeWidth={1.25}
                strokeOpacity={0.7}
                dot={<RefundDot />}
                activeDot={{ r: 4 }}
              />
              <Line type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke="#2e4bd8" dot={period === 'day'} strokeWidth={2} />
              <Line type="monotone" dataKey="margin" name={t('dashboard.salesMargin')} stroke="#1b7f5c" dot={period === 'day'} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartShell>
      )}
    </div>
  );
}
