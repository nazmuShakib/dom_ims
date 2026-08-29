'use client';

import { useActionState, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { updateUsedDeviceAction } from '@/actions/used-devices';
import { Button, Field, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ProductUnitDTO } from '@/lib/dto';
import { toTaka } from '@/lib/money';

export function UsedDeviceDetailsForm({ unit }: { unit: ProductUnitDTO }) {
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState(updateUsedDeviceAction, {});
  const [batteryHealth, setBatteryHealth] = useState(unit.batteryHealth === null ? '' : String(unit.batteryHealth));
  const warrantyUnit = unit.warrantyDays != null ? 'DAYS' : 'MONTHS';
  const warrantyDuration = unit.warrantyDays ?? unit.warrantyMonths ?? '';
  const effectiveAskingPrice = unit.askingPrice
    ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice ?? null : null);
  return (
    <details className="mt-2 w-full rounded-[3px] border border-rule bg-card">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium">{t('used.editDetails')}</summary>
      <form action={action} className="grid gap-2 border-t border-rule p-2.5 sm:grid-cols-2">
        <input type="hidden" name="unitId" value={unit.id} />
        <Field label={t('used.grade')}><Select name="grade" defaultValue={unit.usedGrade ?? 'GRADE_B'}><option value="GRADE_A">{t('used.gradeA')}</option><option value="GRADE_B">{t('used.gradeB')}</option><option value="GRADE_C">{t('used.gradeC')}</option><option value="REFURBISHED">{t('used.refurbished')}</option></Select></Field>
        <Field label={t('used.askingPrice')} error={state.fieldErrors?.askingPrice ? message(state.fieldErrors.askingPrice) : undefined}><MonoInput name="askingPrice" required inputMode="decimal" defaultValue={effectiveAskingPrice === null ? '' : toTaka(effectiveAskingPrice)} placeholder={t('used.askingPricePlaceholder')} /></Field>
        <Field label={t('used.batteryHealth')} error={state.fieldErrors?.batteryHealth ? message(state.fieldErrors.batteryHealth) : undefined}>
          <div className="flex">
            <button type="button" aria-label="Decrease battery health" className="flex h-9 w-10 items-center justify-center rounded-l-[3px] border border-r-0 border-rule bg-card hover:bg-plate" onClick={() => setBatteryHealth(String(Math.max(0, Number(batteryHealth || 0) - 1)))}><Minus size={16} /></button>
            <MonoInput name="batteryHealth" type="number" min={0} max={100} value={batteryHealth} placeholder={t('used.batteryHealthPlaceholder')} onChange={(event) => setBatteryHealth(event.target.value)} className="rounded-none text-center" />
            <button type="button" aria-label="Increase battery health" className="flex h-9 w-10 items-center justify-center rounded-r-[3px] border border-l-0 border-rule bg-card hover:bg-plate" onClick={() => setBatteryHealth(String(Math.min(100, Number(batteryHealth || 0) + 1)))}><Plus size={16} /></button>
          </div>
        </Field>
        <Field label={t('used.warrantyDuration')} error={state.fieldErrors?.warrantyDays || state.fieldErrors?.warrantyMonths ? message(state.fieldErrors.warrantyDays ?? state.fieldErrors.warrantyMonths ?? '') : undefined}>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <MonoInput name="warrantyDuration" type="number" min={0} max={3650} defaultValue={warrantyDuration} placeholder={t('used.warrantyPlaceholder')} />
            <Select name="warrantyUnit" defaultValue={warrantyUnit}><option value="DAYS">{t('used.warrantyDays')}</option><option value="MONTHS">{t('used.warrantyMonths')}</option></Select>
          </div>
        </Field>
        <Field label={t('used.knownDefects')} error={state.fieldErrors?.knownDefects ? message(state.fieldErrors.knownDefects) : undefined}><Textarea name="knownDefects" defaultValue={unit.knownDefects ?? ''} rows={2} placeholder={t('used.knownDefectsPlaceholder')} /></Field>
        <Field label={t('used.accessories')}><Textarea name="includedAccessories" defaultValue={unit.includedAccessories ?? ''} rows={2} placeholder={t('used.accessoriesPlaceholder')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('common.saveChanges')}</Button>{(state.error || state.ok) && <p className={`mt-2 text-[11px] ${state.error ? 'text-out' : 'text-ok'}`}>{message(state.error ?? state.ok ?? '')}</p>}</div>
      </form>
    </details>
  );
}
