import { z } from 'zod';

import type {
  CartDraft, Customer, PaymentMethod, PaymentStatus, Sale, SaleItem, Role,
  TradeInCartDraft, EmiTerm,
} from '@/domain/types';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { formatBDT } from '@/lib/money';
import { hasPermission } from '@/lib/permissions';
import { normalizeBangladeshMobile } from '@/lib/phone';
import { dhakaDateKey } from '@/lib/time';
import { db, type Repositories } from '@/repositories';
import {
  checkoutSchema, localCheckoutLinesSchema, createCustomerSchema,
  acceptUsedDeviceSchema, regularCheckoutPaymentSchema,
  type CreateCustomerInput, type AcceptUsedDeviceInput,
} from '@/schemas';
import { acceptUsedDeviceInTransaction } from '@/services/used-devices';
import { installmentAmounts, installmentDates } from '@/services/emi';

const checkoutSubmissionSchema = checkoutSchema.extend({
  actorName: z.string().min(1),
  actorRole: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
  lines: localCheckoutLinesSchema,
  customerId: z.string().uuid().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  tradeInPayoutMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  reference: z.string().trim().max(100).nullable(),
  note: z.string().trim().max(1000).nullable(),
  isEmi: z.boolean(),
  emiTermMonths: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]).nullable(),
  emiDownPayment: z.number().int().nonnegative(),
  emiFirstDueDate: z.string().datetime().nullable(),
  identificationType: z.enum(['NID', 'PASSPORT', 'BIRTH_CERTIFICATE']).nullable(),
  identificationNumber: z.string().trim().max(100).nullable(),
  auditIp: z.string().trim().max(255).nullable(),
});

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return normalizeBangladeshMobile(value);
}

export async function getOrCreateCart(actorId: string): Promise<CartDraft> {
  return db.transaction(async (tx) => {
    const existing = await tx.carts.findByActor(actorId);
    if (existing) return existing;
    const now = new Date().toISOString();
    return tx.carts.create({
      id: uuidv7(), actorId, tradeInDraft: null, createdAt: now, updatedAt: now,
    });
  });
}

async function ownedCart(repositories: Repositories, cartId: string, actorId: string): Promise<CartDraft> {
  const cart = await repositories.carts.findById(cartId);
  if (!cart || cart.actorId !== actorId) throw new Error('Draft cart not found.');
  return cart;
}

export async function createCustomer(
  raw: CreateCustomerInput,
  repositories: Repositories = db,
): Promise<Customer> {
  const input = createCustomerSchema.parse(raw);
  const phoneNormalized = normalizePhone(input.phone);
  if (phoneNormalized) {
    const existing = await repositories.customers.findByNormalizedPhone(phoneNormalized);
    if (existing) throw new Error(`That phone number already belongs to ${existing.name}.`);
  }
  const now = new Date().toISOString();
  return repositories.customers.create({
    id: uuidv7(), name: input.name, phone: input.phone ?? null, phoneNormalized,
    identificationType: null, identificationNumber: null, isActive: true,
    createdAt: now, updatedAt: now,
  });
}

export async function discardCart(cartId: string, actorId: string): Promise<{ cart: CartDraft }> {
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, cartId, actorId);
    await tx.carts.delete(cart.id);
    return { cart };
  });
}

