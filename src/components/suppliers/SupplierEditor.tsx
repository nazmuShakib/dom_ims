'use client';

import { useActionState, useEffect, useState } from 'react';
import { Pencil, RotateCcw, Trash2 } from 'lucide-react';

import { setSupplierActive, updateSupplier } from '@/actions/catalog';
import { Button, Field, Input } from '@/components/ui';
import type { Supplier } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export function SupplierEditor({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState(updateSupplier, {});
  const [statusState, statusAction, statusPending] = useActionState(setSupplierActive, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  useEffect(() => {
    if (statusState.ok) setConfirmingStatus(false);
  }, [statusState.ok]);

  useEffect(() => {
    if (!open && !confirmingStatus) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending && !statusPending) {
        setOpen(false);
        setConfirmingStatus(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmingStatus, open, pending, statusPending]);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('common.edit')}
          title={t('common.edit')}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[3px] border border-rule bg-card transition-colors hover:bg-plate"
        >
          <Pencil aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmingStatus(true)}
          aria-label={t(supplier.isActive ? 'catalog.remove' : 'catalog.restore')}
          title={t(supplier.isActive ? 'catalog.remove' : 'catalog.restore')}
          className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-[3px] border border-rule bg-card transition-colors ${supplier.isActive ? 'text-out hover:bg-out-wash' : 'text-ink hover:bg-plate'}`}
        >
          {supplier.isActive
            ? <Trash2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
            : <RotateCcw aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-supplier-${supplier.id}`}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id={`edit-supplier-${supplier.id}`} className="text-[16px] font-semibold">
              {t('suppliers.edit')}
            </h2>
            <p className="mt-1 text-[12px] text-graphite">
              {t('suppliers.editHelp')}
            </p>

            <form action={action} className="mt-5">
              <input type="hidden" name="id" value={supplier.id} />
              {state.error && (
                <p className="mb-3 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
                  {message(state.error)}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('common.name')} error={state.fieldErrors?.name}>
                  <Input name="name" required defaultValue={supplier.name} />
                </Field>
                <Field
                  label={t('customers.mobile')}
                  hint={t('customers.mobileHint')}
                  error={state.fieldErrors?.phone}
                >
                  <Input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01712345678"
                    defaultValue={supplier.phone ?? ''}
                  />
                </Field>
                <Field label={t('common.email')} error={state.fieldErrors?.email}>
                  <Input name="email" type="email" defaultValue={supplier.email ?? ''} />
                </Field>
                <Field label={t('common.address')} error={state.fieldErrors?.address}>
                  <Input name="address" defaultValue={supplier.address ?? ''} />
                </Field>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t('common.saving') : t('common.saveChanges')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmingStatus && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !statusPending) setConfirmingStatus(false);
          }}
        >
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">
              {t(supplier.isActive ? 'suppliers.confirmRemove' : 'suppliers.confirmRestore')}
            </h2>
            <p className="mt-2 text-[13px] text-graphite">
              {t(supplier.isActive ? 'suppliers.removeHelp' : 'suppliers.restoreHelp')}
            </p>
            <p className="mt-3 text-[14px] font-medium">{supplier.name}</p>
            <form action={statusAction} className="mt-5 flex justify-end gap-2">
              <input type="hidden" name="id" value={supplier.id} />
              <input type="hidden" name="active" value={supplier.isActive ? 'false' : 'true'} />
              <Button type="button" variant="ghost" onClick={() => setConfirmingStatus(false)} disabled={statusPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant={supplier.isActive ? 'danger' : 'primary'} disabled={statusPending}>
                {statusPending ? t('common.saving') : t(supplier.isActive ? 'catalog.remove' : 'catalog.restore')}
              </Button>
            </form>
            {statusState.error && (
              <p className="mt-3 text-[12px] text-out">{message(statusState.error)}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
