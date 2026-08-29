import { db } from '@/repositories';
import { getSession, requirePageRole } from '@/lib/session';
import { toProductDTO } from '@/lib/dto';
import { StockInForm } from '@/components/stock/StockInForm';
import { PageHeader } from '@/components/ui';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function StockInPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; supplier?: string; reference?: string; supplierReturn?: string }>;
}) {
  await requirePageRole('ADMIN', 'MANAGER', 'STAFF');
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const { product, supplier, reference, supplierReturn } = await searchParams;

  const [products, suppliers] = await Promise.all([
    db.products.findAll({ activeOnly: true }),
    db.suppliers.findAll(),
  ]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);

  return (
    <>
      <PageHeader
        title={t('stock.receiveTitle')}
        count={t('stock.receiveHelp')}
      />
      <StockInForm
        products={products.map((item) => toProductDTO(item, role))}
        suppliers={activeSuppliers}
        initialProductId={product}
        initialSupplierId={supplier}
        initialReference={reference}
        lockInitialReference={Boolean(reference && supplierReturn)}
      />
    </>
  );
}
