'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/session';
import { invoicePaymentCollectionFieldsSchema, type InvoicePaymentCollectionFieldsInput } from '@/schemas';
import { collectInvoicePayment } from '@/services/sale-settlements';

export interface InvoiceCollectionActionState {
  error?: string;
  ok?: string;
  receiptNumber?: string;
  fieldErrors?: Partial<Record<keyof InvoicePaymentCollectionFieldsInput, string>>;
}

const formSchema = invoicePaymentCollectionFieldsSchema.extend({
  saleId: z.string().uuid('Invoice not found.'),
  idempotencyKey: z.string().min(8, 'Refresh the page and try again.'),
});

const value = (formData: FormData, key: string): string => {
  const entry = formData.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
};

export async function collectInvoicePaymentAction(
  _previous: InvoiceCollectionActionState,
  formData: FormData,
): Promise<InvoiceCollectionActionState> {
  const actor = await requireCapability('VIEW_INVOICES');
  const parsed = formSchema.safeParse({
    saleId: value(formData, 'saleId'),
    idempotencyKey: value(formData, 'idempotencyKey'),
    amount: value(formData, 'amount'),
    paymentMethod: value(formData, 'paymentMethod'),
    reference: value(formData, 'reference'),
    note: value(formData, 'note'),
  });
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      error: parsed.error.issues[0]?.message ?? 'Review the payment details.',
      fieldErrors: {
        amount: flattened.amount?.[0],
        paymentMethod: flattened.paymentMethod?.[0],
        reference: flattened.reference?.[0],
        note: flattened.note?.[0],
      },
    };
  }

  try {
    const result = await collectInvoicePayment({
      saleId: parsed.data.saleId,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      reference: parsed.data.reference,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
      actorId: actor.id,
      actorName: actor.name,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'sale.payment.collect',
      entity: 'SaleSettlement',
      entityId: result.settlement.id,
      after: {
        saleId: parsed.data.saleId,
        receiptNumber: result.settlement.receiptNumber,
        amount: result.settlement.amount,
        amountPaid: result.amountPaid,
        amountDue: result.amountDue,
        paymentStatus: result.paymentStatus,
      },
    });
    revalidatePath('/');
    revalidatePath('/invoices');
    revalidatePath(`/invoices/${parsed.data.saleId}`);
    revalidatePath('/customers');
    return {
      ok: `Payment recorded. Receipt ${result.settlement.receiptNumber}.`,
      receiptNumber: result.settlement.receiptNumber,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The payment could not be recorded.' };
  }
}
