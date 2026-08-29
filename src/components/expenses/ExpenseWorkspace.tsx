'use client';

import { startTransition, useActionState, useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, FileText, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';

import {
  createExpenseAction,
  createExpenseCategoryAction,
  updateExpenseAction,
  updateExpenseCategoryAction,
  voidExpenseAction,
  type ExpenseActionState,
} from '@/actions/expenses';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Badge, Button, Card, EmptyState, Field, Input, Select, TableViewport, Textarea } from '@/components/ui';
import { PAYMENT_METHODS, type ExpenseCategory, type OperatingExpense, type PaymentMethod, type Role } from '@/domain/types';
import { domainLabel } from '@/lib/i18n/domain';
import { formatBDT, toTaka } from '@/lib/money';
import { createExpenseCategorySchema, expenseFieldsSchema, voidExpenseFieldsSchema } from '@/schemas';
import type { ExpenseQuery, ExpenseSummary } from '@/services/expenses';

type NamedUser = { id: string; name: string };
type FilterValues = {
  query: string; from: string; to: string; categoryId: string; paymentMethod: string;
  recordedById: string; status: string; minAmount: string; maxAmount: string; order: string;
  groupBy: string;
};

function withoutError(errors: Record<string, string>, key: string): Record<string, string> {
  const next = { ...errors };
  delete next[key];
  return next;
}

function visibleErrors(
  serverErrors: Record<string, string> | undefined,
  clientErrors: Record<string, string>,
  clearedServerErrors: Set<string>,
  translate: (value: string) => string,
): Record<string, string> {
  const server = Object.fromEntries(
    Object.entries(serverErrors ?? {}).filter(([key]) => !clearedServerErrors.has(key)),
  );
  return Object.fromEntries(
    Object.entries({ ...server, ...clientErrors }).map(([key, value]) => [key, translate(value)]),
  );
}

function filtersFrom(query: ExpenseQuery): FilterValues {
  return {
    query: query.query ?? '', from: query.from ?? '', to: query.to ?? '',
    categoryId: query.categoryId ?? '', paymentMethod: query.paymentMethod ?? '',
    recordedById: query.recordedById ?? '', status: query.status ?? '',
    minAmount: query.minAmount === undefined ? '' : String(toTaka(query.minAmount)),
    maxAmount: query.maxAmount === undefined ? '' : String(toTaka(query.maxAmount)),
    order: query.order, groupBy: query.groupBy,
  };
}

function expenseUrl(values: FilterValues): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
  if (!values.from && !values.to) params.set('range', 'all');
  return `/expenses?${params.toString()}`;
}

