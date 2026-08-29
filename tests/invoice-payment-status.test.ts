import { describe, expect, it } from 'vitest';

import { effectiveInvoicePaymentStatus } from '../src/lib/invoice-payment-status';

describe('effective invoice payment status', () => {
  it('does not classify voided invoices as paid or unpaid', () => {
    expect(effectiveInvoicePaymentStatus({ status: 'VOIDED', paymentStatus: 'UNPAID' })).toBeNull();
  });

  it('classifies paid and early-settled EMI invoices as paid', () => {
    const sale = { status: 'COMPLETED' as const, paymentStatus: 'UNPAID' as const };
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'PAID', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 10_000,
    })).toBe('PAID');
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'SETTLED_EARLY', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 8_000,
    })).toBe('PAID');
  });

  it('distinguishes untouched and partially paid active EMI invoices', () => {
    const sale = { status: 'COMPLETED' as const, paymentStatus: 'UNPAID' as const };
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'ACTIVE', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 0,
    })).toBe('UNPAID');
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'OVERDUE', downPayment: 1_000, tradeInCredit: 0, installmentAmountPaid: 0,
    })).toBe('PARTIALLY_PAID');
  });
});
