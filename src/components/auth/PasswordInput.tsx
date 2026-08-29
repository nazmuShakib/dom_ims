'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function PasswordInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  const label = visible ? t('auth.hidePassword') : t('auth.showPassword');

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`pr-11 ${className}`}
      />
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-graphite transition-colors hover:text-ink"
      >
        {visible
          ? <EyeOff aria-hidden="true" className="size-4" />
          : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </div>
  );
}
