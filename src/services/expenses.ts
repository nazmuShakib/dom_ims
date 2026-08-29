import type {
  ExpenseCategory,
  OperatingExpense,
  OperatingExpenseStatus,
  PaymentMethod,
} from '@/domain/types';
import { OPERATING_EXPENSE_STATUSES, PAYMENT_METHODS } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import type { Paisa } from '@/lib/money';
import { parseBDT } from '@/lib/money';
import { db } from '@/repositories';
import type { ExpenseOrder, OperatingExpenseFilters, Repositories } from '@/repositories';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  voidExpenseFieldsSchema,
} from '@/schemas';

export interface ExpenseQuery {
  query?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  recordedById?: string;
  status?: OperatingExpenseStatus;
  minAmount?: Paisa;
  maxAmount?: Paisa;
  order: ExpenseOrder;
  groupBy: 'none' | 'category' | 'payment';
}

export interface ExpenseSummary {
  activeTotal: Paisa;
  activeCount: number;
  voidedCount: number;
  lowest: Paisa;
  highest: Paisa;
  byCategory: Array<{ categoryId: string; name: string; amount: Paisa }>;
  byPaymentMethod: Array<{ paymentMethod: PaymentMethod; amount: Paisa }>;
}

function dhakaDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function currentMonthRange(now: Date): { from: string; to: string } {
  const [year, month] = dhakaDateKey(now).split('-');
  return { from: `${year}-${month}-01`, to: dhakaDateKey(now) };
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function optionalPaisa(value: string | undefined): Paisa | undefined {
  if (!value?.trim()) return undefined;
  try {
    const amount = parseBDT(value);
    return amount >= 0 ? amount : undefined;
  } catch {
    return undefined;
  }
}

export function parseExpenseQuery(
  raw: Record<string, string | string[] | undefined>,
  now = new Date(),
): ExpenseQuery {
  const one = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const defaults = currentMonthRange(now);
  const hasQueryParameters = Object.values(raw).some((value) => value !== undefined);
  const payment = one('paymentMethod');
  const status = one('status');
  const order = one('order');
  return {
    query: one('query')?.trim() || undefined,
    from: validDate(one('from')) ? one('from')! : hasQueryParameters ? undefined : defaults.from,
    to: validDate(one('to')) ? one('to')! : hasQueryParameters ? undefined : defaults.to,
    categoryId: one('categoryId') || undefined,
    paymentMethod: PAYMENT_METHODS.includes(payment as PaymentMethod) ? payment as PaymentMethod : undefined,
    recordedById: one('recordedById') || undefined,
    status: OPERATING_EXPENSE_STATUSES.includes(status as OperatingExpenseStatus)
      ? status as OperatingExpenseStatus
      : undefined,
    minAmount: optionalPaisa(one('minAmount')),
    maxAmount: optionalPaisa(one('maxAmount')),
    order: ['oldest', 'amount-desc', 'amount-asc'].includes(order ?? '')
      ? order as ExpenseOrder
      : 'newest',
    groupBy: ['category', 'payment'].includes(one('groupBy') ?? '')
      ? one('groupBy') as 'category' | 'payment'
      : 'none',
  };
}

export function expenseRepositoryFilters(query: ExpenseQuery): OperatingExpenseFilters {
  return {
    query: query.query,
    from: query.from ? new Date(`${query.from}T00:00:00+06:00`) : undefined,
    to: query.to ? new Date(`${query.to}T23:59:59.999+06:00`) : undefined,
    categoryId: query.categoryId,
    paymentMethod: query.paymentMethod,
    recordedById: query.recordedById,
    status: query.status,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
    order: query.order,
  };
}

export async function listExpenses(
  query: ExpenseQuery,
  repositories: Repositories = db,
): Promise<OperatingExpense[]> {
  return repositories.operatingExpenses.findAll(expenseRepositoryFilters(query), 2_000);
}

export function summarizeExpenses(
  expenses: OperatingExpense[],
  categories: ExpenseCategory[],
): ExpenseSummary {
  const active = expenses.filter((item) => item.status === 'ACTIVE');
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const categoryTotals = new Map<string, Paisa>();
  const methodTotals = new Map<PaymentMethod, Paisa>();
  for (const item of active) {
    categoryTotals.set(item.categoryId, (categoryTotals.get(item.categoryId) ?? 0) + item.amount);
    methodTotals.set(item.paymentMethod, (methodTotals.get(item.paymentMethod) ?? 0) + item.amount);
  }
  const activeTotal = active.reduce((sum, item) => sum + item.amount, 0);
  return {
    activeTotal,
    activeCount: active.length,
    voidedCount: expenses.length - active.length,
    lowest: active.reduce((minimum, item) => Math.min(minimum, item.amount), active[0]?.amount ?? 0),
    highest: active.reduce((maximum, item) => Math.max(maximum, item.amount), 0),
    byCategory: [...categoryTotals].map(([categoryId, amount]) => ({
      categoryId, name: categoryNames.get(categoryId) ?? 'Unknown category', amount,
    })).sort((a, b) => b.amount - a.amount),
    byPaymentMethod: [...methodTotals].map(([paymentMethod, amount]) => ({ paymentMethod, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function expenseDateIso(value: string): string {
  return new Date(`${value}T00:00:00+06:00`).toISOString();
}

export async function createExpense(raw: unknown, repositories: Repositories = db) {
  const input = createExpenseSchema.parse(raw);
  return repositories.transaction(async (tx) => {
    const category = await tx.expenseCategories.findById(input.categoryId);
    if (!category?.isActive) throw new Error('Choose an active expense category.');
    const now = new Date();
    const timestamp = now.toISOString();
    const value: OperatingExpense = {
      id: uuidv7(),
      expenseNumber: await tx.operatingExpenses.nextExpenseNumber(now),
      expenseDate: expenseDateIso(input.expenseDate),
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      paidTo: input.paidTo,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      note: input.note,
      status: 'ACTIVE',
      recordedById: input.actorId,
      updatedById: input.actorId,
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return tx.operatingExpenses.create(value);
  });
}

export async function updateExpense(raw: unknown, repositories: Repositories = db) {
  const input = updateExpenseSchema.parse(raw);
  const existing = await repositories.operatingExpenses.findById(input.expenseId);
  if (!existing) throw new Error('Expense not found.');
  if (existing.status !== 'ACTIVE') throw new Error('A voided expense cannot be edited.');
  const category = await repositories.expenseCategories.findById(input.categoryId);
  if (!category || (!category.isActive && category.id !== existing.categoryId)) {
    throw new Error('Choose an active expense category.');
  }
  return repositories.operatingExpenses.update(existing.id, {
    expenseDate: expenseDateIso(input.expenseDate),
    categoryId: input.categoryId,
    description: input.description,
    amount: input.amount,
    paidTo: input.paidTo,
    paymentMethod: input.paymentMethod,
    reference: input.reference,
    note: input.note,
    updatedById: input.actorId,
    updatedAt: new Date().toISOString(),
  });
}

export async function voidExpense(
  raw: { expenseId: string; actorId: string; reason: string; confirmed: boolean },
  repositories: Repositories = db,
) {
  const fields = voidExpenseFieldsSchema.parse({ reason: raw.reason, confirmed: raw.confirmed });
  const existing = await repositories.operatingExpenses.findById(raw.expenseId);
  if (!existing) throw new Error('Expense not found.');
  if (existing.status !== 'ACTIVE') throw new Error('This expense is already voided.');
  const now = new Date().toISOString();
  return repositories.operatingExpenses.void(existing.id, {
    status: 'VOIDED',
    voidedById: raw.actorId,
    voidedAt: now,
    voidReason: fields.reason,
    updatedById: raw.actorId,
    updatedAt: now,
  });
}

export async function createExpenseCategory(
  raw: unknown,
  _actorId: string,
  repositories: Repositories = db,
) {
  const input = createExpenseCategorySchema.parse(raw);
  const existing = await repositories.expenseCategories.findAll();
  if (existing.some((item) => item.name.localeCompare(input.name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new Error('An expense category with this name already exists.');
  }
  const timestamp = new Date().toISOString();
  return repositories.expenseCategories.create({
    id: uuidv7(), name: input.name, isActive: true, createdAt: timestamp, updatedAt: timestamp,
  });
}

export async function updateExpenseCategory(
  raw: { categoryId: string; name: string; isActive: boolean },
  repositories: Repositories = db,
) {
  const input = createExpenseCategorySchema.parse({ name: raw.name });
  const current = await repositories.expenseCategories.findById(raw.categoryId);
  if (!current) throw new Error('Expense category not found.');
  const existing = await repositories.expenseCategories.findAll();
  if (existing.some((item) => item.id !== current.id && item.name.localeCompare(input.name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new Error('An expense category with this name already exists.');
  }
  return repositories.expenseCategories.update(current.id, {
    name: input.name,
    isActive: raw.isActive,
    updatedAt: new Date().toISOString(),
  });
}
