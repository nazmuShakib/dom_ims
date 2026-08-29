'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Button, Card, EmptyState, Input, TableViewport } from '@/components/ui';
import type { Customer } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export function CustomerRegister({
  confirmedQuery,
  customers,
  resultVersion,
}: {
  confirmedQuery: string;
  customers: Customer[];
  resultVersion: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState(confirmedQuery);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;

  useEffect(() => {
    setQuery(confirmedQuery);
    setFiltering(false);
  }, [confirmedQuery, resultVersion]);

  function navigate(nextQuery: string) {
    setQuery(nextQuery);
    setFiltering(true);
    const trimmed = nextQuery.trim();
    window.history.pushState(
      null,
      '',
      trimmed ? `/customers?q=${encodeURIComponent(trimmed)}` : '/customers',
    );
    startRefreshing(() => {
      router.refresh();
    });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(query);
  }

  return (
    <>
      <Card className="mb-4 p-4 sm:p-5">
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={search}>
          <Input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={pending}
            placeholder={t('customers.searchPlaceholder')}
            aria-label={t('nav.customers')}
          />
          <Button type="submit" disabled={pending}>
            {pending ? t('customers.searching') : t('common.search')}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => navigate('')}>
            {t('common.reset')}
          </Button>
        </form>
      </Card>

      {pending ? (
        <Card>
          <LoadingScreen compact label={t('loading.searchCustomers')} />
        </Card>
      ) : (
        <Card>
          {customers.length === 0 ? (
            <EmptyState title={confirmedQuery ? t('customers.noMatch') : t('customers.empty')} />
          ) : (
            <TableViewport>
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-center">{t('common.name')}</th>
                    <th className="eyebrow px-4 py-2.5 text-center">{t('common.phone')}</th>
                    <th className="eyebrow px-4 py-2.5 text-center">{t('customers.purchaseHistory')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-rule-soft transition-colors last:border-0 hover:bg-plate/50">
                      <td className="px-4 py-3 text-center text-ink">{customer.name}</td>
                      <td className="tnum px-4 py-3 text-center text-ink">{customer.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/customers/${customer.id}`} className="font-medium text-signal hover:underline">
                          {t('customers.view')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      )}
    </>
  );
}
