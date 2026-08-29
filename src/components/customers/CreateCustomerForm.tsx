'use client';

import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react';

import { createCustomerAction, type CustomerActionState } from '@/actions/checkout';
import { Button, Field, Input, MonoInput } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { createCustomerSchema, type CreateCustomerInput } from '@/schemas';

type CustomerFields = Pick<CreateCustomerInput, 'name' | 'phone'>;
type CustomerFieldErrors = Partial<Record<keyof CustomerFields, string>>;

const EMPTY_VALUES: CustomerFields = { name: '', phone: '' };

export function CreateCustomerForm({
  stacked = false,
  onCreated,
}: {
  stacked?: boolean;
  onCreated?: (customerId: string) => void;
}) {
  const [state, action, pending] = useActionState<CustomerActionState, FormData>(createCustomerAction, {});
  const { t, message } = useI18n();
  const [values, setValues] = useState<CustomerFields>(EMPTY_VALUES);
  const onCreatedRef = useRef(onCreated);
  const [clientErrors, setClientErrors] = useState<CustomerFieldErrors>({});
  const [clearedServerErrors, setClearedServerErrors] = useState<Set<keyof CustomerFields>>(() => new Set());

  useEffect(() => {
    setClearedServerErrors(new Set());
  }, [state.fieldErrors]);

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (!pending && state.ok) {
      setValues(EMPTY_VALUES);
      setClientErrors({});
      if (state.customerId) onCreatedRef.current?.(state.customerId);
    }
  }, [pending, state.customerId, state.ok]);

  function update(field: keyof CustomerFields, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({ ...current, [field]: undefined }));
    setClearedServerErrors((current) => new Set(current).add(field));
  }

  function validate(event: FormEvent<HTMLFormElement>) {
    const parsed = createCustomerSchema.safeParse(values);
    if (parsed.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    const fields = parsed.error.flatten().fieldErrors;
    setClientErrors({ name: fields.name?.[0], phone: fields.phone?.[0] });
  }

  const fieldError = (field: keyof CustomerFields) => {
    const error = clientErrors[field]
      ?? (clearedServerErrors.has(field) ? undefined : state.fieldErrors?.[field]);
    return error ? message(error) : undefined;
  };

  return (
    <form
      action={action}
      onSubmit={validate}
      noValidate
      className={stacked ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}
    >
      <Field label={t('common.name')} error={fieldError('name')}>
        <Input
          name="name"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          aria-invalid={Boolean(fieldError('name'))}
          maxLength={150}
        />
      </Field>
      <Field label={t('customers.mobile')} error={fieldError('phone')}>
        <MonoInput
          name="phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          aria-invalid={Boolean(fieldError('phone'))}
          maxLength={30}
          placeholder="01712345678"
        />
      </Field>
      <div className={stacked ? '' : 'sm:col-span-2'}>
        <Button type="submit" disabled={pending}>
          {pending ? t('customers.creating') : t(onCreated ? 'checkout.createSelect' : 'customers.create')}
        </Button>
        {state.error && <p className="mt-2 text-[12px] text-out">{message(state.error)}</p>}
        {state.ok && <p className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>}
      </div>
    </form>
  );
}
