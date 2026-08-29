import { z } from 'zod';

import type { PaymentMethod, Role, Sale, StockMovement } from '@/domain/types';
import { emiVoidRefundAmount } from '@/lib/emi-summary';
import { db } from '@/repositories';
import { voidInvoiceFieldsSchema } from '@/schemas';
import { correctMovementInTransaction } from '@/services/stock';

const voidSaleSchema = voidInvoiceFieldsSchema.omit({ confirmed: true }).extend({
  saleId: z.string().uuid(),
  actorId: z.string().min(1),
  actorName: z.string().min(1),
  actorRole: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
  idempotencyKey: z.string().min(8).max(160),
});

export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

export function staffVoidWindowMinutes(): number {
  const configured = Number(process.env.STAFF_INVOICE_VOID_WINDOW_MINUTES ?? '1440');
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 1440;
}

export function assertVoidPermission(
  sale: Sale,
  actor: { id: string; role: Role },
  now = new Date(),
): void {
  if (actor.role === 'ADMIN') return;
  if (sale.actorId !== actor.id) {
    throw new Error('You may void only invoices that you completed yourself.');
  }
  const deadline = new Date(sale.completedAt).getTime() + staffVoidWindowMinutes() * 60_000;
  if (now.getTime() > deadline) {
    throw new Error('The 24-hour staff void window has expired. Ask an admin to void this invoice.');
  }
}

function happenedAfter(candidate: StockMovement, original: StockMovement): boolean {
  return candidate.id !== original.id
    && new Date(candidate.createdAt).getTime() >= new Date(original.createdAt).getTime();
}

/**
 * Voids one complete invoice. The status change, outgoing-sale corrections,
 * incoming trade-in correction, and unit/quantity restoration are one database
 * transaction. Any failed guard rolls the entire operation back.
 */
export async function voidSale(raw: VoidSaleInput): Promise<Sale> {
  const input = voidSaleSchema.parse(raw);

  return db.transaction(async (tx) => {
    const sale = await tx.sales.findById(input.saleId);
    if (!sale) throw new Error('Invoice not found.');
    if (sale.status === 'VOIDED') {
      if (sale.voidIdempotencyKey === input.idempotencyKey) return sale;
      throw new Error('This invoice has already been voided.');
    }

    assertVoidPermission(sale, { id: input.actorId, role: input.actorRole });

    const emiContract = await tx.emi.findContractBySale(sale.id);
    const emiPayments = emiContract ? await tx.emi.findPayments(emiContract.id) : [];
    const refundAmount = emiContract
      ? emiVoidRefundAmount(emiContract, emiPayments)
      : Math.max(0, sale.amountPaid ?? 0);
    if (refundAmount > 0 && !input.refundMethod) {
      throw new Error('Choose how the customer was refunded.');
    }

    const items = await tx.sales.findItems(sale.id);
    if (items.length === 0) throw new Error('This invoice has no sale lines and cannot be voided safely.');

    const saleMovements: StockMovement[] = [];
    for (const item of items) {
      const movement = await tx.movements.findById(item.movementId);
      if (!movement || movement.reason !== 'SALE' || movement.quantity >= 0) {
        throw new Error(`Invoice line ${item.productName} is not linked to a valid sale movement.`);
      }
      const siblings = await tx.movements.findByProduct(movement.productId);
      if (siblings.some((candidate) => candidate.reversesId === movement.id)) {
        throw new Error(`The stock movement for ${item.productName} has already been reversed.`);
      }

      if (movement.unitId) {
        const unit = await tx.units.findById(movement.unitId);
        if (!unit || unit.status !== 'SOLD') {
          throw new Error(`Device ${item.serialNo ?? item.productName} is no longer in its original sold state.`);
        }
        const claims = await tx.warranties.findAll({ unitId: unit.id });
        if (claims.length > 0) {
          throw new Error(`Device ${unit.serialNo} has warranty history. Resolve that workflow before voiding.`);
        }
        if (siblings.some((candidate) => candidate.unitId === unit.id && happenedAfter(candidate, movement))) {
          throw new Error(`Device ${unit.serialNo} has later inventory activity and cannot be restored automatically.`);
        }
      }
      saleMovements.push(movement);
    }

    const tradeIn = await tx.usedDeviceAcquisitions.findBySale(sale.id);
    let tradeInMovement: StockMovement | null = null;
    if (tradeIn) {
      const unit = await tx.units.findById(tradeIn.unitId);
      if (!unit) throw new Error('The trade-in device could not be found.');
      if (unit.status !== 'IN_STOCK') {
        throw new Error('The trade-in device is no longer untouched in stock and cannot be returned automatically.');
      }
      const expenses = await tx.refurbishmentExpenses.findByUnit(unit.id);
      if (expenses.length > 0) {
        throw new Error('The trade-in has repair or refurbishment costs. It must be resolved manually before voiding.');
      }
      const movements = await tx.movements.findByProduct(unit.productId);
      const originalTradeInMovement = movements.find((movement) => (
        movement.unitId === unit.id && movement.reason === 'TRADE_IN' && movement.quantity > 0
      )) ?? null;
      if (!originalTradeInMovement) throw new Error('The incoming trade-in movement could not be found.');
      if (movements.some((candidate) => (
        candidate.unitId === unit.id && happenedAfter(candidate, originalTradeInMovement)
      ))) {
        throw new Error('The trade-in device has later inventory activity and cannot be returned automatically.');
      }
      tradeInMovement = originalTradeInMovement;
    }

    const correctionNote = `Invoice ${sale.invoiceNumber} voided: ${input.reason}`;
    for (const [index, movement] of saleMovements.entries()) {
      await correctMovementInTransaction({
        movementId: movement.id,
        note: correctionNote,
        actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:sale:${index + 1}`,
      }, tx, { allowSale: true });
    }
    if (tradeInMovement) {
      await correctMovementInTransaction({
        movementId: tradeInMovement.id,
        note: `${correctionNote}. Trade-in returned to customer.`,
        actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:trade-in`,
      }, tx, { allowAttachedTradeIn: true });
    }

    const now = new Date().toISOString();
    if (emiContract) {
      for (const payment of emiPayments) {
        if (payment.status !== 'ACTIVE') continue;
        await tx.emi.updatePayment(payment.id, {
          status: 'REVERSED',
          reversedAt: now,
          reverseReason: input.reason,
        });
      }
    }
    const voided = await tx.sales.markVoided(sale.id, {
      status: 'VOIDED',
      voidedAt: now,
      voidedById: input.actorId,
      voidedByName: input.actorName,
      voidReason: input.reason,
      refundAmount,
      refundMethod: refundAmount > 0 ? input.refundMethod as PaymentMethod : null,
      voidIdempotencyKey: input.idempotencyKey,
    });
    if (emiContract) {
      await tx.emi.updateContract(emiContract.id, { status: 'VOIDED', voidedAt: now, updatedAt: now });
      for (const installment of await tx.emi.findInstallments(emiContract.id)) {
        await tx.emi.updateInstallment(installment.id, { status: 'VOIDED', updatedAt: now });
      }
    }
    return voided;
  });
}
