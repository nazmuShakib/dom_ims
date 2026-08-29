export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = 'ims-locale';

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === 'bn' ? 'bn' : 'en';
}
