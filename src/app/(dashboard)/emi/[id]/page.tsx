import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmiContractWorkspace } from '@/components/emi/EmiContractWorkspace';
import { Badge, PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { db } from '@/repositories';
import { refreshEmiStatuses } from '@/services/emi';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function EmiContractPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageCapability('VIEW_EMI'); const { id } = await params;
  const { locale } = await getSession();
  const t = createTranslator(locale);
  await refreshEmiStatuses();
  const contract = await db.emi.findContractById(id); if (!contract) notFound();
  const [sale, customer, installments, payments, earlySettlement] = await Promise.all([db.sales.findById(contract.saleId), db.customers.findById(contract.customerId), db.emi.findInstallments(id), db.emi.findPayments(id), db.emi.findEarlySettlement(id)]);
  const installmentSequence = new Map(installments.map((row) => [row.id, row.sequence]));
  const allocationRows = await Promise.all(payments.map(async (payment) => [payment.id, (await db.emi.findAllocations(payment.id)).map((row) => ({ sequence: installmentSequence.get(row.installmentId) ?? 0, amount: row.amount }))] as const));
  const allocationsByPayment = Object.fromEntries(allocationRows);
  const statusLabel = t(`emi.status.${contract.status.toLowerCase()}` as 'emi.status.active');
  return <><PageHeader title={contract.contractNumber} action={<div className="flex flex-wrap gap-2"><Link href="/emi" className="inline-flex h-9 items-center rounded-[3px] border border-slate-600 bg-slate-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-slate-800 hover:bg-slate-800">{t('emi.backToContracts')}</Link><Link href={`/invoices/${contract.saleId}`} className="inline-flex h-9 items-center rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white transition-colors hover:border-blue-800 hover:bg-blue-800">{t('emi.viewInvoice', { invoice: sale?.invoiceNumber ?? t('emi.invoice') })}</Link></div>}/><div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]"><span><strong>{t('emi.customerLabel')}</strong> {customer?.name ?? t('common.notRecorded')}</span><span><strong>{t('emi.paymentPlanLabel')}</strong> {t('emi.installments', { count: contract.termMonths })}</span><Badge tone={contract.status === 'PAID' ? 'ok' : contract.status === 'OVERDUE' || contract.status === 'VOIDED' ? 'out' : contract.status === 'ACTIVE' ? 'signal' : 'neutral'}>{statusLabel}</Badge></div><EmiContractWorkspace contract={contract} installments={installments} payments={payments} earlySettlement={earlySettlement} allocationsByPayment={allocationsByPayment} role={actor.role}/></>;
}
