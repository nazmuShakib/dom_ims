'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  voidExpenseFieldsSchema,
} from '@/schemas';
import {
  createExpense,
  createExpenseCategory,
  updateExpense,
  updateExpenseCategory,
  voidExpense,
} from '@/services/expenses';

export interface ExpenseActionState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function errors(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) output[issue.path.join('.') || '_'] ??= issue.message;
  return output;
}

function expenseForm(data: FormData) {
  return {
    expenseDate: text(data, 'expenseDate'),
    categoryId: text(data, 'categoryId'),
    description: text(data, 'description'),
    amount: text(data, 'amount'),
    paidTo: text(data, 'paidTo'),
    paymentMethod: text(data, 'paymentMethod'),
    reference: text(data, 'reference'),
    note: text(data, 'note'),
  };
}

export async function createExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = createExpenseSchema.safeParse({ ...expenseForm(data), actorId: actor.id });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const created = await createExpense(parsed.data);
    await writeAudit({
      actorId: actor.id,
      action: 'operating_expense.create',
      entity: 'OperatingExpense',
      entityId: created.id,
      after: created,
    });
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Recorded ${created.expenseNumber}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not record the expense.' };
  }
}

export async function updateExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = updateExpenseSchema.safeParse({
    ...expenseForm(data), expenseId: text(data, 'expenseId'), actorId: actor.id,
  });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const before = await db.operatingExpenses.findById(parsed.data.expenseId);
    const updated = await updateExpense(parsed.data);
    await writeAudit({
      actorId: actor.id,
      action: 'operating_expense.update',
      entity: 'OperatingExpense',
      entityId: updated.id,
      before,
      after: updated,
    });
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Updated ${updated.expenseNumber}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update the expense.' };
  }
}

export async function voidExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('VOID_EXPENSES');
  const fields = voidExpenseFieldsSchema.safeParse({
    reason: text(data, 'reason'), confirmed: data.get('confirmed') === 'true',
  });
  if (!fields.success) return { fieldErrors: errors(fields.error) };
  const expenseId = text(data, 'expenseId');
  if (!expenseId) return { fieldErrors: { expenseId: 'Expense is required.' } };
  try {
    const before = await db.operatingExpenses.findById(expenseId);
    const updated = await voidExpense({ expenseId, actorId: actor.id, ...fields.data });
    await writeAudit({
      actorId: actor.id,
      action: 'operating_expense.void',
      entity: 'OperatingExpense',
      entityId: updated.id,
      before,
      after: updated,
    });
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Voided ${updated.expenseNumber}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not void the expense.' };
  }
}

export async function createExpenseCategoryAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = createExpenseCategorySchema.safeParse({ name: text(data, 'name') });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const category = await createExpenseCategory(parsed.data, actor.id);
    await writeAudit({ actorId: actor.id, action: 'expense_category.create', entity: 'ExpenseCategory', entityId: category.id, after: category });
    revalidatePath('/expenses');
    return { ok: 'Expense category added.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not add the category.' };
  }
}

export async function updateExpenseCategoryAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const categoryId = text(data, 'categoryId');
  const parsed = createExpenseCategorySchema.safeParse({ name: text(data, 'name') });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  if (!categoryId) return { fieldErrors: { categoryId: 'Category is required.' } };
  try {
    const before = await db.expenseCategories.findById(categoryId);
    const category = await updateExpenseCategory({
      categoryId, name: parsed.data.name, isActive: text(data, 'isActive') === 'true',
    });
    await writeAudit({ actorId: actor.id, action: 'expense_category.update', entity: 'ExpenseCategory', entityId: category.id, before, after: category });
    revalidatePath('/expenses');
    return { ok: 'Expense category updated.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update the category.' };
  }
}
