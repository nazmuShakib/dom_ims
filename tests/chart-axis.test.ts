import { describe, expect, it } from 'vitest';

import {
  outwardIntegerAxisDomain,
  outwardNiceAxisDomain,
  splitSignedIntegerAxis,
  splitSignedNiceAxis,
} from '@/lib/chart-axis';

describe('outwardIntegerAxisDomain', () => {
  it('rounds positive and negative stock movement independently', () => {
    expect(outwardIntegerAxisDomain([175, -2, 173])).toEqual([-5, 180]);
    expect(outwardIntegerAxisDomain([2, -15])).toEqual([-20, 5]);
  });

  it('adds one step when an extreme is already on a step boundary', () => {
    expect(outwardIntegerAxisDomain([175, -15])).toEqual([-20, 180]);
  });

  it('does not add an unused negative range', () => {
    expect(outwardIntegerAxisDomain([0, 12])).toEqual([0, 15]);
    expect(outwardIntegerAxisDomain([0])).toEqual([0, 5]);
  });

  it('rejects an invalid step', () => {
    expect(() => outwardIntegerAxisDomain([1], 0)).toThrow(RangeError);
  });

  it('supports reduced stock-movement headroom', () => {
    expect(outwardIntegerAxisDomain([120, -3], 2)).toEqual([-4, 122]);
  });
});

describe('outwardNiceAxisDomain', () => {
  it('uses a proportional step instead of a fixed money offset', () => {
    expect(outwardNiceAxisDomain([50, 40, -5])).toEqual([-10, 60]);
    expect(outwardNiceAxisDomain([16_000, 8_000, 0])).toEqual([0, 20_000]);
  });

  it('keeps an empty chart usable', () => {
    expect(outwardNiceAxisDomain([0])).toEqual([0, 1]);
  });

  it('uses finer money bounds when more target steps are requested', () => {
    expect(outwardNiceAxisDomain([34_000, 13_000, -39_000], 8)).toEqual([-40_000, 35_000]);
  });
});

describe('splitSignedIntegerAxis', () => {
  it('scales positive and negative ranges independently around zero', () => {
    const axis = splitSignedIntegerAxis([175, -2, 173]);

    const negativeShare = Math.abs(axis.domain[0]);
    const positiveShare = axis.domain[1];

    expect(negativeShare).toBeCloseTo(0.2162, 4);
    expect(positiveShare).toBeCloseTo(0.7838, 4);
    expect(negativeShare + positiveShare).toBeCloseTo(1);
    expect(axis.scale(180)).toBeCloseTo(positiveShare);
    expect(axis.scale(90)).toBeCloseTo(positiveShare / 2);
    expect(axis.scale(-5)).toBeCloseTo(-negativeShare);
    expect(axis.scale(-2)).toBeCloseTo(-negativeShare * 0.4);
    expect(axis.formatTick(positiveShare / 2)).toBe('90');
    expect(axis.formatTick(-negativeShare * 0.4)).toBe('-2');
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(axis.ticks).toEqual([...new Set(axis.ticks)].sort((left, right) => left - right));
    expect(axis.ticks.filter((tick) => tick === 0)).toHaveLength(1);
    expect(axis.ticks.filter((tick) => tick < 0)).toHaveLength(1);
  });

  it('uses the full chart for one-sided and empty data', () => {
    const positive = splitSignedIntegerAxis([0, 12]);
    expect(positive.domain).toEqual([0, 1]);
    expect(positive.scale(12)).toBe(0.8);

    const negative = splitSignedIntegerAxis([0, -3]);
    expect(negative.domain).toEqual([-1, 0]);
    expect(negative.scale(-3)).toBe(-0.6);

    const empty = splitSignedIntegerAxis([0]);
    expect(empty.domain).toEqual([0, 1]);
    expect(empty.formatTick(1)).toBe('5');
  });

  it('gives the larger negative range more room while preserving both minimum shares', () => {
    const axis = splitSignedIntegerAxis([5, -100]);

    expect(axis.domain[1]).toBeGreaterThanOrEqual(0.2);
    expect(Math.abs(axis.domain[0])).toBeGreaterThan(axis.domain[1]);
    expect(Math.abs(axis.domain[0])).toBeLessThanOrEqual(0.8);
    expect(Math.abs(axis.domain[0]) + axis.domain[1]).toBeCloseTo(1);
  });

  it('uses equal space for equal signed ranges', () => {
    const axis = splitSignedIntegerAxis([4, -4]);

    expect(axis.domain).toEqual([-0.5, 0.5]);
  });
});

describe('splitSignedNiceAxis', () => {
  it('uses weighted signed portions with proportional money bounds', () => {
    const axis = splitSignedNiceAxis([34_000, -39_000]);

    expect(axis.domain[0]).toBeLessThan(0);
    expect(axis.domain[1]).toBeGreaterThan(0);
    expect(Math.abs(axis.domain[0]) + axis.domain[1]).toBeCloseTo(1);
    expect(axis.unscale(axis.scale(34_000))).toBeCloseTo(34_000);
    expect(axis.unscale(axis.scale(-39_000))).toBeCloseTo(-39_000);
  });
});
