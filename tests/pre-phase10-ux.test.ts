import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('pre-Phase 10 catalog and ledger UX', () => {
  it('filters suppliers locally and preserves history through reversible removal', () => {
    const register = source('src/components/suppliers/SupplierRegister.tsx');
    const editor = source('src/components/suppliers/SupplierEditor.tsx');
    const actions = source('src/actions/catalog.ts');
    expect(register).toContain('useMemo');
    expect(register).toContain('supplier.phone');
    expect(register).toContain('supplier.email');
    expect(register).toContain('supplier.address');
    expect(register).toContain("order === 'newest'");
    expect(editor).toContain('<Pencil');
    expect(editor).toContain('<Trash2');
    expect(editor).toContain('<RotateCcw');
    expect(actions).toContain('export async function setSupplierActive');
    expect(actions).toContain("action: active ? 'supplier.restore' : 'supplier.archive'");
    expect(actions).not.toContain('db.suppliers.delete');
  });

  it('keeps ledger controls stable while only its output displays loading', () => {
    const workspace = source('src/components/stock/MovementWorkspace.tsx');
    const page = source('src/app/(dashboard)/stock/movements/page.tsx');
    expect(workspace).toContain("window.history.pushState(null, '',");
    expect(workspace).toContain('router.refresh()');
    expect(workspace).toContain('startRefreshing(() => {');
    expect(workspace).toContain('{filterPanel}');
    expect(workspace).toContain("t('loading.filterMovements')");
    expect(workspace).toContain("field.type !== 'hidden'");
    expect(workspace).toContain('field.selectedIndex = 0');
    expect(page).toContain('data-ledger-reset');
    expect(page).toContain('name="product"');
    expect(page).toContain('name="type"');
    expect(page).toContain('name="actor"');
    expect(page).toContain('name="from"');
    expect(page).toContain('name="to"');
  });

  it('supports product identity, tracking, stock, catalog and price ordering filters', () => {
    const register = source('src/components/catalog/ProductRegister.tsx');
    const page = source('src/app/(dashboard)/products/page.tsx');
    for (const field of ['q', 'tracking', 'stock', 'category', 'brand', 'status', 'order']) {
      expect(register).toContain(`${field}:`);
    }
    for (const value of ['SERIAL', 'QUANTITY', 'on-hand', 'low', 'out', 'dead', 'newest', 'oldest', 'cost-desc', 'price-desc', 'name-desc']) {
      expect(register).toContain(`value="${value}"`);
    }
    expect(register).toContain("t('loading.filterProducts')");
    expect(page).toContain('60 * DAY_MS');
    expect(page).toContain("movement.reason === 'CORRECTION'");
    expect(page).toContain('product.model');
    expect(page).toContain('product.barcode');
  });
});
