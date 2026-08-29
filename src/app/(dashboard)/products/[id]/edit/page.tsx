import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { getSession, requirePageRole } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { updateProduct } from '@/actions/catalog';
import { ProductForm } from '@/components/catalog/ProductForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole('ADMIN', 'MANAGER');
  const { locale, role } = await getSession();
  const t = createTranslator(locale);
  const { id } = await params;

  const [product, allCategories, allBrands] = await Promise.all([
    db.products.findById(id),
    db.categories.findAll(),
    db.brands.findAll(),
  ]);

  if (!product) notFound();
  const categories = allCategories.filter(
    (category) => category.isActive || category.id === product.categoryId,
  );
  const brands = allBrands.filter(
    (brand) => brand.isActive || brand.id === product.brandId,
  );

  return (
    <>
      <PageHeader title={t('products.edit')} count={product.sku} />
      <ProductForm
        action={updateProduct}
        categories={categories}
        brands={brands}
        product={product}
        canManageStaffDiscount={role === 'ADMIN'}
      />
    </>
  );
}
