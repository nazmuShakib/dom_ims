'use client';

import Link from 'next/link';

import { Badge, Card, EmptyState, TableViewport } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useDashboardPeriod } from '@/components/dashboard/DashboardPeriodContext';
import type { DashboardActivity, MoverRow } from '@/services/dashboard';

const dhaka = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
});

function periodTitle(title: string, periodLabel: string) {
  return `${title} · ${periodLabel}`;
}

export function DashboardMovers({ top, slow }: {
  top: Record<'day' | 'week' | 'month', MoverRow[]>;
  slow: Record<'day' | 'week' | 'month', MoverRow[]>;
}) {
  const { t } = useI18n();
  const { period, key } = useDashboardPeriod();
  const periodLabel = t(period === 'day' ? 'dashboard.today' : period === 'week' ? 'dashboard.thisWeek' : 'dashboard.thisMonth');
  const topRows = top[key];
  const slowRows = slow[key];
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.topMoversBase'), periodLabel)}</h2></div>
        {topRows.length === 0 ? <EmptyState title={t('dashboard.noOutboundPeriod')} /> : <div className="divide-y divide-rule-soft">{topRows.map((item) => (
          <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
            <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{item.sku}</span></span>
            <Badge tone="ok">{t('dashboard.out', { count: item.movedUnits })}</Badge>
          </Link>
        ))}</div>}
      </Card>
      <Card>
        <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.slowMoversBase'), periodLabel)}</h2></div>
        {slowRows.length === 0 ? <EmptyState title={t('dashboard.noStockedCompare')} /> : <div className="divide-y divide-rule-soft">{slowRows.map((item) => (
          <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
            <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{t('dashboard.onHandCount', { count: item.onHand })}</span></span>
            <Badge tone={item.movedUnits === 0 ? 'low' : 'neutral'}>{t('dashboard.out', { count: item.movedUnits })}</Badge>
          </Link>
        ))}</div>}
      </Card>
    </div>
  );
}

export function DashboardRecentActivity({ activity }: { activity: Record<'day' | 'week' | 'month', DashboardActivity[]> }) {
  const { t } = useI18n();
  const { period, key } = useDashboardPeriod();
  const rows = activity[key];
  return (
    <Card>
      <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.recentActivity'), t(period === 'day' ? 'dashboard.today' : period === 'week' ? 'dashboard.thisWeek' : 'dashboard.thisMonth'))}</h2></div>
      {rows.length === 0 ? <EmptyState title={t('dashboard.noMovementPeriod')} /> : <TableViewport className="max-h-96"><div className="divide-y divide-rule-soft">{rows.map((item) => {
        const correction = item.reason === 'CORRECTION';
        return <Link key={item.id} href={`/products/${item.productId}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
          <span><span className="text-[12px] font-medium">{item.productName}</span><span className="mt-0.5 block text-[10px] text-graphite">{item.reason.replaceAll('_', ' ')} · {item.actorName} · {dhaka(item.createdAt)}</span></span>
          <span className={`tnum text-right text-[12px] font-medium ${correction ? 'text-low' : item.quantity > 0 ? 'text-ok' : 'text-out'}`}>{correction ? t(item.quantity > 0 ? 'dashboard.correctionRestored' : 'dashboard.correctionRemoved', { count: Math.abs(item.quantity) }) : `${item.quantity > 0 ? '+' : ''}${item.quantity}`}</span>
        </Link>;
      })}</div></TableViewport>}
    </Card>
  );
}
