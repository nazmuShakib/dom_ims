import { db } from '@/repositories';
import { toProductDTO } from '@/lib/dto';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { StockOutForm } from '@/components/stock/StockOutForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StockOutPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const { role } = await requirePageCapability('REMOVE_STOCK');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const { serial } = await searchParams;

  const [products, suppliers] = await Promise.all([
    db.products.findAll({ activeOnly: true }),
    db.suppliers.findAll(),
  ]);
  const bulk = products.filter((p) => p.trackingType === 'QUANTITY');

  return (
    <>
      <PageHeader
        title={t('stock.removeTitle')}
        count={t('stock.removeHelp')}
      />
      <StockOutForm
        bulkProducts={bulk.map((product) => toProductDTO(product, role))}
        suppliers={suppliers.filter((supplier) => supplier.isActive)}
        initialSerial={serial}
      />
    </>
  );
}
