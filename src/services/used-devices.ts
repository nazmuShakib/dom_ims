import type { ProductUnit, RefurbishmentExpense, StockMovement, UsedDeviceAcquisition } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { normalizeBangladeshMobile } from '@/lib/phone';
import { db, type Repositories } from '@/repositories';
import {
  acceptUsedDeviceSchema,
  refurbishmentExpenseSchema,
  type AcceptUsedDeviceInput,
  type RefurbishmentExpenseInput,
  updateUsedDeviceSchema,
  type UpdateUsedDeviceInput,
} from '@/schemas';

export interface AcceptedUsedDevice {
  unit: ProductUnit;
  acquisition: UsedDeviceAcquisition;
  movement: StockMovement;
}

async function assertVoidedUnitCanBeReceivedAgain(
  tx: Repositories,
  unit: ProductUnit,
  productId: string,
): Promise<void> {
  if (unit.status !== 'VOID') {
    throw new Error(`Device number ${unit.serialNo} already exists (${unit.status.replaceAll('_', ' ').toLowerCase()}).`);
  }
  if (unit.productId !== productId) {
    throw new Error(`Device number ${unit.serialNo} belongs to a different product and cannot be revived here.`);
  }

  const [claims, expenses, latestAcquisition] = await Promise.all([
    tx.warranties.findAll({ unitId: unit.id }),
    tx.refurbishmentExpenses.findByUnit(unit.id),
    tx.usedDeviceAcquisitions.findByUnit(unit.id),
  ]);
  if (claims.length > 0 || expenses.length > 0 || latestAcquisition?.tradeInSaleId) {
    throw new Error(
      `Device number ${unit.serialNo} has later warranty, refurbishment, or invoice history and cannot be reused automatically.`,
    );
  }
}

export async function updateUsedDeviceDetails(raw: UpdateUsedDeviceInput): Promise<ProductUnit> {
  const input = updateUsedDeviceSchema.parse(raw);
  return db.transaction(async (tx) => {
    const unit = await tx.units.findById(input.unitId);
    if (!unit?.usedGrade) throw new Error('Used phone not found.');
    if (unit.status !== 'IN_STOCK') throw new Error('A sold or removed used phone cannot be repriced.');
    return tx.units.updateDetails(unit.id, {
      usedGrade: input.grade,
      batteryHealth: input.batteryHealth ?? null,
      knownDefects: input.knownDefects ?? null,
      includedAccessories: input.includedAccessories ?? null,
      askingPrice: input.askingPrice,
      warrantyMonths: input.warrantyMonths ?? null,
      warrantyDays: input.warrantyDays ?? null,
    });
  });
}

/**
 * Accepts an already-inspected used phone. There is intentionally no pending
 * intake: the unit, acquisition history and +1 ledger row commit together.
 */
export async function acceptUsedDevice(raw: AcceptUsedDeviceInput): Promise<AcceptedUsedDevice> {
  const input = acceptUsedDeviceSchema.parse(raw);
  return db.transaction((tx) => acceptUsedDeviceInTransaction(input, tx));
}

