'use client';

import { useActionState, useRef, useEffect } from 'react';
import type { ActionState } from '@/actions/catalog';
import { Button, Card, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export interface FieldSpec {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}

/** Inline create form for the simple catalog entities. */
export function QuickCreateForm({
  action,
  fields,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: FieldSpec[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const { t, message } = useI18n();
  const ref = useRef<HTMLFormElement>(null);

  // Clear the form after a clean save, so you can type the next one straight away.
  useEffect(() => {
    if (!pending && !state.error && !state.fieldErrors) ref.current?.reset();
  }, [state, pending]);

  return (
    <Card className="p-4">
      <form ref={ref} action={formAction}>
        {state.error && (
          <p className="mb-3 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
            {message(state.error)}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.name} label={f.label} error={state.fieldErrors?.[f.name]}>
              <Input
                name={f.name}
                type={f.type ?? 'text'}
                required={f.required}
                placeholder={f.placeholder}
              />
            </Field>
          ))}
        </div>

        <div className="mt-4">
          <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