export async function saveTradeInDraft(raw: AcceptUsedDeviceInput & { cartId: string }): Promise<CartDraft> {
  const input = acceptUsedDeviceSchema.parse({ ...raw, acquisitionType: 'TRADE_IN' });
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, raw.cartId, input.actorId);
    const product = await tx.products.findById(input.productId);
    if (!product?.isActive || product.trackingType !== 'SERIAL') {
      throw new Error('Choose an active serial-tracked phone product.');
    }
    const duplicate = await tx.units.findBySerial(input.serialNo);
    if (duplicate && duplicate.status !== 'VOID') {
      throw new Error(`Device number ${input.serialNo} already exists (${duplicate.status.replaceAll('_', ' ').toLowerCase()}).`);
    }
    if (duplicate && duplicate.productId !== input.productId) {
      throw new Error(`Device number ${input.serialNo} belongs to a different product and cannot be revived here.`);
    }
    const draft: TradeInCartDraft = {
      productId: input.productId,
      serialNo: input.serialNo,
      grade: input.grade,
      batteryHealth: input.batteryHealth ?? null,
      inspectionResults: input.inspectionResults,
      knownDefects: input.knownDefects ?? null,
      includedAccessories: input.includedAccessories ?? null,
      askingPrice: input.askingPrice,
      warrantyMonths: input.warrantyMonths ?? null,
      warrantyDays: input.warrantyDays ?? null,
      location: input.location ?? null,
      sellerName: input.sellerName,
      sellerPhone: input.sellerPhone,
      identificationType: input.identificationType ?? null,
      identificationNumber: input.identificationNumber ?? null,
      acquisitionValue: input.acquisitionValue,
      reference: input.reference ?? null,
      note: input.note ?? null,
    };
    return tx.carts.update(cart.id, { tradeInDraft: draft });
  });
}

export async function clearTradeInDraft(cartId: string, actorId: string): Promise<CartDraft> {
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, cartId, actorId);
    return tx.carts.update(cart.id, { tradeInDraft: null });
  });
}

