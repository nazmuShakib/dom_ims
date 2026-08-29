import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Card, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user, locale } = await getSession();
  const t = createTranslator(locale);
  return (
    <>
      <PageHeader title={t('settings.title')} count={t('settings.help')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">{t('settings.account')}</h2>
          <dl className="mt-4 grid gap-3 text-[13px]">
            <div>
              <dt className="eyebrow">{t('common.name')}</dt>
              <dd className="mt-1">{user.name}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('customers.mobile')}</dt>
              <dd className="tnum mt-1">{user.phoneNumber ?? t('common.notRecorded')}</dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-rule pt-5">
            <p className="eyebrow mb-2">{t('settings.language')}</p>
            <LanguageSwitcher locale={locale} showBoth />
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">{t('settings.password')}</h2>
          <p className="mb-5 mt-1 text-[12px] text-graphite">{t('settings.passwordHelp')}</p>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
