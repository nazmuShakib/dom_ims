'use client';

import { startTransition, useActionState, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { Supplier } from '@/domain/types';
import type { ProductDTO } from '@/lib/dto';
import { formatBDT, parseBDT, toTaka } from '@/lib/money';
import {
  preflightStockSerials,
  receiveStockAction,
  type StockActionState,
  type StockSerialConflict,
} from '@/actions/stock';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { ScannerInput } from '@/components/search/ScannerInput';
import { useI18n } from '@/components/i18n/I18nProvider';

interface StockConfirmation {
  productName: string;
  sku: string;
  trackingType: ProductDTO['trackingType'];
  count: number;
  serials: string[];
  supplierName: string | null;
  reason: 'PURCHASE' | 'INITIAL_STOCK' | 'CUSTOMER_RETURN';
  unitCost: number;
  totalCost: number;
  reference: string | null;
  note: string | null;
  location: string | null;
  warrantyDuration: string | null;
  warrantyUnit: 'DAYS' | 'MONTHS';
  unitCondition: 'NEW' | 'REFURBISHED';
}

export function StockInForm({
  products,
  suppliers,
  initialProductId,
  initialSupplierId,
  initialReference,
  lockInitialReference = false,
}: {
  products: ProductDTO[];
  suppliers: Supplier[];
  initialProductId?: string;
  initialSupplierId?: string;
  initialReference?: string;
  lockInitialReference?: boolean;
}) {
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    receiveStockAction,
    {},
  );
  const { t, message } = useI18n();

  const [productId, setProductId] = useState(initialProductId ?? '');
  const [serialText, setSerialText] = useState('');
  const [serialScan, setSerialScan] = useState('');
  const [cost, setCost] = useState('');
  const [warrantyUnit, setWarrantyUnit] = useState<'DAYS' | 'MONTHS'>('MONTHS');
  const [key, setKey] = useState('');
  const [scanError, setScanError] = useState('');
  const [serialScanError, setSerialScanError] = useState('');
  const [confirmation, setConfirmation] = useState<StockConfirmation | null>(null);
  const [confirmationSubmitted, setConfirmationSubmitted] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [serialConflicts, setSerialConflicts] = useState<StockSerialConflict[]>([]);
  const [preflightPending, setPreflightPending] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const serialScanRef = useRef<HTMLInputElement>(null);
  const confirmationDataRef = useRef<FormData | null>(null);
  const formId = useId();

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const isSerial = product?.trackingType === 'SERIAL';

  // A fresh idempotency key per submission. Generated in an effect so the server
  // render and the client render agree (no hydration mismatch), and rotated after
  // every success so the next receipt isn't swallowed as a replay.
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.ok) {
      setKey(crypto.randomUUID());
      setSerialText('');
      setSerialScan('');
      setSerialScanError('');
    }
  }, [state.ok]);

  useEffect(() => {
    if (state.receipt) {
      setReceiptOpen(true);
      setConfirmation(null);
      setConfirmationSubmitted(false);
      confirmationDataRef.current = null;
    }
  }, [state.receipt]);

  useEffect(() => {
    if (!receiptOpen && !confirmation && serialConflicts.length === 0) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const bodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(document.body).paddingRight,
    ) || 0;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pending) return;
      if (serialConflicts.length > 0) setSerialConflicts([]);
      else if (confirmation) closeConfirmation();
      else setReceiptOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [receiptOpen, confirmation, serialConflicts, pending]);

  useEffect(() => {
    if (isSerial) serialScanRef.current?.focus();
  }, [isSerial, productId]);

  // Prefill cost from the product's default, but let the operator override it —
  // the real cost is whatever the supplier charged THIS time, and it's what gets
  // written onto each unit.
  useEffect(() => {
    if (product) {
      setCost(
        product.defaultCostPrice === undefined ? '' : String(toTaka(product.defaultCostPrice)),
      );
    }
  }, [product]);

  const serials = serialText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seenSerials = new Set<string>();
  const dupes = serials.filter((serial) => {
    const key = serial.toLocaleLowerCase();
    if (seenSerials.has(key)) return true;
    seenSerials.add(key);
    return false;
  });
  const uniqueSerialCount = seenSerials.size;

  function appendScannedSerial(value: string) {
    const scanned = value.trim();
    if (!scanned) return;
    if (serials.some((serial) => serial.toLocaleLowerCase() === scanned.toLocaleLowerCase())) {
      setSerialScanError(`${scanned} is already in this receipt.`);
      setSerialScan('');
      return;
    }
    setSerialText((current) => {
      const existing = current.trimEnd();
      return existing ? `${existing}\n${scanned}` : scanned;
    });
    setSerialScan('');
    setSerialScanError('');
    setSerialConflicts([]);
  }

  async function reviewReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;

    const data = new FormData(event.currentTarget);
    let unitCost: number;
    try {
      unitCost = parseBDT(String(data.get('unitCost') ?? ''));
    } catch {
      setConfirmationError(t('stock.invalidCost'));
      return;
    }

    const count = product.trackingType === 'SERIAL'
      ? uniqueSerialCount
      : Number(data.get('quantity') ?? 0);
    const supplierId = String(data.get('supplierId') ?? '');
    const supplierName = suppliers.find((supplier) => supplier.id === supplierId)?.name ?? null;
    const reasonValue = String(data.get('reason') ?? 'PURCHASE');
    const reason = reasonValue === 'INITIAL_STOCK' || reasonValue === 'CUSTOMER_RETURN'
      ? reasonValue
      : 'PURCHASE';
    const nullable = (name: string) => {
      const value = String(data.get(name) ?? '').trim();
      return value || null;
    };

    setConfirmationError('');
    setSerialConflicts([]);

    if (product.trackingType === 'SERIAL') {
      setPreflightPending(true);
      try {
        const result = await preflightStockSerials({
          productId: product.id,
          serialNumbers: serials,
        });
        if (result.error) {
          setConfirmationError(message(result.error));
          return;
        }
        if (result.conflicts?.length) {
          setSerialConflicts(result.conflicts);
          return;
        }
      } catch {
        setConfirmationError(t('stock.serialCheckFailed'));
        return;
      } finally {
        setPreflightPending(false);
      }
    }

    confirmationDataRef.current = data;
    setConfirmationSubmitted(false);
    setConfirmation({
      productName: product.name,
      sku: product.sku,
      trackingType: product.trackingType,
      count,
      serials: product.trackingType === 'SERIAL' ? serials : [],
      supplierName,
      reason,
      unitCost,
      totalCost: unitCost * count,
      reference: nullable('reference'),
      note: nullable('note'),
      location: nullable('location'),
      warrantyDuration: nullable('warrantyDuration'),
      warrantyUnit: data.get('warrantyUnit') === 'DAYS' ? 'DAYS' : 'MONTHS',
      unitCondition: data.get('unitCondition') === 'REFURBISHED' ? 'REFURBISHED' : 'NEW',
    });
  }

  function confirmReceipt() {
    const data = confirmationDataRef.current;
    if (!data) return;
    setConfirmationSubmitted(true);
    startTransition(() => formAction(data));
  }

  function closeConfirmation() {
    if (pending) return;
    setConfirmation(null);
    setConfirmationSubmitted(false);
    confirmationDataRef.current = null;
  }

  const err = (k: string) => state.fieldErrors?.[k];
  const receiptSupplier = state.receipt?.supplierId
    ? suppliers.find((supplier) => supplier.id === state.receipt?.supplierId)?.name
    : null;
  const receiptReason = state.receipt
    ? t(state.receipt.reason === 'PURCHASE'
        ? 'stock.purchaseSupplier'
        : state.receipt.reason === 'INITIAL_STOCK'
          ? 'stock.openingBalance'
          : 'stock.customerReturn')
    : '';
  const receiptLabelHref = state.receipt
    ? state.labelReceiptId
      ? `/stock/labels?receipt=${encodeURIComponent(state.labelReceiptId)}`
      : `/stock/labels?product=${encodeURIComponent(state.receipt.productId)}`
    : '/stock/labels';
  const unitStatusLabel = (status: StockSerialConflict['status']) => {
    const keys = {
      IN_STOCK: 'stock.unitStatusInStock',
      RESERVED: 'stock.unitStatusReserved',
      SOLD: 'stock.unitStatusSold',
      RETURNED: 'stock.unitStatusReturned',
      DAMAGED: 'stock.unitStatusDamaged',
      LOST: 'stock.unitStatusLost',
      VOID: 'stock.unitStatusVoid',
    } as const;
    return t(keys[status]);
  };

  return (
    <form action={formAction} id={formId} onSubmit={reviewReceipt}>
      <input type="hidden" name="idempotencyKey" value={key} />

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(state.error)}
        </div>
      )}
      {confirmationError && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {confirmationError}
        </div>
      )}
      {serialConflicts.length > 0 && (
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3 sm:p-5"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSerialConflicts([]);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="stock-conflict-title"
              aria-describedby="stock-conflict-description"
              className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[3px] border border-rule bg-card shadow-xl"
            >
              <div className="border-b border-rule p-5">
                <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-out-wash text-[20px] font-semibold text-out" aria-hidden="true">
                  !
                </div>
                <h2 id="stock-conflict-title" className="text-[18px] font-semibold">
                  {t(serialConflicts.length === 1
                    ? 'stock.serialConflictTitle'
                    : 'stock.serialConflictsTitle', { count: serialConflicts.length })}
                </h2>
                <p id="stock-conflict-description" className="mt-1 text-[13px] text-graphite">
                  {t('stock.serialConflictsHelp')}
                </p>
              </div>
              <ul className="tnum max-h-64 space-y-1.5 overflow-y-auto overscroll-contain p-5 text-[13px]">
                {serialConflicts.map((conflict) => (
                  <li key={conflict.serialNo} className="flex items-center justify-between gap-4 rounded-[3px] bg-out-wash px-3 py-2">
                    <span className="break-all font-medium">{conflict.serialNo}</span>
                    <span className="shrink-0 text-out">{unitStatusLabel(conflict.status)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end border-t border-rule p-4">
                <Button type="button" onClick={() => setSerialConflicts([])} autoFocus>
                  {t('stock.reviewDeviceNumbers')}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      )}
      {confirmation && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (!pending && event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-busy={pending}
            aria-labelledby="stock-confirm-title"
            aria-describedby="stock-confirm-description"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card shadow-xl"
          >
            <div className="border-b border-rule p-5">
              <h2 id="stock-confirm-title" className="text-[18px] font-semibold">
                {t('stock.confirmReceiveTitle')}
              </h2>
              <p id="stock-confirm-description" className="mt-1 text-[13px] text-graphite">
                {t('stock.confirmReceiveHelp')}
              </p>
            </div>

            {pending && (
              <div className="mx-5 mt-5 flex items-center gap-3 rounded-[3px] border border-signal/20 bg-signal/5 px-3 py-2.5" role="status" aria-live="polite">
                <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-rule border-t-signal" aria-hidden="true" />
                <span><span className="block text-[13px] font-medium">{t('stock.receiving')}</span><span className="block text-[11px] text-graphite">{t('stock.receivingHelp')}</span></span>
              </div>
            )}
            {!pending && confirmationSubmitted && state.error && (
              <div className="mx-5 mt-5 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[12px] text-out" role="alert">
                {message(state.error)}
              </div>
            )}

            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="eyebrow">{t('common.product')}</dt>
                <dd className="mt-1 text-[15px] font-semibold">{confirmation.productName}</dd>
                <dd className="tnum mt-0.5 text-[12px] text-graphite">
                  {t('stock.productCode')}: {confirmation.sku}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.receivedQuantity')}</dt>
                <dd className="tnum mt-1 text-[15px] font-semibold">{confirmation.count}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.trackingMethod')}</dt>
                <dd className="mt-1 text-[14px]">
                  {t(confirmation.trackingType === 'SERIAL'
                    ? 'products.serialTracking'
                    : 'products.bulkTracking')}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('common.supplier')}</dt>
                <dd className="mt-1 text-[14px]">{confirmation.supplierName ?? t('common.notRecorded')}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.reason')}</dt>
                <dd className="mt-1 text-[14px]">
                  {t(confirmation.reason === 'PURCHASE'
                    ? 'stock.purchaseSupplier'
                    : confirmation.reason === 'INITIAL_STOCK'
                      ? 'stock.openingBalance'
                      : 'stock.customerReturn')}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.costPerUnitSummary')}</dt>
                <dd className="tnum mt-1 text-[14px]">{formatBDT(confirmation.unitCost)}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.totalReceivedCost')}</dt>
                <dd className="tnum mt-1 text-[15px] font-semibold">{formatBDT(confirmation.totalCost)}</dd>
              </div>
              {confirmation.trackingType === 'SERIAL' && (
                <div>
                  <dt className="eyebrow">{t('stock.unitCondition')}</dt>
                  <dd className="mt-1 text-[14px]">{confirmation.unitCondition === 'REFURBISHED' ? t('used.refurbished') : t('used.newStock')}</dd>
                </div>
              )}
              {confirmation.warrantyDuration && (
                <div>
                  <dt className="eyebrow">{t('stock.warrantyDuration')}</dt>
                  <dd className="tnum mt-1 text-[14px]">{confirmation.warrantyDuration} {confirmation.warrantyUnit === 'DAYS' ? (confirmation.warrantyDuration === '1' ? t('used.warrantyDay') : t('used.warrantyDays')) : (confirmation.warrantyDuration === '1' ? t('used.warrantyMonth') : t('used.warrantyMonths'))}</dd>
                </div>
              )}
              {confirmation.reference && (
                <div>
                  <dt className="eyebrow">{t('common.reference')}</dt>
                  <dd className="tnum mt-1 break-words text-[14px]">{confirmation.reference}</dd>
                </div>
              )}
              {confirmation.location && (
                <div>
                  <dt className="eyebrow">{t('stock.location')}</dt>
                  <dd className="mt-1 break-words text-[14px]">{confirmation.location}</dd>
                </div>
              )}
              {confirmation.note && (
                <div>
                  <dt className="eyebrow">{t('stock.receiptNote')}</dt>
                  <dd className="mt-1 break-words text-[14px]">{confirmation.note}</dd>
                </div>
              )}
              {confirmation.serials.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="eyebrow">{t('stock.deviceNumbers')}</dt>
                  <dd className="tnum mt-1 max-h-32 overflow-y-auto overscroll-contain rounded-[3px] border border-rule bg-plate/40 p-2 text-[12px]">
                    {confirmation.serials.map((serial) => <div key={serial}>{serial}</div>)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col-reverse gap-2 border-t border-rule p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={closeConfirmation} disabled={pending}>
                {t('stock.backToReceipt')}
              </Button>
              <Button type="button" onClick={confirmReceipt} disabled={pending}>
                {pending ? t('stock.receiving') : t('stock.yesReceive')}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {receiptOpen && state.receipt && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReceiptOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-receipt-title"
            aria-describedby="stock-receipt-description"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card shadow-xl"
          >
            <div className="border-b border-rule p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-ok-wash text-[20px] font-semibold text-ok" aria-hidden="true">
                ✓
              </div>
              <h2 id="stock-receipt-title" className="text-[18px] font-semibold">
                {t('stock.receiptTitle')}
              </h2>
              <p id="stock-receipt-description" className="mt-1 text-[13px] text-graphite">
                {t('stock.receiptHelp')}
              </p>
            </div>

            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="eyebrow">{t('common.product')}</dt>
                <dd className="mt-1 text-[15px] font-semibold">{state.receipt.productName}</dd>
                <dd className="tnum mt-0.5 text-[12px] text-graphite">
                  {t('stock.productCode')}: {state.receipt.sku}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.receivedQuantity')}</dt>
                <dd className="tnum mt-1 text-[15px] font-semibold">{state.receipt.count}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.trackingMethod')}</dt>
                <dd className="mt-1 text-[14px]">
                  {t(state.receipt.trackingType === 'SERIAL'
                    ? 'products.serialTracking'
                    : 'products.bulkTracking')}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('common.supplier')}</dt>
                <dd className="mt-1 text-[14px]">{receiptSupplier ?? t('common.notRecorded')}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.reason')}</dt>
                <dd className="mt-1 text-[14px]">{receiptReason}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.costPerUnitSummary')}</dt>
                <dd className="tnum mt-1 text-[14px]">{formatBDT(state.receipt.unitCost)}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('stock.totalReceivedCost')}</dt>
                <dd className="tnum mt-1 text-[15px] font-semibold">{formatBDT(state.receipt.totalCost)}</dd>
              </div>
              {state.receipt.reference && (
                <div>
                  <dt className="eyebrow">{t('common.reference')}</dt>
                  <dd className="tnum mt-1 break-words text-[14px]">{state.receipt.reference}</dd>
                </div>
              )}
              {state.receipt.location && (
                <div>
                  <dt className="eyebrow">{t('stock.location')}</dt>
                  <dd className="mt-1 break-words text-[14px]">{state.receipt.location}</dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col-reverse gap-2 border-t border-rule p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setReceiptOpen(false)}>
                {t('stock.receiveAnother')}
              </Button>
              <Link
                href={receiptLabelHref}
                className="inline-flex min-h-10 items-center justify-center rounded-[3px] border border-signal bg-signal px-4 text-[13px] font-medium text-white transition-colors hover:bg-signal/90"
              >
                {t('stock.printLabels')}
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">{t('stock.whatArrived')}</p>
        <div className="mb-4 max-w-md">
          <Field
            label={<HelpTerm description={t('term.productCodeHelp')}>{t('stock.scanProduct')}</HelpTerm>}
            hint={t('stock.scanOptional')}
          >
            <ScannerInput
              placeholder={t('stock.scanEnter')}
              onScan={(value) => {
                const normalized = value.toLowerCase();
                const match = products.find((item) => item.barcode?.toLowerCase() === normalized)
                  ?? products.find((item) => item.sku.toLowerCase() === normalized);
                if (!match) { setScanError('No active product matches that barcode or product code (SKU).'); return; }
                setProductId(match.id); setScanError(''); setSerialConflicts([]);
              }}
            />
          </Field>
          {scanError && <p className="mt-1 text-[12px] text-out">{scanError}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.product')} error={err('productId')}>
            <Select
              name="productId"
              required
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setSerialConflicts([]);
              }}
            >
              <option value="" disabled>
                {t('stock.chooseProduct')}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('common.supplier')}>
            <Select name="supplierId" defaultValue={initialSupplierId ?? ''}>
              <option value="">{t('common.notRecorded')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t('stock.costPerUnit')}
            error={err('unitCost')}
            hint={t('stock.costHelp')}
          >
            <MonoInput
              name="unitCost"
              inputMode="decimal"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="42000"
            />
          </Field>

          <Field label={t('stock.reason')}>
            <Select name="reason" defaultValue="PURCHASE">
              <option value="PURCHASE">{t('stock.purchaseSupplier')}</option>
              <option value="INITIAL_STOCK">{t('stock.openingBalance')}</option>
              <option value="CUSTOMER_RETURN">{t('stock.customerReturn')}</option>
            </Select>
          </Field>

          <Field label={t('common.reference')} hint={t('stock.referenceHint')}>
            <MonoInput name="reference" defaultValue={initialReference ?? ''} readOnly={lockInitialReference} placeholder="CHL-1001" />
          </Field>

          <Field label={t('stock.receiptNote')} hint={t('stock.receiptNoteHint')}>
            <Input name="note" />
          </Field>
        </div>
      </Card>

      {product && (
        <Card className="mb-4 p-5">
          {isSerial ? (
            <>
              <p className="eyebrow mb-1">{t('stock.deviceNumbers')}</p>
              <p className="mb-3 text-[12px] text-graphite">
                {t('stock.deviceListHelp')}
              </p>

              <div className="mb-4 max-w-md">
                <Field
                  label={<HelpTerm description={t('term.trackingHelp')}>{t('stock.scanDevice')}</HelpTerm>}
                  hint={t('stock.scanDeviceHint')}
                >
                  <ScannerInput
                    ref={serialScanRef}
                    value={serialScan}
                    onValueChange={setSerialScan}
                    onScan={appendScannedSerial}
                    placeholder={t('stock.scanDevice')}
                    autoComplete="off"
                  />
                </Field>
                {serialScanError && (
                  <p className="mt-1 text-[12px] text-out" role="alert">
                    {serialScanError}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-graphite">
                  {t('stock.imeiHint')}
                </p>
              </div>

              <Textarea
                name="serialNumbers"
                value={serialText}
                onChange={(e) => {
                  setSerialText(e.target.value);
                  setSerialScanError('');
                  setSerialConflicts([]);
                }}
                rows={6}
                className="tnum min-h-32"
                placeholder={'352099001761481\n352099001761482\n352099001761483'}
                required
              />

              <div className="mt-2 flex items-center gap-3 text-[12px]">
                <span className="tnum text-graphite">
                  {t('stock.uniqueUnits', {
                    count: uniqueSerialCount,
                    kind: t(uniqueSerialCount === 1 ? 'stock.unit' : 'stock.units'),
                  })}
                </span>
                {dupes.length > 0 && (
                  <span className="text-out">
                    {dupes.length} duplicate{dupes.length > 1 ? 's' : ''} in this list:{' '}
                    <span className="tnum">{[...new Set(dupes)].join(', ')}</span>
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={t('stock.unitCondition')}>
                  <Select name="unitCondition" defaultValue="NEW">
                    <option value="NEW">{t('used.newStock')}</option>
                    <option value="REFURBISHED">{t('used.refurbished')}</option>
                  </Select>
                </Field>
                <Field label={t('stock.warrantyDuration')} hint={t('stock.warrantyHint')}>
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                    <MonoInput name="warrantyDuration" type="number" min={0} max={warrantyUnit === 'DAYS' ? 3650 : 120} inputMode="numeric" defaultValue={12} />
                    <Select name="warrantyUnit" value={warrantyUnit} onChange={(event) => setWarrantyUnit(event.target.value as 'DAYS' | 'MONTHS')}>
                      <option value="DAYS">{t('used.warrantyDays')}</option>
                      <option value="MONTHS">{t('used.warrantyMonths')}</option>
                    </Select>
                  </div>
                </Field>
                <Field label={t('stock.location')}>
                  <Input name="location" placeholder="Shelf A1" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow mb-1">{t('common.quantity')}</p>
              <p className="mb-3 text-[12px] text-graphite">
                {t('stock.bulkHelp', { product: product.name })}
              </p>
              <div className="max-w-40">
                <Field label={t('stock.unitsReceived')} error={err('quantity')}>
                  <MonoInput
                    name="quantity"
                    inputMode="numeric"
                    required
                    min={1}
                    type="number"
                    placeholder="100"
                  />
                </Field>
              </div>
            </>
          )}
        </Card>
      )}

      <Button
        type="submit"
        disabled={pending || preflightPending || !product || (isSerial && (uniqueSerialCount === 0 || dupes.length > 0))}
      >
        {preflightPending
          ? t('stock.checkingDeviceNumbers')
          : pending
          ? t('stock.receiving')
          : isSerial && uniqueSerialCount > 0
            ? t('stock.receiveCount', {
                count: uniqueSerialCount,
                kind: t(uniqueSerialCount === 1 ? 'stock.unit' : 'stock.units'),
              })
            : t('stock.receiveTitle')}
      </Button>
    </form>
  );
}
