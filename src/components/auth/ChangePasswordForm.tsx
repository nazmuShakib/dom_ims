'use client';

import { useActionState, useEffect, useRef } from 'react';

import {
  changeOwnPasswordAction,
  type PasswordActionState,
} from '@/actions/settings';
import { Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PasswordInput } from '@/components/auth/PasswordInput';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PasswordActionState, FormData>(
    changeOwnPasswordAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const { t, message } = useI18n();

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="grid max-w-xl gap-4">
      <Field label={t('settings.currentPassword')} error={state.fieldErrors?.currentPassword}>
        <PasswordInput name="currentPassword" autoComplete="current-password" required />
      </Field>
      <Field
        label={t('settings.newPassword')}
        hint={t('settings.passwordHint')}
        error={state.fieldErrors?.newPassword}
      >
        <PasswordInput name="newPassword" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label={t('settings.confirmPassword')} error={state.fieldErrors?.confirmPassword}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" minLength={12} required />
      </Field>
      {(state.error || state.ok) && (
        <p className={`text-[12px] ${state.error ? 'text-out' : 'text-ok'}`} role="status">
          {message((state.error ?? state.ok)!)}
        </p>
      )}
      <div><Button type="submit" disabled={pending}>{pending ? t('settings.changing') : t('settings.changePassword')}</Button></div>
    </form>
  );
}
