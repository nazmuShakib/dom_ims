import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { PrintReceiptButton } from '@/components/emi/PrintReceiptButton';
import { getSession, requirePageCapability } from '@/lib/session';
import { formatBDT } from '@/lib/money';
import { formatDhakaDateTime } from '@/lib/time';
import { db } from '@/repositories';
import { emiRemainingBalanceAfterPayment } from '@/services/emi';
import { createTranslator } from '@/lib/i18n/messages';
import { domainLabel } from '@/lib/i18n/domain';
import { SHOP_LOGO_DATA_URI } from '@/lib/shop-branding';

export const dynamic = 'force-dynamic';
export default async function EmiReceiptPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  await requirePageCapability('VIEW_EMI');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  // Customer-facing printable content intentionally remains in English, matching sales invoices.
  const receiptT = createTranslator('en');
  const { id, paymentId } = await params;
  const contract = await db.emi.findContractById(id);
  if (!contract) notFound();
  const payments = await db.emi.findPayments(id);
  const payment = payments.find((row) => row.id === paymentId);
  if (!payment) notFound();
  const [customer, sale, saleItems, installments, allocations, earlySettlement] = await Promise.all([db.customers.findById(contract.customerId), db.sales.findById(contract.saleId), db.sales.findItems(contract.saleId), db.emi.findInstallments(id), db.emi.findAllocations(payment.id), db.emi.findEarlySettlement(id)]);
  const isEarlySettlementReceipt = Boolean(earlySettlement && payment.paidAt === earlySettlement.approvedAt);
  const installmentSequence = new Map(installments.map((row) => [row.id, row.sequence]));
  const outstanding = emiRemainingBalanceAfterPayment(
    contract.financedAmount,
    contract.status,
    payments,
    payment.id,
  );
  const legacyReasonPrefix = sale ? `Invoice ${sale.invoiceNumber} voided: ` : '';
  const voidReason = payment.reverseReason && legacyReasonPrefix && payment.reverseReason.startsWith(legacyReasonPrefix)
    ? payment.reverseReason.slice(legacyReasonPrefix.length)
    : payment.reverseReason;
  return <div className="emi-receipt-root" data-layout="a4">
    <PageHeader title={t('emi.receiptTitle')} count={payment.receiptNumber} action={<div className="flex flex-wrap items-center gap-2 sm:flex-nowrap"><Link href={`/emi/${contract.id}`} className="inline-flex h-9 shrink-0 items-center rounded-[3px] border border-slate-600 bg-slate-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-slate-800 hover:bg-slate-800">{t('emi.backToDetails')}</Link><PrintReceiptButton contractId={contract.id} paymentId={payment.id} /></div>} />
    <div className="emi-receipt-viewport" tabIndex={0} aria-label={t('emi.receiptPreviewAria')}>
    <article className="emi-receipt-document">
      {payment.status === 'REVERSED' && <section className="mb-4 border border-out bg-out-wash p-3 text-out">
        <strong className="block text-[15px]">{receiptT('emi.reversedReceipt')}</strong>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
          <div><dt className="font-semibold">{receiptT('emi.voidedOn')}</dt><dd>{payment.reversedAt ? formatDhakaDateTime(payment.reversedAt) : receiptT('emi.reversedWhenVoided')}</dd></div>
          <div><dt className="font-semibold">{receiptT('emi.voidedInvoice')}</dt><dd>{sale?.invoiceNumber ?? receiptT('emi.invoiceNotRecorded')}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">{receiptT('emi.voidReason')}</dt><dd>{voidReason ?? receiptT('emi.reversedPaymentHelp')}</dd></div>
        </dl>
      </section>}
      <header className="emi-receipt-header">
        <div>
          <h1 className="sr-only">{receiptT('emi.shopName')}</h1>
      <Image className="emi-receipt-shop-logo" src={SHOP_LOGO_DATA_URI} alt={receiptT('emi.shopName')} width={180} height={120} unoptimized />
          <h2>{receiptT('emi.receiptDocumentTitle')}</h2>
          <p className="emi-receipt-number">{payment.receiptNumber}</p>
          <p>{formatDhakaDateTime(payment.paidAt)}</p>
        </div>
      </header>
      <section className="emi-receipt-amount">
        {isEarlySettlementReceipt && earlySettlement && <><div><span>{receiptT('emi.dueBeforeDiscount')}</span><strong>{formatBDT(earlySettlement.outstandingBefore)}</strong></div><div><span>{receiptT('emi.earlySettlementDiscount')}</span><strong>-{formatBDT(earlySettlement.discountAmount)}</strong></div></>}
        <div><span>{payment.status === 'REVERSED' ? receiptT('emi.reversedAmount') : receiptT('emi.paidAmount')}</span><strong>{formatBDT(payment.amount)}</strong></div>
        <div><span>{isEarlySettlementReceipt ? receiptT('emi.dueAfterSettlement') : receiptT('emi.dueAmount')}</span><strong>{payment.status === 'REVERSED' ? receiptT('emi.notApplicable') : formatBDT(outstanding)}</strong></div>
      </section>
      <dl className="emi-receipt-details"><div><dt>{receiptT('common.customer')}</dt><dd>{customer?.name ?? receiptT('common.notRecorded')}<br/><span>{customer?.phone ?? receiptT('emi.mobileNotRecorded')}</span></dd></div><div><dt>{receiptT('emi.contractInvoice')}</dt><dd>{contract.contractNumber}<br/><span>{sale?.invoiceNumber ?? receiptT('emi.invoiceNotRecorded')}</span></dd></div><div><dt>{receiptT('emi.paymentMethod')}</dt><dd>{domainLabel(receiptT, payment.paymentMethod)}</dd></div><div><dt>{receiptT('emi.recordedBy')}</dt><dd>{payment.recordedByName}</dd></div><div><dt>{receiptT('emi.appliedInstallments')}</dt><dd>{allocations.map((row) => `#${installmentSequence.get(row.installmentId) ?? '?'} (${formatBDT(row.amount)})`).join(' · ') || '—'}</dd></div><div><dt>{receiptT('common.reference')}</dt><dd>{payment.reference ?? '—'}</dd></div></dl>
      <section className="emi-receipt-products"><h3>{receiptT('emi.productDetails')}</h3>{saleItems.map((item) => <div key={item.id}><strong>{item.productName}</strong><span>{receiptT('emi.productCode', { sku: item.sku })}{item.serialNo ? ` · ${receiptT('emi.deviceImei', { serial: item.serialNo })}` : ` · ${receiptT('emi.quantity', { count: item.quantity })}`}</span></div>)}</section>
      <footer className="emi-receipt-footer"><span>{receiptT('emi.installments', { count: contract.termMonths })}</span><span>{receiptT('emi.keepReceipt')}</span></footer>
    </article>
    </div>
  </div>;
}
