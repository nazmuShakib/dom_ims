'use client';

import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/messages';

const LABEL_KEYS: Record<string, MessageKey> = {
  'Loading dashboard…': 'loading.dashboard',
  'Loading checkout…': 'loading.checkout',
  'Loading products…': 'loading.products',
  'Loading categories…': 'loading.categories',
  'Loading brands…': 'loading.brands',
  'Loading suppliers…': 'loading.suppliers',
  'Loading customers…': 'loading.customers',
  'Loading invoices…': 'loading.invoices',
  'Loading users…': 'loading.users',
  'Loading settings…': 'loading.settings',
  'Loading audit log…': 'loading.audit',
  'Loading reports…': 'loading.reports',
  'Loading stock receipt…': 'loading.receiveStock',
  'Loading stock removal…': 'loading.removeStock',
  'Loading movement ledger…': 'loading.movementLedger',
  'Loading reconciliation…': 'loading.reconciliation',
  'Loading warranty claims…': 'loading.warranty',
  'Loading stock labels…': 'loading.printLabels',
  'Searching inventory…': 'search.searching',
  'Searching customers…': 'loading.searchCustomers',
  'Filtering invoices…': 'loading.filterInvoices',
  'Loading product labels…': 'loading.productLabels',
};

export function LoadingScreen({
  label,
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const displayLabel = label ? (LABEL_KEYS[label] ? t(LABEL_KEYS[label]) : label) : t('common.loading');
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={displayLabel}
      className={`flex items-center justify-center p-5 print:hidden ${
        compact
          ? 'min-h-44'
          : 'min-h-[calc(100dvh-6rem)] lg:min-h-[calc(100dvh-7rem)]'
      }`}
    >
      <div className="flex min-w-48 flex-col items-center px-8 py-7">
        <span
          aria-hidden="true"
          className="h-7 w-7 animate-spin rounded-full border-2 border-rule border-t-signal"
        />
        <p className="mt-3 text-[13px] font-medium">{displayLabel}</p>
        <p className="mt-1 text-[11px] text-graphite">{t('common.pleaseWait')}</p>
      </div>
    </div>
  );
}
