'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { logoutAction } from '@/actions/auth';
import { Button } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function SignOutControl() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const bodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(document.body).paddingRight,
    ) || 0;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !signingOut) setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, signingOut]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[11px] text-graphite underline underline-offset-2 hover:text-ink"
      >
        {t('auth.signOut')}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !signingOut) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            aria-describedby="sign-out-description"
            aria-busy={signingOut}
            className="w-full max-w-sm rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id="sign-out-title" className="text-[16px] font-semibold">
              {t('auth.signOutQuestion')}
            </h2>
            <p id="sign-out-description" className="mt-2 text-[13px] text-graphite">
              {t('auth.signOutDescription')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={signingOut} onClick={() => setOpen(false)} autoFocus>
                {t('common.cancel')}
              </Button>
              <form action={logoutAction} onSubmit={() => setSigningOut(true)}>
                <Button type="submit" variant="danger" disabled={signingOut} aria-live="polite">
                  {signingOut && <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />}
                  {signingOut ? t('auth.signingOut') : t('auth.signOut')}
                </Button>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
