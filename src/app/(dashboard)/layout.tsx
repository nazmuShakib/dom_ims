import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui';
import { SignOutControl } from '@/components/auth/SignOutControl';
import { CommandPalette } from '@/components/search/CommandPalette';
import { MobileNavigation } from '@/components/shell/MobileNavigation';
import { NavigationLinks } from '@/components/shell/NavigationLinks';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { translate } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic'; // JSON repos read from disk per request

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, locale } = await getSession();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <I18nProvider locale={locale}>
    <div className="flex min-h-screen">
      {/* --- Sidebar ---------------------------------------------------- */}
      <aside className="desktop-sidebar hidden w-56 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar print:hidden md:sticky md:top-0 md:flex md:h-screen md:self-start">
        <div className="border-b border-sidebar-border px-4 py-4">
          <Link href="/" className="block">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">{t('shell.inventory')}</span>
            <span className="eyebrow mt-0.5 block">{t('shell.shop')}</span>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavigationLinks role={role} desktop />
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="truncate text-[12px] font-medium">{user.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone="signal">{role}</Badge>
            <span className="text-[11px] font-medium text-sidebar-muted">{t('shell.authenticated')}</span>
          </div>
          <SignOutControl />
        </div>
      </aside>

      {/* --- Main ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-rule bg-card px-3 print:hidden sm:gap-3">
          <MobileNavigation
            role={role}
            userName={user.name}
          />
          <CommandPalette />
          <div className="ml-auto hidden md:block"><LanguageSwitcher locale={locale} /></div>
        </header>

        <main className="flex-1 px-3 py-4 print:p-0">
          <div className="dashboard-content mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
    </I18nProvider>
  );
}
