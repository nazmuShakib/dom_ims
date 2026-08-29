import { SupplierAnalyticsWorkspace } from '@/components/suppliers/SupplierAnalyticsWorkspace';
import { requirePageCapability } from '@/lib/session';
import { db } from '@/repositories';
import { getSupplierAnalytics, parseSupplierAnalyticsFilters } from '@/services/supplier-analytics';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

export default async function SupplierAnalyticsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePageCapability('VIEW_REPORTS');
  const filters = parseSupplierAnalyticsFilters(await searchParams);
  const [result, suppliers, products, categories, brands] = await Promise.all([
    getSupplierAnalytics(filters), db.suppliers.findAll(), db.products.findAll(), db.categories.findAll(), db.brands.findAll(),
  ]);
  return <SupplierAnalyticsWorkspace filters={filters} result={result} suppliers={suppliers} products={products} categories={categories} brands={brands} resultVersion={crypto.randomUUID()} />;
}
