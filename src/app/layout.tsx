import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { I18nProvider } from '@/components/i18n/I18nProvider';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inventory — Electronics Shop',
  description: 'Stock, products and device numbers for a single-location electronics shop.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <head>
        {/* Phase 1: linked, not next/font, so the build needs no network.
            Swap to next/font/google before production for self-hosting + no FOUT. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+Bengali:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Browser extensions (Grammarly, ColorZilla) inject attributes into <body>
          before React hydrates. Scoped to this element only — it will NOT mask a
          real hydration bug inside a component. */}
      <body suppressHydrationWarning>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
