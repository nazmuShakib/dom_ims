import { describe, expect, it } from 'vitest';

import {
  emiRemainingBalanceAfterPayment,
  installmentAmounts,
  installmentDates,
  installmentStatusForDate,
} from '@/services/emi';
import { emiDisplayStatus, emiOutstanding, emiOverdueAmount } from '@/lib/emi-summary';

describe('EMI schedule calculations', () => {
  it('uses whole-taka installments and distributes the remainder', () => {
    const amounts = installmentAmounts(1_600_000, 3);
    expect(amounts).toEqual([533_400, 533_300, 533_300]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(1_600_000);
    expect(amounts.every((amount) => amount % 100 === 0)).toBe(true);
  });

  it('rejects a financed balance containing fractional taka', () => {
    expect(() => installmentAmounts(100_001, 3)).toThrow('whole-taka');
  });

  it('uses the last valid day when a later month is shorter', () => {
    const dates = installmentDates(new Date('2026-01-31T12:00:00.000Z'), 3);
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('creates exactly the selected number of monthly due dates', () => {
    const dates = installmentDates(new Date('2026-08-16T12:00:00.000Z'), 12);
    expect(dates).toHaveLength(12);
    expect(dates.at(-1)?.toISOString().slice(0, 10)).toBe('2027-07-16');
  });

  it('marks an unpaid installment overdue after its due date', () => {
    expect(installmentStatusForDate({ amountDue: 500_000, amountPaid: 0, dueDate: '2026-08-15T12:00:00.000Z' }, '2026-08-16')).toBe('OVERDUE');
  });

  it('keeps a partially paid future installment partial', () => {
    expect(installmentStatusForDate({ amountDue: 500_000, amountPaid: 100_000, dueDate: '2026-08-20T12:00:00.000Z' }, '2026-08-16')).toBe('PARTIAL');
  });

  it('keeps an older receipt balance fixed after later installments are paid', () => {
    const payments = [
      { id: 'payment-3', amount: 533_300, paidAt: '2026-10-16T12:00:00.000Z', createdAt: '2026-10-16T12:00:00.000Z', status: 'ACTIVE' as const },
      { id: 'payment-2', amount: 533_300, paidAt: '2026-09-16T12:00:00.000Z', createdAt: '2026-09-16T12:00:00.000Z', status: 'ACTIVE' as const },
      { id: 'payment-1', amount: 533_400, paidAt: '2026-08-16T12:00:00.000Z', createdAt: '2026-08-16T12:00:00.000Z', status: 'ACTIVE' as const },
    ];

    expect(emiRemainingBalanceAfterPayment(1_600_000, 'PAID', payments, 'payment-1')).toBe(1_066_600);
    expect(emiRemainingBalanceAfterPayment(1_600_000, 'PAID', payments, 'payment-2')).toBe(533_300);
    expect(emiRemainingBalanceAfterPayment(1_600_000, 'PAID', payments, 'payment-3')).toBe(0);
  });

  it('shows zero on the final discounted early-settlement receipt only', () => {
    const payments = [
      { id: 'settlement', amount: 900_000, paidAt: '2026-09-16T12:00:00.000Z', createdAt: '2026-09-16T12:00:00.000Z', status: 'ACTIVE' as const },
      { id: 'payment-1', amount: 533_400, paidAt: '2026-08-16T12:00:00.000Z', createdAt: '2026-08-16T12:00:00.000Z', status: 'ACTIVE' as const },
    ];

    expect(emiRemainingBalanceAfterPayment(1_600_000, 'PAID', payments, 'payment-1')).toBe(1_066_600);
    expect(emiRemainingBalanceAfterPayment(1_600_000, 'PAID', payments, 'settlement')).toBe(0);
  });

  it('derives live outstanding and overdue amounts for invoice displays', () => {
    const installments = [
      { amountDue: 500_000, amountPaid: 100_000, dueDate: '2026-08-15T12:00:00.000Z' },
      { amountDue: 500_000, amountPaid: 0, dueDate: '2026-09-15T12:00:00.000Z' },
    ];

    expect(emiOutstanding(installments)).toBe(900_000);
    expect(emiOverdueAmount(installments, new Date('2026-08-16T12:00:00.000Z'))).toBe(400_000);
    expect(emiDisplayStatus(
      { status: 'ACTIVE' },
      installments,
      null,
      new Date('2026-08-16T12:00:00.000Z'),
    )).toBe('OVERDUE');
  });

  it('distinguishes ordinary completion from early settlement', () => {
    expect(emiDisplayStatus({ status: 'PAID' }, [], null)).toBe('PAID');
    expect(emiDisplayStatus({ status: 'PAID' }, [], {} as never)).toBe('SETTLED_EARLY');
  });
});
