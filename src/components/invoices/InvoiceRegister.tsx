'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Badge, Card, EmptyState, Input, Select, TableViewport } from '@/components/ui';
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentStatus, type Sale } from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';
import type { EmiDisplayStatus } from '@/lib/emi-summary';

export interface InvoiceEmiSummary {
  contractId: string;
  termMonths: number;
  status: EmiDisplayStatus;
  overdueAmount: number;
  paymentStatus: PaymentStatus | null;
}

export interface InvoiceFilterValues {
  q: string;
  status: string;
  from: string;
  to: string;
  customerType: string;
  sellerId: string;
  paymentStatus: string;
  paymentMethod: string;
  minTotal: string;
  maxTotal: string;
}

const EMPTY_FILTERS: InvoiceFilterValues = {
  q: '',
  status: '',
  from: '',
  to: '',
  customerType: '',
  sellerId: '',
  paymentStatus: '',
  paymentMethod: '',
  minTotal: '',
  maxTotal: '',
};

function filterUrl(values: InvoiceFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value.trim()) params.set(key, value.trim());
  }
  const query = params.toString();
  return query ? `/invoices?${query}` : '/invoices';
}

export function InvoiceRegister({
  confirmedFilters,
  sellers,
  sales,
  emiBySaleId,
  hasFilters,
  invalidDateRange,
  invalidPriceRange,
  resultVersion,
}: {
  confirmedFilters: InvoiceFilterValues;
  sellers: Array<{ id: string; name: string }>;
  sales: Sale[];
  emiBySaleId: Record<string, InvoiceEmiSummary>;
  hasFilters: boolean;
  invalidDateRange: boolean;
  invalidPriceRange: boolean;
  resultVersion: string;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [values, setValues] = useState(confirmedFilters);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;

  useEffect(() => {
    setValues(confirmedFilters);
    setFiltering(false);
  }, [confirmedFilters, resultVersion]);

  function update(key: keyof InvoiceFilterValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function navigate(next: InvoiceFilterValues) {
    setValues(next);
    setFiltering(true);
    window.history.pushState(null, '', filterUrl(next));
    startRefreshing(() => {
      router.refresh();
    });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(values);
  }

  function emiStatusLabel(status: EmiDisplayStatus): string {
    if (status === 'SETTLED_EARLY') return t('invoices.settledEarly');
    if (status === 'OVERDUE') return t('invoices.overdue');
    if (status === 'PAID') return t('invoices.paid');
    if (status === 'VOIDED') return t('invoices.voided');
    return t('invoices.active');
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={applyFilters}>
          <label className="sm:col-span-2">
            <span className="eyebrow mb-1.5 block">{t('common.search')}</span>
            <Input
              type="search"
              name="q"
              value={values.q}
              onChange={(event) => update('q', event.target.value)}
              disabled={pending}
              placeholder={t('invoices.searchPlaceholder')}
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.invoiceStatus')}</span>
            <Select
              name="status"
              value={values.status}
              onChange={(event) => update('status', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allInvoiceStatuses')}</option>
              <option value="COMPLETED">{t('invoices.completedOnly')}</option>
              <option value="VOIDED">{t('invoices.voidedOnly')}</option>
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.fromDate')}</span>
            <Input
              type="date"
              name="from"
              value={values.from}
              onChange={(event) => update('from', event.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.toDate')}</span>
            <Input
              type="date"
              name="to"
              value={values.to}
              onChange={(event) => update('to', event.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.customerType')}</span>
            <Select
              name="customerType"
              value={values.customerType}
              onChange={(event) => update('customerType', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allCustomers')}</option>
              <option value="WALK_IN">{t('invoices.walkInOnly')}</option>
              <option value="REGISTERED">{t('invoices.savedOnly')}</option>
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.seller')}</span>
            <Select
              name="sellerId"
              value={values.sellerId}
              onChange={(event) => update('sellerId', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allSellers')}</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>{seller.name}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('checkout.paymentStatus')}</span>
            <Select
              name="paymentStatus"
              value={values.paymentStatus}
              onChange={(event) => update('paymentStatus', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allStatuses')}</option>
              {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('checkout.paymentMethod')}</span>
            <Select
              name="paymentMethod"
              value={values.paymentMethod}
              onChange={(event) => update('paymentMethod', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allMethods')}</option>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>{domainLabel(t, value)}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.minTotal')}</span>
            <Input
              type="number"
              name="minTotal"
              min="0"
              step="0.01"
              value={values.minTotal}
              onChange={(event) => update('minTotal', event.target.value)}
              disabled={pending}
              placeholder="0.00"
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">{t('invoices.maxTotal')}</span>
            <Input
              type="number"
              name="maxTotal"
              min="0"
              step="0.01"
              value={values.maxTotal}
              onChange={(event) => update('maxTotal', event.target.value)}
              disabled={pending}
              placeholder={t('invoices.setMaximumPrice')}
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              className="h-9 rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? t('invoices.filtering') : t('common.applyFilters')}
            </button>
            <button
              className="h-9 rounded-[3px] border border-rule bg-card px-3 text-[12px] disabled:opacity-60"
              type="button"
              disabled={pending}
              onClick={() => navigate(EMPTY_FILTERS)}
            >
              {t('common.reset')}
            </button>
          </div>
        </form>
        {!pending && invalidDateRange && (
          <p className="mt-3 text-[12px] text-out">{t('invoices.invalidDates')}</p>
        )}
        {!pending && invalidPriceRange && (
          <p className="mt-3 text-[12px] text-out">{t('invoices.invalidPrices')}</p>
        )}
        <p className="mt-3 text-[11px] text-graphite">
          {t('invoices.limitHelp')}
        </p>
      </Card>

      {pending ? (
        <Card>
          <LoadingScreen compact label={t('loading.filterInvoices')} />
        </Card>
      ) : (
        <Card>
          {sales.length === 0 ? (
            <EmptyState title={hasFilters ? t('invoices.noMatch') : t('invoices.empty')} />
          ) : (
            <TableViewport>
              <table className="min-w-[1020px] w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-rule text-left">
                    <th className="eyebrow px-4 py-2.5">{t('invoices.invoice')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('common.date')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('common.customer')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.seller')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.saleType')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.paymentStatusColumn')}</th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const emi = emiBySaleId[sale.id];
                    return (
                    <tr key={sale.id} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-3">
                        <Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link>
                        {sale.status === 'VOIDED' && <span className="ml-2"><Badge tone="out">VOIDED</Badge></span>}
                      </td>
                      <td className="tnum px-4 py-3">{new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(sale.completedAt))}</td>
                      <td className="px-4 py-3">{sale.customerName ?? t('invoices.walkIn')}</td>
                      <td className="px-4 py-3">{sale.actorName}</td>
                      <td className="px-4 py-3">
                        {emi
                          ? <><Link href={`/emi/${emi.contractId}`} className="font-medium text-signal underline-offset-2 hover:underline">{t('invoices.shopManagedEmi')}</Link><span className="block text-[11px] text-graphite">{t('invoices.monthlyInstallments', { count: emi.termMonths })}</span></>
                          : t('invoices.regularSale')}
                      </td>
                      <td className="px-4 py-3">
                        {emi ? (
                          <>
                            <Badge tone={emi.status === 'PAID' || emi.status === 'SETTLED_EARLY' ? 'ok' : emi.status === 'OVERDUE' || emi.status === 'VOIDED' ? 'out' : 'signal'}>
                              {emiStatusLabel(emi.status)}
                            </Badge>
                            {emi.status === 'OVERDUE' && <span className="tnum ml-2 text-[11px] text-out">{formatBDT(emi.overdueAmount)} {t('invoices.overdueAmount')}</span>}
                          </>
                        ) : (
                          <>
                            {domainLabel(t, sale.paymentStatus)}
                            {sale.paymentStatus !== 'UNPAID' && <span className="text-graphite"> · {domainLabel(t, sale.paymentMethod)}</span>}
                          </>
                        )}
                      </td>
                      <td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      )}
    </>
  );
}
