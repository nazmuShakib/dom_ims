'use client';

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { useI18n } from '@/components/i18n/I18nProvider';
import type { DashboardPeriod, DashboardPeriodKey } from '@/services/dashboard';

const DashboardPeriodContext = createContext<{
  period: DashboardPeriod;
  key: DashboardPeriodKey;
  periodStart: string;
  setPeriod: Dispatch<SetStateAction<DashboardPeriod>>;
}>({ period: 'month', key: 'month', periodStart: '', setPeriod: () => undefined });

export function DashboardPeriodProvider({ children, periodStarts }: {
  children: ReactNode;
  periodStarts: Record<DashboardPeriodKey, string>;
}) {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const value = useMemo(
    () => ({ period, key: period, periodStart: periodStarts[period], setPeriod }),
    [period, periodStarts],
  );
  return <DashboardPeriodContext.Provider value={value}>{children}</DashboardPeriodContext.Provider>;
}

export function DashboardPeriodSelector() {
  const { t } = useI18n();
  const { period, setPeriod } = useDashboardPeriod();
  const options: Array<{ value: DashboardPeriod; label: string }> = [
    { value: 'day', label: t('dashboard.today') },
    { value: 'week', label: t('dashboard.thisWeek') },
    { value: 'month', label: t('dashboard.thisMonth') },
  ];

  return (
    <label className="block min-w-44">
      <span className="eyebrow mb-1 block">{t('dashboard.period')}</span>
      <select
        value={period}
        onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
        className="h-9 w-full rounded-[3px] border border-rule bg-card px-2.5 text-[12px] font-medium text-ink outline-none focus:border-signal"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function useDashboardPeriod() {
  return useContext(DashboardPeriodContext);
}