function dateInputValue(value: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function resetFilters(): FilterValues {
  return { query: '', from: '', to: '', categoryId: '', paymentMethod: '', recordedById: '', status: '', minAmount: '', maxAmount: '', order: 'newest', groupBy: 'none' };
}

export function ExpenseWorkspace({
  role, query, expenses, categories, users, summary, resultVersion,
}: {
  role: Role; query: ExpenseQuery; expenses: OperatingExpense[]; categories: ExpenseCategory[];
  users: NamedUser[]; summary: ExpenseSummary; resultVersion: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState(() => filtersFrom(query));
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefresh] = useTransition();
  const [editing, setEditing] = useState<OperatingExpense | 'new' | null>(null);
  const [voiding, setVoiding] = useState<OperatingExpense | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const pending = filtering || refreshPending;
  const categoryById = new Map(categories.map((item) => [item.id, item.name]));
  const userById = new Map(users.map((item) => [item.id, item.name]));

  useEffect(() => { setValues(filtersFrom(query)); setFiltering(false); }, [query, resultVersion]);
  function update(key: keyof FilterValues, value: string) { setValues((current) => ({ ...current, [key]: value })); }
  function navigate(next: FilterValues) {
    setValues(next); setFiltering(true);
    window.history.pushState(null, '', expenseUrl(next));
    startRefresh(() => router.refresh());
  }
  const exportQuery = expenseUrl(values).split('?')[1] ?? '';
  const groupedRows = values.groupBy === 'category'
    ? summary.byCategory.map((item) => ({ label: item.name, amount: item.amount }))
    : values.groupBy === 'payment'
      ? summary.byPaymentMethod.map((item) => ({ label: domainLabel(t, item.paymentMethod), amount: item.amount }))
      : [];

  return <>
    <header className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="text-[22px] font-semibold tracking-[-0.01em]">{t('expenses.title')}</h1><p className="tnum mt-0.5 text-[12px] text-graphite">{t('expenses.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex h-9 items-center rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700" onClick={() => setEditing('new')}><Plus className="mr-1.5 size-4" />{t('expenses.add')}</button>
        <button type="button" className="inline-flex h-9 items-center rounded-[3px] border border-graphite bg-graphite px-3.5 text-[13px] font-medium text-white transition-colors hover:border-ink hover:bg-ink" onClick={() => setCategoriesOpen(true)}><Settings2 className="mr-1.5 size-4" />{t('expenses.manageCategories')}</button>
        <a className="inline-flex h-9 items-center rounded-[3px] border border-emerald-700 bg-emerald-700 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-emerald-800 hover:bg-emerald-800" href={`/api/expenses/export?${exportQuery}&format=csv`}><FileDown className="mr-1.5 size-4" />{t('expenses.exportCsv')}</a>
        <a className="inline-flex h-9 items-center rounded-[3px] border border-rose-700 bg-rose-700 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-rose-800 hover:bg-rose-800" href={`/api/expenses/export?${exportQuery}&format=pdf`}><FileText className="mr-1.5 size-4" />{t('expenses.exportPdf')}</a>
      </div>
    </header>

    <Card className="mb-4 p-4">
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => { event.preventDefault(); navigate(values); }}>
        <Field label={t('common.search')}><Input value={values.query} onChange={(e) => update('query', e.target.value)} placeholder={t('expenses.searchPlaceholder')} /></Field>
        <Field label={t('expenses.from')}><Input type="date" value={values.from} onChange={(e) => update('from', e.target.value)} /></Field>
        <Field label={t('expenses.to')}><Input type="date" value={values.to} onChange={(e) => update('to', e.target.value)} /></Field>
        <Field label={t('common.category')}><Select value={values.categoryId} onChange={(e) => update('categoryId', e.target.value)}><option value="">{t('expenses.allCategories')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label={t('expenses.paymentMethod')}><Select value={values.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value)}><option value="">{t('expenses.allMethods')}</option>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{domainLabel(t, method)}</option>)}</Select></Field>
        <Field label={t('expenses.recordedBy')}><Select value={values.recordedById} onChange={(e) => update('recordedById', e.target.value)}><option value="">{t('expenses.allUsers')}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></Field>
        <Field label={t('common.status')}><Select value={values.status} onChange={(e) => update('status', e.target.value)}><option value="">{t('expenses.activeAndVoided')}</option><option value="ACTIVE">{t('common.active')}</option><option value="VOIDED">{t('expenses.voided')}</option></Select></Field>
        <Field label={t('expenses.minimum')}><Input inputMode="decimal" value={values.minAmount} onChange={(e) => update('minAmount', e.target.value)} placeholder="0.00" /></Field>
        <Field label={t('expenses.maximum')}><Input inputMode="decimal" value={values.maxAmount} onChange={(e) => update('maxAmount', e.target.value)} placeholder={t('expenses.setMaximum')} /></Field>
        <Field label={t('expenses.orderBy')}><Select value={values.order} onChange={(e) => update('order', e.target.value)}><option value="newest">{t('expenses.newest')}</option><option value="oldest">{t('expenses.oldest')}</option><option value="amount-desc">{t('expenses.highestFirst')}</option><option value="amount-asc">{t('expenses.lowestFirst')}</option></Select></Field>
        <Field label={t('expenses.groupBy')}><Select value={values.groupBy} onChange={(e) => update('groupBy', e.target.value)}><option value="none">{t('expenses.noGrouping')}</option><option value="category">{t('expenses.groupCategory')}</option><option value="payment">{t('expenses.groupPayment')}</option></Select></Field>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-5"><Button disabled={pending}>{t('common.applyFilters')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => navigate(resetFilters())}>{t('common.reset')}</Button></div>
      </form>
    </Card>

    {pending ? <Card><LoadingScreen compact label={t('expenses.filtering')} /></Card> : <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t('expenses.total')} value={formatBDT(summary.activeTotal)} />
        <SummaryCard label={t('expenses.entries')} value={String(summary.activeCount)} />
        <SummaryCard label={t('expenses.lowest')} value={formatBDT(summary.lowest)} />
        <SummaryCard label={t('expenses.highest')} value={formatBDT(summary.highest)} />
      </div>
      {groupedRows.length > 0 && <BreakdownCard title={values.groupBy === 'category' ? t('expenses.byCategory') : t('expenses.byPayment')} rows={groupedRows} />}
      <Card>
      {expenses.length === 0 ? <EmptyState title={t('expenses.empty')} /> : <TableViewport><table className="w-full min-w-[1050px] border-collapse text-[12px] [&_td]:align-middle [&_td]:text-center [&_th]:text-center">
        <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule"><th className="eyebrow px-4 py-2.5">{t('expenses.expense')}</th><th className="eyebrow px-4 py-2.5">{t('common.date')}</th><th className="eyebrow px-4 py-2.5">{t('common.category')}</th><th className="eyebrow px-4 py-2.5">{t('common.description')}</th><th className="eyebrow px-4 py-2.5">{t('expenses.paidTo')}</th><th className="eyebrow px-4 py-2.5">{t('expenses.paymentMethod')}</th><th className="eyebrow px-4 py-2.5">{t('expenses.recordedBy')}</th><th className="eyebrow px-4 py-2.5">{t('expenses.amount')}</th><th className="eyebrow px-4 py-2.5">{t('common.actions')}</th></tr></thead>
        <tbody>{expenses.map((item) => <tr key={item.id} className="border-b border-rule-soft hover:bg-plate/60"><td className="tnum px-4 py-3 font-medium">{item.expenseNumber}{item.status === 'VOIDED' && <span className="ml-2"><Badge tone="out">{t('expenses.voided')}</Badge></span>}</td><td className="tnum px-4 py-3">{displayDate(item.expenseDate)}</td><td className="px-4 py-3">{categoryById.get(item.categoryId) ?? '—'}</td><td className="max-w-xs px-4 py-3"><p className="font-medium">{item.description}</p>{item.reference && <p className="mt-1 text-graphite">{t('common.reference')}: {item.reference}</p>}{item.voidReason && <p className="mt-1 text-out">{item.voidReason}</p>}</td><td className="px-4 py-3">{item.paidTo ?? '—'}</td><td className="px-4 py-3">{domainLabel(t, item.paymentMethod)}</td><td className="px-4 py-3">{userById.get(item.recordedById) ?? '—'}</td><td className="tnum px-4 py-3 font-medium">{formatBDT(item.amount)}</td><td className="px-4 py-3">{item.status === 'ACTIVE' && <span className="inline-flex items-center justify-center gap-1"><button className="inline-flex size-8 items-center justify-center rounded border border-rule hover:bg-plate" title={t('common.edit')} onClick={() => setEditing(item)}><Pencil className="size-4" /></button>{role === 'ADMIN' && <button className="inline-flex size-8 items-center justify-center rounded border border-out/30 text-out hover:bg-out-wash" title={t('expenses.void')} onClick={() => setVoiding(item)}><Trash2 className="size-4" /></button>}</span>}</td></tr>)}</tbody>
      </table></TableViewport>}
      </Card>
    </>}

    {editing && <ExpenseDialog item={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    {voiding && <VoidExpenseDialog item={voiding} onClose={() => setVoiding(null)} />}
    {categoriesOpen && <CategoryDialog categories={categories} onClose={() => setCategoriesOpen(false)} />}
  </>;
}

function SummaryCard({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="eyebrow">{label}</p><p className="tnum mt-2 text-[20px] font-semibold">{value}</p></Card>; }

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ label: string; amount: number }> }) { return <Card className="mb-4"><h2 className="border-b border-rule px-4 py-3 text-[13px] font-medium">{title}</h2><div className="max-h-48 overflow-y-auto">{rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-4 border-b border-rule-soft px-4 py-2 last:border-0"><span className="text-[12px]">{row.label}</span><span className="tnum text-[12px] font-medium">{formatBDT(row.amount)}</span></div>)}</div></Card>; }

function todayDhaka() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()); }

