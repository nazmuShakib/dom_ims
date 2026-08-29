'use client';

import { useActionState } from 'react';

import { createUserAction, type UserActionState } from '@/actions/users';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PasswordInput } from '@/components/auth/PasswordInput';

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(createUserAction, {});
  const { t, message } = useI18n();

  return (
    <Card className="mb-4 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('common.name')} error={state.fieldErrors?.name}>
          <Input name="name" required />
        </Field>
        <Field label={t('customers.mobile')} error={state.fieldErrors?.phone}>
          <Input name="phone" type="tel" inputMode="tel" placeholder="01712345678" required />
        </Field>
        <Field label={t('users.temporaryPassword')} error={state.fieldErrors?.password}>
          <PasswordInput name="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Field label={t('users.role')} error={state.fieldErrors?.role}>
          <Select name="role" defaultValue="STAFF">
            <option value="STAFF">{t('users.staff')}</option>
            <option value="MANAGER">{t('users.manager')}</option>
            <option value="ADMIN">{t('users.admin')}</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t('customers.creating') : t('users.create')}
          </Button>
        </div>
        {(state.error || state.ok) && (
          <p className={`sm:col-span-2 lg:col-span-5 text-[12px] ${state.error ? 'text-out' : 'text-ok'}`}>
            {message((state.error ?? state.ok)!)}
          </p>
        )}
      </form>
    </Card>
  );
}
