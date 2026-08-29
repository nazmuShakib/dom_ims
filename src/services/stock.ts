import { db } from '@/repositories';
import { idempotencyKey as newKey, uuidv7 } from '@/lib/ids';
import { weightedAvgCost, type Paisa } from '@/lib/money';
import {
  OUTBOUND_UNIT_STATUS,
  type Product,
  type ProductUnit,
  type StockMovement,
} from '@/domain/types';
import {
  receiveStockSchema,
  stockOutSchema,
  correctionSchema,
  type ReceiveStockInput,
  type StockOutInput,
  type CorrectionInput,
} from '@/schemas';
import type { Repositories } from '@/repositories/types';

/**
 * THE CORE OF THE APPLICATION. PLAN.md §8.
 *
 * Every stock-affecting operation runs inside db.transaction(). The unit status,
 * the ledger row, and the cached quantity move together or not at all.
 *
 * INVARIANT (PLAN.md §5.1):
 *   on-hand(product) === SUM(stock_movements.quantity WHERE productId = ...)
 *
 * If you are tempted to change a stock number without writing a movement: don't.
 * That is the one change that quietly destroys the audit trail.
 */

export { newKey as generateIdempotencyKey };

/** On-hand, computed the correct way for each tracking type. */
export async function getOnHand(product: Product): Promise<number> {
  return product.trackingType === 'SERIAL'
    ? db.units.countInStock(product.id)
    : product.quantityOnHand;
}

// ---------------------------------------------------------------------------
// STOCK IN
// ---------------------------------------------------------------------------

