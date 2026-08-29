import type { EmiContract, EmiInstallment, EmiPayment, PaymentMethod } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { db, type Repositories } from '@/repositories';
import { emiEarlySettlementSchema, emiPaymentSchema } from '@/schemas';

export function installmentDates(firstDueDate: Date, termMonths: number): Date[] {
  const day = firstDueDate.getUTCDate();
  return Array.from({ length: termMonths }, (_, index) => {
    const year = firstDueDate.getUTCFullYear();
    const month = firstDueDate.getUTCMonth() + index;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12));
  });
}

function dhakaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function installmentStatusForDate(
  installment: Pick<EmiInstallment, 'amountDue' | 'amountPaid' | 'dueDate'>,
  today: string,
): EmiInstallment['status'] {
  if (installment.amountPaid >= installment.amountDue) return 'PAID';
  const dueDay = installment.dueDate.slice(0, 10);
  if (dueDay < today) return 'OVERDUE';
  if (dueDay === today && installment.amountPaid === 0) return 'DUE';
  if (installment.amountPaid > 0) return 'PARTIAL';
  return 'UPCOMING';
}

export function installmentAmounts(financedAmount: number, termMonths: number): number[] {
  if (financedAmount % 100 !== 0) {
    throw new Error('EMI installments require a whole-taka financed balance.');
  }
  const financedTaka = financedAmount / 100;
  const baseTaka = Math.floor(financedTaka / termMonths);
  const remainderTaka = financedTaka - baseTaka * termMonths;
  return Array.from(
    { length: termMonths },
    (_, index) => (baseTaka + (index < remainderTaka ? 1 : 0)) * 100,
  );
}

/**
 * Reconstruct the balance printed when a particular payment was recorded.
 * Installment rows are mutable progress records, so their current balance must
 * not be used when an older, immutable receipt is reopened.
 */
export function emiRemainingBalanceAfterPayment(
  financedAmount: number,
  contractStatus: EmiContract['status'],
  payments: Pick<EmiPayment, 'id' | 'amount' | 'paidAt' | 'createdAt' | 'status'>[],
  paymentId: string,
): number {
  const chronological = payments
    .filter((row) => row.status === 'ACTIVE')
    .sort((left, right) =>
      left.paidAt.localeCompare(right.paidAt)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id));
  const selectedIndex = chronological.findIndex((row) => row.id === paymentId);
  if (selectedIndex < 0) return 0;

  const paidThroughReceipt = chronological
    .slice(0, selectedIndex + 1)
    .reduce((sum, row) => sum + row.amount, 0);

  // An early-settlement discount can close the contract even when recorded
  // payments are lower than the original financed amount.
  if (contractStatus === 'PAID' && selectedIndex === chronological.length - 1) return 0;
  return Math.max(0, financedAmount - paidThroughReceipt);
}

export async function recordEmiPayment(raw: {
  contractId: string;
  amount: number | string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  idempotencyKey: string;
  actorId: string;
  actorName: string;
}): Promise<EmiPayment> {
  const input = emiPaymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.emi.findPaymentByIdempotencyKey(input.idempotencyKey);
    if (replay) return replay;
    const contract = await tx.emi.findContractById(input.contractId);
    if (!contract || !['ACTIVE', 'OVERDUE'].includes(contract.status)) throw new Error('This EMI contract is not open for payments.');
    const installments = await tx.emi.findInstallments(contract.id);
    const outstanding = installments.reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0);
    if (input.amount <= 0 || input.amount > outstanding) throw new Error('Payment must be greater than zero and cannot exceed the outstanding balance.');
    const now = new Date().toISOString();
    const payment: EmiPayment = {
      id: uuidv7(), receiptNumber: await tx.emi.nextReceiptNumber(new Date(now)), idempotencyKey: input.idempotencyKey,
      contractId: contract.id, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference,
      note: input.note, status: 'ACTIVE', recordedById: raw.actorId, recordedByName: raw.actorName,
      paidAt: now, reversedAt: null, reverseReason: null, createdAt: now,
    };
    await tx.emi.createPayment(payment);
    let remaining = payment.amount;
    for (const installment of installments) {
      if (remaining <= 0) break;
      const open = installment.amountDue - installment.amountPaid;
      if (open <= 0) continue;
      const allocated = Math.min(open, remaining);
      const amountPaid = installment.amountPaid + allocated;
      await tx.emi.createAllocation({ id: uuidv7(), paymentId: payment.id, installmentId: installment.id, amount: allocated, createdAt: now });
      await tx.emi.updateInstallment(installment.id, {
        amountPaid,
        status: amountPaid === installment.amountDue ? 'PAID' : 'PARTIAL',
        paidAt: amountPaid === installment.amountDue ? now : null,
        updatedAt: now,
      });
      remaining -= allocated;
    }
    if (payment.amount === outstanding) await tx.emi.updateContract(contract.id, { status: 'PAID', completedAt: now, updatedAt: now });
    return payment;
  });
}

