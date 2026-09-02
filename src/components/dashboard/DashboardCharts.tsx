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
import { splitSignedIntegerAxis, splitSignedNiceAxis } from '@/lib/chart-axis';

const chartDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return `${day} ${monthName}, ${year}`;
};
const taka = (value: number) => Math.round(value / 100);
const moneyTick = (value: number) => `${value < 0 ? '−' : ''}৳${Math.round(Math.abs(value) / 1000)}k`;
const signedTaka = (value: number) => `${value < 0 ? '−' : ''}৳${Math.abs(value).toLocaleString('en-BD')}`;

function RefundDot({ cx, cy, value }: { cx?: number; cy?: number; value?: number }) {
  if (cx === undefined || cy === undefined || !value) return null;
  return <circle cx={cx} cy={cy} r={2.5} fill="#b3261e" stroke="#b3261e" opacity={0.7} />;
}

function AccessibleChartTable<T extends { date: string }>({ caption, rows, columns }: {
  caption: string;
  rows: T[];
  columns: Array<{ label: string; value: (row: T) => React.ReactNode }>;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Date</th>{columns.map((column) => <th key={column.label} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.date}>
            <th scope="row">{chartDate(row.date)}</th>
            {columns.map((column) => <td key={column.label}>{column.value(row)}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ChartShell({ title, children, summary }: {
  title: string;
  children: React.ReactNode;
  summary: React.ReactNode;
}) {
  return (
    <section className="rounded-[3px] border border-rule bg-card p-3">
      <h2 className="mb-2 text-[13px] font-medium">{title}</h2>
      {summary}
      <div className="h-72" aria-hidden="true">{children}</div>
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
  const salesMoneyAxis = splitSignedNiceAxis(
    salesData?.flatMap((point) => [point.revenue, point.margin, point.refunds]) ?? [0],
    8,
  );
  const salesChartData = salesData?.map((point) => ({
    ...point,
    revenuePlot: salesMoneyAxis.scale(point.revenue),
    marginPlot: salesMoneyAxis.scale(point.margin),
    refundsPlot: salesMoneyAxis.scale(point.refunds),
  }));
  const operationsData = operations.filter((point) => point.date >= periodStart).map((point) => ({
    ...point,
    stockOut: -point.stockOut,
    net: point.stockIn - point.stockOut,
  }));
  const operationsAxis = splitSignedIntegerAxis(
    operationsData.flatMap((point) => [point.stockIn, point.stockOut, point.net]),
    2,
  );
  const operationsChartData = operationsData.map((point) => ({
    ...point,
    stockInPlot: operationsAxis.scale(point.stockIn),
    stockOutPlot: operationsAxis.scale(point.stockOut),
    netPlot: operationsAxis.scale(point.net),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartShell
        title={`${t('dashboard.chartMovementBase')} · ${periodLabel}`}
        summary={<AccessibleChartTable
          caption={`${t('dashboard.chartMovementBase')} · ${periodLabel}`}
          rows={operationsData}
          columns={[
            { label: t('dashboard.stockIn'), value: (row) => row.stockIn.toLocaleString('en-BD') },
            { label: t('dashboard.stockOut'), value: (row) => Math.abs(row.stockOut).toLocaleString('en-BD') },
            { label: t('dashboard.net'), value: (row) => row.net.toLocaleString('en-BD') },
          ]}
        />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={operationsChartData}
            margin={{ left: -20, right: 8, top: 4, bottom: 0 }}
            barCategoryGap="20%"
            stackOffset="sign"
          >
            <CartesianGrid stroke="#e6e9eb" vertical={false} />
            <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
            <YAxis
              allowDataOverflow
              domain={operationsAxis.domain}
              ticks={operationsAxis.ticks}
              tickFormatter={operationsAxis.formatTick}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              labelFormatter={(label) => chartDate(String(label))}
              formatter={(_value, name, item) => {
                const originalKey = item.dataKey === 'stockInPlot'
                  ? 'stockIn'
                  : item.dataKey === 'stockOutPlot' ? 'stockOut' : 'net';
                const originalValue = Number(item.payload?.[originalKey] ?? 0);
                return [
                  (originalKey === 'stockOut' ? Math.abs(originalValue) : originalValue).toLocaleString('en-BD'),
                  name,
                ];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#9ca3af" />
            <Bar dataKey="stockInPlot" name={t('dashboard.stockIn')} fill="#1b7f5c" stackId="movement" maxBarSize={22} />
            <Bar dataKey="stockOutPlot" name={t('dashboard.stockOut')} fill="#b3261e" stackId="movement" maxBarSize={22} />
            <Line type="linear" dataKey="netPlot" name={t('dashboard.net')} stroke="#626c76" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartShell>

      {moneyData && (
        <ChartShell
          title={`${t('dashboard.chartStockValueBase')} · ${periodLabel}`}
          summary={<AccessibleChartTable
            caption={`${t('dashboard.chartStockValueBase')} · ${periodLabel}`}
            rows={stockValueData ?? []}
            columns={[{ label: t('dashboard.stockValue'), value: (row) => signedTaka(row.stockValue) }]}
          />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stockValueData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} width={54} />
              <Tooltip labelFormatter={(label) => chartDate(String(label))} formatter={(value) => signedTaka(Number(value))} />
              <Line type="monotone" dataKey="stockValue" name={t('dashboard.stockValue')} stroke="#2e4bd8" dot={period === 'day'} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      )}

      {moneyData && (
        <ChartShell
          title={`${t('dashboard.chartRevenue')} · ${periodLabel}`}
          summary={<AccessibleChartTable
            caption={`${t('dashboard.chartRevenue')} · ${periodLabel}`}
            rows={salesData ?? []}
            columns={[
              { label: t('dashboard.revenue'), value: (row) => signedTaka(row.revenue) },
              { label: t('dashboard.salesMargin'), value: (row) => signedTaka(row.margin) },
              { label: t('dashboard.cashRefunds'), value: (row) => signedTaka(row.refunds) },
            ]}
          />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={salesChartData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={chartDate} tick={{ fontSize: 9 }} minTickGap={38} />
              <YAxis
                allowDataOverflow
                domain={salesMoneyAxis.domain}
                ticks={salesMoneyAxis.ticks}
                tickFormatter={(value) => moneyTick(salesMoneyAxis.unscale(value))}
                interval={0}
                tick={{ fontSize: 10 }}
                width={54}
              />
              <Tooltip
                labelFormatter={(label) => chartDate(String(label))}
                formatter={(_value, name, item) => {
                  const originalKey = item.dataKey === 'refundsPlot'
                    ? 'refunds'
                    : item.dataKey === 'marginPlot' ? 'margin' : 'revenue';
                  return [signedTaka(Number(item.payload?.[originalKey] ?? 0)), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Line
                type="linear"
                dataKey="refundsPlot"
                name={t('dashboard.cashRefunds')}
                stroke="#b3261e"
                strokeWidth={1.25}
                strokeOpacity={0.7}
                dot={<RefundDot />}
                activeDot={{ r: 4 }}
              />
              <Line type="monotone" dataKey="revenuePlot" name={t('dashboard.revenue')} stroke="#2e4bd8" dot={period === 'day'} strokeWidth={2} />
              <Line type="monotone" dataKey="marginPlot" name={t('dashboard.salesMargin')} stroke="#1b7f5c" dot={period === 'day'} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartShell>
      )}
    </div>
  );
}
