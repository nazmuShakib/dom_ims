import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card, EmptyState, PageHeader, TableViewport } from '@/components/ui';
import { formatBDT } from '@/lib/money';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageCapability('MANAGE_CUSTOMERS');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const { id } = await params;
  const customer = await db.customers.findById(id);
  if (!customer) notFound();
  const sales = await db.sales.findByCustomer(customer.id);
  const completedSales = sales.filter((sale) => sale.status === 'COMPLETED');
  const total = completedSales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={customer.name}
        action={(
          <Link
            href="/customers"
            className="inline-flex h-9 items-center rounded-[3px] border border-slate-600 bg-slate-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-slate-800 hover:bg-slate-800"
          >
            {t('customers.all')}
          </Link>
        )}
      />
      <dl className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[3px] border border-rule bg-card px-4 py-3 text-[13px] text-ink">
        <div className="flex items-baseline gap-2">
          <dt className="font-semibold text-graphite">{t('common.phone')}:</dt>
          <dd className="tnum font-semibold text-ink">{customer.phone ?? t('customers.noPhone')}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="font-semibold text-graphite">{t('customers.completedPurchases')}:</dt>
          <dd className="tnum font-semibold text-ink">{completedSales.length}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="font-semibold text-graphite">{t('customers.lifetimeSales')}:</dt>
          <dd className="tnum font-semibold text-ink">{formatBDT(total)}</dd>
        </div>
      </dl>
      <Card>
        {sales.length === 0 ? <EmptyState title={t('customers.noHistory')} /> : (
          <TableViewport>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left">
                <th className="eyebrow px-4 py-2.5">{t('invoices.invoice')}</th>
                <th className="eyebrow px-4 py-2.5">{t('common.date')}</th>
                <th className="eyebrow px-4 py-2.5">{t('invoices.payment')}</th>
                <th className="eyebrow px-4 py-2.5 text-right">{t('common.total')}</th>
              </tr></thead>
              <tbody>{sales.map((sale) => <tr key={sale.id} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-3">
                  <Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link>
                  {sale.status === 'VOIDED' && <span className="ml-2"><Badge tone="out">VOIDED</Badge></span>}
                </td>
                <td className="tnum px-4 py-3">{new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(sale.completedAt))}</td>
                <td className="px-4 py-3">{sale.paymentMethod.replaceAll('_', ' ')} · {sale.paymentStatus}</td>
                <td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
              </tr>)}</tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </div>
  );
}
