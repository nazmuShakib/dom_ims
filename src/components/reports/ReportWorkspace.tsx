'use client';

import { Children, useEffect, useState, useTransition, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Card } from '@/components/ui';
import type { ReportKind } from '@/services/reports';
import { useI18n } from '@/components/i18n/I18nProvider';

interface ReportTab {
  id: ReportKind;
  label: string;
  href: string;
}

type LoadingScope = 'tab' | 'output' | null;

export function ReportWorkspace({
  tabs,
  confirmedReport,
  resultVersion,
  children,
}: {
  tabs: ReportTab[];
  confirmedReport: ReportKind;
  resultVersion: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [selectedReport, setSelectedReport] = useState(confirmedReport);
  const [loadingScope, setLoadingScope] = useState<LoadingScope>(null);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = loadingScope !== null || refreshPending;
  const selectedLabel = tabs.find((tab) => tab.id === selectedReport)?.label ?? 'report';
  const [filterPanel, results] = Children.toArray(children);

  useEffect(() => {
    setSelectedReport(confirmedReport);
    setLoadingScope(null);
  }, [confirmedReport, resultVersion]);

  function navigate(href: string, report: ReportKind, scope: Exclude<LoadingScope, null>) {
    if (pending) return;
    setSelectedReport(report);
    setLoadingScope(scope);
    window.history.pushState(null, '', href);
    startRefreshing(() => {
      router.refresh();
    });
  }

  function selectTab(event: MouseEvent<HTMLAnchorElement>, tab: ReportTab) {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    event.preventDefault();
    navigate(tab.href, tab.id, 'tab');
  }

  function applyFilters(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
    }
    const report = (params.get('report') as ReportKind | null) ?? selectedReport;
    navigate(`/reports?${params.toString()}`, report, 'output');
  }

  function resetFilters(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const reset = target.closest<HTMLButtonElement>('[data-report-reset]');
    if (!reset) return;

    const form = reset.closest('form');
    if (form) {
      for (const field of form.elements) {
        if (field instanceof HTMLSelectElement) field.selectedIndex = 0;
        if (field instanceof HTMLInputElement && field.type !== 'hidden') field.value = '';
      }
    }
    navigate(`/reports?report=${selectedReport}`, selectedReport, 'output');
  }

  return (
    <>
      <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Report selection">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            aria-current={selectedReport === tab.id ? 'page' : undefined}
            onClick={(event) => selectTab(event, tab)}
            className={`shrink-0 rounded-[3px] border px-2.5 py-1.5 text-[12px] ${
              selectedReport === tab.id
                ? 'border-ink bg-ink text-white'
                : 'border-rule bg-card text-graphite hover:text-ink'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      {loadingScope === 'tab' ? (
        <Card className="flex min-h-[24rem] items-center justify-center">
          <LoadingScreen compact label={t('reports.loading', { report: selectedLabel })} />
        </Card>
      ) : (
        <>
          <div
            aria-busy={pending}
            onSubmit={applyFilters}
            onClick={resetFilters}
            className={pending ? 'pointer-events-none opacity-70' : ''}
          >
            {filterPanel}
          </div>

          {loadingScope === 'output' ? (
            <Card>
              <LoadingScreen compact label={t('reports.filtering', { report: selectedLabel })} />
            </Card>
          ) : results}
        </>
      )}
    </>
  );
}
