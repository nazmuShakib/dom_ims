'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import {
  checkoutCart,
  clearTradeInDraft,
  createCustomer,
  discardCart,
} from '@/services/checkout';
import { emiVoidRefundAmount } from '@/lib/emi-summary';
import { voidSale } from '@/services/sales';
import { type PaymentMethod, type PaymentStatus } from '@/domain/types';
import {
  createCustomerSchema,
  emiCheckoutFieldsSchema,
  regularCheckoutPaymentSchema,
  voidInvoiceFieldsSchema,
  type CreateCustomerInput,
} from '@/schemas';

export interface CheckoutActionState {
  error?: string;
  ok?: string;
}

export interface CustomerActionState extends CheckoutActionState {
  fieldErrors?: Partial<Record<keyof CreateCustomerInput, string>>;
  customerId?: string;
}

export interface VoidInvoiceActionState extends CheckoutActionState {
  fieldErrors?: Partial<Record<'reason' | 'refundMethod' | 'confirmed', string>>;
}

const voidInvoiceFormSchema = voidInvoiceFieldsSchema.extend({
  saleId: z.string().uuid('The invoice identifier is invalid.'),
  idempotencyKey: z.string().min(8, 'The void request is not ready. Close the dialog and try again.'),
});

function voidFieldErrors(error: z.ZodError): VoidInvoiceActionState['fieldErrors'] {
  const result: VoidInvoiceActionState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === 'reason' || field === 'refundMethod' || field === 'confirmed') && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}

function customerFieldErrors(error: z.ZodError): CustomerActionState['fieldErrors'] {
  const result: CustomerActionState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === 'name' || field === 'phone') && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}

