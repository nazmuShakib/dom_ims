import { db } from '@/repositories';
import { createBrand } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { TaxonomyManager } from '@/components/catalog/TaxonomyManager';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const [brands, products] = await Promise.all([
    db.brands.findAll(),
    db.products.findAll(),
  ]);

  const productCounts = new Map<string, number>();
  for (const product of products) {
    if (product.brandId) productCounts.set(product.brandId, (productCounts.get(product.brandId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('nav.brands')} count={t('catalog.brandCount', { count: brands.length })} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createBrand}
          submitLabel={t('catalog.addBrand')}
          fields={[{ name: 'name', label: t('common.name'), placeholder: 'Samsung', required: true }]}
        />
      </div>}

      <TaxonomyManager
        kind="brand"
        canManage={role !== 'STAFF'}
        items={brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          isActive: brand.isActive,
          productCount: productCounts.get(brand.id) ?? 0,
          createdAt: brand.createdAt,
        }))}
      />
    </div>
  );
}
