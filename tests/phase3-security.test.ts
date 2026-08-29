import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Product, ProductUnit, Role } from '@/domain/types';
import { toProductDTO, toProductUnitDTO } from '@/lib/dto';
import {
  CAPABILITY_ROLES,
  canUseAccount,
  hasPermission,
  type Capability,
} from '@/lib/permissions';

const product: Product = {
  id: 'product-1',
  sku: 'PHONE-1',
  barcode: null,
  name: 'Test phone',
  description: null,
  model: null,
  trackingType: 'SERIAL',
  categoryId: 'category-1',
  brandId: null,
  defaultCostPrice: 50_000,
  defaultSalePrice: 60_000,
  taxRate: 0,
  reorderPoint: 2,
  quantityOnHand: 0,
  avgCostPrice: 50_000,
  imageUrl: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const unit: ProductUnit = {
  id: 'unit-1',
  serialNo: 'IMEI-1',
  productId: product.id,
  status: 'IN_STOCK',
  costPrice: 50_000,
  salePrice: null,
  supplierId: null,
  receivedAt: '2026-01-01T00:00:00.000Z',
  soldAt: null,
  warrantyMonths: null,
  warrantyExpiresAt: null,
  location: null,
  note: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Phase 3 role matrix', () => {
  const expected: Record<Role, readonly Capability[]> = {
    ADMIN: [
      'VIEW_STOCK',
      'MOVE_STOCK',
      'REMOVE_STOCK',
      'VIEW_COSTS',
      'VIEW_REPORTS',
      'MANAGE_CATALOG',
      'CORRECT_STOCK',
      'MANAGE_USERS',
      'ARCHIVE_PRODUCTS',
      'VIEW_RMA',
      'CREATE_RMA',
      'MANAGE_RMA',
      'PRINT_LABELS',
      'REPRINT_NON_STOCK_LABELS',
      'CHECKOUT',
      'VIEW_INVOICES',
      'MANAGE_CUSTOMERS',
      'MANAGE_USED_DEVICES',
      'VIEW_EXPENSES',
      'MANAGE_EXPENSES',
      'VOID_EXPENSES',
      'VIEW_EMI',
      'RECORD_EMI_PAYMENT',
      'APPROVE_EMI_SETTLEMENT',
    ],
    MANAGER: ['VIEW_STOCK', 'MOVE_STOCK', 'VIEW_COSTS', 'VIEW_REPORTS', 'MANAGE_CATALOG', 'CORRECT_STOCK', 'VIEW_RMA', 'CREATE_RMA', 'MANAGE_RMA', 'PRINT_LABELS', 'REPRINT_NON_STOCK_LABELS', 'CHECKOUT', 'VIEW_INVOICES', 'MANAGE_CUSTOMERS', 'MANAGE_USED_DEVICES', 'VIEW_EXPENSES', 'MANAGE_EXPENSES', 'VIEW_EMI', 'RECORD_EMI_PAYMENT', 'APPROVE_EMI_SETTLEMENT'],
    STAFF: ['VIEW_STOCK', 'MOVE_STOCK', 'VIEW_RMA', 'CREATE_RMA', 'PRINT_LABELS', 'CHECKOUT', 'VIEW_INVOICES', 'MANAGE_CUSTOMERS', 'VIEW_EMI'],
  };

  for (const role of Object.keys(expected) as Role[]) {
    it(`grants exactly the planned capabilities to ${role}`, () => {
      const granted = (Object.keys(CAPABILITY_ROLES) as Capability[]).filter((capability) =>
        hasPermission(role, capability),
      );
      expect(granted).toEqual(expected[role]);
    });
  }
});

describe('STAFF serialization boundary', () => {
  it('removes product cost and average-cost fields', () => {
    const dto = toProductDTO(product, 'STAFF');
    expect(dto).not.toHaveProperty('defaultCostPrice');
    expect(dto).not.toHaveProperty('avgCostPrice');
    expect(dto).toHaveProperty('defaultSalePrice', product.defaultSalePrice);
  });

  it('removes serialized-unit cost fields', () => {
    const dto = toProductUnitDTO(unit, 'STAFF');
    expect(dto).not.toHaveProperty('costPrice');
    expect(dto).toHaveProperty('salePrice');
  });

  it.each(['ADMIN', 'MANAGER'] as const)('keeps cost fields for %s', (role) => {
    expect(toProductDTO(product, role)).toHaveProperty('defaultCostPrice', product.defaultCostPrice);
    expect(toProductUnitDTO(unit, role)).toHaveProperty('costPrice', unit.costPrice);
  });
});

describe('account status enforcement', () => {
  it('allows only active, non-banned accounts', () => {
    expect(canUseAccount({ isActive: true, banned: false })).toBe(true);
    expect(canUseAccount({ isActive: false, banned: false })).toBe(false);
    expect(canUseAccount({ isActive: true, banned: true })).toBe(false);
    expect(canUseAccount({ isActive: false, banned: true })).toBe(false);
  });
});

