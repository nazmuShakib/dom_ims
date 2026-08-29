import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 6 repository cutover', () => {
  it('selects JSON or PostgreSQL only at the repository boundary', () => {
    const selector = source('src/repositories/index.ts');
    expect(selector).toContain("source === 'postgres'");
    expect(selector).toContain("await import('./prisma')");
    expect(selector).toContain('jsonRepositories');
  });

  it('passes transaction-scoped repositories into all stock mutations', () => {
    const contract = source('src/repositories/types.ts');
    expect(contract).toContain('(repositories: Repositories)');

    const stock = source('src/services/stock.ts');
    expect(stock.match(/db\.transaction\(async \(tx\)/g)).toHaveLength(3);
    expect(stock).toContain('tx.units.transitionStatus');
    expect(stock).toContain('tx.products._applyQuantityDelta');
    expect(stock).toContain('tx.movements.record');
  });

  it('creates scoped Prisma repositories inside a real interactive transaction', () => {
    const repository = source('src/repositories/prisma/index.ts');
    expect(repository).toContain('prisma.$transaction(');
    expect(repository).toContain('fn(createRepositories(tx))');
    expect(repository).toContain('maxWait: 5_000');
    expect(repository).toContain('timeout: 15_000');
  });

  it('keeps movements append-only and guards stock updates atomically', () => {
    const contract = source('src/repositories/types.ts');
    expect(contract).toContain("'quantityOnHand'");
    expect(contract).toContain("'avgCostPrice'");
    const repository = source('src/repositories/prisma/index.ts');
    const movementSection = repository.slice(repository.indexOf('movements: {'));
    expect(movementSection).toContain('stockMovement.create');
    expect(movementSection).not.toContain('stockMovement.update');
    expect(movementSection).not.toContain('stockMovement.delete');
    expect(repository).toContain('productUnit.updateMany');
    expect(repository).toContain('quantityOnHand: { gte: -delta }');
  });
});

describe('Phase 6 database invariants', () => {
  it('enforces ledger, money, quantity, correction, and identifier constraints', () => {
    const migration = source('prisma/migrations/20260718150000_phase_6_inventory_constraints/migration.sql');
    for (const required of [
      'stock_movements_quantity_nonzero',
      'stock_movements_serial_quantity_one',
      'stock_movements_unit_cost_nonnegative',
      'products_quantity_on_hand_nonnegative',
      'stock_movements_reversesId_key',
      'stock_movements_reversesId_fkey',
      'products_sku_ci_key',
      'product_units_serial_no_ci_key',
    ]) expect(migration).toContain(required);
  });

  it('installs PostgreSQL trigram indexes for product search', () => {
    const migration = source('prisma/migrations/20260718150000_phase_6_inventory_constraints/migration.sql');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(migration).toContain('products_name_trgm_idx');
    expect(migration).toContain('products_sku_trgm_idx');
  });
});
