import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Phase 0 JSON persistence. PLAN.md §13.
 *
 * ⚠️ TWO HARD LIMITS, both intentional:
 *
 * 1. This does not work on Vercel. Serverless filesystems are read-only.
 *    Phase 0 is a LOCAL DEV prototype. Do not deploy it.
 *
 * 2. The mutex below serializes writes within ONE process. It is not a real
 *    transaction — a crash mid-`fn` leaves partial writes committed. That is
 *    exactly why Phase 1 swaps this for `prisma.$transaction`.
 */

const DATA_DIR = path.join(process.cwd(), 'data');

export type Collection =
  | 'products'
  | 'product-units'
  | 'stock-movements'
  | 'categories'
  | 'brands'
  | 'suppliers'
  | 'users'
  | 'audit-logs'
  | 'warranty-claims'
  | 'warranty-claim-events'
  | 'supplier-warranty-cases'
  | 'customers'
  | 'cart-drafts'
  | 'cart-items'
  | 'sales'
  | 'sale-items'
  | 'sale-settlements'
  | 'used-device-acquisitions'
  | 'refurbishment-expenses'
  | 'supplier-returns'
  | 'expense-categories'
  | 'operating-expenses'
  | 'emi-contracts'
  | 'emi-installments'
  | 'emi-payments'
  | 'emi-payment-allocations'
  | 'emi-early-settlements';

/** Tiny in-memory cache so a single request doesn't re-read the same file 20 times. */
const cache = new Map<Collection, unknown[]>();

export async function readAll<T>(name: Collection): Promise<T[]> {
  const cached = cache.get(name);
  if (cached) return cached as T[];

  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const rows = JSON.parse(raw) as T[];
    cache.set(name, rows as unknown[]);
    return rows;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cache.set(name, []);
      return [];
    }
    throw err;
  }
}

/**
 * ⚠️ Atomic write: temp file + rename. A plain fs.writeFile that dies halfway
 * leaves you with a truncated, unparseable products.json and no stock data.
 * rename(2) is atomic on POSIX.
 */
export async function writeAll<T>(name: Collection, rows: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf-8');
  await fs.rename(tmp, file);
  cache.set(name, rows as unknown[]);
}

/** Drop the cache — call after an out-of-band write (e.g. the seed script). */
export function invalidate(): void {
  cache.clear();
}

/**
 * Serializes all mutations through one promise chain, so two concurrent requests
 * can't read-modify-write over each other. Becomes prisma.$transaction in Phase 1.
 */
let queue: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Keep the chain alive even if `fn` rejects, or every later write would reject too.
  queue = run.catch(() => undefined);
  return run;
}

export function nowIso(): string {
  return new Date().toISOString();
}
