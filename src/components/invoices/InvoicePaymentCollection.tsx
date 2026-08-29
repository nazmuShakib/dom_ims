'use client';

import { useActionState, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { collectInvoicePaymentAction } from '@/actions/sale-settlements';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { PAYMENT_METHODS, type PaymentMethod, type Sale, type SaleSettlement } from '@/domain/types';
import { domainLabel } from '@/lib/i18n/domain';
import { formatBDT } from '@/lib/money';
import { invoicePaymentCollectionFieldsSchema } from '@/schemas';

type CollectionFields = {
  amount: string;
  paymentMethod: PaymentMethod;
  reference: string;
  note: string;
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-BD', {
  timeZone: 'Asia/Dhaka',
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: true,
}).format(new Date(value));

export function InvoicePaymentCollection({
  sale,
  settlements,
}: {
  sale: Sale;
  settlements: SaleSettlement[];
}) {
  const router = useRouter();
  const { t, message } = useI18n();
  const collectible = Math.max(0, sale.total - sale.tradeInCredit);
  const amountPaid = sale.amountPaid ?? 0;
  const due = Math.max(0, collectible - amountPaid);
  const [state, action, pending] = useActionState(collectInvoicePaymentAction, {});
  const [fields, setFields] = useState<CollectionFields>({
    amount: due ? (due / 100).toFixed(2) : '',
    paymentMethod: 'CASH',
    reference: '',
    note: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CollectionFields, string>>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => setIdempotencyKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.ok) {
      setShowConfirm(false);
      setResult({ tone: 'success', message: message(state.ok) });
      setFields((current) => ({ ...current, amount: '', reference: '', note: '' }));
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    } else if (state.error && !state.fieldErrors) {
      setShowConfirm(false);
      setResult({ tone: 'error', message: message(state.error) });
    }
  }, [message, router, state.error, state.fieldErrors, state.ok]);

  useEffect(() => {
    if (!state.fieldErrors) return;
    setShowConfirm(false);
    setFieldErrors({
      amount: state.fieldErrors.amount ? message(state.fieldErrors.amount) : undefined,
      paymentMethod: state.fieldErrors.paymentMethod ? message(state.fieldErrors.paymentMethod) : undefined,
      reference: state.fieldErrors.reference ? message(state.fieldErrors.reference) : undefined,
      note: state.fieldErrors.note ? message(state.fieldErrors.note) : undefined,
    });
  }, [message, state.fieldErrors]);

  const orderedSettlements = useMemo(
    () => [...settlements].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [settlements],
  );
  const hasTradeInPayout = orderedSettlements.some((entry) => entry.type === 'TRADE_IN_PAYOUT');

  function updateField<K extends keyof CollectionFields>(key: K, value: CollectionFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function requestConfirmation() {
    const parsed = invoicePaymentCollectionFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        amount: errors.amount?.[0],
        paymentMethod: errors.paymentMethod?.[0],
        reference: errors.reference?.[0],
        note: errors.note?.[0],
      });
      return;
    }
    if (parsed.data.amount > due) {
      setFieldErrors({ amount: message('The received amount cannot exceed the invoice due amount.') });
      return;
    }
    setFieldErrors({});
    setShowConfirm(true);
  }

  function validateSubmission(event: FormEvent<HTMLFormElement>) {
    const parsed = invoicePaymentCollectionFieldsSchema.safeParse(fields);
    if (!parsed.success || parsed.data.amount > due) {
      event.preventDefault();
      setShowConfirm(false);
      requestConfirmation();
    }
  }

  return (
    <section className="invoice-payment-collection mb-4 rounded-[3px] border border-rule bg-card print:hidden">
      <div className="border-b border-rule px-4 py-3">
        <h2 className="text-[16px] font-semibold">{t('invoice.collectionTitle')}</h2>
        <p className="mt-1 text-[12px] text-graphite">{t('invoice.collectionHelp')}</p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-[3px] border border-rule bg-plate/40 p-3">
          <p className="eyebrow">{t('invoice.collectibleAmount')}</p>
          <p className="tnum mt-1 text-[18px] font-semibold">{formatBDT(collectible)}</p>
        </div>
        <div className="rounded-[3px] border border-ok/30 bg-ok/5 p-3">
          <p className="eyebrow">{t('invoice.paidAmount')}</p>
          <p className="tnum mt-1 text-[18px] font-semibold text-ok">{formatBDT(amountPaid)}</p>
        </div>
        <div className="rounded-[3px] border border-out/30 bg-out/5 p-3">
          <p className="eyebrow">{t('invoice.dueAmount')}</p>
          <p className="tnum mt-1 text-[18px] font-semibold text-out">{formatBDT(due)}</p>
        </div>
      </div>

      {sale.status === 'COMPLETED' && due > 0 && (
        <div className="border-t border-rule p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-1.5 block">{t('invoice.amountReceived')}</span>
              <Input value={fields.amount} onChange={(event) => updateField('amount', event.target.value)} inputMode="decimal" placeholder={t('invoice.amountReceivedPlaceholder')} />
              {fieldErrors.amount && <span className="mt-1 block text-[12px] text-out">{fieldErrors.amount}</span>}
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">{t('invoice.paymentMethod')}</span>
              <Select value={fields.paymentMethod} onChange={(event) => updateField('paymentMethod', event.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{domainLabel(t, method)}</option>)}
              </Select>
              {fieldErrors.paymentMethod && <span className="mt-1 block text-[12px] text-out">{fieldErrors.paymentMethod}</span>}
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">{t('invoice.reference')}</span>
              <Input value={fields.reference} onChange={(event) => updateField('reference', event.target.value)} maxLength={120} />
              {fieldErrors.reference && <span className="mt-1 block text-[12px] text-out">{fieldErrors.reference}</span>}
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">{t('invoice.note')}</span>
              <Textarea value={fields.note} onChange={(event) => updateField('note', event.target.value)} rows={2} maxLength={1000} />
              {fieldErrors.note && <span className="mt-1 block text-[12px] text-out">{fieldErrors.note}</span>}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={requestConfirmation}>{t('invoice.recordPayment')}</Button>
            <Button type="button" variant="ghost" onClick={() => updateField('amount', (due / 100).toFixed(2))}>{t('invoice.useFullDue')}</Button>
          </div>
          {state.fieldErrors && <p className="mt-2 text-[12px] text-out">{t('invoice.reviewPaymentFields')}</p>}
        </div>
      )}

      {orderedSettlements.length > 0 && (
        <div className="border-t border-rule">
          <div className="px-4 py-3"><h3 className="text-[14px] font-semibold">{t(hasTradeInPayout ? 'invoice.paymentHistory' : 'invoice.customerPaymentHistory')}</h3></div>
          <div className="overflow-x-auto">
            <table className={`w-full text-center text-[12px] ${hasTradeInPayout ? 'min-w-[660px]' : 'min-w-[520px]'}`}>
              <thead className="border-y border-rule bg-plate/60">
                <tr>
                  <th className="px-3 py-2">{t('invoice.date')}</th>
                  {hasTradeInPayout && <th className="px-3 py-2">{t('invoice.type')}</th>}
                  <th className="px-3 py-2">{t('invoice.amount')}</th>
                  <th className="px-3 py-2">{t('invoice.method')}</th>
                  <th className="px-3 py-2">{t('invoice.recordedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {orderedSettlements.map((entry) => (
                  <tr key={entry.id} className="border-b border-rule last:border-b-0">
                    <td className="px-3 py-2.5">{formatDateTime(entry.recordedAt)}</td>
                    {hasTradeInPayout && <td className={`px-3 py-2.5 font-medium ${entry.type === 'TRADE_IN_PAYOUT' ? 'text-out' : 'text-ok'}`}>{entry.type === 'TRADE_IN_PAYOUT' ? t('invoice.tradeInCashPayout') : t('invoice.customerPayment')}</td>}
                    <td className="tnum px-3 py-2.5">{formatBDT(entry.amount)}</td>
                    <td className="px-3 py-2.5">{domainLabel(t, entry.paymentMethod)}</td>
                    <td className="px-3 py-2.5">{entry.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setShowConfirm(false); }}>
          <form action={action} onSubmit={validateSubmission} noValidate className="w-full max-w-md rounded-[4px] border border-rule bg-card shadow-2xl">
            <input type="hidden" name="saleId" value={sale.id} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="amount" value={fields.amount} />
            <input type="hidden" name="paymentMethod" value={fields.paymentMethod} />
            <input type="hidden" name="reference" value={fields.reference} />
            <input type="hidden" name="note" value={fields.note} />
            <div className="border-b border-rule p-5"><h2 className="text-[18px] font-semibold">{t('invoice.confirmCollectionTitle')}</h2><p className="mt-2 text-[13px] text-graphite">{t('invoice.confirmCollectionHelp', { amount: formatBDT(Math.round(Number(fields.amount || 0) * 100)), invoice: sale.invoiceNumber })}</p></div>
            <div className="flex justify-end gap-2 p-4"><Button type="button" variant="ghost" disabled={pending} onClick={() => setShowConfirm(false)}>{t('invoice.keepEditing')}</Button><Button type="submit" disabled={pending}>{pending ? t('invoice.recording') : t('invoice.yesRecordPayment')}</Button></div>
          </form>
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setResult(null); }}>
          <div className="w-full max-w-md rounded-[4px] border border-rule bg-card shadow-2xl">
            <div className="p-5">{result.tone === 'success' ? <CircleCheck className="h-9 w-9 text-ok" /> : <TriangleAlert className="h-9 w-9 text-out" />}<h2 className="mt-3 text-[18px] font-semibold">{result.tone === 'success' ? t('invoice.paymentRecorded') : t('invoice.paymentFailed')}</h2><p className="mt-2 text-[13px] text-graphite">{result.message}</p></div>
            <div className="flex justify-end border-t border-rule p-4"><Button type="button" onClick={() => setResult(null)}>{t('invoice.close')}</Button></div>
          </div>
        </div>
      )}
    </section>
  );
}
