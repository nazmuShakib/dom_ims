'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/repositories';
import { parseBDT } from '@/lib/money';
import { requireCapability, getSession, canSeeCosts } from '@/lib/session';
import { toProductUnitDTO, type ProductUnitDTO } from '@/lib/dto';
import { writeAudit } from '@/lib/audit';
import { correctMovement, receiveStock, recordStockOut } from '@/services/stock';
import { createSupplierReturn } from '@/services/supplier-returns';
import type { MovementReason, UnitStatus } from '@/domain/types';

/**
 * Phase 2 (PLAN.md §16). These are thin — every one of them just validates the
 * form and hands off to `src/services/stock.ts`, which owns the transaction, the
 * ledger write and the concurrency guard.
 *
 * Business logic does NOT live here. If you find yourself writing a stock rule in
 * this file, it belongs in the service.
 */

export interface StockActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  labelReceiptId?: string;
  receipt?: {
    productId: string;
    productName: string;
    sku: string;
    trackingType: 'SERIAL' | 'QUANTITY';
    count: number;
    unitCost: number;
    totalCost: number;
    supplierId: string | null;
    reason: 'PURCHASE' | 'INITIAL_STOCK' | 'CUSTOMER_RETURN';
    reference: string | null;
    location: string | null;
  };
  supplierReturn?: {
    id: string;
    returnNumber: string;
    productName: string;
    sku: string;
    serialNo: string | null;
    quantity: number;
  };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] ??= i.message;
  return out;
}

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Invalid input';
  return err instanceof Error ? err.message : 'Something went wrong';
}

/* --- Serial lookup: the counter flow -------------------------------------- */

export interface SerialLookup {
  unit: ProductUnitDTO;
  productId: string;
  productName: string;
  sku: string;
  suggestedPrice: number;
}

/**
 * A customer puts a device on the counter. You type its IMEI. This is that.
 * Resolves the serial to its unit AND its product, so the operator never has to
 * know which product row it belongs to.
 */
export async function lookupSerial(
  _prev: { error?: string; found?: SerialLookup },
  fd: FormData,
): Promise<{ error?: string; found?: SerialLookup }> {
  const actor = await requireCapability('REMOVE_STOCK');
  const { role } = actor;
  const serial = str(fd, 'serialNo');
  if (!serial) return { error: 'Enter a device number or IMEI' };

  const unit = await db.units.findBySerial(serial);
  if (!unit) return { error: `No item with device number ${serial}. Check the number, or receive it first.` };

  if (unit.status !== 'IN_STOCK') {
    return {
      error: `That unit is ${unit.status.replace('_', ' ').toLowerCase()}, so it isn't in stock. Nothing to take out.`,
    };
  }

  const product = await db.products.findById(unit.productId);
  if (!product) return { error: 'That unit points at a product that no longer exists.' };

  return {
    found: {
      unit: toProductUnitDTO(unit, role),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      suggestedPrice: product.defaultSalePrice,
    },
  };
}

/* --- Stock in -------------------------------------------------------------- */

export interface StockSerialConflict {
  serialNo: string;
  status: UnitStatus;
}

