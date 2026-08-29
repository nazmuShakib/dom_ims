import { describe, expect, it } from 'vitest';

import type { ProductUnitDTO } from '@/lib/dto';
import { filterAndOrderUnits } from '@/lib/unit-filters';

const units: ProductUnitDTO[] = [
  {
    id: '1', serialNo: 'IMEI-200', productId: 'p1', status: 'SOLD', supplierId: null,
    receivedAt: '2026-08-02T18:30:00.000Z', soldAt: '2026-08-03T00:00:00.000Z',
    warrantyExpiresAt: null, location: 'Shelf A1', salePrice: 150_000, costPrice: 100_000,
  },
  {
    id: '2', serialNo: 'IMEI-100', productId: 'p1', status: 'IN_STOCK', supplierId: null,
    receivedAt: '2026-08-01T12:00:00.000Z', soldAt: null,
    warrantyExpiresAt: null, location: 'Back room', salePrice: null, costPrice: 80_000,
  },
  {
    id: '3', serialNo: 'IMEI-300', productId: 'p1', status: 'SOLD', supplierId: null,
    receivedAt: '2026-08-03T08:00:00.000Z', soldAt: '2026-08-03T10:00:00.000Z',
    warrantyExpiresAt: null, location: null, salePrice: 110_000, costPrice: 120_000,
  },
];

const defaults = {
  query: '', location: '', status: 'all' as const, receivedFrom: '', receivedTo: '',
  minCost: null, maxCost: null, order: 'in-stock-first' as const,
};

describe('serialized-unit filters', () => {
  it('combines IMEI, status, location, Dhaka receipt date, and cost ranges', () => {
    expect(filterAndOrderUnits(units, { ...defaults, query: '200', receivedFrom: '2026-08-03', receivedTo: '2026-08-03' }).map((unit) => unit.id))
      .toEqual(['1']);
    expect(filterAndOrderUnits(units, { ...defaults, status: 'IN_STOCK', location: 'back', minCost: 70_000, maxCost: 90_000 }).map((unit) => unit.id))
      .toEqual(['2']);
  });

  it('orders newest, oldest, and realized profit while leaving unsold profit last', () => {
    expect(filterAndOrderUnits(units, { ...defaults, order: 'newest' }).map((unit) => unit.id))
      .toEqual(['3', '1', '2']);
    expect(filterAndOrderUnits(units, { ...defaults, order: 'oldest' }).map((unit) => unit.id))
      .toEqual(['2', '1', '3']);
    expect(filterAndOrderUnits(units, { ...defaults, order: 'profit-desc' }).map((unit) => unit.id))
      .toEqual(['1', '3', '2']);
    expect(filterAndOrderUnits(units, { ...defaults, order: 'profit-asc' }).map((unit) => unit.id))
      .toEqual(['3', '1', '2']);
  });

  it('does not mutate the server-provided unit array', () => {
    filterAndOrderUnits(units, { ...defaults, order: 'serial-asc' });
    expect(units.map((unit) => unit.id)).toEqual(['1', '2', '3']);
  });

  it('orders device numbers character by character and preserves leading-zero significance', () => {
    const serials = [
      '12312',
      '3231231',
      '12313125',
      '025463210',
      '85463212',
      '97456320',
      '123123132',
      '31231231212',
    ];
    const numberedUnits = serials.map((serialNo, index) => ({
      ...units[0],
      id: `number-${index}`,
      serialNo,
    }));

    expect(
      filterAndOrderUnits(numberedUnits, { ...defaults, order: 'serial-asc' })
        .map((unit) => unit.serialNo),
    ).toEqual([
      '025463210',
      '12312',
      '123123132',
      '12313125',
      '31231231212',
      '3231231',
      '85463212',
      '97456320',
    ]);
  });
});
