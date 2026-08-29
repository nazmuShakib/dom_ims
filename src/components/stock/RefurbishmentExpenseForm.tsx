'use client';

import { useActionState } from 'react';
import { addRefurbishmentExpenseAction } from '@/actions/used-devices';
import { Button, Field, Input, MonoInput } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function RefurbishmentExpenseForm({ unitId }: { unitId: string }) {
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState(addRefurbishmentExpenseAction, {});
  return (
    <details className="mt-2 w-full rounded-[3px] border border-rule bg-card">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium">{t('used.addRefurbishmentCost')}</summary>
      <form action={action} className="grid gap-2 border-t border-rule p-2.5 sm:grid-cols-[1fr_8rem_auto]">
        <input type="hidden" name="unitId" value={unitId} />
        <Field label={t('common.description')}><Input name="description" required maxLength={500} /></Field>
        <Field label={t('common.cost')}><MonoInput name="amount" required inputMode="decimal" /></Field>
        <Button className="self-end" type="submit" disabled={pending}>{pending ? t('common.saving') : t('common.add')}</Button>
        {(state.error || state.ok) && <p className={`text-[11px] sm:col-span-3 ${state.error ? 'text-out' : 'text-ok'}`}>{message(state.error ?? state.ok ?? '')}</p>}
      </form>
    </details>
  );
}
