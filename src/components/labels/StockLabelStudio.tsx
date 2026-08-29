'use client';

import { useActionState, useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  recordLabelPrintAction,
  type LabelPrintState,
} from '@/actions/labels';
import { Barcode128 } from '@/components/labels/Barcode128';
import { LabelProductCombobox } from '@/components/labels/LabelProductCombobox';
import { ScannerInput } from '@/components/search/ScannerInput';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import {
  Button,
  Card,
  EmptyState,
  Field,
  HelpTerm,
  Input,
  Select,
  TableViewport,
} from '@/components/ui';
import type { Role, TrackingType, UnitStatus } from '@/domain/types';
import type { SearchResponse } from '@/lib/search';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';

export interface LabelProductOption {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  model: string | null;
  trackingType: TrackingType;
  brandName: string | null;
  quantityOnHand: number;
  isActive: boolean;
}

export interface LabelUnitOption {
  id: string;
  serialNo: string;
  status: UnitStatus;
  receivedAt: string;
}

function ProductLabel({
  product,
  serialNo,
}: {
  product: LabelProductOption;
  serialNo?: string;
}) {
  const barcodeValue = serialNo ?? product.barcode;
  if (!barcodeValue) return null;

  return (
    <article className="stock-label">
      <div className="stock-label-heading">
        <strong className="stock-label-name">{product.name}</strong>
      </div>
      <div className="stock-label-meta">
        <span className="tnum">SKU: {product.sku}</span>
      </div>
      <div className="stock-label-bars">
        <Barcode128 value={barcodeValue} />
      </div>
      <div className="stock-label-code tnum">
        {serialNo ? `S/N ${serialNo}` : barcodeValue}
      </div>
    </article>
  );
}

