import type { EmiContract, EmiEarlySettlement, EmiInstallment, EmiPayment } from '@/domain/types';

export type EmiDisplayStatus = 'ACTIVE' | 'OVERDUE' | 'PAID' | 'SETTLED_EARLY' | 'VOIDED';

function dhakaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function emiOutstanding(
  installments: Pick<EmiInstallment, 'amountDue' | 'amountPaid'>[],
): number {
  return installments.reduce((sum, row) => sum + Math.max(0, row.amountDue - row.amountPaid), 0);
}

/**
 * Cash that must be returned when an EMI invoice is voided. Trade-in credit is
 * deliberately excluded because that device is returned through the stock
 * correction workflow instead of being treated as cash paid by the customer.
 */
export function emiVoidRefundAmount(
  contract: Pick<EmiContract, 'downPayment'>,
  payments: Pick<EmiPayment, 'amount' | 'status'>[],
): number {
  return contract.downPayment + payments
    .filter((payment) => payment.status === 'ACTIVE')
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function emiOverdueAmount(
  installments: Pick<EmiInstallment, 'amountDue' | 'amountPaid' | 'dueDate'>[],
  now = new Date(),
): number {
  const today = dhakaDateKey(now);
  return installments.reduce((sum, row) => (
    row.dueDate.slice(0, 10) < today
      ? sum + Math.max(0, row.amountDue - row.amountPaid)
      : sum
  ), 0);
}

export function emiDisplayStatus(
  contract: Pick<EmiContract, 'status'>,
  installments: Pick<EmiInstallment, 'amountDue' | 'amountPaid' | 'dueDate'>[],
  earlySettlement: EmiEarlySettlement | null,
  now = new Date(),
): EmiDisplayStatus {
  if (contract.status === 'VOIDED') return 'VOIDED';
  if (contract.status === 'PAID') return earlySettlement ? 'SETTLED_EARLY' : 'PAID';
  return emiOverdueAmount(installments, now) > 0 ? 'OVERDUE' : 'ACTIVE';
}
