import type { UnitStatus } from '@/domain/types';
import type { ProductUnitDTO } from '@/lib/dto';
import type { Paisa } from '@/lib/money';

export type UnitStatusFilter = 'all' | UnitStatus;
export type UnitOrder =
  | 'in-stock-first'
  | 'newest'
  | 'oldest'
  | 'profit-desc'
  | 'profit-asc'
  | 'cost-desc'
  | 'cost-asc'
  | 'serial-asc';

export interface UnitFilters {
  query: string;
  location: string;
  status: UnitStatusFilter;
  receivedFrom: string;
  receivedTo: string;
  minCost: Paisa | null;
  maxCost: Paisa | null;
  order: UnitOrder;
}

function dhakaDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function unitProfit(unit: ProductUnitDTO): Paisa | null {
  return unit.salePrice !== null && unit.costPrice !== undefined
    ? unit.salePrice - unit.costPrice
    : null;
}

function nullableNumber(left: number | null, right: number | null, direction: 1 | -1): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function deviceNumberAscending(left: string, right: string): number {
  return left.localeCompare(right, 'en', {
    numeric: false,
    sensitivity: 'base',
  }) || left.localeCompare(right, 'en');
}

export function filterAndOrderUnits(
  units: readonly ProductUnitDTO[],
  filters: UnitFilters,
): ProductUnitDTO[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const location = filters.location.trim().toLocaleLowerCase();

  const filtered = units.filter((unit) => {
    const received = dhakaDate(unit.receivedAt);
    return (
      (!query || unit.serialNo.toLocaleLowerCase().includes(query)) &&
      (!location || unit.location?.toLocaleLowerCase().includes(location)) &&
      (filters.status === 'all' || unit.status === filters.status) &&
      (!filters.receivedFrom || received >= filters.receivedFrom) &&
      (!filters.receivedTo || received <= filters.receivedTo) &&
      (filters.minCost === null || (unit.costPrice !== undefined && unit.costPrice >= filters.minCost)) &&
      (filters.maxCost === null || (unit.costPrice !== undefined && unit.costPrice <= filters.maxCost))
    );
  });

  return filtered.sort((left, right) => {
    switch (filters.order) {
      case 'newest':
        return right.receivedAt.localeCompare(left.receivedAt) || left.serialNo.localeCompare(right.serialNo);
      case 'oldest':
        return left.receivedAt.localeCompare(right.receivedAt) || left.serialNo.localeCompare(right.serialNo);
      case 'profit-desc':
        return nullableNumber(unitProfit(left), unitProfit(right), -1) || left.serialNo.localeCompare(right.serialNo);
      case 'profit-asc':
        return nullableNumber(unitProfit(left), unitProfit(right), 1) || left.serialNo.localeCompare(right.serialNo);
      case 'cost-desc':
        return nullableNumber(left.costPrice ?? null, right.costPrice ?? null, -1) || left.serialNo.localeCompare(right.serialNo);
      case 'cost-asc':
        return nullableNumber(left.costPrice ?? null, right.costPrice ?? null, 1) || left.serialNo.localeCompare(right.serialNo);
      case 'serial-asc':
        return deviceNumberAscending(left.serialNo, right.serialNo);
      case 'in-stock-first':
      default:
        if (left.status === 'IN_STOCK' && right.status !== 'IN_STOCK') return -1;
        if (right.status === 'IN_STOCK' && left.status !== 'IN_STOCK') return 1;
        return right.receivedAt.localeCompare(left.receivedAt) || left.serialNo.localeCompare(right.serialNo);
    }
  });
}
