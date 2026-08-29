import { NextResponse } from 'next/server';

import { emiReceiptToThermalPdf } from '@/lib/emi-receipt-pdf';
import { hasPermission } from '@/lib/permissions';
import { getOptionalSession } from '@/lib/session';
import { db } from '@/repositories';
import { emiRemainingBalanceAfterPayment } from '@/services/emi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_EMI')) return NextResponse.json({ error: 'EMI access denied' }, { status: 403 });

  const width: 58 | 80 = new URL(request.url).searchParams.get('width') === '58' ? 58 : 80;
  const { id, paymentId } = await params;
  const contract = await db.emi.findContractById(id);
  if (!contract) return NextResponse.json({ error: 'EMI contract not found' }, { status: 404 });

  const payments = await db.emi.findPayments(id);
  const payment = payments.find((row) => row.id === paymentId);
  if (!payment) return NextResponse.json({ error: 'Payment receipt not found' }, { status: 404 });

  const [customer, sale, saleItems, installments, allocations, earlySettlement] = await Promise.all([
    db.customers.findById(contract.customerId),
    db.sales.findById(contract.saleId),
    db.sales.findItems(contract.saleId),
    db.emi.findInstallments(id),
    db.emi.findAllocations(payment.id),
    db.emi.findEarlySettlement(id),
  ]);
  const outstanding = emiRemainingBalanceAfterPayment(contract.financedAmount, contract.status, payments, payment.id);
  const legacyReasonPrefix = sale ? `Invoice ${sale.invoiceNumber} voided: ` : '';
  const voidReason = payment.reverseReason && legacyReasonPrefix && payment.reverseReason.startsWith(legacyReasonPrefix)
    ? payment.reverseReason.slice(legacyReasonPrefix.length)
    : payment.reverseReason;
  const content = await emiReceiptToThermalPdf({
    contract,
    payment,
    customer,
    sale,
    saleItems,
    installments,
    allocations,
    earlySettlement,
    outstanding,
    voidReason,
  }, width);

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${payment.receiptNumber}-${width}mm.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
