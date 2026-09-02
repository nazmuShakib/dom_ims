import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { productStaffDiscountFieldsSchema } from '@/schemas';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 10 controlled selling', () => {
  it('validates an ADMIN-managed discount allowance on each product', () => {
    expect(productStaffDiscountFieldsSchema.safeParse({ staffMaxDiscount: '500' }).success).toBe(true);
    expect(productStaffDiscountFieldsSchema.safeParse({ staffMaxDiscount: '0' }).success).toBe(true);
    expect(productStaffDiscountFieldsSchema.safeParse({ staffMaxDiscount: '-1' }).success).toBe(false);
    expect(productStaffDiscountFieldsSchema.safeParse({ staffMaxDiscount: '1.234' }).success).toBe(false);

    const form = source('src/components/catalog/ProductForm.tsx');
    const details = source('src/app/(dashboard)/products/[id]/page.tsx');
    const action = source('src/actions/catalog.ts');
    expect(form).toContain('productStaffDiscountFieldsSchema.safeParse');
    expect(form).toContain('onSubmit={(event) =>');
    expect(form).toContain('noValidate');
    expect(form).toContain('onInputCapture={(event) => receiveBrowserValue(event.target)}');
    expect(form).toContain('onChangeCapture={(event) => receiveBrowserValue(event.target)}');
    expect(form).toContain('clearedServerErrors.has(key)');
    expect(action).toContain("actor.role === 'ADMIN' ? money(fd, 'staffMaxDiscount') : 0");
    expect(action).toContain(': existing.staffMaxDiscount');
    expect(details).toContain('<Money value={raw.staffMaxDiscount} />');
    expect(details).toContain("t('products.staffMinimumPrice')");
  });

  it('enforces the live STAFF floor while editing and again during atomic checkout', () => {
    const service = source('src/services/checkout.ts');
    const action = source('src/actions/checkout.ts');
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(service).toContain("if (input.actorRole === 'STAFF') {");
    expect(service).toContain('listUnitPrice - product.staffMaxDiscount');
    expect(action).toContain('actorRole: actor.role');
    expect(workspace).toContain('const hasInvalidLines = invalidLineIds.size > 0');
    expect(workspace).toContain('disabled={checkingOut || hasInvalidLines}');
    expect(workspace).toContain('name="localCartLines"');
    expect(action).toContain('lines: localLines');
    expect(action).not.toContain('replaceCartItemsFromBrowser');
  });

  it('makes stock removal an ADMIN-only capability at every entry point', () => {
    const permissions = source('src/lib/permissions.ts');
    const page = source('src/app/(dashboard)/stock/out/page.tsx');
    const actions = source('src/actions/stock.ts');
    const navigation = source('src/components/shell/NavigationLinks.tsx');
    expect(permissions).toContain("REMOVE_STOCK: ['ADMIN']");
    expect(page).toContain("requirePageCapability('REMOVE_STOCK')");
    expect(actions.match(/requireCapability\('REMOVE_STOCK'\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(navigation).toContain("role === 'ADMIN' && <NavLink href=\"/stock/out\"");
  });
});
