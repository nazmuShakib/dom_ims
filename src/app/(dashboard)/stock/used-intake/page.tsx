import { UsedDeviceIntakeForm } from '@/components/stock/UsedDeviceIntakeForm';
import { PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function UsedDeviceIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ cart?: string }>;
}) {
  const actor = await requirePageCapability('MANAGE_USED_DEVICES');
  const { cart: requestedCartId } = await searchParams;
  const requestedCart = requestedCartId ? await db.carts.findById(requestedCartId) : null;
  const tradeInCartId = requestedCart?.actorId === actor.id ? requestedCart.id : undefined;
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const products = (await db.products.findAll({ activeOnly: true }))
    .filter((product) => product.trackingType === 'SERIAL')
    .map((product) => ({ id: product.id, sku: product.sku, name: product.name }));
  return (
    <>
      <PageHeader
        title={tradeInCartId ? t('used.prepareTradeIn') : t('used.title')}
        count={tradeInCartId ? t('used.prepareTradeInHelp') : t('used.pageHelp')}
      />
      <UsedDeviceIntakeForm
        products={products}
        tradeInCartId={tradeInCartId}
        initialTradeInDraft={tradeInCartId ? requestedCart?.tradeInDraft ?? null : null}
      />
    </>
  );
}
