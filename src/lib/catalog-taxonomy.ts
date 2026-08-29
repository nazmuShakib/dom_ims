export type TaxonomyStatusFilter = 'all' | 'active' | 'removed';
export type TaxonomyUsageFilter = 'all' | 'used' | 'unused';
export type TaxonomyOrder =
  | 'newest'
  | 'oldest'
  | 'products-desc'
  | 'products-asc'
  | 'name-asc'
  | 'name-desc';

export interface TaxonomyListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export interface TaxonomyFilters {
  query: string;
  status: TaxonomyStatusFilter;
  usage: TaxonomyUsageFilter;
  order: TaxonomyOrder;
}

export function filterTaxonomyItems(
  items: readonly TaxonomyListItem[],
  filters: TaxonomyFilters,
): TaxonomyListItem[] {
  const query = filters.query.trim().toLocaleLowerCase();

  const filtered = items.filter((item) => {
    const matchesQuery = !query || `${item.name} ${item.slug}`.toLocaleLowerCase().includes(query);
    const matchesStatus =
      filters.status === 'all' ||
      (filters.status === 'active' ? item.isActive : !item.isActive);
    const matchesUsage =
      filters.usage === 'all' ||
      (filters.usage === 'used' ? item.productCount > 0 : item.productCount === 0);
    return matchesQuery && matchesStatus && matchesUsage;
  });

  return filtered.sort((left, right) => {
    switch (filters.order) {
      case 'oldest':
        return left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
      case 'products-desc':
        return right.productCount - left.productCount || left.name.localeCompare(right.name);
      case 'products-asc':
        return left.productCount - right.productCount || left.name.localeCompare(right.name);
      case 'name-asc':
        return left.name.localeCompare(right.name);
      case 'name-desc':
        return right.name.localeCompare(left.name);
      case 'newest':
      default:
        return right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name);
    }
  });
}