function str(fd: FormData, key: string): string | null {
  const value = fd.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Invalid input.';
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export async function discardCartAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const discarded = await discardCart(str(fd, 'cartId') ?? '', actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'cart.discard',
      entity: 'CartDraft',
      entityId: discarded.cart.id,
      before: {
        hadTradeIn: Boolean(discarded.cart.tradeInDraft),
      },
    });
    revalidatePath('/checkout');
    return { ok: 'Draft discarded. A fresh empty draft is ready.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function expireCartDraftAction(fd: FormData): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const discarded = await discardCart(str(fd, 'cartId') ?? '', actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'cart.expire',
      entity: 'CartDraft',
      entityId: discarded.cart.id,
      before: {
        hadTradeIn: Boolean(discarded.cart.tradeInDraft),
      },
    });
    revalidatePath('/checkout');
    return { ok: 'Expired draft removed.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function clearTradeInDraftAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const cart = await clearTradeInDraft(str(fd, 'cartId') ?? '', actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'trade_in.draft_discard',
      entity: 'CartDraft',
      entityId: cart.id,
    });
    revalidatePath('/checkout');
    return { ok: 'Trade-in removed from this checkout.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function createCustomerAction(
  _previous: CustomerActionState,
  fd: FormData,
): Promise<CustomerActionState> {
  const actor = await requireCapability('MANAGE_CUSTOMERS');
  const parsed = createCustomerSchema.safeParse({
    name: typeof fd.get('name') === 'string' ? fd.get('name') : '',
    phone: typeof fd.get('phone') === 'string' ? fd.get('phone') : '',
  });
  if (!parsed.success) {
    return { fieldErrors: customerFieldErrors(parsed.error) };
  }
  try {
    const customer = await createCustomer(parsed.data);
    await writeAudit({
      actorId: actor.id,
      action: 'customer.create',
      entity: 'Customer',
      entityId: customer.id,
      after: { name: customer.name, phone: customer.phone },
    });
    revalidatePath('/checkout');
    revalidatePath('/customers');
    return { ok: `${customer.name} created.`, customerId: customer.id };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function checkoutAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  let saleId: string;
  try {
    const cartId = str(fd, 'cartId') ?? '';
    const localLinesRaw = str(fd, 'localCartLines');
    if (!localLinesRaw) throw new Error('The browser cart is missing. Add the items again and retry.');
    let localLines: unknown;
    try {
      localLines = JSON.parse(localLinesRaw);
    } catch {
      throw new Error('The browser cart could not be read. Add the items again and retry.');
    }
    const isEmi = str(fd, 'saleMode') === 'EMI';
    const parsedEmi = isEmi ? emiCheckoutFieldsSchema.parse({
      isEmi: true,
      termMonths: str(fd, 'emiTermMonths') ?? '',
      downPayment: str(fd, 'emiDownPayment') ?? '',
      firstDueDate: str(fd, 'emiFirstDueDate') ?? '',
      identificationType: str(fd, 'identificationType') ?? '',
      identificationNumber: str(fd, 'identificationNumber') ?? '',
    }) : null;
    const details = parsedEmi ? {
      isEmi: true,
      emiTermMonths: parsedEmi.termMonths as 3 | 6 | 9 | 12,
      emiDownPayment: parsedEmi.downPayment,
      emiFirstDueDate: parsedEmi.firstDueDate.toISOString(),
      identificationType: parsedEmi.identificationType,
      identificationNumber: parsedEmi.identificationNumber,
    } : {
      isEmi: false,
      emiTermMonths: null,
      emiDownPayment: 0,
      emiFirstDueDate: null,
      identificationType: null,
      identificationNumber: null,
    };
    const customerId = str(fd, 'customerId');
    const regularPayment = !isEmi ? regularCheckoutPaymentSchema.parse({
      customerId,
      paymentStatus: str(fd, 'paymentStatus') ?? 'PAID',
    }) : null;
    const sale = await checkoutCart({
      cartId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
      lines: localLines,
      customerId: regularPayment?.customerId ?? customerId,
      paymentMethod: (str(fd, 'paymentMethod') ?? 'CASH') as PaymentMethod,
      tradeInPayoutMethod: (str(fd, 'tradeInPayoutMethod') ?? 'CASH') as PaymentMethod,
      paymentStatus: (regularPayment?.paymentStatus ?? 'UNPAID') as PaymentStatus,
      reference: str(fd, 'reference'),
      note: str(fd, 'note'),
      ...details,
    });
    saleId = sale.id;
    await writeAudit({
      actorId: actor.id,
      action: 'sale.complete',
      entity: 'Sale',
      entityId: sale.id,
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
    });
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/');
  revalidatePath('/checkout');
  revalidatePath('/invoices');
  revalidatePath('/products');
  revalidatePath('/stock/movements');
  redirect(`/invoices/${saleId}`);
}

export async function recordInvoicePrintAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState & { printNonce?: string }> {
  const actor = await requireCapability('VIEW_INVOICES');
  const saleId = str(fd, 'saleId') ?? '';
  const layout = str(fd, 'layout') === 'thermal' ? 'thermal' : 'a4';
  const sale = await db.sales.findById(saleId);
  if (!sale) return { error: 'Invoice not found.' };
  await writeAudit({
    actorId: actor.id,
    action: 'invoice.print',
    entity: 'Sale',
    entityId: sale.id,
    after: { invoiceNumber: sale.invoiceNumber, layout },
  });
  return { printNonce: crypto.randomUUID() };
}

export async function voidInvoiceAction(
  _previous: VoidInvoiceActionState,
  fd: FormData,
): Promise<VoidInvoiceActionState> {
  const actor = await requireCapability('VIEW_INVOICES');
  const parsed = voidInvoiceFormSchema.safeParse({
    saleId: str(fd, 'saleId') ?? '',
    idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    reason: str(fd, 'reason') ?? '',
    refundMethod: str(fd, 'refundMethod'),
    confirmed: str(fd, 'confirmed') === 'yes',
  });
  if (!parsed.success) {
    const fieldErrors = voidFieldErrors(parsed.error);
    const hiddenIssue = parsed.error.issues.find((issue) => (
      issue.path[0] === 'saleId' || issue.path[0] === 'idempotencyKey'
    ));
    return { fieldErrors, error: hiddenIssue?.message };
  }

  try {
    const before = await db.sales.findById(parsed.data.saleId);
    const emiContract = before ? await db.emi.findContractBySale(before.id) : null;
    const refundAmount = emiContract
      ? emiVoidRefundAmount(emiContract, await db.emi.findPayments(emiContract.id))
      : before?.paymentStatus === 'PAID'
        ? Math.max(0, before.total - before.tradeInCredit)
        : 0;
    if (refundAmount > 0 && !parsed.data.refundMethod) {
      return { fieldErrors: { refundMethod: 'Choose how the customer was refunded.' } };
    }
    const sale = await voidSale({
      saleId: parsed.data.saleId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason: parsed.data.reason,
      refundMethod: parsed.data.refundMethod as PaymentMethod | null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    try {
      await writeAudit({
        actorId: actor.id,
        action: 'sale.void',
        entity: 'Sale',
        entityId: sale.id,
        before: before ? { status: before.status } : undefined,
        after: {
          invoiceNumber: sale.invoiceNumber,
          status: sale.status,
          reason: sale.voidReason,
          refundAmount: sale.refundAmount,
          refundMethod: sale.refundMethod,
        },
      });
    } catch (auditError) {
      // The immutable Sale record already contains the actor, reason, refund,
      // and timestamp. Do not report the atomic void as failed if this secondary
      // request-metadata log is temporarily unavailable.
      console.error('Invoice void audit-log write failed', auditError);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: voidFieldErrors(error), error: message(error) };
    }
    return { error: message(error) };
  }

  revalidatePath('/');
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${parsed.data.saleId}`);
  revalidatePath('/products');
  revalidatePath('/stock/movements');
  revalidatePath('/reports');
  revalidatePath('/customers');
  return { ok: 'Invoice voided. Inventory and financial records were reversed together.' };
}
