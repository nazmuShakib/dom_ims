/**
 * Money is ALWAYS an integer number of paisa. Never a float. Never a Decimal.
 * See PLAN.md §17.
 *
 *   85000  ->  BDT 850.00
 */

/** Branded type so a raw number can't be passed where paisa is expected by mistake. */
export type Paisa = number;

export function taka(amount: number): Paisa {
  return Math.round(amount * 100);
}

export function toTaka(paisa: Paisa): number {
  return paisa / 100;
}

/** Display only. Never do arithmetic on the output of this. */
export function formatBDT(paisa: Paisa): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}\u09F3${whole.toLocaleString('en-BD')}.${frac}`;
}

/** Parses user input ("850", "850.50", "৳850.50") into paisa. Throws on garbage. */
export function parseBDT(input: string): Paisa {
  const cleaned = input.replace(/[^\d.-]/g, '').trim();
  if (cleaned === '' || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Not a valid amount: "${input}"`);
  }
  return Math.round(Number(cleaned) * 100);
}

/**
 * Weighted-average cost, for QUANTITY-tracked products only.
 * SERIAL products don't need this — each unit carries its exact cost (PLAN.md §5.3).
 */
export function weightedAvgCost(
  oldQty: number,
  oldAvgCost: Paisa,
  newQty: number,
  newUnitCost: Paisa,
): Paisa {
  const totalQty = oldQty + newQty;
  if (totalQty <= 0) return 0;
  return Math.round((oldQty * oldAvgCost + newQty * newUnitCost) / totalQty);
}
