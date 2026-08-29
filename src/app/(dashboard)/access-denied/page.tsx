import Link from 'next/link';

import { Button, Card } from '@/components/ui';
import { createTranslator } from '@/lib/i18n/messages';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AccessDeniedPage() {
  const { locale } = await getSession();
  const t = createTranslator(locale);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center">
      <Card className="w-full max-w-lg p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-out-wash text-[22px] font-semibold text-out">
          !
        </div>
        <h1 className="mt-4 text-[20px] font-semibold">{t('accessDenied.title')}</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-graphite">
          {t('accessDenied.description')}
        </p>
        <div className="mt-5 flex justify-center">
          <Link href="/">
            <Button>{t('accessDenied.dashboard')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
