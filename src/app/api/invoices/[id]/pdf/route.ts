import { NextResponse } from 'next/server';

import { invoiceToPdf } from '@/lib/invoice-pdf';
import { hasPermission } from '@/lib/permissions';
import { getOptionalSession } from '@/lib/session';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_INVOICES')) {
    return NextResponse.json({ error: 'Invoice access denied' }, { status: 403 });
  }
  const { id } = await params;
  const sale = await db.sales.findById(id);
  if (!sale) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const items = await db.sales.findItems(sale.id);
  const emiContract = await db.emi.findContractBySale(sale.id);
  const [emiInstallments, emiEarlySettlement] = emiContract
    ? await Promise.all([
        db.emi.findInstallments(emiContract.id),
        db.emi.findEarlySettlement(emiContract.id),
      ])
    : [[], null];
  const content = await invoiceToPdf(sale, items, {
    name: process.env.SHOP_NAME?.trim() || 'Electronics Shop',
    address: process.env.SHOP_ADDRESS?.trim() || null,
    phone: process.env.SHOP_PHONE?.trim() || null,
    policy: process.env.INVOICE_POLICY?.trim() || null,
  }, emiContract ? {
    contract: emiContract,
    installments: emiInstallments,
    earlySettlement: emiEarlySettlement,
  } : null);
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sale.invoiceNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
