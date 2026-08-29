'use client';

import { useActionState, useEffect, useState } from 'react';

import { discardCartAction } from '@/actions/checkout';
import { Button } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function DiscardDraftControl({
  cartId,
  itemCount,
  hasTradeIn,
  onDiscard,
}: {
  cartId: string;
  itemCount: number;
  hasTradeIn: boolean;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState(discardCartAction, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-graphite underline underline-offset-2 hover:text-out"
      >
        {t('checkout.discard')}
      </button>
      {state.error && <p className="mt-1 text-[11px] text-out">{message(state.error)}</p>}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-draft-title"
            aria-describedby="discard-draft-description"
            className="w-full max-w-sm rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id="discard-draft-title" className="text-[16px] font-semibold">
              {t('checkout.discardTitle')}
            </h2>
            <p id="discard-draft-description" className="mt-2 text-[13px] text-graphite">
              {itemCount > 0
                ? t('checkout.discardWithItems', {
                    count: itemCount,
                    kind: t(itemCount === 1 ? 'checkout.line' : 'checkout.lines'),
                  })
                : t('checkout.discardEmpty')}
              {' '}{t('checkout.inventoryUnchanged')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} autoFocus>
                {t('checkout.keepDraft')}
              </Button>
              {hasTradeIn ? (
                <form action={action} onSubmit={onDiscard}>
                  <input type="hidden" name="cartId" value={cartId} />
                  <Button type="submit" variant="danger" disabled={pending}>
                    {pending ? t('checkout.discarding') : t('checkout.discard')}
                  </Button>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    onDiscard();
                    setOpen(false);
                  }}
                >
                  {t('checkout.discard')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
