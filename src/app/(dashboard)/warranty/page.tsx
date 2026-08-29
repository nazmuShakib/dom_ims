import Link from 'next/link';
import { db } from '@/repositories';
import { getSession, requirePageCapability } from '@/lib/session';
import { Badge, Button, Card, EmptyState, PageHeader, SerialChip, TableViewport } from '@/components/ui';
import { RMA_STATUSES, type RmaStatus } from '@/domain/types';
import { createTranslator } from '@/lib/i18n/messages';
import { domainLabel } from '@/lib/i18n/domain';

export const dynamic = 'force-dynamic';
export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ status?: string; assigned?: string }> }) {
  await requirePageCapability('VIEW_RMA'); const { user, locale } = await getSession(); const t = createTranslator(locale); const { status, assigned } = await searchParams;
  const filter = RMA_STATUSES.includes(status as RmaStatus) ? status as RmaStatus : undefined;
  const claims = await db.warranties.findAll({ ...(filter ? { status: filter } : {}), ...(assigned === 'me' ? { assignedToId: user.id } : {}) });
  const rows = await Promise.all(claims.sort((a,b) => b.openedAt.localeCompare(a.openedAt)).map(async (claim) => {
    const unit = await db.units.findById(claim.unitId); const product = unit ? await db.products.findById(unit.productId) : null;
    return { claim, unit, product };
  }));
  return <><PageHeader title={t('nav.warrantyClaims')} count={t('warranty.claims', { count: claims.length })} action={<Link href="/warranty/new"><Button>{t('warranty.open')}</Button></Link>} />
    <nav className="mb-4 flex flex-wrap gap-1.5"><Link href="/warranty" className="text-[12px] text-signal">{t('warranty.all')}</Link><Link href="/warranty?assigned=me" className="rounded border border-rule bg-card px-2 py-1 text-[11px]">{t('warranty.assignedMe')}</Link>{RMA_STATUSES.map((value) => <Link key={value} href={`/warranty?status=${value}`} className={`rounded border px-2 py-1 text-[11px] ${filter === value ? 'border-ink bg-ink text-white' : 'border-rule bg-card'}`}>{domainLabel(t, value)}</Link>)}</nav>
    <Card>{rows.length === 0 ? <EmptyState title={t('warranty.empty')} /> : <TableViewport><table className="w-full"><thead className="sticky top-0 bg-card"><tr className="border-b border-rule"><th className="eyebrow px-4 py-3 text-left">{t('warranty.claim')}</th><th className="eyebrow px-4 py-3 text-left">{t('warranty.productDevice')}</th><th className="eyebrow px-4 py-3 text-left">{t('common.status')}</th><th className="eyebrow px-4 py-3 text-left">{t('warranty.opened')}</th></tr></thead><tbody>{rows.map(({claim,unit,product}) => <tr key={claim.id} className="border-b border-rule-soft"><td className="px-4 py-3"><Link className="tnum text-signal" href={`/warranty/${claim.id}`}>{claim.claimNumber}</Link><span className="block text-[11px] text-graphite">{claim.claimantName ?? t('warranty.customerMissing')}</span></td><td className="px-4 py-3 text-[12px]">{product?.name ?? t('warranty.productMissing')}{unit && <span className="mt-1 block"><SerialChip serial={unit.serialNo} /></span>}</td><td className="px-4 py-3"><Badge tone={['COMPLETED','REPLACED'].includes(claim.status) ? 'ok' : claim.status === 'REJECTED' ? 'out' : 'signal'}>{domainLabel(t, claim.status)}</Badge><span className="mt-1 block text-[10px] text-graphite">{domainLabel(t, claim.coverage)}</span></td><td className="tnum px-4 py-3 text-[12px]">{new Date(claim.openedAt).toLocaleDateString('en-GB')}</td></tr>)}</tbody></table></TableViewport>}</Card>
  </>;
}
