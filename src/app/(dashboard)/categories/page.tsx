import { db } from '@/repositories';
import { createCategory } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { TaxonomyManager } from '@/components/catalog/TaxonomyManager';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const [categories, products] = await Promise.all([
    db.categories.findAll(),
    db.products.findAll(),
  ]);

  const productCounts = new Map<string, number>();
  for (const product of products) {
    productCounts.set(product.categoryId, (productCounts.get(product.categoryId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('nav.categories')} count={t('catalog.categoryCount', { count: categories.length })} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createCategory}
          submitLabel={t('catalog.addCategory')}
          fields={[{ name: 'name', label: t('common.name'), placeholder: 'Mobile Phones', required: true }]}
        />
      </div>}

      <TaxonomyManager
        kind="category"
        canManage={role !== 'STAFF'}
        items={categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          isActive: category.isActive,
          productCount: productCounts.get(category.id) ?? 0,
          createdAt: category.createdAt,
        }))}
      />
    </div>
  );
}
