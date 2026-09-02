import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { regularInvoiceCollectible } from '@/services/sale-settlements';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('regular invoice collections and trade-in payouts', () => {
  it('collects only the amount remaining after trade-in credit', () => {
    expect(regularInvoiceCollectible({ total: 20_000, tradeInCredit: 5_000 })).toBe(15_000);
    expect(regularInvoiceCollectible({ total: 20_000, tradeInCredit: 25_000 })).toBe(0);
  });

  it('records partial and final payments without changing invoice totals or sales metrics', () => {
    const service = source('src/services/sale-settlements.ts');
    expect(service).toContain("amountPaid === collectible ? 'PAID' : 'PARTIALLY_PAID'");
    expect(service).toContain('input.amount > amountDue');
    expect(service).toContain('tx.sales.updatePayment');
    expect(service).not.toContain('tx.sales.updateTotal');
    expect(service).not.toContain('stockMovements');
  });

  it('uses the same Zod fields on the client and server and shows field messages', () => {
    const schema = source('src/schemas/index.ts');
    const action = source('src/actions/sale-settlements.ts');
    const form = source('src/components/invoices/InvoicePaymentCollection.tsx');
    expect(schema).toContain('invoicePaymentCollectionFieldsSchema');
    expect(action).toContain('const formSchema = invoicePaymentCollectionFieldsSchema.extend');
    expect(action).toContain('formSchema.safeParse');
    expect(form).toContain('invoicePaymentCollectionFieldsSchema.safeParse');
    expect(form).toContain('fieldErrors.amount');
    expect(form).toContain('fieldErrors.paymentMethod');
  });

  it('records excess trade-in credit as a separate cash payout', () => {
    const checkout = source('src/services/checkout.ts');
    const migration = source('prisma/migrations/20260901133000_allow_excess_trade_in_credit/migration.sql');
    expect(checkout).toContain('tradeInCashPayout');
    expect(checkout).toContain("type: 'TRADE_IN_PAYOUT'");
    expect(checkout).toContain("nextReceiptNumber('TRADE_IN_PAYOUT'");
    expect(checkout).toContain('tradeInPayoutMethod');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "sales_tradeInCredit_check"');
    expect(migration).toContain('CHECK ("tradeInCredit" >= 0)');
    expect(migration).not.toContain('"tradeInCredit" <= "total"');
  });

  it('keeps audit receipt numbers internal and only shows type for mixed payout histories', () => {
    const history = source('src/components/invoices/InvoicePaymentCollection.tsx');
    expect(history).toContain("entry.type === 'TRADE_IN_PAYOUT'");
    expect(history).toContain("hasTradeInPayout && <th");
    expect(history).not.toContain('{entry.receiptNumber}');
  });

  it('keeps a subtle invoice scrollbar visible before interaction', () => {
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    const styles = source('src/app/globals.css');
    expect(invoice).toContain('invoice-preview-viewport scrollbar-hint');
    expect(styles).toContain('.scrollbar-hint::-webkit-scrollbar-thumb');
  });

  it('keeps collection amounts independent from thermal receipt typography', () => {
    const form = source('src/components/invoices/InvoicePaymentCollection.tsx');
    const styles = source('src/app/globals.css');
    expect(form).toContain('invoice-payment-collection');
    expect(styles).toContain('.invoice-root .invoice-payment-collection .tnum');
    expect(styles).toContain('font-family: var(--font-mono)');
  });
});