export async function receiveStock(raw: ReceiveStockInput): Promise<StockMovement[]> {
  const input = receiveStockSchema.parse(raw);

  return db.transaction(async (tx) => {
    // Idempotency: a retried Server Action must not double-receive stock.
    const existing = await tx.movements.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return [existing];

    const product = await tx.products.findById(input.productId);
    if (!product) throw new Error(`Product not found: ${input.productId}`);

    const type = 'IN' as const;
    const now = new Date().toISOString();

    // ---- SERIAL path: one ProductUnit + one +1 movement per serial ----
    if (product.trackingType === 'SERIAL') {
      const serials = input.serialNumbers ?? [];
      if (serials.length === 0) {
        throw new Error(`${product.sku} is individually tracked — device numbers or IMEIs are required`);
      }

      // A serial belonging to a VOID unit is re-usable: that unit was created in
      // error and reversed out. Receiving it again REVIVES the existing row rather
      // than creating a second one — the serial stays globally unique, and the
      // unit's full history (including the void) stays intact in the ledger.
      const fresh: ProductUnit[] = [];
      const revived: ProductUnit[] = [];

      for (const serialNo of serials) {
        const existing = await tx.units.findBySerial(serialNo);

        if (existing && existing.status !== 'VOID') {
          throw new Error(
            `Device number ${serialNo} is already in the system (${existing.status}). ` +
              `If it was entered by mistake, reverse that movement first.`,
          );
        }

        if (existing && existing.productId !== product.id) {
          throw new Error(
            `Device number ${serialNo} belongs to a different product and cannot be revived here.`,
          );
        }

        if (existing) {
          revived.push(
            await tx.units.transitionStatus(existing.id, 'VOID', 'IN_STOCK', {
              costPrice: input.unitCost,
              supplierId: input.supplierId ?? null,
              receivedAt: now,
              salePrice: null,
              soldAt: null,
              warrantyMonths: input.warrantyMonths ?? null,
              warrantyDays: input.warrantyDays ?? null,
              warrantyExpiresAt: null,
              location: input.location ?? null,
              note: null,
              usedGrade: input.unitCondition === 'REFURBISHED' ? 'REFURBISHED' : null,
              batteryHealth: null,
              inspectionResults: null,
              knownDefects: null,
              includedAccessories: null,
              askingPrice: input.unitCondition === 'REFURBISHED' ? input.unitCost : null,
            }),
          );
          continue;
        }

        fresh.push({
          id: uuidv7(),
          serialNo,
          productId: product.id,
          status: 'IN_STOCK',
          costPrice: input.unitCost,
          salePrice: null,
          supplierId: input.supplierId ?? null,
          receivedAt: now,
          soldAt: null,
          warrantyMonths: input.warrantyMonths ?? null,
          warrantyDays: input.warrantyDays ?? null,
          warrantyExpiresAt: null, // set at sale time, from soldAt + warrantyMonths
          location: input.location ?? null,
          note: null,
          usedGrade: input.unitCondition === 'REFURBISHED' ? 'REFURBISHED' : null,
          batteryHealth: null,
          inspectionResults: null,
          knownDefects: null,
          includedAccessories: null,
          askingPrice: input.unitCondition === 'REFURBISHED' ? input.unitCost : null,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (fresh.length > 0) await tx.units.createMany(fresh);
      const units = [...fresh, ...revived];

      const recorded: StockMovement[] = [];
      for (const unit of units) {
        recorded.push(
          await tx.movements.record({
            id: uuidv7(),
            type,
            reason: input.reason,
            productId: product.id,
            unitId: unit.id,
            quantity: 1, // SIGNED, always +1 for a serial
            unitCost: input.unitCost,
            unitPrice: null,
            supplierId: input.supplierId ?? null,
            customerName: null,
            customerPhone: null,
            reference: input.reference ?? null,
            note: input.note ?? null,
            actorId: input.actorId,
            // Only the first movement of a batch carries the key — it's unique.
            idempotencyKey: recorded.length === 0 ? input.idempotencyKey : null,
            reversesId: null,
            createdAt: now,
          }),
        );
      }
      return recorded;
    }

    // ---- QUANTITY path: one movement, plus cache + weighted-average cost ----
    const qty = input.quantity;
    if (!qty) throw new Error(`${product.sku} is bulk/count-based — a quantity is required`);

    const newAvg = weightedAvgCost(
      product.quantityOnHand,
      product.avgCostPrice,
      qty,
      input.unitCost,
    );

    // ⚠️ Cache write and ledger write are both inside this transaction.
    await tx.products._applyQuantityDelta(product.id, qty, newAvg);

    const movement = await tx.movements.record({
      id: uuidv7(),
      type,
      reason: input.reason,
      productId: product.id,
      unitId: null,
      quantity: qty, // SIGNED, positive
      unitCost: input.unitCost,
      unitPrice: null,
      supplierId: input.supplierId ?? null,
      customerName: null,
      customerPhone: null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reversesId: null,
      createdAt: now,
    });

    return [movement];
  });
}

// ---------------------------------------------------------------------------
// STOCK OUT  — a "sale" is this, with reason=SALE and a salePrice. PLAN.md §1.1.
// ---------------------------------------------------------------------------

export async function recordStockOut(raw: StockOutInput): Promise<StockMovement> {
  const input = stockOutSchema.parse(raw);

  return db.transaction(async (tx) => recordStockOutInTransaction(input, tx));
}

/** Transaction-aware stock removal used by workflows that must link their own
 * record to the movement atomically (for example supplier returns). */
export async function recordStockOutInTransaction(
  raw: StockOutInput,
  tx: Repositories,
): Promise<StockMovement> {
  const input = stockOutSchema.parse(raw);

  {
    const existing = await tx.movements.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const product = await tx.products.findById(input.productId);
    if (!product) throw new Error(`Product not found: ${input.productId}`);

    const now = new Date().toISOString();
    const nextStatus = OUTBOUND_UNIT_STATUS[input.reason] ?? 'SOLD';

    // ---- SERIAL path ----
    if (product.trackingType === 'SERIAL') {
      if (!input.serialNo) {
        throw new Error(`${product.sku} is individually tracked — a device number or IMEI is required`);
      }

      const unit = await tx.units.findBySerial(input.serialNo);
      if (!unit) throw new Error(`Unknown device number or IMEI: ${input.serialNo}`);
      if (unit.productId !== product.id) {
        throw new Error(`Device number ${input.serialNo} belongs to a different product`);
      }

      const warrantyExpiresAt = input.reason === 'SALE'
        ? unit.warrantyDays
          ? addDays(now, unit.warrantyDays)
          : unit.warrantyMonths
            ? addMonths(now, unit.warrantyMonths)
            : null
        : null;

      // ⚠️ OPTIMISTIC CONCURRENCY. Throws if the unit isn't IN_STOCK any more.
      // Two staff selling the same IMEI: the second one fails here rather than
      // corrupting the books. This guard is the whole point. Do not remove it.
      await tx.units.transitionStatus(unit.id, 'IN_STOCK', nextStatus, {
        salePrice: input.reason === 'SALE' ? (input.salePrice ?? null) : null,
        soldAt: input.reason === 'SALE' ? now : null,
        warrantyExpiresAt,
      });

      return tx.movements.record({
        id: uuidv7(),
        type: 'OUT',
        reason: input.reason,
        productId: product.id,
        unitId: unit.id,
        quantity: -1, // SIGNED
        unitCost: unit.costPrice, // exact cost — this unit's own. No FIFO needed.
        unitPrice: input.salePrice ?? null,
        supplierId: input.supplierId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        reversesId: null,
        createdAt: now,
      });
    }

    // ---- QUANTITY path ----
    const qty = input.quantity;
    if (!qty) throw new Error(`${product.sku} is bulk/count-based — a quantity is required`);

    // Throws if this would take stock negative (mirrors the CHECK constraint).
    await tx.products._applyQuantityDelta(product.id, -qty);

    return tx.movements.record({
      id: uuidv7(),
      type: 'OUT',
      reason: input.reason,
      productId: product.id,
      unitId: null,
      quantity: -qty, // SIGNED
      unitCost: product.avgCostPrice,
      unitPrice: input.salePrice ?? null,
      supplierId: input.supplierId ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reversesId: null,
      createdAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// CORRECTION — never edit or delete a movement. Write an opposing one. §8.3.
// ---------------------------------------------------------------------------

export async function correctMovementInTransaction(
  input: CorrectionInput,
  tx: Repositories,
  options: { allowSale?: boolean; allowAttachedTradeIn?: boolean; allowSupplierReturn?: boolean } = {},
): Promise<StockMovement> {
    const original = await tx.movements.findById(input.movementId);
    if (!original) throw new Error(`Movement not found: ${input.movementId}`);

    if (original.reason === 'SALE' && !options.allowSale) {
      throw new Error('Void the complete invoice instead of reversing an individual sale movement.');
    }

    if (original.reason === 'TRADE_IN' && original.unitId && !options.allowAttachedTradeIn) {
      const acquisition = await tx.usedDeviceAcquisitions.findByUnit(original.unitId);
      if (acquisition?.tradeInSaleId) {
        const sale = await tx.sales.findById(acquisition.tradeInSaleId);
        if (sale) {
          throw new Error(
            `This trade-in belongs to invoice ${sale.invoiceNumber}. `
            + 'Void the complete invoice instead of reversing its trade-in movement.',
          );
        }
      }
    }

    if (original.reason === 'RETURN_TO_SUPPLIER' && !options.allowSupplierReturn) {
      const supplierReturn = await tx.supplierReturns.findByMovement(original.id);
      if (supplierReturn) {
        throw new Error('Cancel this return from Supplier Returns instead of reversing its movement directly.');
      }
    }

    const product = await tx.products.findById(original.productId);
    if (!product) throw new Error(`Product not found: ${original.productId}`);

    // Guard 1: a correction is itself a ledger entry. Reversing one would just
    // re-apply the original. Reverse the original instead.
    if (original.reason === 'CORRECTION') {
      throw new Error('This entry is already a correction. Reverse the original movement.');
    }

    // Guard 2: no double-reversal. Reversing twice would move stock twice.
    const siblings = await tx.movements.findByProduct(original.productId);
    const alreadyReversed = siblings.find((m) => m.reversesId === original.id);
    if (alreadyReversed) {
      throw new Error('This movement has already been reversed.');
    }

    const now = new Date().toISOString();

    if (original.unitId) {
      const unit = await tx.units.findById(original.unitId);
      if (!unit) throw new Error(`Unit not found: ${original.unitId}`);

      if (original.quantity > 0) {
        // Reversing an INBOUND movement: this unit should never have entered stock.
        // It becomes VOID — not SOLD. It was never sold, and marking it so would
        // invent a sale and a profit figure out of nothing.
        //
        // We require it to still be IN_STOCK: if it has since been sold, the sale
        // must be reversed first, or we'd be voiding stock that has left the shop.
        await tx.units.transitionStatus(unit.id, 'IN_STOCK', 'VOID', {
          note: `Voided: ${input.note}`,
        });
      } else {
        // Reversing an OUTBOUND movement: the unit comes back into stock.
        // Expect exactly the status that outbound movement set — if it's anything
        // else, someone has touched this unit in between and we must not guess.
        const expected = OUTBOUND_UNIT_STATUS[original.reason] ?? 'SOLD';
        await tx.units.transitionStatus(unit.id, expected, 'IN_STOCK', {
          salePrice: null,
          soldAt: null,
          warrantyExpiresAt: null,
        });
      }
    } else {
      await tx.products._applyQuantityDelta(product.id, -original.quantity);
    }

    return tx.movements.record({
      ...original,
      id: uuidv7(),
      type: 'ADJUST',
      reason: 'CORRECTION',
      quantity: -original.quantity, // the exact opposite
      note: input.note,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reversesId: original.id,
      createdAt: now,
    });
}

export async function correctMovement(raw: CorrectionInput): Promise<StockMovement> {
  const input = correctionSchema.parse(raw);
  return db.transaction(async (tx) => {
    return correctMovementInTransaction(input, tx);
  });
}

// ---------------------------------------------------------------------------
// RECONCILIATION — the cache must always agree with the ledger. §8.4.
// ---------------------------------------------------------------------------

export interface Drift {
  productId: string;
  sku: string;
  name: string;
  onHand: number;
  ledgerSum: number;
  drift: number;
}

export async function reconcile(): Promise<Drift[]> {
  const products = await db.products.findAll();
  const drifts: Drift[] = [];

  for (const product of products) {
    const onHand = await getOnHand(product);
    const ledgerSum = await db.movements.sumQuantity(product.id);
    if (onHand !== ledgerSum) {
      drifts.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        onHand,
        ledgerSum,
        drift: onHand - ledgerSum,
      });
    }
  }
  return drifts; // empty array == healthy. Anything else means a missed transaction.
}

// ---------------------------------------------------------------------------

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export type { Paisa };
