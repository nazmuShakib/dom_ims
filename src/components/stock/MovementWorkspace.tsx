'use client';

import { Children, useEffect, useState, useTransition, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Card } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

interface MovementTab {
  reason: string;
  label: string;
}

export function MovementWorkspace({
  tabs,
  confirmedReason,
  resultVersion,
  children,
}: {
  tabs: MovementTab[];
  confirmedReason: string;
  resultVersion: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [selectedReason, setSelectedReason] = useState(confirmedReason);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;
  const [filterPanel, results] = Children.toArray(children);

  useEffect(() => {
    setSelectedReason(confirmedReason);
    setFiltering(false);
  }, [confirmedReason, resultVersion]);

  function navigate(params: URLSearchParams, reason = selectedReason) {
    if (pending) return;
    setSelectedReason(reason);
    setFiltering(true);
    if (reason) params.set('reason', reason);
    else params.delete('reason');
    const query = params.toString();
    const href = query ? `/stock/movements?${query}` : '/stock/movements';
    startRefreshing(() => {
      window.history.pushState(null, '', href);
      router.refresh();
    });
  }

  function selectTab(event: MouseEvent<HTMLAnchorElement>, reason: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(new URLSearchParams(window.location.search), reason);
  }

  function applyFilters(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
    }
    navigate(params);
  }

  function resetFilters(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const reset = target.closest<HTMLButtonElement>('[data-ledger-reset]');
    if (!reset) return;

    const form = reset.closest('form');
    if (form) {
      for (const field of form.elements) {
        if (field instanceof HTMLInputElement && field.type !== 'hidden') field.value = '';
        if (field instanceof HTMLSelectElement) field.selectedIndex = 0;
      }
    }
    const params = new URLSearchParams();
    navigate(params);
  }

  return (
    <>
      <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label={t('ledger.tabs')}>
        {tabs.map((tab) => {
          const params = new URLSearchParams();
          if (tab.reason) params.set('reason', tab.reason);
          const href = params.size ? `/stock/movements?${params}` : '/stock/movements';
          return (
            <a
              key={tab.reason || 'all'}
              href={href}
              aria-current={selectedReason === tab.reason ? 'page' : undefined}
              onClick={(event) => selectTab(event, tab.reason)}
              className={`shrink-0 rounded-[3px] border px-2.5 py-1 text-[12px] transition-colors ${
                selectedReason === tab.reason
                  ? 'border-ink bg-ink text-white'
                  : 'border-rule bg-card text-graphite hover:text-ink'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>

      <div
        aria-busy={pending}
        onSubmit={applyFilters}
        onClick={resetFilters}
        className={pending ? 'pointer-events-none opacity-70' : ''}
      >
        {filterPanel}
      </div>

      {pending ? (
        <Card>
          <LoadingScreen compact label={t('loading.filterMovements')} />
        </Card>
      ) : results}
    </>
  );
}
