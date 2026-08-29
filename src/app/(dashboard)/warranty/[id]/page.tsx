import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { getAuthUserNames, getSession, requirePageCapability } from '@/lib/session';
import { Badge, Card, Money, PageHeader, SerialChip, TableViewport } from '@/components/ui';
import {
  PrintButton, SupplierWarrantyForm, WarrantyHandoverForm, WarrantyNoteForm,
  WarrantyResolutionForm, WarrantyTransitionForm,
} from '@/components/warranty/WarrantyForms';
import { createTranslator } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';
import { domainLabel } from '@/lib/i18n/domain';

export const dynamic = 'force-dynamic';
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const stamp = (iso: string, _locale: Locale) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true });

export default async function WarrantyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageCapability('VIEW_RMA'); const { role, locale } = await getSession(); const t = createTranslator(locale); const { id } = await params;
  const claim = await db.warranties.findById(id); if (!claim) notFound();
  const [unit, sale, events, supplierCase, suppliers, users] = await Promise.all([
    db.units.findById(claim.unitId), db.movements.findById(claim.saleMovementId),
    db.warranties.findEvents(claim.id), db.warranties.findSupplierCase(claim.id),
    db.suppliers.findAll(), db.users.findAll(),
  ]);
  const product = unit ? await db.products.findById(unit.productId) : null;
  const selectableSuppliers = suppliers.filter((supplier) => supplier.isActive || supplier.id === supplierCase?.supplierId);
  const names = await getAuthUserNames([claim.openedById, claim.assignedToId, ...events.map((e) => e.actorId)]);
  for (const user of users) names.set(user.id, user.name);
  const manage = role === 'ADMIN' || role === 'MANAGER';
  const canResolve = claim.status === 'APPROVED' || claim.status === 'READY_FOR_COLLECTION';
  const terminal = ['REPLACED', 'COMPLETED', 'CANCELLED'].includes(claim.status);

  return <div className="print:max-w-none"><PageHeader title={claim.claimNumber} count={t('warranty.acknowledgement')} action={<PrintButton />} />
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-4">
        <Card className="p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-[17px] font-medium">{product?.name ?? t('warranty.productMissing')}</p>{unit && <p className="mt-1"><SerialChip serial={unit.serialNo} /></p>}</div><div className="text-right"><Badge tone={terminal ? 'ok' : 'signal'}>{domainLabel(t, claim.status)}</Badge><p className="mt-1 text-[11px] text-graphite">{t('common.customer')}: {domainLabel(t, claim.coverage)}</p></div></div>
          <dl className="mt-5 grid gap-4 text-[12px] sm:grid-cols-2"><div><dt className="eyebrow">{t('warranty.claimant')}</dt><dd>{claim.claimantName ?? t('common.notRecorded')}{claim.claimantPhone && <span className="block tnum">{claim.claimantPhone}</span>}</dd></div><div><dt className="eyebrow">{t('warranty.custody')}</dt><dd>{domainLabel(t, claim.custody)}</dd></div><div><dt className="eyebrow">{t('warranty.originalSale')}</dt><dd>{sale ? stamp(sale.createdAt, locale) : t('warranty.missingMovement')}{sale && <span className="ml-2"><Money value={sale.unitPrice} /></span>}</dd></div><div><dt className="eyebrow">{t('warranty.expiry')}</dt><dd>{unit?.warrantyExpiresAt ? stamp(unit.warrantyExpiresAt, locale) : t('common.notRecorded')}</dd></div><div className="sm:col-span-2"><dt className="eyebrow">{t('warranty.reportedIssue')}</dt><dd className="whitespace-pre-wrap">{claim.reportedIssue}</dd></div>{claim.physicalCondition && <div className="sm:col-span-2"><dt className="eyebrow">{t('warranty.conditionReceived')}</dt><dd className="whitespace-pre-wrap">{claim.physicalCondition}</dd></div>}{claim.resolution && <div className="sm:col-span-2"><dt className="eyebrow">{t('warranty.resolution')}</dt><dd>{claim.resolution}</dd></div>}</dl>
        </Card>

        <Card><div className="border-b border-rule px-5 py-3"><p className="eyebrow">{t('warranty.timeline')}</p></div><TableViewport className="max-h-96"><ol className="divide-y divide-rule-soft">{events.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((event) => <li key={event.id} className="px-5 py-3"><div className="flex justify-between gap-3"><p className="text-[12px] font-medium">{label(event.eventType)}</p><time className="tnum text-[10px] text-graphite">{stamp(event.createdAt, locale)}</time></div><p className="mt-1 text-[12px] text-graphite">{event.note ?? t('warranty.noNote')} · {names.get(event.actorId) ?? t('ledger.unknownUser')}</p>{event.fromStatus !== event.toStatus && <p className="mt-1 text-[10px] text-graphite">{event.fromStatus ? domainLabel(t, event.fromStatus) : t('warranty.new')} → {event.toStatus ? domainLabel(t, event.toStatus) : '—'}</p>}</li>)}</ol></TableViewport></Card>
        <Card className="p-5 print:hidden"><WarrantyNoteForm claimId={claim.id} /></Card>
        {!terminal && <Card className="p-5 print:hidden"><WarrantyHandoverForm claimId={claim.id} status={claim.status} custody={claim.custody} /></Card>}
      </div>

      <div className="space-y-4 print:hidden">
        <Card className="p-5"><p className="eyebrow mb-3">{t('warranty.ownership')}</p><dl className="grid gap-3 text-[12px]"><div><dt className="text-graphite">{t('warranty.openedBy')}</dt><dd>{names.get(claim.openedById) ?? t('ledger.unknownUser')}</dd></div><div><dt className="text-graphite">{t('warranty.assignedTo')}</dt><dd>{claim.assignedToId ? names.get(claim.assignedToId) ?? t('ledger.unknownUser') : t('warranty.unassigned')}</dd></div><div><dt className="text-graphite">{t('warranty.opened')}</dt><dd>{stamp(claim.openedAt, locale)}</dd></div></dl></Card>
        {manage && !terminal && <Card className="p-5"><p className="eyebrow mb-3">{t('warranty.workflow')}</p><WarrantyTransitionForm claimId={claim.id} status={claim.status} coverage={claim.coverage} users={users} /></Card>}
        {manage && canResolve && <Card className="p-5"><p className="eyebrow mb-2">{t('warranty.inventoryResolution')}</p><p className="mb-3 text-[11px] text-graphite">{t('warranty.inventoryResolutionHelp')}</p><WarrantyResolutionForm claimId={claim.id} status={claim.status} /></Card>}
        {manage && <Card className="p-5"><p className="eyebrow mb-2">{t('warranty.supplierWarranty')}</p><p className="mb-3 text-[11px] text-graphite">{t('warranty.supplierWarrantyHelp')}</p><SupplierWarrantyForm claimId={claim.id} suppliers={selectableSuppliers} value={supplierCase} /></Card>}
      </div>
    </div>
  </div>;
}
