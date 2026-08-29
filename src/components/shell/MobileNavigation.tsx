'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { SignOutControl } from '@/components/auth/SignOutControl';
import { NavigationLinks } from '@/components/shell/NavigationLinks';
import { Badge } from '@/components/ui';
import type { Role } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export function MobileNavigation({
  role,
  userName,
}: {
  role: Role;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const existingPadding = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight,
      ) || 0;
      document.body.style.paddingRight = `${existingPadding + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={t('nav.openMenu')}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-rule bg-card text-ink md:hidden"
      >
        <span aria-hidden="true" className="text-[20px] leading-none">☰</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label={t('nav.closeMenu')}
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
            className="mobile-navigation-panel absolute inset-y-0 left-0 flex w-[min(88vw,21rem)] flex-col bg-sidebar shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
              <Link href="/" onClick={() => setOpen(false)} className="block">
                <span className="text-[13px] font-semibold tracking-[-0.01em]">{t('shell.inventory')}</span>
                <span className="eyebrow mt-0.5 block">{t('shell.shop')}</span>
              </Link>
              <button
                type="button"
                aria-label={t('nav.closeMenu')}
                onClick={() => setOpen(false)}
                autoFocus
                className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-rule text-[18px]"
              >
                ×
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
              <NavigationLinks role={role} onNavigate={() => setOpen(false)} />
            </nav>

            <div className="border-t border-sidebar-border px-4 py-3">
              <p className="truncate text-[12px] font-medium">{userName}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone="signal">{role}</Badge>
                <span className="text-[11px] font-medium text-sidebar-muted">{t('shell.authenticated')}</span>
              </div>
              <SignOutControl />
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
