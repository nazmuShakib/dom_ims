import { StockLabelStudio, type LabelProductOption } from '@/components/labels/StockLabelStudio';
import { PageHeader } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function StockLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; receipt?: string; unit?: string }>;
}) {
  const actor = await requirePageCapability('PRINT_LABELS');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const params = await searchParams;

  const [products, brands] = await Promise.all([
    db.products.findAll(),
    db.brands.findAll(),
  ]);
  const brandsById = new Map(brands.map((brand) => [brand.id, brand.name]));

  let receipt = params.receipt ? await db.movements.findById(params.receipt) : null;
  if (receipt?.type !== 'IN' || receipt.quantity <= 0) receipt = null;

  const selectedProductId = receipt?.productId ?? params.product ?? null;
  const selectedProduct = selectedProductId
    ? products.find((product) => product.id === selectedProductId) ?? null
    : null;

  const productOptions: LabelProductOption[] = products.map((product) => ({
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    model: product.model,
    trackingType: product.trackingType,
    brandName: product.brandId ? brandsById.get(product.brandId) ?? null : null,
    quantityOnHand: product.quantityOnHand,
    isActive: product.isActive,
  }));
  const selectedOption = selectedProduct
    ? productOptions.find((product) => product.id === selectedProduct.id) ?? null
    : null;

  let units = selectedProduct?.trackingType === 'SERIAL'
    ? await db.units.findByProduct(
        selectedProduct.id,
        hasPermission(actor.role, 'REPRINT_NON_STOCK_LABELS') ? undefined : 'IN_STOCK',
      )
    : [];

  let initialUnitIds: string[] = [];
  let initialCopies = 1;

  if (selectedProduct?.trackingType === 'SERIAL') {
    if (receipt) {
      const receiptMovements = await db.movements.findByProduct(selectedProduct.id);
      const receiptUnitIds = new Set(
        receiptMovements
          .filter(
            (movement) =>
              movement.type === 'IN' &&
              movement.createdAt === receipt!.createdAt &&
              movement.actorId === receipt!.actorId &&
              movement.reason === receipt!.reason &&
              movement.reference === receipt!.reference &&
              movement.supplierId === receipt!.supplierId &&
              movement.unitCost === receipt!.unitCost &&
              movement.note === receipt!.note,
          )
          .map((movement) => movement.unitId)
          .filter((id): id is string => Boolean(id)),
      );
      initialUnitIds = units.filter((unit) => receiptUnitIds.has(unit.id)).map((unit) => unit.id);
    } else if (params.unit && units.some((unit) => unit.id === params.unit)) {
      initialUnitIds = [params.unit];
    }
  } else if (receipt && selectedProduct?.trackingType === 'QUANTITY') {
    initialCopies = Math.max(1, receipt.quantity);
  }

  // A stable order keeps receipt selections and printed sheets predictable.
  units = [...units].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <>
      <div className="label-screen-only">
        <PageHeader
          title={t('labels.title')}
          count={t('labels.help')}
        />
      </div>
      <StockLabelStudio
        key={`${selectedProductId ?? 'none'}-${params.receipt ?? ''}-${params.unit ?? ''}`}
        products={productOptions}
        product={selectedOption}
        units={units.map((unit) => ({
          id: unit.id,
          serialNo: unit.serialNo,
          status: unit.status,
          receivedAt: unit.receivedAt,
        }))}
        initialUnitIds={initialUnitIds}
        initialCopies={initialCopies}
        role={actor.role}
        resultVersion={crypto.randomUUID()}
      />
    </>
  );
}
