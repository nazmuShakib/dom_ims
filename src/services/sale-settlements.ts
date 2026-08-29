import { z } from 'zod';

import { PAYMENT_METHODS, type PaymentMethod, type PaymentStatus, type SaleSettlement } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { db } from '@/repositories';

const collectInvoicePaymentSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).nullable(),
  note: z.string().trim().max(1000).nullable(),
  actorId: z.string().min(1),
  actorName: z.string().min(1),
  idempotencyKey: z.string().min(8).max(160),
});

export function regularInvoiceCollectible(sale: { total: number; tradeInCredit: number }): number {
  return Math.max(0, sale.total - sale.tradeInCredit);
}

export async function collectInvoicePayment(raw: z.input<typeof collectInvoicePaymentSchema>): Promise<{
  settlement: SaleSettlement;
  amountPaid: number;
  amountDue: number;
  paymentStatus: PaymentStatus;
}> {
  const input = collectInvoicePaymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.saleSettlements.findByIdempotencyKey(input.idempotencyKey);
    if (replay) {
      const replaySale = await tx.sales.findById(replay.saleId);
      if (!replaySale) throw new Error('The invoice for this receipt no longer exists.');
      const collectible = regularInvoiceCollectible(replaySale);
      return {
        settlement: replay,
        amountPaid: replaySale.amountPaid ?? 0,
        amountDue: Math.max(0, collectible - (replaySale.amountPaid ?? 0)),
        paymentStatus: replaySale.paymentStatus,
      };
    }

    const sale = await tx.sales.findById(input.saleId);
    if (!sale) throw new Error('Invoice not found.');
    if (sale.status !== 'COMPLETED') throw new Error('Payments cannot be recorded against a voided invoice.');
    if (await tx.emi.findContractBySale(sale.id)) {
      throw new Error('Use the EMI contract to record installment payments.');
    }

    const collectible = regularInvoiceCollectible(sale);
    const previousPaid = sale.amountPaid ?? 0;
    const amountDue = Math.max(0, collectible - previousPaid);
    if (amountDue === 0) throw new Error('This invoice is already fully paid.');
    if (input.amount > amountDue) throw new Error('The received amount cannot exceed the invoice due amount.');

    const now = new Date().toISOString();
    const amountPaid = previousPaid + input.amount;
    const paymentStatus: PaymentStatus = amountPaid === collectible ? 'PAID' : 'PARTIALLY_PAID';
    const paymentMethod: PaymentMethod = previousPaid === 0 || sale.paymentMethod === input.paymentMethod
      ? input.paymentMethod
      : 'MIXED';
    const settlement: SaleSettlement = {
      id: uuidv7(),
      receiptNumber: await tx.saleSettlements.nextReceiptNumber('CUSTOMER_COLLECTION', new Date(now)),
      idempotencyKey: input.idempotencyKey,
      saleId: sale.id,
      type: 'CUSTOMER_COLLECTION',
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      note: input.note,
      recordedById: input.actorId,
      recordedByName: input.actorName,
      recordedAt: now,
      createdAt: now,
    };
    await tx.saleSettlements.create(settlement);
    await tx.sales.updatePayment(sale.id, previousPaid, { amountPaid, paymentStatus, paymentMethod });
    return { settlement, amountPaid, amountDue: collectible - amountPaid, paymentStatus };
  });
}