export function addCalendarMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function addDateKeyDays(dateKey: string, days: number): string {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isEmiFirstDueDateAllowed(firstDueDate: Date, now = new Date()): boolean {
  const firstDueDateKey = dhakaDateKey(firstDueDate);
  const todayKey = dhakaDateKey(now);
  return firstDueDateKey >= todayKey && firstDueDateKey <= addDateKeyDays(todayKey, 31);
}

export function checkoutTransactionTimeout(lineCount: number): number {
  return Math.min(120_000, Math.max(15_000, 10_000 + Math.max(1, lineCount) * 400));
}

function ownedCheckoutReplay(
  replay: Sale,
  input: Pick<z.infer<typeof checkoutSubmissionSchema>, 'actorId' | 'cartId'>,
): Sale {
  if (replay.actorId !== input.actorId || replay.checkoutCartId !== input.cartId) {
    throw new Error('This checkout request belongs to a different cart or seller. Start a fresh checkout.');
  }
  return replay;
}

/**
 * Validate the untrusted local browser draft and commit the complete sale in
 * one transaction. Ordinary cart fields are never persisted before checkout;
 * only a protected trade-in draft may live on CartDraft.
 */
export async function checkoutCart(raw: {
  cartId: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  idempotencyKey: string;
  lines: unknown;
  customerId: string | null;
  paymentMethod: PaymentMethod;
  tradeInPayoutMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  reference: string | null;
  note: string | null;
  isEmi: boolean;
  emiTermMonths: EmiTerm | null;
  emiDownPayment: number;
  emiFirstDueDate: string | null;
  identificationType: 'NID' | 'PASSPORT' | 'BIRTH_CERTIFICATE' | null;
  identificationNumber: string | null;
  auditIp: string | null;
}, repositories: Repositories = db): Promise<Sale> {
  const input = checkoutSubmissionSchema.parse(raw);
  return repositories.transaction(async (tx) => {
    let replay = await tx.sales.findByIdempotencyKey(input.idempotencyKey);
    if (replay) return ownedCheckoutReplay(replay, input);

    const cart = await tx.carts.findByIdForUpdate(input.cartId);
    if (!cart) {
      // A concurrent request may have completed and deleted this cart while
      // this transaction waited for its row lock. Re-read after the wait.
      replay = await tx.sales.findByIdempotencyKey(input.idempotencyKey);
      if (replay) return ownedCheckoutReplay(replay, input);
      throw new Error('Draft cart not found.');
    }
    if (cart.actorId !== input.actorId) throw new Error('Draft cart not found.');
    replay = await tx.sales.findByIdempotencyKey(input.idempotencyKey);
    if (replay) return ownedCheckoutReplay(replay, input);
    if (cart.tradeInDraft && !hasPermission(input.actorRole, 'MANAGE_USED_DEVICES')) {
      throw new Error('Manager or Admin approval is required to complete a checkout with a trade-in.');
    }
    const customer = input.customerId ? await tx.customers.findById(input.customerId) : null;
    if (input.customerId && !customer?.isActive) throw new Error('The selected customer is unavailable.');

    if (!input.isEmi) {
      regularCheckoutPaymentSchema.parse({
        customerId: customer?.id ?? null,
        paymentStatus: input.paymentStatus,
      });
    }

    if (input.isEmi) {
      if (!customer) throw new Error('Choose a saved customer for an EMI sale.');
      if (!input.identificationType || !input.identificationNumber || input.identificationNumber.length < 3) {
        throw new Error('Add the customer identification type and number before an EMI sale.');
      }
      if (!input.emiTermMonths) throw new Error('Choose a valid EMI term.');
      if (!input.emiFirstDueDate) throw new Error('Choose the first installment date.');
      const firstDueDate = new Date(input.emiFirstDueDate);
      if (!isEmiFirstDueDateAllowed(firstDueDate)) {
        throw new Error('First installment date must be today or within the next 31 days.');
      }
      await tx.customers.update(customer.id, {
        identificationType: input.identificationType,
        identificationNumber: input.identificationNumber,
      });
    }

    const seenUnits = new Set<string>();
    const quantityByProduct = new Map<string, number>();
    const resolved = [];
    for (const [position, line] of input.lines.entries()) {
      const product = await tx.products.findById(line.productId);
      if (!product?.isActive) throw new Error('A product in this cart is no longer available.');
      const unit = line.unitId ? await tx.units.findById(line.unitId) : null;

      if (product.trackingType === 'SERIAL') {
        if (!unit || unit.productId !== product.id || unit.status !== 'IN_STOCK') {
          throw new Error(`${product.name} (${unit?.serialNo ?? 'unknown device number'}) is no longer available.`);
        }
        if (line.quantity !== 1) throw new Error('Individually tracked cart lines must have quantity 1.');
        if (seenUnits.has(unit.id)) throw new Error(`Device number ${unit.serialNo} appears more than once in this cart.`);
        seenUnits.add(unit.id);
      } else {
        if (line.unitId) throw new Error(`${product.name} must be added as a quantity product.`);
        const quantity = (quantityByProduct.get(product.id) ?? 0) + line.quantity;
        if (quantity > product.quantityOnHand) {
          throw new Error(`Only ${product.quantityOnHand} × ${product.name} remain in stock.`);
        }
        quantityByProduct.set(product.id, quantity);
      }

      const listUnitPrice = unit?.askingPrice
        ?? (unit?.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice);
      if (input.actorRole === 'STAFF') {
        const minimumPrice = Math.max(0, listUnitPrice - product.staffMaxDiscount);
        if (line.actualUnitPrice < minimumPrice) {
          throw new Error(`${product.name} must be at least ${formatBDT(minimumPrice)} for STAFF.`);
        }
      }
      resolved.push({
        item: {
          quantity: line.quantity,
          listUnitPrice,
          actualUnitPrice: line.actualUnitPrice,
          position,
        },
        product,
        unit,
      });
    }

    const now = new Date().toISOString();
    const invoiceNumber = await tx.sales.nextInvoiceNumber(new Date(now));
    const subtotal = resolved.reduce((sum, row) => sum + row.item.listUnitPrice * row.item.quantity, 0);
    const total = resolved.reduce((sum, row) => sum + row.item.actualUnitPrice * row.item.quantity, 0);
    const tradeInCredit = cart.tradeInDraft?.acquisitionValue ?? 0;
    if (input.isEmi && resolved.some((row) => row.item.actualUnitPrice % 100 !== 0)) {
      throw new Error('Each EMI selling price must use a whole-taka amount.');
    }
    if (input.isEmi && total <= 0) {
      throw new Error('EMI total must be greater than zero.');
    }
    if (input.isEmi && input.emiDownPayment + tradeInCredit > total) {
      throw new Error('Down payment and trade-in credit cannot exceed the EMI total.');
    }
    if (input.isEmi && [total, input.emiDownPayment, tradeInCredit].some((amount) => amount % 100 !== 0)) {
      throw new Error('EMI price, down payment, and trade-in credit must use whole-taka amounts.');
    }

    const acceptedTradeIn = cart.tradeInDraft
      ? await acceptUsedDeviceInTransaction({
          ...cart.tradeInDraft,
          acquisitionType: 'TRADE_IN',
          ownershipConfirmed: true,
          actorId: input.actorId,
          idempotencyKey: `${input.idempotencyKey}:trade-in`,
        } as AcceptUsedDeviceInput, tx)
      : null;
    const incomingTradeInUnit = acceptedTradeIn?.unit ?? null;
    const incomingTradeInProduct = incomingTradeInUnit
      ? await tx.products.findById(incomingTradeInUnit.productId)
      : null;
    if (cart.tradeInDraft && (!incomingTradeInUnit || !incomingTradeInProduct || !incomingTradeInUnit.usedGrade)) {
      throw new Error('The trade-in device details are incomplete.');
    }

    const regularAmountDue = Math.max(0, total - tradeInCredit);
    const tradeInCashPayout = input.isEmi ? 0 : Math.max(0, tradeInCredit - total);
    const paymentStatus: PaymentStatus = input.isEmi
      ? total - tradeInCredit - input.emiDownPayment > 0 ? 'UNPAID' : 'PAID'
      : regularAmountDue === 0 ? 'PAID' : input.paymentStatus;
    const amountPaid = !input.isEmi && paymentStatus === 'PAID' ? regularAmountDue : 0;

    const sale: Sale = {
      id: uuidv7(),
      invoiceNumber,
      idempotencyKey: input.idempotencyKey,
      checkoutCartId: cart.id,
      status: 'COMPLETED',
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      actorId: input.actorId,
      actorName: input.actorName,
      // An unpaid regular sale has not used a payment channel yet. Normalize
      // this on the trusted boundary even if a client submits CASH or CARD.
      paymentMethod: !input.isEmi && paymentStatus !== 'PAID' ? 'OTHER' : input.paymentMethod,
      paymentStatus,
      amountPaid,
      reference: input.reference,
      note: input.note,
      subtotal,
      discount: subtotal - total,
      total,
      tradeInCredit,
      tradeInDetails: incomingTradeInUnit && incomingTradeInProduct && incomingTradeInUnit.usedGrade
        ? {
            productName: incomingTradeInProduct.name,
            sku: incomingTradeInProduct.sku,
            serialNo: incomingTradeInUnit.serialNo,
            grade: incomingTradeInUnit.usedGrade,
            acquisitionValue: tradeInCredit,
          }
        : null,
      completedAt: now,
      createdAt: now,
      voidedAt: null,
      voidedById: null,
      voidedByName: null,
      voidReason: null,
      refundAmount: null,
      refundMethod: null,
      voidIdempotencyKey: null,
    };
    await tx.sales.create(sale);
    if (acceptedTradeIn) await tx.usedDeviceAcquisitions.attachToSale(acceptedTradeIn.acquisition.id, sale.id);
    if (tradeInCashPayout > 0) {
      await tx.saleSettlements.create({
        id: uuidv7(),
        receiptNumber: await tx.saleSettlements.nextReceiptNumber('TRADE_IN_PAYOUT', new Date(now)),
        idempotencyKey: `${input.idempotencyKey}:trade-in-payout`,
        saleId: sale.id,
        type: 'TRADE_IN_PAYOUT',
        amount: tradeInCashPayout,
        paymentMethod: input.tradeInPayoutMethod,
        reference: input.reference,
        note: input.note,
        recordedById: input.actorId,
        recordedByName: input.actorName,
        recordedAt: now,
        createdAt: now,
      });
    }

    for (const [index, row] of resolved.entries()) {
      const { item, product, unit } = row;
      const unitCost = unit?.costPrice ?? product.avgCostPrice;
      if (unit) {
        await tx.units.transitionStatus(unit.id, 'IN_STOCK', 'SOLD', {
          salePrice: item.actualUnitPrice,
          soldAt: now,
          warrantyExpiresAt: unit.warrantyDays
            ? addDays(now, unit.warrantyDays)
            : unit.warrantyMonths
              ? addCalendarMonths(now, unit.warrantyMonths)
              : null,
        });
      } else {
        await tx.products._applyQuantityDelta(product.id, -item.quantity);
      }

      const movement = await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'SALE', productId: product.id,
        unitId: unit?.id ?? null, quantity: -item.quantity, unitCost,
        unitPrice: item.actualUnitPrice, supplierId: null,
        customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null,
        reference: invoiceNumber, note: input.note, actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:${index + 1}`, reversesId: null,
        warrantyClaimId: null, createdAt: now,
      });

      const saleItem: SaleItem = {
        id: uuidv7(), saleId: sale.id, movementId: movement.id,
        productName: product.name, sku: product.sku, serialNo: unit?.serialNo ?? null,
        listUnitPrice: item.listUnitPrice, warrantyMonths: unit?.warrantyMonths ?? null,
        warrantyDays: unit?.warrantyDays ?? null, usedGrade: unit?.usedGrade ?? null,
        knownDefects: unit?.knownDefects ?? null, position: item.position, createdAt: now,
      };
      await tx.sales.createItem(saleItem);
    }

    if (input.isEmi) {
      const termMonths = input.emiTermMonths as EmiTerm;
      const financedAmount = total - tradeInCredit - input.emiDownPayment;
      const contractId = uuidv7();
      await tx.emi.createContract({
        id: contractId,
        contractNumber: await tx.emi.nextContractNumber(new Date(now)),
        saleId: sale.id,
        customerId: customer!.id,
        status: financedAmount === 0 ? 'PAID' : 'ACTIVE',
        termMonths,
        normalPrice: subtotal,
        emiTotal: total,
        downPayment: input.emiDownPayment,
        tradeInCredit,
        financedAmount,
        firstDueDate: input.emiFirstDueDate!,
        createdById: input.actorId,
        createdByName: input.actorName,
        createdAt: now,
        updatedAt: now,
        completedAt: financedAmount === 0 ? now : null,
        voidedAt: null,
      });
      const dates = installmentDates(new Date(input.emiFirstDueDate!), termMonths);
      const amounts = installmentAmounts(financedAmount, termMonths);
      for (let index = 0; index < termMonths; index += 1) {
        await tx.emi.createInstallment({
          id: uuidv7(), contractId, sequence: index + 1,
          dueDate: dates[index]!.toISOString(), amountDue: amounts[index]!, amountPaid: 0,
          status: financedAmount === 0 ? 'PAID' : 'UPCOMING',
          paidAt: financedAmount === 0 ? now : null, createdAt: now, updatedAt: now,
        });
      }
    }

    await tx.auditLogs.create({
      id: uuidv7(),
      actorId: input.actorId,
      action: 'sale.complete',
      entity: 'Sale',
      entityId: sale.id,
      before: null,
      after: {
        invoiceNumber: sale.invoiceNumber,
        customerId: sale.customerId,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        tradeInCredit: sale.tradeInCredit,
      },
      ip: input.auditIp,
      createdAt: now,
    });
    await tx.carts.delete(cart.id);
    return sale;
  }, { timeout: checkoutTransactionTimeout(input.lines.length) });
}
