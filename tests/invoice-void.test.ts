import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Sale } from '@/domain/types';
import { emiVoidRefundAmount } from '@/lib/emi-summary';
import { assertVoidPermission, staffVoidWindowMinutes } from '@/services/sales';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sale(overrides: Partial<Sale> = {}): Sale {
  const now = new Date().toISOString();
  return {
    id: '019fe5d0-f89c-7000-8000-000000000001',
    invoiceNumber: 'INV-2026-000001',
    idempotencyKey: 'checkout-idempotency',
    checkoutCartId: '019fe5d0-f89c-7000-8000-000000000002',
    status: 'COMPLETED',
    customerId: null,
    customerName: null,
    customerPhone: null,
    actorId: 'staff-1',
    actorName: 'Staff One',
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    reference: null,
    note: null,
    subtotal: 10_000,
    discount: 0,
    total: 10_000,
    tradeInCredit: 0,
    tradeInDetails: null,
    completedAt: now,
    createdAt: now,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    refundAmount: null,
    refundMethod: null,
    voidIdempotencyKey: null,
    ...overrides,
  };
}

const previousWindow = process.env.STAFF_INVOICE_VOID_WINDOW_MINUTES;
afterEach(() => {
  if (previousWindow === undefined) delete process.env.STAFF_INVOICE_VOID_WINDOW_MINUTES;
  else process.env.STAFF_INVOICE_VOID_WINDOW_MINUTES = previousWindow;
});

describe('invoice void safeguards', () => {
  it('defaults the staff self-void window to 24 hours', () => {
    delete process.env.STAFF_INVOICE_VOID_WINDOW_MINUTES;
    expect(staffVoidWindowMinutes()).toBe(1440);
  });

  it('allows staff to void their own invoice during the configured window', () => {
    const completedAt = new Date('2026-08-08T00:00:00.000Z');
    expect(() => assertVoidPermission(
      sale({ completedAt: completedAt.toISOString() }),
      { id: 'staff-1', role: 'STAFF' },
      new Date('2026-08-08T23:59:59.000Z'),
    )).not.toThrow();
  });

  it('blocks another staff member and an expired staff void', () => {
    const invoice = sale({ completedAt: '2026-08-08T00:00:00.000Z' });
    expect(() => assertVoidPermission(invoice, { id: 'staff-2', role: 'STAFF' }))
      .toThrow(/only invoices that you completed/);
    expect(() => assertVoidPermission(
      invoice,
      { id: 'staff-1', role: 'STAFF' },
      new Date('2026-08-09T00:00:01.000Z'),
    )).toThrow(/24-hour/);
  });

  it('allows an admin regardless of invoice owner or age', () => {
    expect(() => assertVoidPermission(
      sale({ completedAt: '2020-01-01T00:00:00.000Z' }),
      { id: 'admin-1', role: 'ADMIN' },
      new Date('2026-08-09T00:00:00.000Z'),
    )).not.toThrow();
  });

  it('refunds an EMI down payment and every active installment receipt', () => {
    expect(emiVoidRefundAmount(
      { downPayment: 100_000 },
      [
        { amount: 500_000, status: 'ACTIVE' },
        { amount: 250_000, status: 'ACTIVE' },
        { amount: 300_000, status: 'REVERSED' },
      ],
    )).toBe(850_000);
  });

  it('uses one transaction and correction movements for stock and finance integrity', () => {
    const service = source('src/services/sales.ts');
    expect(service).toContain('return db.transaction(async (tx) =>');
    expect(service).toContain('correctMovementInTransaction');
    expect(service).toContain("status: 'VOIDED'");
    expect(service).toContain('findBySale(sale.id)');
    expect(service).toContain('warranties.findAll({ unitId: unit.id })');
    expect(service).toContain("status: 'REVERSED'");
    expect(service).toContain('updatePayment(payment.id');
  });

  it('blocks individual sale movement reversal and requires confirmation in the UI', () => {
    expect(source('src/services/stock.ts')).toContain('Void the complete invoice instead');
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    expect(invoice).toContain('action={voidAction}');
    expect(invoice).toContain('onSubmit={validateVoidForm} noValidate');
    expect(invoice).toContain('voidInvoiceFieldsSchema.safeParse(voidFields)');
    expect(invoice).toContain('value={voidFields.reason}');
    expect(invoice).toContain('checked={voidFields.confirmed}');
    expect(invoice).toContain('name="confirmed"');
    expect(invoice).toContain('Reason for voiding');
    expect(invoice).toContain('fieldErrors?.reason');
    expect(invoice).toContain('fieldErrors?.refundMethod');
    expect(invoice).toContain('fieldErrors?.confirmed');
  });

  it('prevents invoice-owned trade-ins from being reversed separately', () => {
    const stock = source('src/services/stock.ts');
    expect(stock).toContain("original.reason === 'TRADE_IN'");
    expect(stock).toContain('acquisition?.tradeInSaleId');
    const page = source('src/app/(dashboard)/stock/movements/page.tsx');
    expect(page).toContain('invoiceOwnedTradeIn');
    expect(page).toContain('Managed by {linkedSale.invoiceNumber}');
    expect(page).not.toContain('RestoreTradeInButton');
  });

  it('links sale movements directly to their invoice detail page', () => {
    const page = source('src/app/(dashboard)/stock/movements/page.tsx');
    expect(page).toContain('db.sales.findByInvoiceNumber(movement.reference)');
    expect(page).toContain('href={`/invoices/${invoiceSale.id}`}');
    expect(page).not.toContain('href={`/invoices?q=${encodeURIComponent(movement.reference)}`}');
  });
});
