import { describe, expect, it } from 'vitest';

import type { ExpenseCategory, OperatingExpense } from '@/domain/types';
import { expenseFieldsSchema } from '@/schemas';
import { parseExpenseQuery, summarizeExpenses } from '@/services/expenses';

const categories: ExpenseCategory[] = [
  { id: 'rent', name: 'Rent', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'utility', name: 'Utilities', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

function expense(patch: Partial<OperatingExpense> & Pick<OperatingExpense, 'id' | 'amount'>): OperatingExpense {
  return {
    id: patch.id, expenseNumber: `EXP-2026-${patch.id}`, expenseDate: '2026-08-01T18:00:00.000Z',
    categoryId: 'rent', description: 'Shop rent', amount: patch.amount, paidTo: null,
    paymentMethod: 'CASH', reference: null, note: null, status: 'ACTIVE', recordedById: 'user',
    updatedById: 'user', voidedById: null, voidedAt: null, voidReason: null,
    createdAt: '2026-08-01T18:00:00.000Z', updatedAt: '2026-08-01T18:00:00.000Z', ...patch,
  };
}

describe('Phase 10.1 operating expenses', () => {
  it('defaults the register to the current Dhaka month but accepts unrestricted dates', () => {
    const defaults = parseExpenseQuery({}, new Date('2026-08-11T04:00:00.000Z'));
    expect(defaults.from).toBe('2026-08-01');
    expect(defaults.to).toBe('2026-08-11');
    const allDates = parseExpenseQuery({ range: 'all', groupBy: 'category' }, new Date('2026-08-11T04:00:00.000Z'));
    expect(allDates.from).toBeUndefined();
    expect(allDates.to).toBeUndefined();
    expect(allDates.groupBy).toBe('category');
    const historical = parseExpenseQuery({ from: '2024-01-01', to: '2024-12-31', minAmount: '10.50' });
    expect(historical.from).toBe('2024-01-01');
    expect(historical.to).toBe('2024-12-31');
    expect(historical.minAmount).toBe(1_050);
  });

  it('uses the shared Zod boundary to convert taka to integer paisa and reject mixed text', () => {
    const valid = expenseFieldsSchema.parse({ expenseDate: '2026-08-11', categoryId: 'rent', description: 'August rent', amount: '12,500.25', paidTo: '', paymentMethod: 'CASH', reference: '', note: '' });
    expect(valid.amount).toBe(1_250_025);
    expect(expenseFieldsSchema.safeParse({ ...valid, amount: '12abc' }).success).toBe(false);
  });

  it('excludes voided entries from totals without deleting their records', () => {
    const rows = [expense({ id: '1', amount: 10_000 }), expense({ id: '2', amount: 5_000, categoryId: 'utility' }), expense({ id: '3', amount: 9_999, status: 'VOIDED', voidedById: 'admin', voidedAt: '2026-08-02T00:00:00.000Z', voidReason: 'Duplicate' })];
    const summary = summarizeExpenses(rows, categories);
    expect(summary.activeTotal).toBe(15_000);
    expect(summary.activeCount).toBe(2);
    expect(summary.voidedCount).toBe(1);
    expect(summary.lowest).toBe(5_000);
  });
});
