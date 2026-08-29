'use client';

import { startTransition, useActionState, useEffect, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cancelSupplierReturnAction, settleSupplierReturnAction, type SupplierReturnActionState } from '@/actions/supplier-returns';
import type { SupplierRecoveryMethod, SupplierReturnReason, SupplierReturnStatus } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, EmptyState, Field, Input, Money, Select, SerialChip, TableViewport, Textarea } from '@/components/ui';
import { formatBDT, parseBDT, toTaka } from '@/lib/money';
import { settleSupplierReturnSchema } from '@/schemas';
import { LoadingScreen } from '@/components/shell/LoadingScreen';

export interface SupplierReturnRow {
  id: string;
  returnNumber: string;
  status: SupplierReturnStatus;
  reason: SupplierReturnReason;
  supplierId: string;
  supplierName: string;
  productName: string;
  sku: string;
  serialNo: string | null;
  quantity: number;
  originalCost: number;
  recoveredAmount: number | null;
  recoveryMethod: SupplierRecoveryMethod | null;
  settlementReference: string | null;
  sentAt: string;
  replacementReceived: boolean;
}

const METHODS: SupplierRecoveryMethod[] = ['CASH', 'MOBILE_BANKING', 'BANK_TRANSFER', 'SUPPLIER_CREDIT', 'MIXED', 'OTHER', 'NO_RECOVERY'];

export interface SupplierReturnFilterValues {
  q: string;
  from: string;
  to: string;
  supplier: string;
  status: string;
  action: string;
  recoveryMethod: string;
  order: string;
}

const EMPTY_FILTERS: SupplierReturnFilterValues = { q: '', from: '', to: '', supplier: '', status: '', action: '', recoveryMethod: '', order: 'newest' };

function filterUrl(values: SupplierReturnFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (!value || (key === 'order' && value === 'newest')) continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `/suppliers/returns?${query}` : '/suppliers/returns';
}