export function StockLabelStudio({
  products,
  product,
  units,
  initialUnitIds,
  initialCopies,
  role,
  resultVersion,
}: {
  products: LabelProductOption[];
  product: LabelProductOption | null;
  units: LabelUnitOption[];
  initialUnitIds: string[];
  initialCopies: number;
  role: Role;
  resultVersion: string;
}) {
  const router = useRouter();
  const { locale, t, message } = useI18n();
  const [selectedProductId, setSelectedProductId] = useState(product?.id ?? '');
  const [selected, setSelected] = useState(() => new Set(initialUnitIds));
  const [copies, setCopies] = useState<number | ''>(Math.max(1, initialCopies));
  const [layout, setLayout] = useState<'thermal' | 'a4'>('thermal');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'ALL'>(
    initialUnitIds.length > 0 ? 'ALL' : 'IN_STOCK',
  );
  const [scanError, setScanError] = useState('');
  const [searching, setSearching] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [refreshPending, startNavigation] = useTransition();
  const [printTransitionPending, startPrintTransition] = useTransition();
  const loading = navigating || refreshPending || searching;
  const [state, formAction, pending] = useActionState<LabelPrintState, FormData>(
    recordLabelPrintAction,
    {},
  );

  useEffect(() => {
    if (state.printNonce) window.print();
  }, [state.printNonce]);

  useEffect(() => {
    // The component key remounts the studio when the selected product, receipt,
    // or unit changes, so the state initializers above already apply new route
    // data. Do not reset label selections here: a successful server action also
    // refreshes resultVersion, and clearing serial selections at that point can
    // leave window.print() with an empty printable DOM.
    setNavigating(false);
  }, [resultVersion]);

  const visibleUnits = useMemo(
    () => units.filter((unit) => statusFilter === 'ALL' || unit.status === statusFilter),
    [statusFilter, units],
  );
  const selectedUnits = useMemo(
    () => units.filter((unit) => selected.has(unit.id)),
    [selected, units],
  );
  const copyCount = copies === '' ? 0 : copies;
  const missingProductBarcode = product?.trackingType === 'QUANTITY' && !product.barcode;
  const labelCount = product?.trackingType === 'SERIAL'
    ? selectedUnits.length * copyCount
    : product && !missingProductBarcode
      ? copyCount
      : 0;

  const labels = useMemo(() => {
    if (!product || labelCount === 0 || labelCount > 500) return [];
    if (product.trackingType === 'QUANTITY') {
      return Array.from({ length: copyCount }, (_, index) => ({
        key: `quantity-${index}`,
        serialNo: undefined,
      }));
    }
    return selectedUnits.flatMap((unit) =>
      Array.from({ length: copyCount }, (_, index) => ({
        key: `${unit.id}-${index}`,
        serialNo: unit.serialNo,
      })),
    );
  }, [copyCount, labelCount, product, selectedUnits]);

  function navigateToProduct(productId: string, unitId?: string) {
    setSelectedProductId(productId);
    setScanError('');
    setNavigating(true);
    const params = new URLSearchParams({ product: productId });
    if (unitId) params.set('unit', unitId);
    window.history.pushState(null, '', `/stock/labels?${params.toString()}`);
    startNavigation(() => {
      router.refresh();
    });
  }

  async function scan(value: string) {
    const normalized = value.trim().toLowerCase();
    const exactProduct = products.find(
      (item) =>
        item.sku.toLowerCase() === normalized ||
        item.barcode?.toLowerCase() === normalized,
    );
    if (exactProduct) {
      navigateToProduct(exactProduct.id);
      setScanError('');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
      const result = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Search failed.');
      if (result.units[0]) {
        navigateToProduct(result.units[0].productId, result.units[0].id);
        setScanError('');
        return;
      }
      if (result.products.length === 1) {
        navigateToProduct(result.products[0]!.id);
        setScanError('');
        return;
      }
      setScanError(
        result.products.length > 1
          ? 'More than one product matches. Choose the product manually.'
          : 'No product or unit matches that identifier.',
      );
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Could not search inventory.');
    } finally {
      setSearching(false);
    }
  }

  function toggleUnit(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitPrint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Calling the action through a transition keeps useActionState's pending
    // semantics without React's successful-form reset. That reset can otherwise
    // make the visible layout selector disagree with the controlled layout state.
    startPrintTransition(() => formAction(formData));
  }

  return (
    <div
      className="stock-label-print-root"
      data-layout={layout}
      aria-busy={loading}
    >
      <div className="label-screen-only">
        <Card className="mb-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={<HelpTerm description={t('term.trackingHelp')}>{t('labels.scan')}</HelpTerm>}
              hint={t('labels.scanHint')}
            >
              <ScannerInput
                placeholder={t('stock.scanEnter')}
                onScan={scan}
                onValueChange={() => setScanError('')}
                disabled={loading}
              />
            </Field>
            <Field label={t('common.product')}>
              <LabelProductCombobox
                products={products}
                value={selectedProductId}
                onChange={navigateToProduct}
                disabled={loading}
                placeholder={t('labels.productSearchPlaceholder')}
                emptyMessage={t('labels.noProductMatch')}
              />
            </Field>
          </div>
          {scanError && <p className="mt-2 text-[12px] text-out">{scanError}</p>}
        </Card>

        {loading ? (
          <Card>
            <LoadingScreen
              compact
              label={searching ? t('search.searching') : t('loading.productLabels')}
            />
          </Card>
        ) : !product ? (
          <Card>
            <EmptyState title={t('labels.chooseHelp')} />
          </Card>
        ) : (
          <form onSubmit={submitPrint}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="unitIds" value={JSON.stringify(selectedUnits.map((unit) => unit.id))} />
            <input type="hidden" name="layout" value={layout} />

            <Card className="mb-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[16px] font-semibold">{product.name}</p>
                  <p className="tnum mt-0.5 text-[12px] text-graphite">
                    {product.sku} · {product.trackingType === 'SERIAL' ? t('products.serialTracking') : t('products.bulkTracking')}
                    {product.brandName ? ` · ${product.brandName}` : ''}
                    {product.model ? ` · ${product.model}` : ''}
                  </p>
                </div>
                <p className="tnum text-[12px] text-graphite">
                  {t('labels.count', {
                    count: labelCount,
                    kind: t(labelCount === 1 ? 'labels.label' : 'labels.labels'),
                  })}
                </p>
              </div>

              {product.trackingType === 'SERIAL' ? (
                <div className="mt-5">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="w-52">
                      <Field label={t('labels.unitStatus')}>
                        <Select
                          value={statusFilter}
                          onChange={(event) => setStatusFilter(event.target.value as UnitStatus | 'ALL')}
                        >
                          <option value="IN_STOCK">{t('common.inStock')}</option>
                          {role !== 'STAFF' && <option value="ALL">{t('labels.allStatuses')}</option>}
                          {role !== 'STAFF' && [...new Set(units.map((unit) => unit.status))]
                            .filter((status) => status !== 'IN_STOCK')
                            .map((status) => (
                              <option key={status} value={status}>
                                {domainLabel(t, status)}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelected((current) => {
                          const next = new Set(current);
                          visibleUnits.forEach((unit) => next.add(unit.id));
                          return next;
                        })}
                      >
                        {t('labels.selectVisible')}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                        {t('common.clear')}
                      </Button>
                    </div>
                  </div>
                  <TableViewport className="max-h-64 border border-rule">
                    <table className="w-full border-collapse text-[12px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-rule text-left">
                          <th className="w-10 px-3 py-2"><span className="sr-only">{t('labels.select')}</span></th>
                          <th className="eyebrow px-3 py-2">{t('term.deviceNumber')}</th>
                          <th className="eyebrow px-3 py-2">{t('common.status')}</th>
                          <th className="eyebrow px-3 py-2">{t('labels.received')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleUnits.map((unit) => (
                          <tr key={unit.id} className="border-b border-rule-soft last:border-0">
                            <td className="px-3 py-2">
                              <input
                                aria-label={`Select ${unit.serialNo}`}
                                type="checkbox"
                                checked={selected.has(unit.id)}
                                onChange={() => toggleUnit(unit.id)}
                              />
                            </td>
                            <td className="tnum px-3 py-2">{unit.serialNo}</td>
                            <td className="px-3 py-2">{domainLabel(t, unit.status)}</td>
                            <td className="tnum px-3 py-2">
                              {new Intl.DateTimeFormat('en-BD', {
                                timeZone: 'Asia/Dhaka',
                                dateStyle: 'medium',
                              }).format(new Date(unit.receivedAt))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleUnits.length === 0 && (
                      <p className="p-5 text-center text-[12px] text-graphite">
                        {t('labels.noUnits')}
                      </p>
                    )}
                  </TableViewport>
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-graphite">
                  {t('labels.bulkHelp', {
                    identifier: t(product.barcode ? 'labels.productBarcode' : 'labels.productCode'),
                  })}
                </p>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Field
                  label={product.trackingType === 'SERIAL' ? t('labels.copies') : t('labels.number')}
                >
                  <Input
                    name="copies"
                    type="number"
                    min={1}
                    max={500}
                    required
                    aria-describedby="label-count-help"
                    value={copies}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === '') {
                        setCopies('');
                        return;
                      }
                      const requested = Number(next);
                      if (Number.isInteger(requested) && requested >= 1 && requested <= 500) {
                        setCopies(requested);
                      }
                    }}
                    onBlur={() => {
                      if (copies === '') setCopies(1);
                    }}
                  />
                  <p id="label-count-help" className="mt-1 text-[11px] text-graphite">
                    {t('labels.rangeHelp')}
                  </p>
                </Field>
                <Field label={t('labels.layout')}>
                  <Select value={layout} onChange={(event) => setLayout(event.target.value as 'thermal' | 'a4')}>
                    <option value="thermal">{t('labels.thermal')}</option>
                    <option value="a4">{t('labels.a4')}</option>
                  </Select>
                </Field>
                <div>
                  <span aria-hidden="true" className="eyebrow invisible mb-1.5 block">&nbsp;</span>
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={pending || printTransitionPending || labelCount === 0 || labelCount > 500}
                  >
                    {pending ? t('labels.preparing') : t('labels.printCount', {
                      count: labelCount || '',
                      kind: t(labelCount === 1 ? 'labels.label' : 'labels.labels'),
                    })}
                  </Button>
                </div>
              </div>
              {state.error && <p className="mt-3 text-[12px] text-out">{message(state.error)}</p>}
              {missingProductBarcode && (
                <p className="mt-3 text-[12px] text-out">
                  {t('labels.productBarcodeRequired')}
                </p>
              )}
              {labelCount > 500 && (
                <p className="mt-3 text-[12px] text-out">{t('labels.maxError')}</p>
              )}
              {role === 'STAFF' && (
                <p className="mt-3 text-[11px] text-graphite">
                  {t('labels.staffHelp')}
                </p>
              )}
              <p className="mt-1 text-[11px] text-graphite">
                {t('labels.dialogHelp')}
              </p>
            </Card>

            {labels.length > 0 && (
              <Card className="mb-4 overflow-auto p-4">
                <p className="eyebrow mb-3">{t('labels.preview')}</p>
                <div className="label-preview-grid">
                  {labels.slice(0, 12).map((label) => (
                    <ProductLabel
                      key={`preview-${label.key}`}
                      product={product}
                      serialNo={label.serialNo}
                    />
                  ))}
                </div>
                {labels.length > 12 && (
                  <p className="mt-3 text-[11px] text-graphite">
                    {t('labels.previewCount', { count: labels.length })}
                  </p>
                )}
              </Card>
            )}
          </form>
        )}
      </div>

      {product && labels.length > 0 && (
        <div className="label-print-area" aria-hidden="true">
          <div className="label-print-grid">
            {labels.map((label) => (
              <ProductLabel
                key={`print-${label.key}`}
                product={product}
                serialNo={label.serialNo}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
