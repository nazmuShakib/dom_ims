import { uuidv7 } from '@/lib/ids';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';
import {
  createSupplierReturnSchema,
  settleSupplierReturnSchema,
  cancelSupplierReturnSchema,
  type CreateSupplierReturnInput,
  type SettleSupplierReturnInput,
  type CancelSupplierReturnInput,
} from '@/schemas';
import { correctMovementInTransaction, recordStockOutInTransaction } from '@/services/stock';

export async function createSupplierReturn(raw: CreateSupplierReturnInput) {
  const input = createSupplierReturnSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replayMovement = await tx.movements.findByIdempotencyKey(input.idempotencyKey);
    if (replayMovement) {
      const replay = await tx.supplierReturns.findByMovement(replayMovement.id);
      if (replay) return { supplierReturn: replay, movement: replayMovement };
      throw new Error('The stock movement exists without its supplier-return record. Contact an administrator.');
    }

    const supplier = await tx.suppliers.findById(input.supplierId);
    if (!supplier || !supplier.isActive) throw new Error('Choose an active supplier.');

    const movement = await recordStockOutInTransaction({
      productId: input.productId,
      reason: 'RETURN_TO_SUPPLIER',
      serialNo: input.serialNo,
      quantity: input.quantity,
      supplierId: supplier.id,
      salePrice: undefined,
      customerName: null,
      customerPhone: null,
      reference: input.reference,
      note: input.note,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    }, tx);

    const now = new Date().toISOString();
    const supplierReturn = await tx.supplierReturns.create({
      id: uuidv7(),
      returnNumber: await tx.supplierReturns.nextReturnNumber(new Date(now)),
      movementId: movement.id,
      supplierId: supplier.id,
      reason: input.returnReason,
      status: 'PENDING',
      recoveredAmount: null,
      recoveryMethod: null,
      settlementReference: null,
      settlementNote: null,
      createdById: input.actorId,
      settledById: null,
      sentAt: now,
      settledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { supplierReturn, movement };
  });
}

export async function cancelSupplierReturn(raw: CancelSupplierReturnInput, repositories: Repositories = db) {
  const input = cancelSupplierReturnSchema.parse(raw);
  return repositories.transaction(async (tx) => {
    const current = await tx.supplierReturns.findById(input.returnId);
    if (!current) throw new Error('Supplier return not found.');
    if (current.status !== 'PENDING') throw new Error('Only a pending supplier return can be cancelled.');
    const correction = await correctMovementInTransaction({
      movementId: current.movementId,
      note: `Supplier return ${current.returnNumber} cancelled: ${input.reason}`,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    }, tx, { allowSupplierReturn: true });
    const now = new Date().toISOString();
    const supplierReturn = await tx.supplierReturns.cancel(current.id, {
      status: 'CANCELLED', settlementNote: input.reason, settledById: input.actorId,
      settledAt: now, updatedAt: now,
    });
    return { supplierReturn, correction };
  });
}

export async function settleSupplierReturn(
  raw: SettleSupplierReturnInput,
  repositories: Repositories = db,
) {
  const input = settleSupplierReturnSchema.parse(raw);
  return repositories.transaction(async (tx) => {
    const current = await tx.supplierReturns.findById(input.returnId);
    if (!current) throw new Error('Supplier return not found.');
    if (current.status !== 'PENDING') throw new Error('This supplier return has already been settled.');
    const movement = await tx.movements.findById(current.movementId);
    if (!movement) throw new Error('The linked stock movement is missing.');
    const movements = await tx.movements.findByProduct(movement.productId);
    if (movements.some((item) => item.reversesId === movement.id)) {
      throw new Error('This return movement was reversed and cannot be settled.');
    }
    const now = new Date().toISOString();
    return tx.supplierReturns.settle(current.id, {
      status: 'SETTLED',
      recoveredAmount: input.recoveredAmount,
      recoveryMethod: input.recoveryMethod,
      settlementReference: input.settlementReference ?? null,
      settlementNote: input.settlementNote ?? null,
      settledById: input.actorId,
      settledAt: now,
      updatedAt: now,
    });
  });
}
