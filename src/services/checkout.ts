import { z } from 'zod';

import type {
  CartDraft, Customer, PaymentMethod, PaymentStatus, Sale, SaleItem, Role,
  TradeInCartDraft, EmiTerm,
} from '@/domain/types';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { formatBDT } from '@/lib/money';
import { normalizeBangladeshMobile } from '@/lib/phone';
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

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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
}): Promise<Sale> {
  const input = checkoutSubmissionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.sales.findByIdempotencyKey(input.idempotencyKey);
    if (replay) return replay;

    const cart = await ownedCart(tx, input.cartId, input.actorId);
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const latest = new Date(today);
      latest.setDate(latest.getDate() + 31);
      latest.setHours(23, 59, 59, 999);
      if (firstDueDate < today || firstDueDate > latest) {
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
              ? addMonths(now, unit.warrantyMonths)
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

    await tx.carts.delete(cart.id);
    return sale;
  });
}
