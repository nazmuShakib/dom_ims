import { describe, expect, it } from 'vitest';

import { generateNumericProductBarcode } from '@/lib/product-barcode';

describe('numeric product barcode generator', () => {
  it('creates compact scanner-friendly 15-digit values', () => {
    const values = Array.from({ length: 20 }, () => generateNumericProductBarcode());

    expect(values.every((value) => /^[1-9]\d{14}$/.test(value))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});
