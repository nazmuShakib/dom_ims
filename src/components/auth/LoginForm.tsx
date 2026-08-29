'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from '@/actions/auth';
import { Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PasswordInput } from '@/components/auth/PasswordInput';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const { t, message } = useI18n();

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={t('auth.mobile')}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="01712345678"
          required
          autoFocus
        />
      </Field>
      <Field label={t('auth.password')}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      {state.error && (
        <p className="rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[12px] text-out">
          {message(state.error)}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t('auth.signingIn') : t('auth.signIn')}
      </Button>
    </form>
  );
}
