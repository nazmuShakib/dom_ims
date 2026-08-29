import { Card, EmptyState, PageHeader, TableViewport } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { getSession, requirePageRole } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

const dhaka = (date: Date, _locale: Locale) =>
  date.toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export default async function AuditPage() {
  await requirePageRole('ADMIN');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const logs = await prisma.auditLog.findMany({
    take: 200,
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <>
      <PageHeader title={t('nav.auditLog')} count={t('audit.latest', { count: logs.length })} />
      <Card>
        {logs.length === 0 ? (
          <EmptyState title={t('audit.empty')} />
        ) : (
          <TableViewport>
            <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">{t('ledger.when')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('audit.actor')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('audit.action')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('audit.entity')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-rule-soft last:border-0">
                  <td className="tnum px-4 py-2.5 text-[11px] text-graphite">{dhaka(log.createdAt, locale)}</td>
                  <td className="px-4 py-2.5 text-[12px]">{log.actor?.name ?? t('ledger.system')}</td>
                  <td className="tnum px-4 py-2.5 text-[12px]">{log.action}</td>
                  <td className="px-4 py-2.5 text-[12px] text-graphite">
                    {log.entity}{log.entityId ? ` · ${log.entityId}` : ''}
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