function ExpenseDialog({ item, categories, onClose }: { item: OperatingExpense | null; categories: ExpenseCategory[]; onClose: () => void }) {
  const { t, message } = useI18n();
  const action = item ? updateExpenseAction : createExpenseAction;
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(action, {});
  const [values, setValues] = useState({ expenseDate: item ? dateInputValue(item.expenseDate) : todayDhaka(), categoryId: item?.categoryId ?? '', description: item?.description ?? '', amount: item ? String(toTaka(item.amount)) : '', paidTo: item?.paidTo ?? '', paymentMethod: item?.paymentMethod ?? 'CASH', reference: item?.reference ?? '', note: item?.note ?? '' });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [clearedServerErrors, setClearedServerErrors] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  useEffect(() => { setClearedServerErrors(new Set()); }, [state]);
  function update(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setClientErrors((current) => withoutError(current, key));
    setClearedServerErrors((current) => new Set(current).add(key));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = expenseFieldsSchema.safeParse(values);
    if (!parsed.success) { setClientErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]))); return; }
    setClientErrors({}); startTransition(() => formAction(new FormData(event.currentTarget)));
  }
  const errors = visibleErrors(state.fieldErrors, clientErrors, clearedServerErrors, message);
  return <Modal title={item ? t('expenses.edit') : t('expenses.add')} onClose={onClose}><form noValidate onSubmit={submit}><input type="hidden" name="expenseId" value={item?.id ?? ''} />{state.error && <p className="mb-4 rounded border border-out/20 bg-out-wash p-3 text-out">{message(state.error)}</p>}<div className="grid gap-4 sm:grid-cols-2">
    <Field label={t('common.date')} error={errors.expenseDate}><Input name="expenseDate" type="date" value={values.expenseDate} onChange={(e) => update('expenseDate', e.target.value)} /></Field>
    <Field label={t('common.category')} error={errors.categoryId}><Select name="categoryId" value={values.categoryId} onChange={(e) => update('categoryId', e.target.value)}><option value="">{t('expenses.chooseCategory')}</option>{categories.filter((category) => category.isActive || category.id === item?.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}{!category.isActive ? ` (${t('common.inactive')})` : ''}</option>)}</Select></Field>
    <Field label={t('common.description')} error={errors.description}><Input name="description" value={values.description} onChange={(e) => update('description', e.target.value)} placeholder={t('expenses.descriptionPlaceholder')} /></Field>
    <Field label={t('expenses.amount')} error={errors.amount}><Input name="amount" inputMode="decimal" value={values.amount} onChange={(e) => update('amount', e.target.value)} placeholder="0.00" /></Field>
    <Field label={t('expenses.paidTo')} error={errors.paidTo}><Input name="paidTo" value={values.paidTo} onChange={(e) => update('paidTo', e.target.value)} placeholder={t('expenses.paidToPlaceholder')} /></Field>
    <Field label={t('expenses.paymentMethod')} error={errors.paymentMethod}><Select name="paymentMethod" value={values.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{domainLabel(t, method)}</option>)}</Select></Field>
    <Field label={t('common.reference')} error={errors.reference}><Input name="reference" value={values.reference} onChange={(e) => update('reference', e.target.value)} placeholder={t('expenses.referencePlaceholder')} /></Field>
    <Field label={t('common.note')} error={errors.note}><Textarea name="note" value={values.note} onChange={(e) => update('note', e.target.value)} /></Field>
  </div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={pending}>{pending ? t('common.saving') : t('common.save')}</Button></div></form></Modal>;
}

