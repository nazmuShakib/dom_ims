'use client';

import { useActionState, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  resetUserPasswordAction,
  updateUserPhoneAction,
  type UserActionState,
} from '@/actions/users';
import { Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PasswordInput } from '@/components/auth/PasswordInput';

export function UserPhoneEditor({ userId, phone }: { userId: string; phone: string | null }) {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    updateUserPhoneAction,
    {},
  );
  const { t, message } = useI18n();
  return (
    <form action={action} className="min-w-48">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-2">
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone ?? ''}
          placeholder="01712345678"
          aria-label={t('customers.mobile')}
          required
        />
        <Button type="submit" variant="ghost" disabled={pending}>{t('common.save')}</Button>
      </div>
      {(state.error || state.fieldErrors?.phone || state.ok) && (
        <p className={`mt-1 text-[10px] ${state.error || state.fieldErrors?.phone ? 'text-out' : 'text-ok'}`}>
          {message((state.error ?? state.fieldErrors?.phone ?? state.ok)!)}
        </p>
      )}
    </form>
  );
}

export function AdminPasswordReset({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    resetUserPasswordAction,
    {},
  );
  const { t, message } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  useEffect(() => {
    if (!state.ok) return;
    const timer = window.setTimeout(() => setOpen(false), 1200);
    return () => window.clearTimeout(timer);
  }, [state.ok]);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t('users.resetPassword')}
      </Button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="reset-password-title" className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl">
            <h2 id="reset-password-title" className="text-[17px] font-semibold">
              {t('users.resetPasswordFor', { name: userName })}
            </h2>
            <p className="mt-1 text-[12px] text-graphite">{t('users.resetPasswordHelp')}</p>
            <form action={action} className="mt-5 grid gap-4">
              <input type="hidden" name="userId" value={userId} />
              <Field label={t('users.temporaryPassword')} error={state.fieldErrors?.password}>
                <PasswordInput name="password" autoComplete="new-password" minLength={12} required />
              </Field>
              <Field label={t('settings.confirmPassword')} error={state.fieldErrors?.confirmPassword}>
                <PasswordInput name="confirmPassword" autoComplete="new-password" minLength={12} required />
              </Field>
              {(state.error || state.ok) && (
                <p className={`text-[12px] ${state.error ? 'text-out' : 'text-ok'}`} role="status">
                  {message((state.error ?? state.ok)!)}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={pending}>{pending ? t('users.resettingPassword') : t('users.resetPassword')}</Button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
