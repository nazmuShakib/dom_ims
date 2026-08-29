import Link from 'next/link';

import { db } from '@/repositories';
import { getSession, canSeeCosts } from '@/lib/session';
import { toProductDTO } from '@/lib/dto';
import { getOnHand } from '@/services/stock';
import { createTranslator } from '@/lib/i18n/messages';
import { ProductRegister, type ProductFilterValues } from '@/components/catalog/ProductRegister';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HelpTerm,
  Money,
  PageHeader,
  StockCount,
  TableViewport,
  stockLevel,
} from '@/components/ui';
import type { TrackingType } from '@/domain/types';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;
const DAY_MS = 86_400_000;

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const rawParams = await searchParams;
  const query = one(rawParams, 'q');
  const trackingValue = one(rawParams, 'tracking');
  const stock = ['on-hand', 'low', 'out', 'dead'].includes(one(rawParams, 'stock'))
    ? one(rawParams, 'stock')
    : '';
  const categoryFilter = one(rawParams, 'category');
  const brandFilter = one(rawParams, 'brand');
  const statusValue = one(rawParams, 'status');
  const status = statusValue === 'archived' || statusValue === 'all' ? statusValue : 'active';
  const allowedOrders = ['name-asc', 'name-desc', 'newest', 'oldest', 'stock-desc', 'stock-asc', 'cost-desc', 'cost-asc', 'price-desc', 'price-asc'];
  const requestedOrder = one(rawParams, 'order');
  const order = allowedOrders.includes(requestedOrder) ? requestedOrder : 'name-asc';
  const tracking = trackingValue === 'SERIAL' || trackingValue === 'QUANTITY'
    ? trackingValue as TrackingType
    : undefined;

  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);
  const safeOrder = !showCosts && order.startsWith('cost-') ? 'name-asc' : order;
  const confirmedFilters: ProductFilterValues = {
    q: query,
    tracking: tracking ?? '',
    stock,
    category: categoryFilter,
    brand: brandFilter,
    status,
    order: safeOrder,
  };

  const [categories, brands, products, movements] = await Promise.all([
    db.categories.findAll(),
    db.brands.findAll(),
    db.products.findAll(),
    stock === 'dead'
      ? db.movements.findByDateRange(new Date(0), new Date())
      : Promise.resolve([]),
  ]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
  const normalizedQuery = query.toLocaleLowerCase();

  const latestOutbound = new Map<string, string>();
  for (const movement of movements) {
    if (movement.quantity >= 0 || movement.reason === 'CORRECTION') continue;
    const previous = latestOutbound.get(movement.productId);
    if (!previous || movement.createdAt > previous) latestOutbound.set(movement.productId, movement.createdAt);
  }
  const deadCutoff = Date.now() - 60 * DAY_MS;

  const allRows = await Promise.all(products.map(async (product) => {
    const onHand = await getOnHand(product);
    const lastOutboundAt = latestOutbound.get(product.id);
    const dead = onHand > 0 && (!lastOutboundAt || new Date(lastOutboundAt).getTime() <= deadCutoff);
    return { product: toProductDTO(product, role), onHand, dead };
  }));

  const rows = allRows
    .filter(({ product, onHand, dead }) => {
      if (status === 'active' && !product.isActive) return false;
      if (status === 'archived' && product.isActive) return false;
      if (tracking && product.trackingType !== tracking) return false;
      if (categoryFilter && product.categoryId !== categoryFilter) return false;
      if (brandFilter && product.brandId !== brandFilter) return false;
      if (stock === 'on-hand' && onHand <= 0) return false;
      if (stock === 'low' && !(onHand > 0 && onHand <= product.reorderPoint)) return false;
      if (stock === 'out' && onHand !== 0) return false;
      if (stock === 'dead' && !dead) return false;
      if (!normalizedQuery) return true;
      return [product.name, product.sku, product.model, product.barcode]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => {
      if (safeOrder === 'newest') return b.product.createdAt.localeCompare(a.product.createdAt);
      if (safeOrder === 'oldest') return a.product.createdAt.localeCompare(b.product.createdAt);
      if (safeOrder === 'stock-desc') return b.onHand - a.onHand;
      if (safeOrder === 'stock-asc') return a.onHand - b.onHand;
      if (safeOrder === 'cost-desc') return (b.product.defaultCostPrice ?? 0) - (a.product.defaultCostPrice ?? 0);
      if (safeOrder === 'cost-asc') return (a.product.defaultCostPrice ?? 0) - (b.product.defaultCostPrice ?? 0);
      if (safeOrder === 'price-desc') return b.product.defaultSalePrice - a.product.defaultSalePrice;
      if (safeOrder === 'price-asc') return a.product.defaultSalePrice - b.product.defaultSalePrice;
      const names = a.product.name.localeCompare(b.product.name, undefined, { numeric: true, sensitivity: 'base' });
      return safeOrder === 'name-desc' ? -names : names;
    });

  const lowCount = rows.filter(({ product, onHand }) => stockLevel(onHand, product.reorderPoint) !== 'ok').length;

  return (
    <>
      <PageHeader
        title={t('products.title')}
        count={t('products.filteredSummary', { shown: rows.length, total: allRows.length, low: lowCount })}
        action={role !== 'STAFF' ? <Link href="/products/new"><Button>{t('products.add')}</Button></Link> : undefined}
      />

      <ProductRegister
        confirmedFilters={confirmedFilters}
        categories={categories.filter((category) => category.isActive).map(({ id, name }) => ({ id, name }))}
        brands={brands.filter((brand) => brand.isActive).map(({ id, name }) => ({ id, name }))}
        showCosts={showCosts}
        resultVersion={crypto.randomUUID()}
      >
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title={t('products.noFilterMatch')}
              action={role !== 'STAFF' && allRows.length === 0 ? <Link href="/products/new"><Button variant="ghost">{t('products.add')}</Button></Link> : undefined}
            />
          ) : (
            <TableViewport>
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-left">
                      <HelpTerm description={t('term.productCodeHelp')} placement="bottom" align="start">{t('term.productCode')}</HelpTerm>
                    </th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">
                      <HelpTerm description={t('term.trackingHelp')} placement="bottom">{t('term.trackingMethod')}</HelpTerm>
                    </th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('products.onHand')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('common.cost')}</th>}
                    <th className="eyebrow px-4 py-2.5 text-right">{t('common.price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ product, onHand }) => {
                    const level = stockLevel(onHand, product.reorderPoint);
                    const stripe = level === 'out' ? 'border-l-2 border-l-out' : level === 'low' ? 'border-l-2 border-l-low' : 'border-l-2 border-l-transparent';
                    return (
                      <tr key={product.id} className={`group border-b border-rule-soft last:border-0 hover:bg-plate/50 ${stripe} ${!product.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5">
                          <Link href={`/products/${product.id}`} className="tnum text-[12px] text-graphite group-hover:text-signal">{product.sku}</Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/products/${product.id}`} className="block">
                            <span className="text-[13px] font-medium">{product.name}</span>
                            <span className="mt-0.5 block text-[11px] text-graphite">
                              {brandName.get(product.brandId ?? '') ?? '—'} · {categoryName.get(product.categoryId) ?? t('products.uncategorised')}
                              {!product.isActive && ` · ${t('products.archived')}`}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={product.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                            {product.trackingType === 'SERIAL' ? t('term.serial') : t('term.bulkCount')}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right"><StockCount onHand={onHand} reorderPoint={product.reorderPoint} /></td>
                        {showCosts && <td className="px-4 py-2.5 text-right"><Money value={product.defaultCostPrice ?? null} muted /></td>}
                        <td className="px-4 py-2.5 text-right"><Money value={product.defaultSalePrice} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      </ProductRegister>
    </>
  );
}
