'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { Locale } from '@/lib/i18n/config';
import { translate, type MessageKey } from '@/lib/i18n/messages';
import { translateActionMessage } from '@/lib/i18n/action-messages';

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const I18nContext = createContext<{ locale: Locale; t: Translate; message: (value: string) => string }>({
  locale: 'en',
  t: (key, values) => translate('en', key, values),
  message: (value) => value,
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(
    () => ({
      locale,
      t: (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
      message: (text: string) => translateActionMessage(locale, text),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