export async function preflightStockSerials(input: {
  productId: string;
  serialNumbers: string[];
}): Promise<{ conflicts?: StockSerialConflict[]; error?: string }> {
  await requireCapability('MOVE_STOCK');

  const parsed = z.object({
    productId: z.string().uuid(),
    serialNumbers: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid device-number check request.' };

  const product = await db.products.findById(parsed.data.productId);
  if (!product || product.trackingType !== 'SERIAL') {
    return { error: 'The selected serialized product is unavailable.' };
  }

  const existing = await db.units.findBySerials(parsed.data.serialNumbers);
  return {
    conflicts: existing
      .filter((unit) => unit.status !== 'VOID' || unit.productId !== product.id)
      .map((unit) => ({ serialNo: unit.serialNo, status: unit.status })),
  };
}

export async function receiveStockAction(
  _prev: StockActionState,
  fd: FormData,
): Promise<StockActionState> {
  const actor = await requireCapability('MOVE_STOCK');

  const productId = str(fd, 'productId');
  if (!productId) return { fieldErrors: { productId: 'Choose a product' } };

  const product = await db.products.findById(productId);
  if (!product) return { error: 'Product not found' };

  // Serials come in as a pasted block, one per line — that's how a delivery note
  // is actually read out. Split, trim, drop blanks.
  const serialBlock = str(fd, 'serialNumbers');
  const serialNumbers = serialBlock
    ? serialBlock.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  const qtyRaw = str(fd, 'quantity');

  let count: number;
  let labelReceiptId: string | undefined;
  let receipt: StockActionState['receipt'];
  try {
    const supplierId = str(fd, 'supplierId');
    const unitCost = parseBDT(str(fd, 'unitCost') ?? '0');
    const reason = (str(fd, 'reason') ?? 'PURCHASE') as 'PURCHASE' | 'INITIAL_STOCK' | 'CUSTOMER_RETURN';
    const location = str(fd, 'location');
    const reference = str(fd, 'reference');
    const warrantyDuration = str(fd, 'warrantyDuration') ? Number(str(fd, 'warrantyDuration')) : null;
    const warrantyUnit = str(fd, 'warrantyUnit') ?? 'MONTHS';
    const movements = await receiveStock({
      productId,
      supplierId,
      unitCost,
      reason,
      serialNumbers: product.trackingType === 'SERIAL' ? serialNumbers : undefined,
      quantity: product.trackingType === 'QUANTITY' && qtyRaw ? Number(qtyRaw) : undefined,
      warrantyMonths: warrantyUnit === 'MONTHS' ? warrantyDuration : null,
      warrantyDays: warrantyUnit === 'DAYS' ? warrantyDuration : null,
      unitCondition: str(fd, 'unitCondition') === 'REFURBISHED' ? 'REFURBISHED' : 'NEW',
      location,
      reference,
      note: str(fd, 'note'),
      actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    count = movements.reduce((n, m) => n + m.quantity, 0);
    labelReceiptId = movements[0]?.id;
    receipt = {
      productId,
      productName: product.name,
      sku: product.sku,
      trackingType: product.trackingType,
      count,
      unitCost,
      totalCost: unitCost * count,
      supplierId,
      reason,
      reference,
      location,
    };
    await writeAudit({
      actorId: actor.id,
      action: 'stock.in',
      entity: 'StockMovement',
      entityId: movements[0]?.id,
      after: { movementIds: movements.map((movement) => movement.id), productId, count, unitCondition: str(fd, 'unitCondition') === 'REFURBISHED' ? 'REFURBISHED' : 'NEW', warrantyDuration, warrantyUnit },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: zodErrors(err) };
    return { error: message(err) };
  }

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  revalidatePath('/stock/movements');

  return {
    ok: `Received ${count} × ${product.name} into stock.`,
    labelReceiptId,
    receipt,
  };
}

/* --- Stock out ------------------------------------------------------------- */

export async function stockOutAction(
  _prev: StockActionState,
  fd: FormData,
): Promise<StockActionState> {
  const actor = await requireCapability('REMOVE_STOCK');

  const productId = str(fd, 'productId');
  if (!productId) return { error: 'Missing product' };

  const product = await db.products.findById(productId);
  if (!product) return { error: 'Product not found' };

  const reason = (str(fd, 'reason') ?? 'DAMAGE') as MovementReason;
  if (reason === 'SALE') {
    return { error: 'Use Checkout for every sale so an invoice and complete sale record are created.' };
  }
  const qtyRaw = str(fd, 'quantity');

  try {
    const common = {
      productId,
      serialNo: product.trackingType === 'SERIAL' ? (str(fd, 'serialNo') ?? undefined) : undefined,
      quantity:
        product.trackingType === 'QUANTITY' && qtyRaw ? Number(qtyRaw) : undefined,
      salePrice: undefined,
      customerName: null,
      customerPhone: null,
      reference: str(fd, 'reference'),
      note: str(fd, 'note'),
      actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    };
    const result = reason === 'RETURN_TO_SUPPLIER'
      ? await createSupplierReturn({
          ...common,
          reason,
          supplierId: str(fd, 'supplierId') ?? '',
          returnReason: (str(fd, 'returnReason') ?? 'OTHER') as 'SLOW_MOVING' | 'EXCESS_STOCK' | 'WRONG_ITEM' | 'DEFECTIVE' | 'RECALL' | 'OTHER',
        })
      : { movement: await recordStockOut({
          ...common,
          reason: reason as 'DAMAGE' | 'LOSS' | 'INTERNAL_USE' | 'SHOP_USE' | 'GIFT',
        }), supplierReturn: undefined };
    const { movement } = result;
    await writeAudit({
      actorId: actor.id,
      action: 'stock.out',
      entity: 'StockMovement',
      entityId: movement.id,
      after: movement,
    });
    if (result.supplierReturn) {
      await writeAudit({
        actorId: actor.id,
        action: 'supplier_return.create',
        entity: 'SupplierReturn',
        entityId: result.supplierReturn.id,
        after: result.supplierReturn,
      });
    }
    revalidatePath('/products');
    revalidatePath(`/products/${productId}`);
    revalidatePath('/stock/movements');
    revalidatePath('/suppliers/returns');
    const what = product.trackingType === 'SERIAL' ? str(fd, 'serialNo') : `${qtyRaw} × ${product.name}`;
    return {
      ok: `Removed ${what}.`,
      supplierReturn: result.supplierReturn
        ? {
            id: result.supplierReturn.id,
            returnNumber: result.supplierReturn.returnNumber,
            productName: product.name,
            sku: product.sku,
            serialNo: product.trackingType === 'SERIAL' ? (str(fd, 'serialNo') ?? null) : null,
            quantity: product.trackingType === 'SERIAL' ? 1 : Number(qtyRaw),
          }
        : undefined,
    };
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: zodErrors(err) };
    if (err instanceof Error && (
      err.message.includes('Invalid `client.')
      || err.message.includes('Error occurred during query execution')
      || err.message.includes('ConnectorError')
    )) {
      console.error('Stock removal database error:', err);
      return { error: 'The stock removal could not be completed. Please try again or contact an administrator.' };
    }
    return { error: message(err) };
  }
}

/* --- Corrections ----------------------------------------------------------- */

/**
 * The ONLY way to undo a movement. Writes an opposing ledger entry — it never
 * edits or deletes the original. PLAN.md §8.3.
 */
export async function reverseMovementAction(
  _prev: StockActionState,
  fd: FormData,
): Promise<StockActionState> {
  const actor = await requireCapability('CORRECT_STOCK');

  const movementId = str(fd, 'movementId');
  const note = str(fd, 'note');
  if (!movementId) return { error: 'Missing movement' };
  if (!note) return { fieldErrors: { note: 'Say why this is being reversed — it goes in the audit trail' } };

  try {
    const correction = await correctMovement({
      movementId,
      note,
      actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({
      actorId: actor.id,
      action: 'stock.correct',
      entity: 'StockMovement',
      entityId: correction.id,
      after: correction,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: zodErrors(err) };
    return { error: message(err) };
  }

  revalidatePath('/products');
  revalidatePath('/stock/movements');
  return { ok: 'Reversed. The original entry is still in the ledger, with the correction beneath it.' };
}

/* --- Reconciliation -------------------------------------------------------- */

export async function runReconcile(): Promise<void> {
  await requireCapability('CORRECT_STOCK');
  revalidatePath('/stock/reconcile');
  redirect('/stock/reconcile');
}

export async function canViewCosts(): Promise<boolean> {
  const { role } = await getSession();
  return canSeeCosts(role);
}
