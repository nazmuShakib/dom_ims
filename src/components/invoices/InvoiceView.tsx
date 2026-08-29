'use client';

import { useActionState, useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { recordInvoicePrintAction, voidInvoiceAction } from '@/actions/checkout';
import { InvoicePaymentCollection } from '@/components/invoices/InvoicePaymentCollection';
import { Button } from '@/components/ui';
import { PAYMENT_METHODS, type EmiContract, type EmiEarlySettlement, type EmiInstallment, type EmiPayment, type InvoiceItem, type Sale, type SaleSettlement } from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { useI18n } from '@/components/i18n/I18nProvider';
import { voidInvoiceFieldsSchema, type VoidInvoiceFields } from '@/schemas';
import { emiDisplayStatus, emiVoidRefundAmount } from '@/lib/emi-summary';
import { SHOP_LOGO_DATA_URI } from '@/lib/shop-branding';
import { thermalPageHeightMm } from '@/lib/thermal-print-page';

export interface InvoiceShop {
  name: string;
  address: string | null;
  phone: string | null;
  policy: string | null;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(new Date(value));
}

function dateOnly(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function InvoiceView({
  sale,
  items,
  shop,
  canVoid,
  emi,
  settlements,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: InvoiceShop;
  canVoid: boolean;
  settlements: SaleSettlement[];
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null; payments: EmiPayment[] } | null;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<'a4' | 'thermal80' | 'thermal58'>('a4');
  const [thermalPageHeight, setThermalPageHeight] = useState(210);
  const invoiceDocumentRef = useRef<HTMLElement>(null);
  const [printPending, startPrintTransition] = useTransition();
  const [printError, setPrintError] = useState<string | null>(null);
  const [voidState, voidAction, voidPending] = useActionState(voidInvoiceAction, {});
  const [showVoid, setShowVoid] = useState(false);
  const [voidKey, setVoidKey] = useState('');
  const [voidFields, setVoidFields] = useState<VoidInvoiceFields>({
    reason: '',
    refundMethod: sale.paymentMethod,
    confirmed: false,
  });
  const [clientVoidErrors, setClientVoidErrors] = useState<Partial<Record<keyof VoidInvoiceFields, string>>>({});
  const [hideServerVoidErrors, setHideServerVoidErrors] = useState(true);
  const [voidResult, setVoidResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const { message, t } = useI18n();

  useEffect(() => setVoidKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (voidState.ok) {
      setShowVoid(false);
      setVoidResult({ tone: 'success', message: voidState.ok });
      router.refresh();
    } else if (voidState.error && !voidState.fieldErrors) {
      setShowVoid(false);
      setVoidResult({ tone: 'error', message: voidState.error });
    }
  }, [router, voidState.error, voidState.fieldErrors, voidState.ok]);
  useEffect(() => {
    if (voidState.error || voidState.fieldErrors) setHideServerVoidErrors(false);
  }, [voidState]);
  useEffect(() => {
    if (layout === 'a4') return;

    const documentElement = invoiceDocumentRef.current;
    if (!documentElement) return;

    let cancelled = false;
    const updatePageHeight = () => {
      if (cancelled) return;
      const nextHeight = thermalPageHeightMm(documentElement.scrollHeight);
      setThermalPageHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
    };

    updatePageHeight();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePageHeight);
    resizeObserver?.observe(documentElement);
    void document.fonts?.ready.then(updatePageHeight);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [layout]);

  const activeEmiPayments = emi?.payments.filter((payment) => payment.status === 'ACTIVE') ?? [];
  const refundAmount = emi
    ? emiVoidRefundAmount(emi.contract, emi.payments)
    : Math.max(0, sale.amountPaid ?? 0);
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const invoicePaymentStatus = rawEmiStatus
    ? rawEmiStatus === 'PAID' || rawEmiStatus === 'SETTLED_EARLY' ? 'PAID' : 'ACTIVE'
    : sale.paymentStatus;
  const paymentBadge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus
      ? `EMI / ${invoicePaymentStatus}`
      : invoicePaymentStatus === 'UNPAID'
        ? 'UNPAID'
      : `${sale.paymentMethod.replaceAll('_', ' ')} / ${invoicePaymentStatus.replaceAll('_', ' ')}`;
  const printPageSize = layout === 'a4'
    ? 'A4 portrait'
    : `${layout === 'thermal58' ? 58 : 80}mm ${thermalPageHeight}mm`;

  function openVoidDialog() {
    setVoidFields({ reason: '', refundMethod: sale.paymentMethod, confirmed: false });
    setClientVoidErrors({});
    setHideServerVoidErrors(true);
    setShowVoid(true);
  }

  function printInvoice() {
    setPrintError(null);
    startPrintTransition(async () => {
      const formData = new FormData();
      formData.set('saleId', sale.id);
      formData.set('layout', layout === 'a4' ? 'a4' : 'thermal');
      const result = await recordInvoicePrintAction({}, formData);
      if (result.error) {
        setPrintError(result.error);
        return;
      }
      window.print();
    });
  }

  function updateVoidField<K extends keyof VoidInvoiceFields>(key: K, value: VoidInvoiceFields[K]) {
    setVoidFields((current) => ({ ...current, [key]: value }));
    setClientVoidErrors((current) => ({ ...current, [key]: undefined }));
    setHideServerVoidErrors(true);
  }

  function validateVoidForm(event: FormEvent<HTMLFormElement>) {
    const result = voidInvoiceFieldsSchema.safeParse(voidFields);
    if (result.success) {
      setClientVoidErrors({});
      return;
    }
    event.preventDefault();
    const fields = result.error.flatten().fieldErrors;
    setClientVoidErrors({
      reason: fields.reason?.[0],
      refundMethod: fields.refundMethod?.[0],
      confirmed: fields.confirmed?.[0],
    });
  }

  return (
    <div
      className="invoice-root"
      data-layout={layout === 'a4' ? 'a4' : 'thermal'}
      data-thermal-width={layout === 'thermal58' ? '58' : '80'}
      style={{ '--invoice-thermal-width': layout === 'thermal58' ? '58mm' : '80mm' } as CSSProperties}
    >
      <style>{`@media print { @page { size: ${printPageSize}; margin: 0; } }`}</style>
      <div className="invoice-screen-controls print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-rule bg-card p-3">
          <div>
            <p className="text-[13px] font-medium">{t('invoice.layout')}</p>
            <p className="text-[11px] text-graphite">{t('invoice.reprintHelp')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/invoices"
            className="inline-flex h-9 items-center rounded-[3px] border border-slate-600 bg-slate-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-slate-800 hover:bg-slate-800"
          >
            {t('invoice.backToInvoices')}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={layout}
              onChange={(event) => setLayout(event.target.value as 'a4' | 'thermal80' | 'thermal58')}
              className="h-9 rounded-[3px] border border-rule bg-card px-2.5 text-[13px]"
            >
              <option value="a4">{t('invoice.a4Layout')}</option>
              <option value="thermal80">{t('invoice.thermalLayout')}</option>
              <option value="thermal58">{t('invoice.thermal58Layout')}</option>
            </select>
            <Button type="button" disabled={printPending} onClick={printInvoice}>
              {printPending ? t('invoice.preparing') : t('invoice.print')}
            </Button>
            <a
              href={`/api/invoices/${sale.id}/pdf`}
              className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3.5 text-[13px] font-medium"
            >
              {t('invoice.downloadPdf')}
            </a>
          </div>
          {canVoid && (
            <Button type="button" variant="danger" onClick={openVoidDialog}>
              {t('invoice.voidInvoice')}
            </Button>
          )}
          </div>
        </div>
        {printError && <p className="mb-3 text-[12px] text-out">{message(printError)}</p>}
      </div>

      {!emi && (sale.status === 'COMPLETED' || settlements.length > 0) && (
        <InvoicePaymentCollection sale={sale} settlements={settlements} />
      )}

      <div className="invoice-preview-viewport scrollbar-hint" tabIndex={0} aria-label={t('invoice.previewAria')}>
        <article ref={invoiceDocumentRef} className="invoice-document">
          <header className="invoice-header">
            <div className="invoice-shop-brand">
              <h1 className="sr-only">{shop.name}</h1>
              <Image
                className="invoice-shop-logo"
                src={SHOP_LOGO_DATA_URI}
                alt={shop.name}
                width={600}
                height={400}
                unoptimized
              />
              {shop.address && <p>{shop.address}</p>}
              {shop.phone && <p>{shop.phone}</p>}
            </div>
            <div className="invoice-title">
              <strong>{sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}</strong>
              <span className="tnum">{sale.invoiceNumber}</span>
              {paymentBadge && <span className="invoice-payment-badge">{paymentBadge}</span>}
            </div>
          </header>

          <section className="invoice-meta">
            <div>
              <span>Customer</span>
              <strong>{sale.customerName ?? 'Walk-in customer'}</strong>
              {sale.customerPhone && <p>{sale.customerPhone}</p>}
            </div>
            <div>
              <span>Date</span>
              <strong>{dateTime(sale.completedAt)}</strong>
              <p>Served by {sale.actorName}</p>
              {sale.reference && <p>Ref: {sale.reference}</p>}
            </div>
          </section>

          <table className="invoice-items">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.productName}</strong>
                    <span className="tnum">Code (SKU) {item.sku}{item.serialNo ? ` · Device no. ${item.serialNo}` : ''}</span>
                    {item.usedGrade && <span>Used phone · {item.usedGrade === 'REFURBISHED' ? 'Refurbished' : item.usedGrade.replace('GRADE_', 'Grade ')}</span>}
                    {item.knownDefects && <span>Declared defects: {item.knownDefects}</span>}
                    {item.warrantyDays
                      ? <span>{item.warrantyDays} {item.warrantyDays === 1 ? 'day' : 'days'} warranty</span>
                      : item.warrantyMonths
                        ? <span>{item.warrantyMonths} {item.warrantyMonths === 1 ? 'month' : 'months'} warranty</span>
                        : null}
                  </td>
                  <td className="tnum">{item.quantity}</td>
                  <td className="tnum">{formatBDT(item.actualUnitPrice)}</td>
                  <td className="tnum">{formatBDT(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {sale.tradeInDetails && (
            <section className="invoice-trade-in">
              <span>Trade-in device</span>
              <strong>{sale.tradeInDetails.productName}</strong>
              <p className="tnum">Code (SKU) {sale.tradeInDetails.sku} · Device no. {sale.tradeInDetails.serialNo}</p>
              <p>{sale.tradeInDetails.grade === 'REFURBISHED' ? 'Refurbished' : sale.tradeInDetails.grade.replace('GRADE_', 'Grade ')} · Credit {formatBDT(sale.tradeInDetails.acquisitionValue)}</p>
            </section>
          )}

          <section className="invoice-summary">
            <dl>
              {emi ? (
                <>
                  <div><dt>Down payment</dt><dd className="tnum">{formatBDT(emi.contract.downPayment)}</dd></div>
                  <div className="invoice-total"><dt>Outstanding</dt><dd className="tnum">{formatBDT(emi.contract.financedAmount)}</dd></div>
                </>
              ) : (
                <>
                  <div className="invoice-total"><dt>Total</dt><dd className="tnum">{formatBDT(sale.total)}</dd></div>
                  {sale.tradeInCredit > 0 && (
                    <>
                      <div><dt>Trade-in credit</dt><dd className="tnum">−{formatBDT(sale.tradeInCredit)}</dd></div>
                      {sale.tradeInCredit > sale.total && (
                        <div><dt>Trade-in cash payout</dt><dd className="tnum">{formatBDT(sale.tradeInCredit - sale.total)}</dd></div>
                      )}
                    </>
                  )}
                  {Math.max(0, sale.total - sale.tradeInCredit) > 0 && (
                    <>
                      <div><dt>Paid amount</dt><dd className="tnum">{formatBDT(sale.amountPaid ?? 0)}</dd></div>
                      <div className="invoice-total"><dt>Amount due</dt><dd className="tnum">{formatBDT(Math.max(0, sale.total - sale.tradeInCredit - (sale.amountPaid ?? 0)))}</dd></div>
                    </>
                  )}
                </>
              )}
            </dl>
          </section>

          {emi && (
            <section className="invoice-trade-in">
              <span>{t('emi.schedule')}</span>
              <p>{emi.installments.map((row) => `#${row.sequence} ${new Date(row.dueDate).toLocaleDateString('en-GB')} ${formatBDT(row.amountDue)}`).join(' · ')}</p>
            </section>
          )}

          {(emi || sale.note || sale.status === 'VOIDED') && <section className="invoice-payment">
            {emi ? (
              <div>
                <p><span>{t('emi.paymentPlanLabel')}</span> {t('checkout.shopManagedEmi')}</p>
                <p><span>Installments:</span> {emi.contract.termMonths} monthly installments</p>
                <p><span>{t('checkout.firstInstallmentDate')}:</span> {dateOnly(emi.contract.firstDueDate)}</p>
              </div>
            ) : null}
            {sale.note && <p><span>Note:</span> {sale.note}</p>}
            {sale.status === 'VOIDED' && (
              <p className="invoice-void-details">
                <span>Voided:</span> {sale.voidedAt ? dateTime(sale.voidedAt) : 'Recorded'}
                {sale.voidedByName ? ` by ${sale.voidedByName}` : ''}. Reason: {sale.voidReason ?? 'Not recorded'}.
                {' '}Refund: {formatBDT(sale.refundAmount ?? 0)}{sale.refundMethod ? ` via ${sale.refundMethod.replaceAll('_', ' ')}` : ''}.
              </p>
            )}
          </section>}

          {shop.policy && (
            <footer>
              <p>{shop.policy}</p>
            </footer>
          )}
        </article>
      </div>

      {showVoid && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/55 p-3 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-invoice-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !voidPending) setShowVoid(false);
          }}
        >
          <form action={voidAction} onSubmit={validateVoidForm} noValidate className="w-full max-w-xl rounded-[4px] border border-rule bg-card shadow-2xl">
            <input type="hidden" name="saleId" value={sale.id} />
            <input type="hidden" name="idempotencyKey" value={voidKey} />
            <div className="border-b border-rule p-5">
              <h2 id="void-invoice-title" className="text-[18px] font-semibold text-out">Void {sale.invoiceNumber}?</h2>
              <p className="mt-2 text-[13px] text-graphite">
                This reverses the complete sale. Sold stock will be restored, financial metrics will receive opposing entries, and this invoice will remain permanently marked VOIDED.
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-[3px] border border-out/30 bg-out/5 p-3 text-[13px]">
                <p><strong>{items.length}</strong> invoice line{items.length === 1 ? '' : 's'} will be reversed.</p>
                {emi && <p className="mt-1"><strong>{activeEmiPayments.length}</strong> active installment receipt{activeEmiPayments.length === 1 ? '' : 's'} will be marked REVERSED.</p>}
                {sale.tradeInDetails && <p className="mt-1">The trade-in device must be returned to the customer and will leave available inventory.</p>}
                <p className="mt-1">Refund to record: <strong>{formatBDT(refundAmount)}</strong></p>
              </div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Reason for voiding</span>
                <textarea
                  name="reason"
                  value={voidFields.reason}
                  onChange={(event) => updateVoidField('reason', event.target.value)}
                  required
                  minLength={5}
                  maxLength={1000}
                  autoFocus
                  className="min-h-24 w-full rounded-[3px] border border-rule bg-card px-3 py-2 text-[13px] outline-none focus:border-signal"
                  placeholder="For example, wrong device or incorrect selling price"
                />
                {(clientVoidErrors.reason ?? (!hideServerVoidErrors ? voidState.fieldErrors?.reason : undefined)) && (
                  <span className="mt-1 block text-[12px] text-out">{clientVoidErrors.reason ?? voidState.fieldErrors?.reason}</span>
                )}
              </label>
              {refundAmount > 0 && (
                <label className="block">
                  <span className="eyebrow mb-1.5 block">Refund method</span>
                  <select
                    name="refundMethod"
                    required
                    value={voidFields.refundMethod ?? ''}
                    onChange={(event) => updateVoidField('refundMethod', event.target.value as VoidInvoiceFields['refundMethod'])}
                    className="h-10 w-full rounded-[3px] border border-rule bg-card px-3 text-[13px]"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                  {(clientVoidErrors.refundMethod ?? (!hideServerVoidErrors ? voidState.fieldErrors?.refundMethod : undefined)) && (
                    <span className="mt-1 block text-[12px] text-out">{clientVoidErrors.refundMethod ?? voidState.fieldErrors?.refundMethod}</span>
                  )}
                </label>
              )}
              <div>
                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    name="confirmed"
                    value="yes"
                    type="checkbox"
                    checked={voidFields.confirmed}
                    onChange={(event) => updateVoidField('confirmed', event.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  <span>I have verified the invoice, customer refund, and physical items. I understand this action cannot be undone by deleting records.</span>
                </label>
                {(clientVoidErrors.confirmed ?? (!hideServerVoidErrors ? voidState.fieldErrors?.confirmed : undefined)) && (
                  <p className="mt-1 text-[12px] text-out">{clientVoidErrors.confirmed ?? voidState.fieldErrors?.confirmed}</p>
                )}
              </div>
              {!hideServerVoidErrors && voidState.error && <p className="text-[12px] text-out">{message(voidState.error)}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-rule p-4">
              <Button type="button" variant="ghost" onClick={() => setShowVoid(false)} disabled={voidPending}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={voidPending}>
                {voidPending ? 'Voiding invoice…' : 'Confirm complete void'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {voidResult && (
        <div
          className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/55 p-3 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-result-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setVoidResult(null);
          }}
        >
          <div className="w-full max-w-md rounded-[4px] border border-rule bg-card shadow-2xl">
            <div className="p-5">
              <div
                className={`mb-4 inline-flex size-11 items-center justify-center rounded-full ${
                  voidResult.tone === 'success' ? 'bg-ok/10 text-ok' : 'bg-out/10 text-out'
                }`}
              >
                {voidResult.tone === 'success'
                  ? <CircleCheck aria-hidden="true" className="size-6" />
                  : <TriangleAlert aria-hidden="true" className="size-6" />}
              </div>
              <h2 id="void-result-title" className={`text-[18px] font-semibold ${voidResult.tone === 'error' ? 'text-out' : ''}`}>
                {voidResult.tone === 'success' ? t('invoices.voidSuccessTitle') : t('invoices.voidErrorTitle')}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-graphite">{message(voidResult.message)}</p>
            </div>
            <div className="flex justify-end border-t border-rule p-4">
              <Button type="button" variant="ghost" onClick={() => setVoidResult(null)}>{t('common.close')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
