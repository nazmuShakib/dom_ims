'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@/lib/audit';
import { getSession, requireCapability } from '@/lib/session';
import { translateActionMessage } from '@/lib/i18n/action-messages';
import type { Locale } from '@/lib/i18n/config';
import { recordEmiPayment, settleEmiEarly } from '@/services/emi';
import type { PaymentMethod } from '@/domain/types';

export interface EmiActionState { error?: string; ok?: string; fieldErrors?: Record<string, string>; receiptId?: string; receiptNumber?: string }
const str = (fd: FormData, key: string) => typeof fd.get(key) === 'string' ? String(fd.get(key)).trim() : '';
const failure = (error: unknown, locale: Locale): EmiActionState => error instanceof z.ZodError
  ? { error: translateActionMessage(locale, error.issues[0]?.message ?? 'Invalid input.'), fieldErrors: Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), translateActionMessage(locale, issue.message)])) }
  : { error: translateActionMessage(locale, error instanceof Error ? error.message : 'Something went wrong.') };

export async function recordEmiPaymentAction(_state: EmiActionState, fd: FormData): Promise<EmiActionState> {
  const actor = await requireCapability('RECORD_EMI_PAYMENT');
  const { locale } = await getSession();
  try {
    const payment = await recordEmiPayment({ contractId: str(fd, 'contractId'), amount: str(fd, 'amount'), paymentMethod: str(fd, 'paymentMethod') as PaymentMethod, reference: str(fd, 'reference') || null, note: str(fd, 'note') || null, idempotencyKey: str(fd, 'idempotencyKey'), actorId: actor.id, actorName: actor.name });
    await writeAudit({ actorId: actor.id, action: 'emi.payment_record', entity: 'EmiPayment', entityId: payment.id, after: { contractId: payment.contractId, amount: payment.amount, receiptNumber: payment.receiptNumber } });
    revalidatePath('/emi'); revalidatePath(`/emi/${payment.contractId}`); revalidatePath('/');
    return { ok: translateActionMessage(locale, 'Payment recorded successfully.'), receiptId: payment.id, receiptNumber: payment.receiptNumber };
  } catch (error) { return failure(error, locale); }
}

export async function settleEmiEarlyAction(_state: EmiActionState, fd: FormData): Promise<EmiActionState> {
  const actor = await requireCapability('APPROVE_EMI_SETTLEMENT');
  const { locale } = await getSession();
  try {
    const payment = await settleEmiEarly({ contractId: str(fd, 'contractId'), discountAmount: str(fd, 'discountAmount'), paymentMethod: str(fd, 'paymentMethod') as PaymentMethod, reason: str(fd, 'reason'), reference: str(fd, 'reference') || null, idempotencyKey: str(fd, 'idempotencyKey'), actorId: actor.id, actorName: actor.name });
    await writeAudit({ actorId: actor.id, action: 'emi.early_settlement', entity: 'EmiContract', entityId: payment.contractId, after: { amount: payment.amount, receiptNumber: payment.receiptNumber } });
    revalidatePath('/emi'); revalidatePath(`/emi/${payment.contractId}`); revalidatePath('/');
    return { ok: translateActionMessage(locale, 'EMI settled early successfully.'), receiptId: payment.id, receiptNumber: payment.receiptNumber };
  } catch (error) { return failure(error, locale); }
}