export async function settleEmiEarly(raw: {
  contractId: string;
  discountAmount: number | string;
  paymentMethod: PaymentMethod;
  reason: string;
  reference?: string | null;
  idempotencyKey: string;
  actorId: string;
  actorName: string;
}): Promise<EmiPayment> {
  const input = emiEarlySettlementSchema.parse(raw);
  return db.transaction(async (tx) => {
    const contract = await tx.emi.findContractById(input.contractId);
    if (!contract || !['ACTIVE', 'OVERDUE'].includes(contract.status)) throw new Error('This EMI contract cannot be settled.');
    if (await tx.emi.findEarlySettlement(contract.id)) throw new Error('Early settlement has already been applied.');
    const installments = await tx.emi.findInstallments(contract.id);
    const outstanding = installments.reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0);
    if (input.discountAmount >= outstanding) throw new Error('Early-settlement discount must be lower than the outstanding balance.');
    const finalAmount = outstanding - input.discountAmount;
    const now = new Date().toISOString();
    await tx.emi.createEarlySettlement({ id: uuidv7(), contractId: contract.id, outstandingBefore: outstanding, discountAmount: input.discountAmount, finalAmount, reason: input.reason, approvedById: raw.actorId, approvedByName: raw.actorName, approvedAt: now });
    // Reduce the final installment(s) so the immutable schedule still adds up.
    let discount = input.discountAmount;
    for (const installment of [...installments].reverse()) {
      if (discount <= 0) break;
      const open = installment.amountDue - installment.amountPaid;
      const reduction = Math.min(open, discount);
      installment.amountDue -= reduction;
      await tx.emi.updateInstallment(installment.id, {
        amountDue: installment.amountDue,
        ...(installment.amountDue === installment.amountPaid
          ? { status: 'PAID', paidAt: now }
          : {}),
        updatedAt: now,
      });
      discount -= reduction;
    }
    // Allocate the settlement payment normally, then close the remaining
    // discounted balance explicitly below.
    const payment: EmiPayment = {
      id: uuidv7(), receiptNumber: await tx.emi.nextReceiptNumber(new Date(now)), idempotencyKey: input.idempotencyKey,
      contractId: contract.id, amount: finalAmount, paymentMethod: input.paymentMethod, reference: input.reference,
      note: `Early settlement: ${input.reason}`, status: 'ACTIVE', recordedById: raw.actorId,
      recordedByName: raw.actorName, paidAt: now, reversedAt: null, reverseReason: null, createdAt: now,
    };
    await tx.emi.createPayment(payment);
    let remaining = finalAmount;
    for (const installment of installments) {
      const open = installment.amountDue - installment.amountPaid;
      if (open <= 0) continue;
      const allocated = Math.min(open, remaining);
      if (allocated > 0) await tx.emi.createAllocation({ id: uuidv7(), paymentId: payment.id, installmentId: installment.id, amount: allocated, createdAt: now });
      const amountPaid = installment.amountPaid + allocated;
      await tx.emi.updateInstallment(installment.id, { amountPaid, status: amountPaid === installment.amountDue ? 'PAID' : 'PARTIAL', paidAt: amountPaid === installment.amountDue ? now : null, updatedAt: now });
      remaining -= allocated;
    }
    await tx.emi.updateContract(contract.id, { status: 'PAID', completedAt: now, updatedAt: now });
    return payment;
  });
}

export async function refreshEmiStatuses(repositories: Repositories = db): Promise<void> {
  const now = new Date();
  const today = dhakaDateKey(now);
  for (const contract of await repositories.emi.findContracts()) {
    if (!['ACTIVE', 'OVERDUE'].includes(contract.status)) continue;
    const installments = await repositories.emi.findInstallments(contract.id);
    let overdue = false;
    for (const row of installments) {
      const status = installmentStatusForDate(row, today);
      if (status === 'OVERDUE') overdue = true;
      if (row.status !== status) {
        await repositories.emi.updateInstallment(row.id, { status, updatedAt: now.toISOString() });
      }
    }
    const status = overdue ? 'OVERDUE' : 'ACTIVE';
    if (contract.status !== status) await repositories.emi.updateContract(contract.id, { status, updatedAt: now.toISOString() });
  }
}
