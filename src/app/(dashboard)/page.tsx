import Link from 'next/link';

import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { DashboardKpis } from '@/components/dashboard/DashboardKpis';
import { DashboardMovers, DashboardRecentActivity } from '@/components/dashboard/DashboardPeriodPanels';
import { DashboardPeriodProvider, DashboardPeriodSelector } from '@/components/dashboard/DashboardPeriodContext';
import { Badge, Card, EmptyState, PageHeader, SerialChip, StockCount, TableViewport } from '@/components/ui';
import { getAuthUserNames, getSession } from '@/lib/session';
import { getDashboard } from '@/services/dashboard';
import { createTranslator } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';
import { db } from '@/repositories';
import { formatBDT } from '@/lib/money';
import { refreshEmiStatuses } from '@/services/emi';

export const dynamic = 'force-dynamic';

const dhaka = (iso: string, _locale: Locale) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export default async function DashboardPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const dashboard = await getDashboard(role);
  if (role !== 'STAFF') await refreshEmiStatuses();
  const periodActivity = Object.values(dashboard.recentActivityByPeriod).flat();
  const authActorNames = await getAuthUserNames(periodActivity.map((item) => item.actorId));
  const recentActivityByPeriod = Object.fromEntries(Object.entries(dashboard.recentActivityByPeriod).map(([key, items]) => [key, items.map((item) => ({
    ...item,
    actorName: (item.actorId && authActorNames.get(item.actorId)) || item.actorName,
  }))])) as typeof dashboard.recentActivityByPeriod;
  const emiRows = role === 'STAFF' ? [] : await Promise.all((await db.emi.findContracts()).filter((contract) => contract.status === 'ACTIVE' || contract.status === 'OVERDUE').map(async (contract) => ({ contract, installments: await db.emi.findInstallments(contract.id) })));
  const emiOutstanding = emiRows.reduce((sum, row) => sum + row.installments.reduce((value, installment) => value + installment.amountDue - installment.amountPaid, 0), 0);
  const overdueContracts = emiRows.filter((row) => row.contract.status === 'OVERDUE').length;

  return (
    <>
      <DashboardPeriodProvider periodStarts={dashboard.periodStarts}>
      <PageHeader title={t('dashboard.title')} count={t('dashboard.updated', { date: dhaka(dashboard.generatedAt, locale) })} action={<DashboardPeriodSelector />} />
      <DashboardKpis dashboard={dashboard} />

      {role !== 'STAFF' && <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Link href="/emi">
          <Card className="h-full border-t-[3px] border-t-metric-revenue p-0">
            <div className="flex h-full flex-col px-3 py-2">
              <p className="eyebrow">{t('emi.openContracts')}</p>
              <div className="mt-1 flex flex-1 flex-col justify-center rounded-[2px] bg-metric-revenue-wash px-2 py-1">
                <p className="text-[20px] font-semibold text-metric-revenue">{emiRows.length}</p>
                <p className="text-[11px] text-metric-revenue">{t('emi.openContractsHelp')}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/emi">
          <Card className="h-full border-t-[3px] border-t-metric-low p-0">
            <div className="flex h-full flex-col px-3 py-2">
              <p className="eyebrow">{t('emi.outstanding')}</p>
              <div className="mt-1 flex flex-1 flex-col justify-center rounded-[2px] bg-metric-low-wash px-2 py-1">
                <p className="tnum text-[20px] font-semibold text-metric-low">{formatBDT(emiOutstanding)}</p>
                <p className="text-[11px] text-metric-low">{t('emi.outstandingHelp')}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/emi?status=OVERDUE">
          <Card className={`h-full border-t-[3px] p-0 ${overdueContracts > 0 ? 'border-t-metric-profit-loss' : 'border-t-metric-neutral'}`}>
            <div className="flex h-full flex-col px-3 py-2">
              <p className="eyebrow">{t('emi.overdueContracts')}</p>
              <div className={`mt-1 flex flex-1 flex-col justify-center rounded-[2px] px-2 py-1 ${overdueContracts > 0 ? 'bg-metric-profit-loss-wash' : 'bg-metric-neutral-wash'}`}>
                <p className={`text-[20px] font-semibold ${overdueContracts > 0 ? 'text-metric-profit-loss' : 'text-metric-neutral'}`}>{overdueContracts}</p>
                <p className={`text-[11px] ${overdueContracts > 0 ? 'text-metric-profit-loss' : 'text-metric-neutral'}`}>{t('emi.overdueContractsHelp')}</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>}

      <div className="mb-4">
        <DashboardCharts
          operations={dashboard.dailyOperations}
          financials={dashboard.canSeeFinancials ? dashboard.dailyFinancials : undefined}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-[13px] font-medium">{t('dashboard.lowStockAlerts')}</h2>
            <p className="mt-0.5 text-[11px] text-graphite">{t('dashboard.reorderHelp')}</p>
          </div>
          {dashboard.lowStock.length === 0 ? (
            <EmptyState title={t('dashboard.noReorder')} />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('shell.stock')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.reorder')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.lowStock.map((item) => (
                    <tr key={item.productId} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/products/${item.productId}`} className="text-[12px] font-medium hover:text-signal">{item.name}</Link>
                        <span className="tnum block text-[10px] text-graphite">{item.sku}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right"><StockCount onHand={item.onHand} reorderPoint={item.reorderPoint} /></td>
                      <td className="tnum px-4 py-2.5 text-right text-[12px]">{Math.max(item.reorderPoint * 2 - item.onHand, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>

        <Card>
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-[13px] font-medium">{t('dashboard.deadStock')}</h2>
            <p className="mt-0.5 text-[11px] text-graphite">{t('dashboard.deadStockHelp')}</p>
          </div>
          {dashboard.deadStock.length === 0 ? (
            <EmptyState title={t('dashboard.noDeadStock')} />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.onHand')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.inactive')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.deadStock.map((item) => (
                    <tr key={item.productId} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/products/${item.productId}`} className="text-[12px] font-medium hover:text-signal">{item.name}</Link>
                        <span className="tnum block text-[10px] text-graphite">{item.sku}</span>
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-[12px]">{item.onHand}</td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-low">{item.inactiveDays === null ? t('dashboard.neverMoved') : t('dashboard.days', { count: item.inactiveDays })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      </div>

      <DashboardMovers top={dashboard.topMoversByPeriod} slow={dashboard.slowMoversByPeriod} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardRecentActivity activity={recentActivityByPeriod} />

        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{t('dashboard.warrantiesExpiring')}</h2></div>
          {dashboard.expiringWarranties.length === 0 ? <EmptyState title={t('dashboard.noWarrantyExpiry')} /> : (
            <TableViewport className="max-h-96">
              <div className="divide-y divide-rule-soft">
                {dashboard.expiringWarranties.map((item) => (
                  <Link key={item.unitId} href={`/products/${item.productId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
                    <span><span className="text-[12px] font-medium">{item.productName}</span><span className="mt-1 block"><SerialChip serial={item.serialNo} dim={item.status !== 'IN_STOCK'} /></span></span>
                    <span className="text-right"><Badge tone="low">{t('dashboard.days', { count: item.daysRemaining })}</Badge><span className="tnum mt-1 block text-[10px] text-graphite">{dhaka(item.warrantyExpiresAt, locale)}</span></span>
                  </Link>
                ))}
              </div>
            </TableViewport>
          )}
        </Card>
      </div>
      </DashboardPeriodProvider>
    </>
  );
}