function VoidExpenseDialog({ item, onClose }: { item: OperatingExpense; onClose: () => void }) {
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState<ExpenseActionState, FormData>(voidExpenseAction, {});
  const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false); const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [clearedServerErrors, setClearedServerErrors] = useState<Set<string>>(() => new Set());
  const [validationStarted, setValidationStarted] = useState(false);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  useEffect(() => { setClearedServerErrors(new Set()); }, [state]);
  function validateChangedField(key: 'reason' | 'confirmed', nextReason: string, nextConfirmed: boolean) {
    setClearedServerErrors((current) => new Set(current).add(key));
    const shouldValidate = validationStarted || Boolean(clientErrors[key]) || Boolean(state.fieldErrors?.[key]);
    if (!shouldValidate) {
      setClientErrors((current) => withoutError(current, key));
      return;
    }
    const parsed = voidExpenseFieldsSchema.safeParse({ reason: nextReason, confirmed: nextConfirmed });
    const issue = parsed.success ? undefined : parsed.error.issues.find((item) => item.path[0] === key);
    setClientErrors((current) => issue
      ? { ...current, [key]: issue.message }
      : withoutError(current, key));
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setValidationStarted(true); const parsed = voidExpenseFieldsSchema.safeParse({ reason, confirmed }); if (!parsed.success) { setClientErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]))); return; } setClientErrors({}); startTransition(() => action(new FormData(event.currentTarget))); }
  const errors = visibleErrors(state.fieldErrors, clientErrors, clearedServerErrors, message);
  return <Modal title={`${t('expenses.void')} ${item.expenseNumber}?`} onClose={onClose}><form noValidate onSubmit={submit}><input type="hidden" name="expenseId" value={item.id} /><input type="hidden" name="confirmed" value={confirmed ? 'true' : 'false'} />{state.error && <p className="mb-4 text-out">{message(state.error)}</p>}<p className="mb-4 text-[13px] text-graphite">{t('expenses.voidHelp')}</p><Field label={t('expenses.voidReason')} error={errors.reason}><Textarea name="reason" value={reason} onChange={(e) => { const nextReason = e.target.value; setReason(nextReason); validateChangedField('reason', nextReason, confirmed); }} /></Field><label className="mt-4 inline-flex w-fit items-center gap-2 text-[13px]"><input type="checkbox" checked={confirmed} onChange={(e) => { const nextConfirmed = e.target.checked; setConfirmed(nextConfirmed); validateChangedField('confirmed', reason, nextConfirmed); }} /><span>{t('expenses.voidConfirm')}</span></label>{errors.confirmed && <p className="mt-1 text-[12px] text-out">{errors.confirmed}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" disabled={pending}>{pending ? t('common.saving') : t('expenses.confirmVoid')}</Button></div></form></Modal>;
}

