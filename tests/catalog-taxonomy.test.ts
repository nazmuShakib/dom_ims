import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { filterTaxonomyItems, type TaxonomyListItem } from '@/lib/catalog-taxonomy';

const items: TaxonomyListItem[] = [
  { id: '1', name: 'Apple', slug: 'apple', isActive: true, productCount: 3, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'Mobile Phones', slug: 'mobile-phones', isActive: true, productCount: 0, createdAt: '2026-03-01T00:00:00.000Z' },
  { id: '3', name: 'Legacy', slug: 'legacy', isActive: false, productCount: 0, createdAt: '2026-02-01T00:00:00.000Z' },
];

describe('brand and category filters', () => {
  it('defaults cleanly to active records and supports name or slug search', () => {
    expect(filterTaxonomyItems(items, { query: '', status: 'active', usage: 'all', order: 'newest' }))
      .toHaveLength(2);
    expect(filterTaxonomyItems(items, { query: 'PHONE', status: 'all', usage: 'all', order: 'newest' }))
      .toEqual([items[1]]);
  });

  it('combines removed status and product-usage filters', () => {
    expect(filterTaxonomyItems(items, { query: '', status: 'removed', usage: 'unused', order: 'newest' }))
      .toEqual([items[2]]);
    expect(filterTaxonomyItems(items, { query: '', status: 'all', usage: 'used', order: 'newest' }))
      .toEqual([items[0]]);
  });

  it('orders by creation time, product usage, or name without mutating the source array', () => {
    expect(filterTaxonomyItems(items, { query: '', status: 'all', usage: 'all', order: 'newest' }).map((item) => item.id))
      .toEqual(['2', '3', '1']);
    expect(filterTaxonomyItems(items, { query: '', status: 'all', usage: 'all', order: 'products-desc' }).map((item) => item.id))
      .toEqual(['1', '3', '2']);
    expect(filterTaxonomyItems(items, { query: '', status: 'all', usage: 'all', order: 'name-desc' }).map((item) => item.id))
      .toEqual(['2', '3', '1']);
    expect(items.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});

describe('brand and category mutation safety', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('uses reversible status changes and blocks removal while active products depend on a record', () => {
    const actions = source('src/actions/catalog.ts');
    expect(actions).toContain("action: active ? 'category.restore' : 'category.archive'");
    expect(actions).toContain("action: active ? 'brand.restore' : 'brand.archive'");
    expect(actions).toContain("db.products.findAll({ categoryId: id, activeOnly: true })");
    expect(actions).toContain("db.products.findAll({ brandId: id, activeOnly: true })");
    expect(actions).not.toContain('db.categories.delete');
    expect(actions).not.toContain('db.brands.delete');
  });

  it('rejects inactive taxonomy selections at the server boundary', () => {
    const actions = source('src/actions/catalog.ts');
    expect(actions).toContain('validateProductTaxonomy');
    expect(actions).toContain('!category.isActive && current?.categoryId !== categoryId');
    expect(actions).toContain('!brand.isActive && current?.brandId !== brandId');
    expect(actions).toContain('The selected category is unavailable.');
    expect(actions).toContain('The selected brand is unavailable.');
  });

  it('keeps inactive options out of new products but retains a current inactive option while editing', () => {
    const createPage = source('src/app/(dashboard)/products/new/page.tsx');
    const editPage = source('src/app/(dashboard)/products/[id]/edit/page.tsx');
    expect(createPage).toContain('db.categories.findAll({ activeOnly: true })');
    expect(createPage).toContain('db.brands.findAll({ activeOnly: true })');
    expect(editPage).toContain('category.isActive || category.id === product.categoryId');
    expect(editPage).toContain('brand.isActive || brand.id === product.brandId');
  });
});
