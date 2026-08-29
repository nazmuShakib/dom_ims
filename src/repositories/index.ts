import { jsonRepositories } from './json';
import type { Repositories } from './types';

/**
 * ⚠️ THE ONLY FILE THAT CHANGES WHEN YOU MIGRATE TO POSTGRES. PLAN.md §13.4.
 *
 * Nothing above this file — services, server actions, UI — imports a storage
 * implementation directly. Phase 6 changes storage here and nowhere else.
 */
// PostgreSQL is the Phase 6 production default. Tests remain self-contained and
// the legacy seed command opts into JSON explicitly.
const source = process.env.DATA_SOURCE ?? (process.env.NODE_ENV === 'test' ? 'json' : 'postgres');

if (source !== 'json' && source !== 'postgres') {
  throw new Error(`Unsupported DATA_SOURCE=${source}. Use "json" or "postgres".`);
}

// Do not initialize Prisma in JSON-only tools/tests. The dynamic import also
// keeps the legacy local backend usable without a Neon connection string.
export const db: Repositories = source === 'postgres'
  ? (await import('./prisma')).prismaRepositories
  : jsonRepositories;

export type * from './types';
