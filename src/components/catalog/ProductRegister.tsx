'use client';

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { useI18n } from '@/components/i18n/I18nProvider';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export interface ProductFilterValues {
  q: string;
  tracking: string;
  stock: string;
  category: string;
  brand: string;
  status: string;
  order: string;
}

const EMPTY_FILTERS: ProductFilterValues = {
  q: '',
  tracking: '',
  stock: '',
  category: '',
  brand: '',
  status: 'active',
  order: 'name-asc',
};

function filterUrl(values: ProductFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (key === 'status' && normalized === 'active') continue;
    if (key === 'order' && normalized === 'name-asc') continue;
    params.set(key, normalized);
  }
  const query = params.toString();
  return query ? `/products?${query}` : '/products';
}

export function ProductRegister({
  confirmedFilters,
  categories,
  brands,
  showCosts,
  resultVersion,
  children,
}: {
  confirmedFilters: ProductFilterValues;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  showCosts: boolean;
  resultVersion: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [values, setValues] = useState(confirmedFilters);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;

  useEffect(() => {
    setValues(confirmedFilters);
    setFiltering(false);
  }, [confirmedFilters, resultVersion]);

  function update(key: keyof ProductFilterValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function navigate(next: ProductFilterValues) {
    if (pending) return;
    setValues(next);
    setFiltering(true);
    window.history.pushState(null, '', filterUrl(next));
    startRefreshing(() => router.refresh());
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(values);
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={apply}>
          <div className="sm:col-span-2">
            <Field label={t('common.search')}>
              <Input
                type="search"
                value={values.q}
                onChange={(event) => update('q', event.target.value)}
                placeholder={t('products.filterSearchPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('term.trackingMethod')}>
            <Select value={values.tracking} onChange={(event) => update('tracking', event.target.value)}>
              <option value="">{t('products.allTrackingMethods')}</option>
              <option value="SERIAL">{t('term.serial')}</option>
              <option value="QUANTITY">{t('term.bulkCount')}</option>
            </Select>
          </Field>
          <Field label={t('products.stockStatus')}>
            <Select value={values.stock} onChange={(event) => update('stock', event.target.value)}>
              <option value="">{t('products.allStockLevels')}</option>
              <option value="on-hand">{t('products.onHandOnly')}</option>
              <option value="low">{t('products.lowStockOnly')}</option>
              <option value="out">{t('products.outOfStockOnly')}</option>
              <option value="dead">{t('products.deadStockOnly')}</option>
            </Select>
          </Field>
          <Field label={t('common.category')}>
            <Select value={values.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">{t('products.allCategories')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.brand')}>
            <Select value={values.brand} onChange={(event) => update('brand', event.target.value)}>
              <option value="">{t('products.allBrands')}</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={values.status} onChange={(event) => update('status', event.target.value)}>
              <option value="active">{t('products.activeOnly')}</option>
              <option value="archived">{t('products.archivedOnly')}</option>
              <option value="all">{t('catalog.allStatuses')}</option>
            </Select>
          </Field>
          <Field label={t('catalog.orderBy')}>
            <Select value={values.order} onChange={(event) => update('order', event.target.value)}>
              <option value="name-asc">{t('catalog.nameAscending')}</option>
              <option value="name-desc">{t('catalog.nameDescending')}</option>
              <option value="newest">{t('products.createdNewest')}</option>
              <option value="oldest">{t('products.createdOldest')}</option>
              <option value="stock-desc">{t('products.stockHigh')}</option>
              <option value="stock-asc">{t('products.stockLow')}</option>
              {showCosts && <option value="cost-desc">{t('products.orderCostHigh')}</option>}
              {showCosts && <option value="cost-asc">{t('products.orderCostLow')}</option>}
              <option value="price-desc">{t('products.salePriceHigh')}</option>
              <option value="price-asc">{t('products.salePriceLow')}</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={pending}>{t('common.applyFilters')}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => navigate(EMPTY_FILTERS)}>{t('common.reset')}</Button>
          </div>
        </form>
        <p className="mt-3 text-[11px] text-graphite">{t('products.deadStockHelp')}</p>
      </Card>

      {pending ? (
        <Card><LoadingScreen compact label={t('loading.filterProducts')} /></Card>
      ) : children}
    </>
  );
}