function CategoryDialog({ categories, onClose }: { categories: ExpenseCategory[]; onClose: () => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const matches = categories.filter((category) => category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Modal title={t('expenses.manageCategories')} onClose={onClose}>
    <p className="mb-4 text-[12px] text-graphite">{t('expenses.categoryDeleteHelp')}</p>
    <CategoryCreate />
    <div className="mt-4"><Field label={t('common.search')}><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('expenses.searchCategories')} /></Field></div>
    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{matches.length ? matches.map((category) => <CategoryRow key={category.id} category={category} />) : <p className="py-8 text-center text-[12px] text-graphite">{t('expenses.noCategories')}</p>}</div>
  </Modal>;
}

function CategoryCreate() {
  const { t, message } = useI18n(); const [name, setName] = useState(''); const [clientError, setClientError] = useState('');
  const [serverErrorCleared, setServerErrorCleared] = useState(false);
  const [state, action, pending] = useActionState<ExpenseActionState, FormData>(createExpenseCategoryAction, {});
  useEffect(() => { if (state.ok) setName(''); }, [state.ok]);
  useEffect(() => { setServerErrorCleared(false); }, [state]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = createExpenseCategorySchema.safeParse({ name }); if (!parsed.success) { setClientError(parsed.error.issues[0]?.message ?? 'Invalid category.'); return; } setClientError(''); startTransition(() => action(new FormData(event.currentTarget))); }
  const fieldError = clientError || (!serverErrorCleared ? state.fieldErrors?.name : '') || '';
  return <form noValidate onSubmit={submit} className="rounded border border-rule bg-plate p-3"><Field label={t('expenses.newCategory')} error={message(fieldError) || undefined}><div className="flex gap-2"><Input name="name" value={name} onChange={(e) => { setName(e.target.value); setClientError(''); setServerErrorCleared(true); }} /><Button disabled={pending}>{t('common.add')}</Button></div></Field>{state.error && <p className="mt-2 text-out">{message(state.error)}</p>}</form>;
}

function CategoryRow({ category }: { category: ExpenseCategory }) {
  const { t, message } = useI18n(); const [name, setName] = useState(category.name); const [clientError, setClientError] = useState(''); const [state, action, pending] = useActionState<ExpenseActionState, FormData>(updateExpenseCategoryAction, {});
  const [serverErrorCleared, setServerErrorCleared] = useState(false);
  useEffect(() => { setServerErrorCleared(false); }, [state]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createExpenseCategorySchema.safeParse({ name });
    if (!parsed.success) { setClientError(parsed.error.issues[0]?.message ?? 'Invalid category.'); return; }
    setClientError('');
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    data.set('isActive', submitter?.value ?? String(category.isActive));
    startTransition(() => action(data));
  }
  const fieldError = clientError || (!serverErrorCleared ? state.fieldErrors?.name : '') || state.error || '';
  return <form noValidate onSubmit={submit} className={`flex flex-wrap items-center gap-2 rounded border border-rule px-2 py-1.5 ${category.isActive ? '' : 'bg-plate/70'}`}><input type="hidden" name="categoryId" value={category.id} /><Input name="name" value={name} onChange={(e) => { setName(e.target.value); setClientError(''); setServerErrorCleared(true); }} className="min-w-44 flex-1" /><Button type="submit" name="isActive" value={String(category.isActive)} variant="ghost" disabled={pending}>{t('common.save')}</Button><Button type="submit" name="isActive" value={String(!category.isActive)} variant={category.isActive ? 'danger' : 'ghost'} disabled={pending}>{category.isActive ? t('expenses.deleteCategory') : t('expenses.restore')}</Button>{!category.isActive && <Badge>{t('expenses.deleted')}</Badge>}{fieldError && <span className="w-full text-[11px] text-out">{message(fieldError)}</span>}</form>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto shadow-xl"><div className="flex items-center justify-between border-b border-rule p-5"><h2 className="text-[19px] font-semibold">{title}</h2><button type="button" className="inline-flex size-10 items-center justify-center rounded border border-out/35 text-out transition-colors hover:border-out/60 hover:bg-out-wash" onClick={onClose} aria-label={t('common.close')}><X className="size-6" strokeWidth={2.25} /></button></div><div className="p-5">{children}</div></Card></div>;
}
