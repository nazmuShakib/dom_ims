import Link from 'next/link';
import { db } from '@/repositories';
import { getSession, requirePageRole } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { createProduct } from '@/actions/catalog';
import { ProductForm } from '@/components/catalog/ProductForm';
import { PageHeader, EmptyState, Card, Button } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requirePageRole('ADMIN', 'MANAGER'); // guard the page, not just the action
  const { locale, role } = await getSession();
  const t = createTranslator(locale);

  const [categories, brands] = await Promise.all([
    db.categories.findAll({ activeOnly: true }),
    db.brands.findAll({ activeOnly: true }),
  ]);

  if (categories.length === 0) {
    return (
      <>
        <PageHeader title={t('products.add')} />
        <Card>
          <EmptyState
            title={t('products.categoryRequired')}
            action={
              <Link href="/categories">
                <Button>{t('products.goCategories')}</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('products.add')} count={t('products.startsZero')} />
      <ProductForm
        action={createProduct}
        categories={categories}
        brands={brands}
        canManageStaffDiscount={role === 'ADMIN'}
      />
    </>
  );
}
