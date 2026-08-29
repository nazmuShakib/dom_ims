import Link from 'next/link';
import { getSession, requirePageRole } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { reconcile } from '@/services/stock';
import { Card, PageHeader, TableViewport } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * PLAN.md §8.4. The cache and the ledger must always agree. If they don't, a
 * transaction boundary was missed somewhere and the ledger is the truth.
 *
 * This page exists so that "the books add up" is something you can SEE, not
 * something you hope is true.
 */
export default async function ReconcilePage() {
  await requirePageRole('ADMIN', 'MANAGER');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const drifts = await reconcile();
  const healthy = drifts.length === 0;

  return (
    <>
      <PageHeader
        title={t('nav.reconciliation')}
        count={t('reconcile.help')}
      />

      <Card
        className={healthy ? 'border-ok/30 bg-ok-wash' : 'border-out/30 bg-out-wash'}
      >
        <div className="p-5">
          <p className={`text-[13px] font-medium ${healthy ? 'text-ok' : 'text-out'}`}>
            {healthy
              ? t('reconcile.healthy')
              : t('reconcile.driftCount', {
                  count: drifts.length,
                  kind: t(drifts.length > 1 ? 'reconcile.products' : 'reconcile.product'),
                })}
          </p>
          <p className="mt-1 text-[12px] text-graphite">
            {healthy
              ? t('reconcile.healthyHelp')
              : t('reconcile.driftHelp')}
          </p>
        </div>

        {!healthy && (
          <TableViewport>
            <table className="w-full border-t border-out/20 bg-card">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">{t('common.product')}</th>
                <th className="eyebrow px-4 py-2.5 text-right">{t('products.onHand')}</th>
                <th className="eyebrow px-4 py-2.5 text-right">{t('reconcile.ledgerSays')}</th>
                <th className="eyebrow px-4 py-2.5 text-right">{t('reconcile.drift')}</th>
              </tr>
            </thead>
            <tbody>
              {drifts.map((d) => (
                <tr key={d.productId} className="border-b border-rule-soft last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${d.productId}`} className="text-[13px] hover:text-signal">
                      {d.name}
                    </Link>
                    <span className="tnum mt-0.5 block text-[11px] text-graphite">{d.sku}</span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px]">{d.onHand}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px]">{d.ledgerSum}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] font-medium text-out">
                    {d.drift > 0 ? '+' : ''}
                    {d.drift}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </>
  );
}
