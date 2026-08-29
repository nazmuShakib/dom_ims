import Link from 'next/link';

import { Badge, Card, Input, PageHeader, Select } from '@/components/ui';
import type { EmiContractStatus, EmiInstallmentStatus } from '@/domain/types';
import { formatBDT, parseBDT } from '@/lib/money';
import { getSession, requirePageCapability } from '@/lib/session';
import { formatDhakaDateTime } from '@/lib/time';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';
import { refreshEmiStatuses } from '@/services/emi';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function dhakaDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function moneyBoundary(value: string): number | undefined {
  if (!value) return undefined;
  try { return parseBDT(value); } catch { return undefined; }
}

const contractStatuses: EmiContractStatus[] = ['ACTIVE', 'OVERDUE', 'PAID', 'VOIDED'];
const installmentStates: EmiInstallmentStatus[] = ['DUE', 'PARTIAL', 'OVERDUE', 'UPCOMING', 'PAID'];

export default async function EmiPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePageCapability('VIEW_EMI');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  await refreshEmiStatuses();
  const raw = await searchParams;
  const q = one(raw, 'q');
  const status = one(raw, 'status');
  const term = one(raw, 'term');
  const installmentStatus = one(raw, 'installmentStatus');
  const from = one(raw, 'from');
  const to = one(raw, 'to');
  const minOutstandingText = one(raw, 'minOutstanding');
  const maxOutstandingText = one(raw, 'maxOutstanding');
  const order = one(raw, 'order') || 'newest';
  const minOutstanding = moneyBoundary(minOutstandingText);
  const maxOutstanding = moneyBoundary(maxOutstandingText);
  const invalidRange = minOutstanding !== undefined && maxOutstanding !== undefined && minOutstanding > maxOutstanding;
  const query = q.toLowerCase();
  const contracts = await db.emi.findContracts();
  const allRows = await Promise.all(contracts.map(async (contract) => {
    const [sale, customer, installments] = await Promise.all([
      db.sales.findById(contract.saleId),
      db.customers.findById(contract.customerId),
      db.emi.findInstallments(contract.id),
    ]);
    return { contract, sale, customer, installments, outstanding: contract.status === 'VOIDED' ? 0 : installments.reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0) };
  }));
  const rows = (invalidRange ? [] : allRows.filter(({ contract, sale, customer, installments, outstanding }) => {
    if (status && contract.status !== status) return false;
    if (term && contract.termMonths !== Number(term)) return false;
    if (installmentStatus && !installments.some((item) => item.status === installmentStatus)) return false;
    const createdDay = dhakaDateKey(contract.createdAt);
    if (from && createdDay < from) return false;
    if (to && createdDay > to) return false;
    if (minOutstanding !== undefined && outstanding < minOutstanding) return false;
    if (maxOutstanding !== undefined && outstanding > maxOutstanding) return false;
    return !query || [contract.contractNumber, sale?.invoiceNumber, customer?.name, customer?.phone].some((value) => value?.toLowerCase().includes(query));
  })).sort((a, b) => {
    if (order === 'oldest') return a.contract.createdAt.localeCompare(b.contract.createdAt);
    if (order === 'outstanding-desc') return b.outstanding - a.outstanding;
    if (order === 'outstanding-asc') return a.outstanding - b.outstanding;
    if (order === 'total-desc') return b.contract.emiTotal - a.contract.emiTotal;
    if (order === 'total-asc') return a.contract.emiTotal - b.contract.emiTotal;
    if (order === 'customer-asc') return (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '', 'en');
    if (order === 'customer-desc') return (b.customer?.name ?? '').localeCompare(a.customer?.name ?? '', 'en');
    return b.contract.createdAt.localeCompare(a.contract.createdAt);
  });
  const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);
  const overdue = rows.filter((row) => row.contract.status === 'OVERDUE').length;
  const statusLabel = (value: EmiContractStatus | EmiInstallmentStatus) => t(`emi.status.${value.toLowerCase()}` as 'emi.status.active');

  return <>
    <PageHeader title={t('emi.title')} count={t('emi.subtitle')} />
    <Card className="mb-4 p-3">
      <form className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2"><span className="eyebrow mb-1 block">{t('common.search')}</span><Input name="q" defaultValue={q} placeholder={t('emi.searchPlaceholder')} /></label>
        <label><span className="eyebrow mb-1 block">{t('emi.contractStatus')}</span><Select name="status" defaultValue={status}><option value="">{t('emi.allContractStatuses')}</option>{contractStatuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</Select></label>
        <label><span className="eyebrow mb-1 block">{t('emi.term')}</span><Select name="term" defaultValue={term}><option value="">{t('emi.allTerms')}</option>{[3, 6, 9, 12].map((item) => <option key={item} value={item}>{t('emi.installments', { count: item })}</option>)}</Select></label>
        <label><span className="eyebrow mb-1 block">{t('emi.installmentStatus')}</span><Select name="installmentStatus" defaultValue={installmentStatus}><option value="">{t('emi.allInstallmentStatuses')}</option>{installmentStates.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</Select></label>
        <label><span className="eyebrow mb-1 block">{t('emi.fromDate')}</span><Input name="from" type="date" defaultValue={from} /></label>
        <label><span className="eyebrow mb-1 block">{t('emi.toDate')}</span><Input name="to" type="date" defaultValue={to} /></label>
        <label><span className="eyebrow mb-1 block">{t('emi.minimumOutstanding')}</span><Input name="minOutstanding" inputMode="numeric" defaultValue={minOutstandingText} placeholder="0" /></label>
        <label><span className="eyebrow mb-1 block">{t('emi.maximumOutstanding')}</span><Input name="maxOutstanding" inputMode="numeric" defaultValue={maxOutstandingText} placeholder={t('emi.setMaximum')} /></label>
        <label><span className="eyebrow mb-1 block">{t('emi.orderBy')}</span><Select name="order" defaultValue={order}><option value="newest">{t('emi.orderNewest')}</option><option value="oldest">{t('emi.orderOldest')}</option><option value="outstanding-desc">{t('emi.orderOutstandingHigh')}</option><option value="outstanding-asc">{t('emi.orderOutstandingLow')}</option><option value="total-desc">{t('emi.orderTotalHigh')}</option><option value="total-asc">{t('emi.orderTotalLow')}</option><option value="customer-asc">{t('emi.orderCustomerAz')}</option><option value="customer-desc">{t('emi.orderCustomerZa')}</option></Select></label>
        <div className="flex items-end gap-2 sm:col-span-2"><button className="h-9 rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700">{t('common.applyFilters')}</button><Link href="/emi" className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[13px] transition-colors hover:border-graphite hover:bg-slate-200">{t('common.reset')}</Link></div>
        {invalidRange && <p className="text-[12px] text-out sm:col-span-2 lg:col-span-4">{t('emi.invalidOutstandingRange')}</p>}
      </form>
    </Card>
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Card className="p-3"><p className="eyebrow">{t('emi.matchingContracts')}</p><p className="mt-1 text-[19px] font-semibold">{rows.length}</p></Card><Card className="p-3"><p className="eyebrow">{t('emi.matchingOutstanding')}</p><p className="tnum mt-1 text-[19px] font-semibold">{formatBDT(outstanding)}</p></Card><Card className="p-3"><p className="eyebrow">{t('emi.overdueContracts')}</p><p className="mt-1 text-[19px] font-semibold text-out">{overdue}</p></Card></div>
    <Card className="overflow-auto">
      {rows.length === 0 ? <p className="p-8 text-center text-graphite">{t('emi.noMatches')}</p> : <table className="w-full min-w-[1050px] text-[13px]">
        <thead><tr className="border-b border-rule"><th className="eyebrow px-4 py-2.5 text-center">{t('emi.contract')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('emi.invoice')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('emi.started')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('common.customer')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('emi.paymentPlan')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('emi.total')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('emi.outstanding')}</th><th className="eyebrow px-4 py-2.5 text-center">{t('common.status')}</th></tr></thead>
        <tbody>{rows.map(({ contract, sale, customer, outstanding: rowOutstanding }) => <tr key={contract.id} className="border-b border-rule-soft transition-colors last:border-0 hover:bg-plate/40"><td className="px-4 py-3 text-center"><Link href={`/emi/${contract.id}`} className="font-semibold text-signal hover:underline">{contract.contractNumber}</Link></td><td className="px-4 py-3 text-center"><Link href={`/invoices/${contract.saleId}`} className="text-signal hover:underline">{sale?.invoiceNumber ?? '—'}</Link></td><td className="px-4 py-3 text-center">{formatDhakaDateTime(contract.createdAt)}</td><td className="px-4 py-3 text-center"><span className="font-medium">{customer?.name ?? '—'}</span><span className="block text-[11px] text-graphite">{customer?.phone ?? ''}</span></td><td className="px-4 py-3 text-center">{t('emi.installments', { count: contract.termMonths })}</td><td className="tnum px-4 py-3 text-center">{formatBDT(contract.emiTotal)}</td><td className="tnum px-4 py-3 text-center font-medium">{formatBDT(rowOutstanding)}</td><td className="px-4 py-3 text-center"><Badge tone={contract.status === 'PAID' ? 'ok' : contract.status === 'OVERDUE' || contract.status === 'VOIDED' ? 'out' : contract.status === 'ACTIVE' ? 'signal' : 'neutral'}>{statusLabel(contract.status)}</Badge></td></tr>)}</tbody>
      </table>}
    </Card>
  </>;
}
