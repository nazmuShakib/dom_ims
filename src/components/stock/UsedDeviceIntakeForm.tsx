'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';

import { acceptUsedDeviceAction, saveTradeInDraftAction, type UsedDeviceActionState } from '@/actions/used-devices';
import { Button, Card, Field, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBDT, parseBDT, toTaka } from '@/lib/money';
import { isBangladeshMobile } from '@/lib/phone';
import { usedDeviceInspectionGroups as inspectionGroups } from '@/lib/used-device-inspection';
import type { TradeInCartDraft } from '@/domain/types';

interface ProductOption { id: string; sku: string; name: string }

interface IntakeReview {
  product: string;
  serial: string;
  grade: string;
  batteryHealth: string;
  inspection: Record<string, string>;
  knownDefects: string;
  includedAccessories: string;
  acquisition: number;
  asking: number;
  acquisitionType: string;
  sellerName: string;
  sellerPhone: string;
  identificationType: string;
  identificationNumber: string;
  warrantyDuration: string;
  warrantyUnit: string;
  location: string;
  reference: string;
  note: string;
}

export function UsedDeviceIntakeForm({
  products,
  tradeInCartId,
  initialTradeInDraft,
}: {
  products: ProductOption[];
  tradeInCartId?: string;
  initialTradeInDraft?: TradeInCartDraft | null;
}) {
  const { t, message } = useI18n();
  const submitAction = tradeInCartId ? saveTradeInDraftAction : acceptUsedDeviceAction;
  const [state, action, pending] = useActionState<UsedDeviceActionState, FormData>(submitAction, {});
  const [key, setKey] = useState('');
  const [review, setReview] = useState<IntakeReview | null>(null);
  const [showError, setShowError] = useState(false);
  const [batteryHealth, setBatteryHealth] = useState(
    initialTradeInDraft?.batteryHealth == null ? '' : String(initialTradeInDraft.batteryHealth),
  );
  const [warrantyUnit, setWarrantyUnit] = useState<'DAYS' | 'MONTHS'>(
    initialTradeInDraft?.warrantyDays != null ? 'DAYS' : 'MONTHS',
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [clearedServerErrors, setClearedServerErrors] = useState<Set<string>>(new Set());
  const dataRef = useRef<FormData | null>(null);

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.receipt) {
      setKey(crypto.randomUUID());
      setBatteryHealth('');
    }
    setClearedServerErrors(new Set());
    if (state.error && !state.fieldErrors) setShowError(true);
  }, [state.error, state.fieldErrors, state.receipt]);

  const errors = Object.fromEntries(Object.entries({
    ...Object.fromEntries(Object.entries(state.fieldErrors ?? {}).filter(([name]) => !clearedServerErrors.has(name))),
    ...clientErrors,
  }).map(([name, value]) => [name, message(value)]));

  function clearFieldError(name: string) {
    setClientErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setClearedServerErrors((current) => new Set(current).add(name));
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = products.find((item) => item.id === data.get('productId'));
    const nextErrors: Record<string, string> = {};
    const required = (name: string) => {
      if (!String(data.get(name) ?? '').trim()) nextErrors[name] = t('used.required');
    };
    required('productId');
    required('serialNo');
    required('grade');
    required('acquisitionType');
    required('acquisitionValue');
    required('sellerName');
    required('sellerPhone');
    required('askingPrice');
    if (!isBangladeshMobile(String(data.get('sellerPhone') ?? ''))) {
      nextErrors.sellerPhone = t('used.validPhoneRequired');
    }
    if (data.get('ownershipConfirmed') !== 'on') nextErrors.ownershipConfirmed = t('used.ownershipRequired');
    const battery = String(data.get('batteryHealth') ?? '').trim();
    if (battery && (!Number.isInteger(Number(battery)) || Number(battery) < 0 || Number(battery) > 100)) {
      nextErrors.batteryHealth = t('used.batteryHealthHelp');
    }
    const warranty = String(data.get('warrantyDuration') ?? '').trim();
    const selectedWarrantyUnit = String(data.get('warrantyUnit') ?? 'MONTHS');
    if (warranty && (
      !Number.isInteger(Number(warranty))
      || Number(warranty) < 0
      || Number(warranty) > (selectedWarrantyUnit === 'DAYS' ? 3650 : 120)
    )) nextErrors.warrantyDuration = t('used.validWarrantyRequired');
    const inspection = Object.fromEntries(inspectionGroups.flatMap((group) => group.items.map(([keyName]) => [
      keyName,
      String(data.get(`inspection.${keyName}`) ?? 'NOT_TESTED'),
    ])));
    if (inspection.imeiMatches !== 'WORKING') {
      nextErrors['inspectionResults.imeiMatches'] = t('used.imeiMustMatch');
    }
    if (inspection.activationLockClear !== 'WORKING') {
      nextErrors['inspectionResults.activationLockClear'] = t('used.activationLockMustClear');
    }
    const knownDefects = String(data.get('knownDefects') ?? '').trim();
    if (Object.values(inspection).includes('DEFECTIVE') && !knownDefects) {
      nextErrors.knownDefects = t('used.defectDescriptionRequired');
    }
    const selectedGrade = String(data.get('grade') ?? '');
    if ((selectedGrade === 'GRADE_C' || selectedGrade === 'REFURBISHED') && !knownDefects) {
      nextErrors.knownDefects = t('used.gradeDefectDescriptionRequired');
    }
    let acquisition: number | null = null;
    let asking: number | null = null;
    try {
      acquisition = parseBDT(String(data.get('acquisitionValue') ?? ''));
      if (acquisition < 0) nextErrors.acquisitionValue = t('used.validMoneyRequired');
    } catch {
      nextErrors.acquisitionValue = t('used.validMoneyRequired');
    }
    const askingText = String(data.get('askingPrice') ?? '').trim();
    if (askingText) {
      try {
        asking = parseBDT(askingText);
        if (asking < 0) nextErrors.askingPrice = t('used.validMoneyRequired');
      } catch {
        nextErrors.askingPrice = t('used.validMoneyRequired');
      }
    }
    if (Object.keys(nextErrors).length || acquisition === null || asking === null) {
      setClientErrors(nextErrors);
      return;
    }
    setClientErrors({});
    dataRef.current = data;
    setReview({
        product: product ? `${product.name} (${product.sku})` : t('stock.chooseProduct'),
        serial: String(data.get('serialNo') ?? ''),
        grade: selectedGrade,
        batteryHealth: battery,
        inspection,
        knownDefects,
        includedAccessories: String(data.get('includedAccessories') ?? '').trim(),
        acquisition,
        asking,
        acquisitionType: String(data.get('acquisitionType') ?? ''),
        sellerName: String(data.get('sellerName') ?? '').trim(),
        sellerPhone: String(data.get('sellerPhone') ?? '').trim(),
        identificationType: String(data.get('identificationType') ?? '').trim(),
        identificationNumber: String(data.get('identificationNumber') ?? '').trim(),
        warrantyDuration: warranty,
        warrantyUnit: selectedWarrantyUnit,
        location: String(data.get('location') ?? '').trim(),
        reference: String(data.get('reference') ?? '').trim(),
        note: String(data.get('note') ?? '').trim(),
    });
  }

  function confirm() {
    const data = dataRef.current;
    if (!data) return;
    setReview(null);
    dataRef.current = null;
    startTransition(() => action(data));
  }

  const resultOptions = [
    ['WORKING', 'used.working'], ['DEFECTIVE', 'used.defective'],
    ['NOT_TESTED', 'used.notTested'], ['NOT_APPLICABLE', 'used.notApplicable'],
  ] as const;

  return (
    <>
      <form action={action} onSubmit={prepare} noValidate className="space-y-5">
        <input type="hidden" name="idempotencyKey" value={key} />
        {tradeInCartId && <input type="hidden" name="cartId" value={tradeInCartId} />}

        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">{t('used.device')}</h2>
          <p className="mt-1 text-[12px] text-graphite">{t('used.deviceHelp')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('common.product')} error={errors.productId}>
              <Select name="productId" required defaultValue={initialTradeInDraft?.productId ?? ''} onChange={() => clearFieldError('productId')}>
                <option value="" disabled>{t('stock.chooseProduct')}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
              </Select>
            </Field>
            <Field label={t('used.deviceNumber')} error={errors.serialNo}>
              <MonoInput name="serialNo" required maxLength={120} autoComplete="off" defaultValue={initialTradeInDraft?.serialNo ?? ''} placeholder={t('used.deviceNumberPlaceholder')} onChange={() => clearFieldError('serialNo')} />
            </Field>
            <Field label={t('used.grade')} error={errors.grade}>
              <Select name="grade" required defaultValue={initialTradeInDraft?.grade ?? ''} onChange={() => clearFieldError('grade')}>
                <option value="" disabled>{t('used.chooseGrade')}</option>
                <option value="GRADE_A">{t('used.gradeA')}</option>
                <option value="GRADE_B">{t('used.gradeB')}</option>
                <option value="GRADE_C">{t('used.gradeC')}</option>
                <option value="REFURBISHED">{t('used.refurbished')}</option>
              </Select>
            </Field>
            <Field label={t('used.batteryHealth')} hint={t('used.batteryHealthHelp')} error={errors.batteryHealth}>
              <div className="flex">
                <button type="button" aria-label="Decrease battery health" className="flex h-9 w-10 items-center justify-center rounded-l-[3px] border border-r-0 border-rule bg-card hover:bg-plate" onClick={() => { setBatteryHealth(String(Math.max(0, Number(batteryHealth || 0) - 1))); clearFieldError('batteryHealth'); }}><Minus size={16} /></button>
                <MonoInput name="batteryHealth" type="number" min={0} max={100} inputMode="numeric" value={batteryHealth} placeholder={t('used.batteryHealthPlaceholder')} onChange={(event) => { setBatteryHealth(event.target.value); clearFieldError('batteryHealth'); }} className="rounded-none text-center" />
                <button type="button" aria-label="Increase battery health" className="flex h-9 w-10 items-center justify-center rounded-r-[3px] border border-l-0 border-rule bg-card hover:bg-plate" onClick={() => { setBatteryHealth(String(Math.min(100, Number(batteryHealth || 0) + 1))); clearFieldError('batteryHealth'); }}><Plus size={16} /></button>
              </div>
            </Field>
          </div>
          <details className="mt-4 rounded-[3px] border border-rule bg-plate/25">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">{t('used.gradeGuide')}</summary>
            <dl className="grid gap-3 border-t border-rule p-4 text-[12px] sm:grid-cols-2">
              <div><dt className="font-semibold">{t('used.gradeA')}</dt><dd className="text-graphite">{t('used.gradeADefinition')}</dd></div>
              <div><dt className="font-semibold">{t('used.gradeB')}</dt><dd className="text-graphite">{t('used.gradeBDefinition')}</dd></div>
              <div><dt className="font-semibold">{t('used.gradeC')}</dt><dd className="text-graphite">{t('used.gradeCDefinition')}</dd></div>
              <div><dt className="font-semibold">{t('used.refurbished')}</dt><dd className="text-graphite">{t('used.refurbishedDefinition')}</dd></div>
            </dl>
          </details>
        </Card>

        <Card className="p-5">
          <details open className="rounded-[3px] border border-rule bg-plate/25">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">{t('used.inspectionChecklist')}</summary>
            <div className="border-t border-rule p-4">
              <p className="text-[12px] text-graphite">{t('used.inspectionHelp')}</p>
              <div className="mt-4 space-y-5">
                {inspectionGroups.map((group) => (
                  <section key={group.title}>
                    <h3 className="eyebrow mb-2">{t(group.title)}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map(([keyName, label]) => (
                        <Field key={keyName} label={t(label)} error={errors[`inspectionResults.${keyName}`]}>
                          <Select name={`inspection.${keyName}`} defaultValue={initialTradeInDraft?.inspectionResults[keyName] ?? 'NOT_TESTED'} onChange={() => clearFieldError(`inspectionResults.${keyName}`)}>
                            {resultOptions.map(([value, option]) => <option key={value} value={value}>{t(option)}</option>)}
                          </Select>
                        </Field>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </details>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={t('used.knownDefects')} error={errors.knownDefects}><Textarea name="knownDefects" rows={3} maxLength={2000} defaultValue={initialTradeInDraft?.knownDefects ?? ''} placeholder={t('used.knownDefectsPlaceholder')} onChange={() => clearFieldError('knownDefects')} /></Field>
            <Field label={t('used.accessories')}><Textarea name="includedAccessories" rows={3} maxLength={1000} defaultValue={initialTradeInDraft?.includedAccessories ?? ''} placeholder={t('used.accessoriesPlaceholder')} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">{t('used.sellerAcquisition')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('used.acquisitionType')} error={errors.acquisitionType}>
              <input type="hidden" name="acquisitionType" value={tradeInCartId ? 'TRADE_IN' : 'DIRECT_PURCHASE'} />
              <div className="flex h-9 items-center rounded-[3px] border border-rule bg-plate/35 px-3 text-[13px]">
                {tradeInCartId ? t('used.tradeIn') : t('used.directPurchase')}
              </div>
            </Field>
            <Field label={t('used.acquisitionValue')} error={errors.acquisitionValue}><MonoInput name="acquisitionValue" inputMode="decimal" required defaultValue={initialTradeInDraft ? String(toTaka(initialTradeInDraft.acquisitionValue)) : ''} placeholder={t('used.acquisitionValuePlaceholder')} onChange={() => clearFieldError('acquisitionValue')} /></Field>
            <Field label={t('used.sellerName')} error={errors.sellerName}><Input name="sellerName" required maxLength={150} defaultValue={initialTradeInDraft?.sellerName ?? ''} placeholder={t('used.sellerNamePlaceholder')} onChange={() => clearFieldError('sellerName')} /></Field>
            <Field label={t('used.sellerPhone')} error={errors.sellerPhone}><MonoInput name="sellerPhone" type="tel" inputMode="tel" required defaultValue={initialTradeInDraft?.sellerPhone ?? ''} placeholder="01712345678" onChange={() => clearFieldError('sellerPhone')} /></Field>
            <Field label={t('used.identificationType')}>
              <Select name="identificationType" defaultValue={initialTradeInDraft?.identificationType ?? ''}>
                <option value="">{t('used.chooseIdentificationType')}</option>
                <option value="National Identification Number">{t('used.nationalIdentification')}</option>
                <option value="Passport">{t('used.passport')}</option>
                <option value="Birth Certificate Number">{t('used.birthCertificate')}</option>
              </Select>
            </Field>
            <Field label={t('used.identificationNumber')}><Input name="identificationNumber" maxLength={150} defaultValue={initialTradeInDraft?.identificationNumber ?? ''} placeholder={t('used.identificationNumberPlaceholder')} /></Field>
            <Field label={t('used.askingPrice')} error={errors.askingPrice}><MonoInput name="askingPrice" inputMode="decimal" required defaultValue={initialTradeInDraft ? String(toTaka(initialTradeInDraft.askingPrice)) : ''} placeholder={t('used.askingPricePlaceholder')} onChange={() => clearFieldError('askingPrice')} /></Field>
            <Field label={t('used.warrantyDuration')} error={errors.warrantyDuration ?? errors.warrantyDays ?? errors.warrantyMonths}>
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <MonoInput name="warrantyDuration" type="number" min={0} max={warrantyUnit === 'DAYS' ? 3650 : 120} inputMode="numeric" defaultValue={initialTradeInDraft?.warrantyDays ?? initialTradeInDraft?.warrantyMonths ?? ''} placeholder={t('used.warrantyPlaceholder')} onChange={() => clearFieldError('warrantyDuration')} />
                <Select name="warrantyUnit" value={warrantyUnit} onChange={(event) => { setWarrantyUnit(event.target.value as 'DAYS' | 'MONTHS'); clearFieldError('warrantyDuration'); }}>
                  <option value="DAYS">{t('used.warrantyDays')}</option>
                  <option value="MONTHS">{t('used.warrantyMonths')}</option>
                </Select>
              </div>
            </Field>
            <Field label={t('common.location')}><Input name="location" maxLength={100} defaultValue={initialTradeInDraft?.location ?? ''} placeholder={t('used.locationPlaceholder')} /></Field>
            <Field label={t('common.reference')}><Input name="reference" maxLength={100} defaultValue={initialTradeInDraft?.reference ?? ''} placeholder={t('used.referencePlaceholder')} /></Field>
            <Field label={t('common.note')}><Textarea name="note" rows={3} maxLength={1000} defaultValue={initialTradeInDraft?.note ?? ''} placeholder={t('used.notePlaceholder')} /></Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-[12px]">
            <input className="mt-0.5" type="checkbox" name="ownershipConfirmed" required defaultChecked={Boolean(initialTradeInDraft)} onChange={() => clearFieldError('ownershipConfirmed')} />
            <span>{t('used.ownershipDeclaration')}</span>
          </label>
          {errors.ownershipConfirmed && <p className="mt-1 text-[12px] text-out">{errors.ownershipConfirmed}</p>}
          <Button className="mt-5" type="submit" disabled={pending}>{pending ? t('common.saving') : tradeInCartId ? t('used.reviewTradeIn') : t('used.reviewAcceptance')}</Button>
        </Card>
      </form>

      {review && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3" onMouseDown={(event) => event.target === event.currentTarget && setReview(null)}>
          <div role="alertdialog" aria-modal="true" className="flex max-h-[92dvh] w-full max-w-5xl flex-col rounded-[3px] border border-rule bg-card shadow-xl">
            <div className="shrink-0 border-b border-rule p-4 sm:p-5"><h2 className="text-[18px] font-semibold">{tradeInCartId ? t('used.confirmTradeInTitle') : t('used.confirmTitle')}</h2><p className="mt-1 text-[12px] text-graphite">{tradeInCartId ? t('used.confirmTradeInHelp') : t('used.confirmHelp')}</p></div>
            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
              <section>
                <h3 className="text-[15px] font-semibold">{t('used.device')}</h3>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2"><dt className="eyebrow">{t('common.product')}</dt><dd className="mt-1 font-medium">{review.product}</dd></div>
                  <div><dt className="eyebrow">{t('used.deviceNumber')}</dt><dd className="tnum mt-1">{review.serial}</dd></div>
                  <div><dt className="eyebrow">{t('used.grade')}</dt><dd className="mt-1">{review.grade === 'GRADE_A' ? t('used.gradeA') : review.grade === 'GRADE_B' ? t('used.gradeB') : review.grade === 'GRADE_C' ? t('used.gradeC') : t('used.refurbished')}</dd></div>
                  <div><dt className="eyebrow">{t('used.batteryHealth')}</dt><dd className="tnum mt-1">{review.batteryHealth ? `${review.batteryHealth}%` : t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('used.knownDefects')}</dt><dd className="mt-1 whitespace-pre-wrap">{review.knownDefects || t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('used.accessories')}</dt><dd className="mt-1 whitespace-pre-wrap">{review.includedAccessories || t('common.notRecorded')}</dd></div>
                </dl>
              </section>

              <section className="mt-6 border-t border-rule pt-5">
                <h3 className="text-[15px] font-semibold">{t('used.inspectionChecklist')}</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {inspectionGroups.map((group) => (
                    <div key={group.title} className="rounded-[3px] border border-rule bg-plate/25 p-3">
                      <h4 className="eyebrow mb-2">{t(group.title)}</h4>
                      <dl className="space-y-1.5 text-[12px]">
                        {group.items.map(([keyName, label]) => {
                          const value = review.inspection[keyName];
                          const result = value === 'WORKING' ? t('used.working') : value === 'DEFECTIVE' ? t('used.defective') : value === 'NOT_APPLICABLE' ? t('used.notApplicable') : t('used.notTested');
                          return <div key={keyName} className="flex items-start justify-between gap-3"><dt>{t(label)}</dt><dd className={`shrink-0 font-medium ${value === 'DEFECTIVE' ? 'text-out' : value === 'WORKING' ? 'text-ok' : 'text-graphite'}`}>{result}</dd></div>;
                        })}
                      </dl>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-6 border-t border-rule pt-5">
                <h3 className="text-[15px] font-semibold">{t('used.sellerAcquisition')}</h3>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="eyebrow">{t('used.acquisitionType')}</dt><dd className="mt-1">{review.acquisitionType === 'TRADE_IN' ? t('used.tradeIn') : t('used.directPurchase')}</dd></div>
                  <div><dt className="eyebrow">{t('used.acquisitionValue')}</dt><dd className="tnum mt-1">{formatBDT(review.acquisition)}</dd></div>
                  <div><dt className="eyebrow">{t('used.sellerName')}</dt><dd className="mt-1">{review.sellerName}</dd></div>
                  <div><dt className="eyebrow">{t('used.sellerPhone')}</dt><dd className="tnum mt-1">{review.sellerPhone}</dd></div>
                  <div><dt className="eyebrow">{t('used.identificationType')}</dt><dd className="mt-1">{review.identificationType === 'National Identification Number' ? t('used.nationalIdentification') : review.identificationType === 'Passport' ? t('used.passport') : review.identificationType === 'Birth Certificate Number' ? t('used.birthCertificate') : t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('used.identificationNumber')}</dt><dd className="tnum mt-1">{review.identificationNumber || t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('used.askingPrice')}</dt><dd className="tnum mt-1">{formatBDT(review.asking)}</dd></div>
                  <div><dt className="eyebrow">{t('used.warrantyDuration')}</dt><dd className="tnum mt-1">{review.warrantyDuration ? `${review.warrantyDuration} ${review.warrantyUnit === 'DAYS' ? (review.warrantyDuration === '1' ? t('used.warrantyDay') : t('used.warrantyDays')) : (review.warrantyDuration === '1' ? t('used.warrantyMonth') : t('used.warrantyMonths'))}` : t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('common.location')}</dt><dd className="mt-1">{review.location || t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('common.reference')}</dt><dd className="mt-1">{review.reference || t('common.notRecorded')}</dd></div>
                  <div className="sm:col-span-2"><dt className="eyebrow">{t('common.note')}</dt><dd className="mt-1 whitespace-pre-wrap">{review.note || t('common.notRecorded')}</dd></div>
                  <div className="sm:col-span-2"><dt className="eyebrow">{t('used.ownershipConfirmation')}</dt><dd className="mt-1 text-ok">{t('common.yes')}</dd></div>
                </dl>
              </section>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-rule p-4"><Button type="button" variant="ghost" onClick={() => setReview(null)}>{t('common.cancel')}</Button><Button type="button" onClick={confirm}>{tradeInCartId ? t('used.saveToCheckout') : t('used.acceptIntoStock')}</Button></div>
          </div>
        </div>, document.body,
      )}

      {state.receipt && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl">
            <h2 className="text-[18px] font-semibold">{t('used.acceptedTitle')}</h2>
            <p className="mt-2 text-[13px] text-graphite">{message(state.ok ?? '')}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><a href="/stock/used-intake"><Button variant="ghost">{t('used.receiveAnother')}</Button></a><Link href={`/products/${state.receipt.productId}`}><Button variant="ghost">{t('used.viewProduct')}</Button></Link><Link href={`/stock/labels?product=${state.receipt.productId}&unit=${state.receipt.unitId}`}><Button>{t('nav.printLabels')}</Button></Link></div>
          </div>
        </div>, document.body,
      )}

      {showError && !state.receipt && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3" onMouseDown={(event) => event.target === event.currentTarget && setShowError(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl"><h2 className="text-[17px] font-semibold text-out">{t('common.error')}</h2><p className="mt-2 text-[13px] text-graphite">{message(state.error ?? t('used.invalidMoney'))}</p><div className="mt-5 flex justify-end"><Button type="button" onClick={() => setShowError(false)}>{t('common.close')}</Button></div></div>
        </div>, document.body,
      )}
    </>
  );
}