describe('Server Action authorization boundaries', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('uses capability checks for catalog mutations', () => {
    const text = source('src/actions/catalog.ts');
    expect(text).toContain("requireCapability('MANAGE_CATALOG')");
    expect(text).toContain("requireCapability('ARCHIVE_PRODUCTS')");
    expect(text).not.toContain('requireRole(');
  });

  it('uses capability checks for stock mutations', () => {
    const text = source('src/actions/stock.ts');
    expect(text).toContain("requireCapability('MOVE_STOCK')");
    expect(text).toContain("requireCapability('REMOVE_STOCK')");
    expect(text).toContain("requireCapability('CORRECT_STOCK')");
    expect(text).not.toContain('requireRole(');
  });

  it('uses capability checks for user administration', () => {
    const text = source('src/actions/users.ts');
    expect(text).toContain("requireCapability('MANAGE_USERS')");
    expect(text).not.toContain('requireRole(');
  });

  it('passes role-filtered DTOs into the client stock-out form', () => {
    const page = source('src/app/(dashboard)/stock/out/page.tsx');
    const form = source('src/components/stock/StockOutForm.tsx');
    expect(page).toContain('toProductDTO(product, role)');
    expect(form).toContain('bulkProducts: ProductDTO[]');
    expect(form).not.toContain('bulkProducts: Product[]');
  });
});

describe('authentication and audit architecture', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('keeps public signup disabled and installs phone, admin and cookie plugins', () => {
    const text = source('src/lib/auth.ts');
    expect(text).toContain('emailAndPassword:');
    expect(text).toContain('enabled: false');
    expect(text).toContain('disableSignUp: true');
    expect(text).toContain('phoneNumber({');
    expect(text).toContain('phoneNumberValidator: isBangladeshMobile');
    expect(text).toContain('admin({');
    expect(text).toContain('nextCookies()');
  });

  it('uses mobile-only login while retaining hidden Better Auth email identifiers', () => {
    const action = source('src/actions/auth.ts');
    const login = source('src/components/auth/LoginForm.tsx');
    const users = source('src/actions/users.ts');
    expect(action).toContain('auth.api.signInPhoneNumber');
    expect(action).not.toContain('signInEmail');
    expect(login).toContain('name="phone"');
    expect(users).toContain('generateInternalAuthEmail()');
    expect(users).toContain('phoneNumberVerified: true');
  });

  it('supports self-service and administrator password changes with session revocation', () => {
    const settings = source('src/actions/settings.ts');
    const users = source('src/actions/users.ts');
    expect(settings).toContain('auth.api.changePassword');
    expect(settings).toContain('revokeOtherSessions: true');
    expect(users).toContain('auth.api.setUserPassword');
    expect(users).toContain('prisma.session.deleteMany');
  });

  it('provides a guarded development-only emergency ADMIN recovery command', () => {
    const recovery = source('scripts/recover-admin.ts');
    const packageJson = source('package.json');
    expect(packageJson).toContain('auth:recover-admin:dev');
    expect(recovery).toContain("required('ADMIN_RECOVERY_DATABASE_URL')");
    expect(recovery).not.toContain("process.env.DATABASE_URL");
    expect(recovery).toContain("CONFIRMATION = 'RESET_DEV_ADMIN'");
    expect(recovery).toContain("process.argv.includes('--development')");
    expect(recovery).toContain('hashPassword(password)');
    expect(recovery).toContain('transaction.account.update');
    expect(recovery).toContain('transaction.session.deleteMany');
    expect(recovery).toContain('transaction.auditLog.create');
    expect(recovery).toContain("actorId: null");
  });

  it('provides accessible password visibility controls without changing form semantics', () => {
    const input = source('src/components/auth/PasswordInput.tsx');
    const login = source('src/components/auth/LoginForm.tsx');
    const settings = source('src/components/auth/ChangePasswordForm.tsx');
    expect(input).toContain("type={visible ? 'text' : 'password'}");
    expect(input).toContain('aria-pressed={visible}');
    expect(login).toContain('<PasswordInput');
    expect(settings.match(/<PasswordInput/g)).toHaveLength(3);
  });

  it('uses proxy.ts only as an optimistic cookie guard', () => {
    const text = source('src/proxy.ts');
    expect(text).toContain('getSessionCookie(request)');
    expect(text).not.toContain('prisma');
    expect(text).not.toContain('requireRole');
    expect(text).not.toContain('requireCapability');
  });

  it('re-resolves the user and account status from Neon for every session', () => {
    const text = source('src/lib/session.ts');
    expect(text).toContain('prisma.user.findUnique');
    expect(text).toContain('canUseAccount(current)');
  });

  it('keeps the audit writer append-only', () => {
    const text = source('src/lib/audit.ts');
    expect(text).toContain('prisma.auditLog.create');
    expect(text).not.toContain('prisma.auditLog.update');
    expect(text).not.toContain('prisma.auditLog.delete');
  });

  it('audits authentication, user, catalog, and stock mutations', () => {
    const text = [
      source('src/actions/auth.ts'),
      source('src/actions/settings.ts'),
      source('src/actions/users.ts'),
      source('src/actions/catalog.ts'),
      source('src/actions/stock.ts'),
    ].join('\n');
    for (const action of [
      'auth.login',
      'auth.logout',
      'auth.password_change',
      'user.create',
      'user.role_change',
      'user.activate',
      'user.deactivate',
      'product.create',
      'product.update',
      'product.archive',
      'product.restore',
      'category.create',
      'category.update',
      'category.archive',
      'category.restore',
      'brand.create',
      'brand.update',
      'brand.archive',
      'brand.restore',
      'supplier.create',
      'supplier.update',
      'stock.in',
      'stock.out',
      'stock.correct',
    ]) {
      expect(text).toContain(`'${action}'`);
    }
  });
});