export function SupplierReturnRegister({ rows, totalCount, confirmedFilters, suppliers, resultVersion }: {
  rows: SupplierReturnRow[];
  totalCount: number;
  confirmedFilters: SupplierReturnFilterValues;
  suppliers: Array<{ id: string; name: string }>;
  resultVersion: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [values, setValues] = useState(confirmedFilters);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;
  const [selected, setSelected] = useState<SupplierReturnRow | null>(null);
  const [cancelling, setCancelling] = useState<SupplierReturnRow | null>(null);
  const awaitingReplacement = (row: SupplierReturnRow) => row.status === 'SETTLED' && row.recoveryMethod === 'SUPPLIER_CREDIT' && !row.replacementReceived;
  const settled = rows.filter((row) => row.status === 'SETTLED' && !awaitingReplacement(row));
  const pendingCost = rows.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + row.originalCost, 0);
  const replacementPending = rows.filter(awaitingReplacement).reduce((sum, row) => sum + (row.recoveredAmount ?? 0), 0);
  const recovered = settled.reduce((sum, row) => sum + (row.recoveredAmount ?? 0), 0);
  const loss = settled.reduce((sum, row) => sum + Math.max(0, row.originalCost - (row.recoveredAmount ?? 0)), 0);

  useEffect(() => { setValues(confirmedFilters); setFiltering(false); }, [confirmedFilters, resultVersion]);
  function update(key: keyof SupplierReturnFilterValues, value: string) { setValues((current) => ({ ...current, [key]: value })); }
  function navigate(next: SupplierReturnFilterValues) {
    if (pending) return;
    setValues(next);
    setFiltering(true);
    window.history.pushState(null, '', filterUrl(next));
    startRefreshing(() => router.refresh());
  }
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate(values); }

  return <>
    <Card className="mb-4 p-4">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={apply}>
        <div className="sm:col-span-2"><Field label={t('common.search')}><Input type="search" value={values.q} onChange={(event) => update('q', event.target.value)} placeholder={t('supplierReturns.searchPlaceholder')} /></Field></div>
        <Field label={t('supplierReturns.fromDate')}><Input type="date" value={values.from} onChange={(event) => update('from', event.target.value)} /></Field>
        <Field label={t('supplierReturns.toDate')}><Input type="date" value={values.to} onChange={(event) => update('to', event.target.value)} /></Field>
        <Field label={t('common.supplier')}><Select value={values.supplier} onChange={(event) => update('supplier', event.target.value)}><option value="">{t('supplierReturns.allSuppliers')}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field>
        <Field label={t('common.status')}>
          <Select value={values.status} onChange={(event) => update('status', event.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="PENDING">{t('supplierReturns.pending')}</option>
            <option value="SETTLED">{t('supplierReturns.settled')}</option>
            <option value="AWAITING_REPLACEMENT">{t('supplierReturns.awaitingReplacement')}</option>
            <option value="CANCELLED">{t('supplierReturns.cancelled')}</option>
          </Select>
        </Field>
        <Field label={t('supplierReturns.actionRequired')}><Select value={values.action} onChange={(event) => update('action', event.target.value)}><option value="">{t('supplierReturns.allActions')}</option><option value="SETTLEMENT">{t('supplierReturns.recordSettlement')}</option><option value="REPLACEMENT">{t('supplierReturns.receiveReplacement')}</option><option value="COMPLETED">{t('supplierReturns.noActionRequired')}</option></Select></Field>
        <Field label={t('supplierReturns.recoveryMethod')}><Select value={values.recoveryMethod} onChange={(event) => update('recoveryMethod', event.target.value)}><option value="">{t('supplierReturns.allMethods')}</option>{METHODS.map((method) => <option key={method} value={method}>{methodLabel(method, t)}</option>)}</Select></Field>
        <Field label={t('catalog.orderBy')}><Select value={values.order} onChange={(event) => update('order', event.target.value)}><option value="newest">{t('supplierReturns.newest')}</option><option value="oldest">{t('supplierReturns.oldest')}</option><option value="recovered-desc">{t('supplierReturns.recoveredHigh')}</option><option value="recovered-asc">{t('supplierReturns.recoveredLow')}</option><option value="cost-desc">{t('supplierReturns.costHigh')}</option><option value="cost-asc">{t('supplierReturns.costLow')}</option><option value="difference-desc">{t('supplierReturns.differenceHigh')}</option><option value="difference-asc">{t('supplierReturns.differenceLow')}</option></Select></Field>
        <div className="flex items-end gap-2 lg:col-span-4"><Button type="submit" disabled={pending}>{t('common.applyFilters')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => navigate(EMPTY_FILTERS)}>{t('common.reset')}</Button></div>
      </form>
      <p className="mt-3 text-[11px] text-graphite">{t('supplierReturns.differenceHelp')}</p>
    </Card>
    {pending ? <Card><LoadingScreen compact label={t('supplierReturns.filtering')} /></Card> : <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label={t('supplierReturns.pending')} value={formatBDT(pendingCost)} />
        <Summary label={t('supplierReturns.replacementPending')} value={formatBDT(replacementPending)} />
        <Summary label={t('supplierReturns.recovered')} value={formatBDT(recovered)} />
        <Summary label={t('supplierReturns.confirmedLoss')} value={formatBDT(loss)} tone="loss" />
      </div>
      <Card>
      <div className="flex justify-end border-b border-rule p-3"><p className="tnum text-[12px] text-graphite">{rows.length} / {totalCount}</p></div>
      {rows.length === 0 ? <EmptyState title={t('supplierReturns.noReturns')} /> : (
        <TableViewport className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-center text-[13px]">
            <thead><tr className="border-b border-rule text-[11px] uppercase tracking-[.12em] text-graphite">
              <th className="px-4 py-3">Return</th><th className="px-4 py-3">{t('common.product')}</th>
              <th className="px-4 py-3">{t('common.supplier')}</th><th className="px-4 py-3">{t('common.quantity')}</th>
              <th className="px-4 py-3">{t('supplierReturns.originalCost')}</th>
              <th className="px-4 py-3">{t('supplierReturns.recovered')}</th><th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-rule-soft last:border-0 hover:bg-plate/60">
              <td className="px-4 py-3"><p className="tnum font-medium">{row.returnNumber}</p><p className="mt-1 text-[11px] text-graphite">{new Date(row.sentAt).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' })}</p></td>
              <td className="px-4 py-3"><p className="font-medium">{row.productName}</p><p className="tnum mt-1 text-[11px] text-graphite">{row.sku}</p>{row.serialNo && <p className="mt-1"><SerialChip serial={row.serialNo} /></p>}</td>
              <td className="px-4 py-3">{row.supplierName}</td><td className="tnum px-4 py-3">{row.quantity}</td>
              <td className="px-4 py-3"><Money value={row.originalCost} /></td><td className="px-4 py-3">{awaitingReplacement(row) ? <span className="text-[11px] font-medium text-amber-700">{t('supplierReturns.awaitingStock')}</span> : <Money value={row.recoveredAmount} />}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] ${row.status === 'CANCELLED' ? 'border-out/25 bg-out-wash text-out' : awaitingReplacement(row) || row.status === 'PENDING' ? 'border-amber-500/25 bg-amber-50 text-amber-700' : 'border-ok/25 bg-ok-wash text-ok'}`}>{row.status === 'CANCELLED' ? t('supplierReturns.cancelled') : awaitingReplacement(row) ? t('supplierReturns.awaitingReplacement') : row.status === 'SETTLED' ? t('supplierReturns.settled') : t('supplierReturns.pending')}</span></td>
              <td className="px-4 py-3">{row.status === 'PENDING' ? <span className="inline-flex justify-center gap-2"><button type="button" className="inline-flex items-center justify-center rounded-[3px] border border-blue-700 bg-blue-700 p-1 text-[13px] font-medium text-white transition-colors hover:border-blue-800 hover:bg-blue-800" onClick={() => setSelected(row)}>{t('supplierReturns.recordSettlement')}</button><button type="button" className="inline-flex items-center justify-center rounded-[3px] border border-red-700 bg-red-700 p-1 text-[13px] font-medium text-white transition-colors hover:border-red-800 hover:bg-red-800" onClick={() => setCancelling(row)}>{t('supplierReturns.cancelReturn')}</button></span> : awaitingReplacement(row) ? <Link className="inline-flex items-center justify-center rounded-[3px] border border-green-700 bg-green-700 p-1 text-[13px] font-medium text-white transition-colors hover:border-green-800 hover:bg-green-800" href={`/stock/in?supplier=${row.supplierId}&reference=${row.returnNumber}&supplierReturn=${row.id}`}>{t('supplierReturns.receiveReplacement')}</Link> : null}</td>
            </tr>)}</tbody>
          </table>
        </TableViewport>
      )}
    </Card></>}
    {selected && <SettlementDialog row={selected} onClose={() => setSelected(null)} />}
    {cancelling && <CancelDialog row={cancelling} onClose={() => setCancelling(null)} />}
  </>;
}

function CancelDialog({ row, onClose }: { row: SupplierReturnRow; onClose: () => void }) {
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState<SupplierReturnActionState, FormData>(cancelSupplierReturnAction, {});
  const [reason, setReason] = useState('');
  const [clientError, setClientError] = useState('');
  const [key, setKey] = useState('');
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) { setClientError('Give a clear cancellation reason using at least 5 characters.'); return; }
    setClientError('');
    startTransition(() => action(new FormData(event.currentTarget)));
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true"><Card className="w-full max-w-xl shadow-xl">
    <div className="border-b border-rule p-5"><h2 className="text-[19px] font-semibold text-out">{t('supplierReturns.cancelReturn')} · {row.returnNumber}</h2><p className="mt-2 text-[13px] text-graphite">{t('supplierReturns.cancelHelp')}</p></div>
    <form noValidate onSubmit={submit} className="p-5"><input type="hidden" name="returnId" value={row.id} /><input type="hidden" name="idempotencyKey" value={key} />
      {state.error && <p className="mb-4 text-[13px] text-out">{message(state.error)}</p>}
      <Field label={t('supplierReturns.cancelReason')} error={clientError || state.fieldErrors?.reason}><Textarea name="reason" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" variant="danger" disabled={pending}>{pending ? t('common.saving') : t('supplierReturns.cancelReturn')}</Button></div>
    </form>
  </Card></div>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'loss' }) {
  return <Card className="p-4"><p className="eyebrow">{label}</p><p className={`tnum mt-2 text-[20px] font-semibold ${tone === 'loss' ? 'text-out' : ''}`}>{value}</p></Card>;
}

function SettlementDialog({ row, onClose }: { row: SupplierReturnRow; onClose: () => void }) {
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState<SupplierReturnActionState, FormData>(settleSupplierReturnAction, {});
  const [method, setMethod] = useState<SupplierRecoveryMethod>('CASH');
  const [amount, setAmount] = useState(String(toTaka(row.originalCost)));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let recoveredAmount = 0;
    try { recoveredAmount = parseBDT(amount); } catch { setClientErrors({ recoveredAmount: 'Enter a valid recovered amount.' }); return; }
    const parsed = settleSupplierReturnSchema.safeParse({ returnId: row.id, recoveredAmount, recoveryMethod: method, settlementReference: reference || null, settlementNote: note || null, actorId: 'client-validation' });
    if (!parsed.success) {
      setClientErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message])));
      return;
    }
    setClientErrors({});
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true">
    <Card className="w-full max-w-2xl shadow-xl">
      <div className="border-b border-rule p-5"><h2 className="text-[19px] font-semibold">{t('supplierReturns.recordSettlement')} · {row.returnNumber}</h2><p className="mt-1 text-[12px] text-graphite">{row.productName} · {row.supplierName}</p></div>
      <form noValidate onSubmit={submit} className="p-5">
        <input type="hidden" name="returnId" value={row.id} />
        {state.error && <p className="mb-4 rounded-[3px] border border-out/20 bg-out-wash p-3 text-[13px] text-out">{message(state.error)}</p>}
        <div className="mb-4 rounded-[3px] bg-plate p-3 text-[13px]"><span className="text-graphite">{t('supplierReturns.originalCost')}:</span> <strong className="tnum">{formatBDT(row.originalCost)}</strong></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('supplierReturns.recoveryMethod')} error={fieldErrors.recoveryMethod}><Select name="recoveryMethod" value={method} onChange={(event) => { const value = event.target.value as SupplierRecoveryMethod; setMethod(value); if (value === 'NO_RECOVERY') setAmount('0'); }}>{METHODS.map((value) => <option value={value} key={value}>{methodLabel(value, t)}</option>)}</Select></Field>
          <Field label={t('supplierReturns.recoveredAmount')} error={fieldErrors.recoveredAmount}><Input name="recoveredAmount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          <Field label={t('common.reference')} error={fieldErrors.settlementReference}><Input name="settlementReference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Credit note / transaction reference" /></Field>
          <Field label={t('common.note')} error={fieldErrors.settlementNote}><Textarea name="settlementNote" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
        <p className="mt-4 text-[12px] text-graphite">{t('supplierReturns.settlementHelp')}</p>
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('supplierReturns.saveSettlement')}</Button></div>
      </form>
    </Card>
  </div>;
}

function methodLabel(method: SupplierRecoveryMethod, t: ReturnType<typeof useI18n>['t']): string {
  const labels = { CASH: 'supplierReturns.cash', MOBILE_BANKING: 'supplierReturns.mobileBanking', BANK_TRANSFER: 'supplierReturns.bankTransfer', SUPPLIER_CREDIT: 'supplierReturns.supplierCredit', MIXED: 'supplierReturns.mixed', OTHER: 'common.other', NO_RECOVERY: 'supplierReturns.noRecovery' } as const;
  return t(labels[method]);
}
