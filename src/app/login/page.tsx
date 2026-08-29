import { Card } from '@/components/ui';
import { LoginForm } from '@/components/auth/LoginForm';
import { cookies } from 'next/headers';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/messages';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <main className="flex min-h-screen items-center justify-center bg-plate p-5">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{t('shell.shop')}</p>
            <h1 className="mt-1 text-[24px] font-semibold">{t('auth.signInTitle')}</h1>
          </div>
          <LanguageSwitcher locale={locale} compact />
        </div>
        <Card className="p-5">
          {error === 'inactive' && (
            <p className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[12px] text-out">
              {t('auth.inactive')}
            </p>
          )}
          <LoginForm next={next} />
        </Card>
      </div>
    </main>
  );
}