/** The transaction-aware form is used by checkout so trade-in stock and sale are atomic. */
export async function acceptUsedDeviceInTransaction(
  raw: AcceptUsedDeviceInput,
  tx: Repositories,
): Promise<AcceptedUsedDevice> {
    const input = acceptUsedDeviceSchema.parse(raw);
    const replay = await tx.usedDeviceAcquisitions.findByIdempotencyKey(input.idempotencyKey);
    if (replay) {
      const [unit, movement] = await Promise.all([
        tx.units.findById(replay.unitId),
        tx.movements.findByIdempotencyKey(input.idempotencyKey),
      ]);
      if (!unit || !movement) throw new Error('The previous used-device receipt is incomplete.');
      return { unit, acquisition: replay, movement };
    }

    const product = await tx.products.findById(input.productId);
    if (!product?.isActive || product.trackingType !== 'SERIAL') {
      throw new Error('Choose an active serial-tracked phone product.');
    }
    const existingUnit = await tx.units.findBySerial(input.serialNo);
    if (existingUnit) await assertVoidedUnitCanBeReceivedAgain(tx, existingUnit, product.id);

    const now = new Date().toISOString();
    const unitValues: ProductUnit = {
      id: uuidv7(),
      serialNo: input.serialNo,
      productId: product.id,
      status: 'IN_STOCK',
      costPrice: input.acquisitionValue,
      salePrice: null,
      supplierId: null,
      receivedAt: now,
      soldAt: null,
      warrantyMonths: input.warrantyMonths ?? null,
      warrantyDays: input.warrantyDays ?? null,
      warrantyExpiresAt: null,
      location: input.location ?? null,
      note: input.note ?? null,
      usedGrade: input.grade,
      batteryHealth: input.batteryHealth ?? null,
      inspectionResults: input.inspectionResults,
      knownDefects: input.knownDefects ?? null,
      includedAccessories: input.includedAccessories ?? null,
      askingPrice: input.askingPrice,
      createdAt: now,
      updatedAt: now,
    };
    const unit = existingUnit
      ? await tx.units.transitionStatus(existingUnit.id, 'VOID', 'IN_STOCK', {
          costPrice: unitValues.costPrice,
          salePrice: null,
          supplierId: null,
          receivedAt: now,
          soldAt: null,
          warrantyMonths: unitValues.warrantyMonths,
          warrantyDays: unitValues.warrantyDays,
          warrantyExpiresAt: null,
          location: unitValues.location,
          note: unitValues.note,
          usedGrade: unitValues.usedGrade,
          batteryHealth: unitValues.batteryHealth,
          inspectionResults: unitValues.inspectionResults,
          knownDefects: unitValues.knownDefects,
          includedAccessories: unitValues.includedAccessories,
          askingPrice: unitValues.askingPrice,
        })
      : unitValues;
    if (!existingUnit) await tx.units.createMany([unit]);

    const movement = await tx.movements.record({
      id: uuidv7(),
      type: 'IN',
      reason: input.acquisitionType === 'TRADE_IN' ? 'TRADE_IN' : 'PURCHASE',
      productId: product.id,
      unitId: unit.id,
      quantity: 1,
      unitCost: input.acquisitionValue,
      unitPrice: null,
      supplierId: null,
      customerName: input.sellerName,
      customerPhone: normalizeBangladeshMobile(input.sellerPhone),
      reference: input.reference ?? null,
      note: input.note ?? null,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reversesId: null,
      createdAt: now,
    });

    const acquisition = await tx.usedDeviceAcquisitions.create({
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      unitId: unit.id,
      type: input.acquisitionType,
      sellerName: input.sellerName,
      sellerPhone: normalizeBangladeshMobile(input.sellerPhone),
      identificationType: input.identificationType ?? null,
      identificationNumber: input.identificationNumber ?? null,
      acquisitionValue: input.acquisitionValue,
      ownershipConfirmed: true,
      acceptedById: input.actorId,
      reference: input.reference ?? null,
      note: input.note ?? null,
      acquiredAt: now,
      createdAt: now,
      tradeInSaleId: null,
    });

    return { unit, acquisition, movement };
}

/** Adds a directly attributable pre-sale refurbishment cost to exact unit cost. */
export async function addRefurbishmentExpense(
  raw: RefurbishmentExpenseInput,
): Promise<{ unit: ProductUnit; expense: RefurbishmentExpense }> {
  const input = refurbishmentExpenseSchema.parse(raw);
  return db.transaction(async (tx) => {
    const unit = await tx.units.findById(input.unitId);
    if (!unit || !unit.usedGrade) throw new Error('Used phone not found.');
    if (unit.status !== 'IN_STOCK') throw new Error('Refurbishment costs can only be added before the phone is sold.');

    const expense = await tx.refurbishmentExpenses.create({
      id: uuidv7(),
      unitId: unit.id,
      description: input.description,
      amount: input.amount,
      actorId: input.actorId,
      createdAt: new Date().toISOString(),
    });
    const nextCostPrice = unit.costPrice + input.amount;
    const updated = await tx.units.updateDetails(unit.id, {
      costPrice: nextCostPrice,
      // Preserve a deliberately chosen selling price. If the price was unset
      // or still followed cost, keep it following cost after this expense.
      askingPrice: unit.askingPrice === null || unit.askingPrice === unit.costPrice
        ? nextCostPrice
        : unit.askingPrice,
    });
    return { unit: updated, expense };
  });
}
