import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { canSeeCosts, getSession } from '@/lib/session';
import { toProductDTO, toProductUnitDTO } from '@/lib/dto';
import { getOnHand } from '@/services/stock';
import { archiveProduct, restoreProduct } from '@/actions/catalog';
import { SerializedUnitRegister } from '@/components/catalog/SerializedUnitRegister';
import {
  Badge,
  Button,
  Card,
  Money,
  PageHeader,
  StockCount,
} from '@/components/ui';
import { createTranslator } from '@/lib/i18n/messages';
import { formatBDT } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);

  const raw = await db.products.findById(id);
  if (!raw) notFound();

  const product = toProductDTO(raw, role);
  const [category, brand, onHand, rawUnits] = await Promise.all([
    db.categories.findById(raw.categoryId),
    raw.brandId ? db.brands.findById(raw.brandId) : Promise.resolve(null),
    getOnHand(raw),
    raw.trackingType === 'SERIAL'
      ? db.units.findByProduct(raw.id)
      : Promise.resolve([]),
  ]);

  const units = rawUnits
    .map((u) => toProductUnitDTO(u, role))
    .sort((a, b) => {
      // In-stock first — that's what someone at the counter is looking for.
      if (a.status === 'IN_STOCK' && b.status !== 'IN_STOCK') return -1;
      if (b.status === 'IN_STOCK' && a.status !== 'IN_STOCK') return 1;
      return b.receivedAt.localeCompare(a.receivedAt);
    });

  const inStock = units.filter((u) => u.status === 'IN_STOCK');
  const usedRows = showCosts
    ? await Promise.all(rawUnits.filter((unit) => unit.usedGrade).map(async (unit) => ({
        unit,
        acquisition: await db.usedDeviceAcquisitions.findByUnit(unit.id),
        expenses: await db.refurbishmentExpenses.findByUnit(unit.id),
      })))
    : [];

  // Valuation is only meaningful if you can see costs.
  const stockValue = showCosts
    ? raw.trackingType === 'SERIAL'
      ? inStock.reduce((sum, u) => sum + (u.costPrice ?? 0), 0)
      : onHand * raw.avgCostPrice
    : null;

  return (
    <>
      <PageHeader
        title={product.name}
        count={product.sku}
        action={
          <div className="flex gap-2">
            {product.isActive && (
              <Link href={`/stock/in?product=${product.id}`}>
                <Button>{t('stock.receiveTitle')}</Button>
              </Link>
            )}
            {role !== 'STAFF' && (
              <Link href={`/products/${product.id}/edit`}>
                <Button variant="ghost">{t('common.edit')}</Button>
              </Link>
            )}
            {role === 'ADMIN' && (product.isActive ? (
              <form action={archiveProduct}>
                <input type="hidden" name="id" value={product.id} />
                <Button variant="danger" type="submit">
                  {t('products.archive')}
                </Button>
              </form>
            ) : (
              <form action={restoreProduct}>
                <input type="hidden" name="id" value={product.id} />
                <Button variant="ghost" type="submit">
                  {t('products.restore')}
                </Button>
              </form>
            ))}
          </div>
        }
      />

      {!product.isActive && (
        <div className="mb-4 rounded-[3px] border border-low/20 bg-low-wash px-3 py-2 text-[13px] text-low">
          {t('products.archivedHelp')}
        </div>
      )}

      {/* --- Summary plate ------------------------------------------------ */}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 divide-rule sm:grid-cols-4 sm:divide-x">
          <div className="p-4">
            <dt className="eyebrow">{t('products.onHand')}</dt>
            <dd className="mt-1">
              <StockCount onHand={onHand} reorderPoint={product.reorderPoint} />
              <span className="mt-0.5 block text-[11px] text-graphite">
                {t('products.reorderAt', { count: product.reorderPoint })}
              </span>
            </dd>
          </div>

          <div className="p-4">
            <dt className="eyebrow">{t('products.sellingPrice')}</dt>
            <dd className="mt-1">
              <Money value={product.defaultSalePrice} />
            </dd>
          </div>

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">{t('products.costPrice')}</dt>
              <dd className="mt-1">
                <Money value={product.defaultCostPrice ?? null} muted />
              </dd>
            </div>
          )}

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">{t('products.stockValue')}</dt>
              <dd className="mt-1">
                <Money value={stockValue} />
                <span className="mt-0.5 block text-[11px] text-graphite">
                  {t(raw.trackingType === 'SERIAL' ? 'products.sumUnitCosts' : 'products.weightedAverage')}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="eyebrow mb-3">{t('products.details')}</p>
          <dl className="space-y-2 text-[13px]">
            {[
              [t('common.brand'), brand?.name ?? '—'],
              [t('common.category'), category?.name ?? '—'],
              [t('products.model'), raw.model ?? '—'],
              [t('common.barcode'), raw.barcode ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-graphite">{k}</dt>
                <dd className={k === t('products.model') || k === t('common.barcode') ? 'tnum' : ''}>{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">{t('products.tracking')}</dt>
              <dd>
                <Badge tone={raw.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                  {raw.trackingType === 'SERIAL' ? t('term.serial') : t('term.bulkCount')}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-rule-soft pt-2">
              <dt className="text-graphite">{t('products.staffMaxDiscount')}</dt>
              <dd className="text-right">
                <Money value={raw.staffMaxDiscount} />
                <span className="mt-0.5 block text-[11px] text-graphite">
                  {t('products.staffMinimumPrice')}: {formatBDT(Math.max(0, raw.defaultSalePrice - raw.staffMaxDiscount))}
                </span>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <p className="eyebrow mb-3">{t('common.description')}</p>
          <p className="text-[13px] leading-relaxed text-graphite">
            {raw.description || t('products.noDescription')}
          </p>
        </Card>
      </div>

      {/* --- The unit ledger: every physical device, individually ---------- */}
      {raw.trackingType === 'SERIAL' && (
        <SerializedUnitRegister
          units={units}
          productId={product.id}
          showCosts={showCosts}
          locale={locale}
          canManageUsedDevices={role !== 'STAFF'}
          usedDetails={usedRows.map(({ unit, acquisition, expenses }) => ({
            unitId: unit.id,
            acquisitionType: acquisition?.type ?? null,
            sellerName: acquisition?.sellerName ?? null,
            sellerPhone: acquisition?.sellerPhone ?? null,
            identificationType: acquisition?.identificationType ?? null,
            identificationNumber: acquisition?.identificationNumber ?? null,
            acquisitionValue: acquisition?.acquisitionValue ?? null,
            reference: acquisition?.reference ?? null,
            note: acquisition?.note ?? null,
            acquiredAt: acquisition?.acquiredAt ?? null,
            refurbishmentTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
          }))}
        />
      )}
    </>
  );
}
