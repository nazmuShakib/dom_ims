import type { EmiDisplayStatus } from '@/lib/emi-summary';
import type { PaymentStatus, SaleStatus } from '@/domain/types';

export interface InvoiceEmiPaymentState {
  status: EmiDisplayStatus;
  downPayment: number;
  tradeInCredit: number;
  installmentAmountPaid: number;
}

/**
 * Returns the payment state that the invoice register should filter by.
 * A voided invoice has no outstanding payment obligation, so it is neither
 * paid, partially paid, nor unpaid.
 */
export function effectiveInvoicePaymentStatus(
  sale: { status: SaleStatus; paymentStatus: PaymentStatus },
  emi?: InvoiceEmiPaymentState,
): PaymentStatus | null {
  if (sale.status === 'VOIDED' || emi?.status === 'VOIDED') return null;
  if (!emi) return sale.paymentStatus;
  if (emi.status === 'PAID' || emi.status === 'SETTLED_EARLY') return 'PAID';

  const upfrontCredit = emi.downPayment + emi.tradeInCredit;
  return upfrontCredit + emi.installmentAmountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}
