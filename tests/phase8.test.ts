import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizePhone } from '@/services/checkout';
import { dhakaYear } from '@/lib/time';
import { thermalPageHeightMm } from '@/lib/thermal-print-page';
import {
  createCustomerSchema,
  createSupplierSchema,
  regularCheckoutPaymentSchema,
} from '@/schemas';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 8 customer and checkout decisions', () => {
  it('creates bounded continuous-paper heights from the rendered receipt', () => {
    expect(thermalPageHeightMm(0)).toBe(40);
    expect(thermalPageHeightMm(960)).toBe(256);
    expect(thermalPageHeightMm(20_000)).toBeLessThanOrEqual(3276);
  });
  it('requires a saved customer for unpaid regular sales on both client and server boundaries', () => {
    expect(regularCheckoutPaymentSchema.safeParse({
      customerId: null,
      paymentStatus: 'PAID',
    }).success).toBe(true);
    expect(regularCheckoutPaymentSchema.safeParse({
      customerId: null,
      paymentStatus: 'UNPAID',
    }).success).toBe(false);
    expect(regularCheckoutPaymentSchema.safeParse({
      customerId: '01914df2-4eec-7ed0-9be7-36e3d303d0fc',
      paymentStatus: 'UNPAID',
    }).success).toBe(true);

    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    const action = source('src/actions/checkout.ts');
    const service = source('src/services/checkout.ts');
    expect(workspace).toContain('regularCheckoutPaymentSchema.safeParse');
    expect(workspace).toContain('error={regularErrors.customerId');
    expect(action).toContain('regularCheckoutPaymentSchema.parse');
    expect(service).toContain('regularCheckoutPaymentSchema.parse');
  });

  it('normalizes customer phone numbers without inventing walk-in records', () => {
    expect(normalizePhone('+880 1712-345678')).toBe('01712345678');
    expect(normalizePhone('1712-345678')).toBe('01712345678');
    expect(normalizePhone('')).toBeNull();
    expect(source('src/services/checkout.ts')).toContain('customerId: customer?.id ?? null');
  });

  it('accepts only Bangladeshi mobile numbers for saved customers', () => {
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '01712345678' }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '+880 1712-345678' }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '01212345678' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '12345' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: '   ', phone: '01712345678' }).success).toBe(false);
  });

  it('uses the shared customer schema for client and server field validation', () => {
    const form = source('src/components/customers/CreateCustomerForm.tsx');
    const action = source('src/actions/checkout.ts');
    const checkout = source('src/components/checkout/CheckoutWorkspace.tsx');

    expect(form).toContain('createCustomerSchema.safeParse(values)');
    expect(form).toContain('onSubmit={validate}');
    expect(form).toContain('noValidate');
    expect(form).toContain("error={fieldError('name')}");
    expect(form).toContain("error={fieldError('phone')}");
    expect(action).toContain('createCustomerSchema.safeParse({');
    expect(action).toContain('fieldErrors: customerFieldErrors(parsed.error)');
    expect(checkout).toContain('<CreateCustomerForm onCreated={chooseCustomer} stacked />');
    expect(action).toContain('customerId: customer.id');
  });

  it('accepts only Bangladeshi mobile numbers when creating or editing suppliers', () => {
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '01712345678' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '+880 1712-345678' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: null }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '+14155552671' }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '12345' }).success).toBe(false);

    const page = source('src/app/(dashboard)/suppliers/page.tsx');
    const editor = source('src/components/suppliers/SupplierEditor.tsx');
    const action = source('src/actions/catalog.ts');
    const repositories = source('src/repositories/types.ts');
    expect(page).toContain("<SupplierRegister suppliers={suppliers} canManage={role !== 'STAFF'} />");
    expect(editor).toContain("t('suppliers.edit')");
    expect(editor).toContain("t('common.saveChanges')");
    expect(action).toContain('export async function updateSupplier');
    expect(action).toContain("action: 'supplier.update'");
    expect(action).toContain('normalizeBangladeshMobile(parsed.data.phone)');
    expect(repositories).toContain("Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>");
  });

  it('does not turn a name-only customer search into an empty phone match', () => {
    const repository = source('src/repositories/prisma/index.ts');
    expect(repository).toContain("const digits = term.replace(/\\D/g, '')");
    expect(repository).toContain('...(digits ? [{ phoneNormalized: { contains: digits } }] : [])');
    expect(repository).not.toContain("phoneNormalized: { contains: term.replace(/\\D/g, '') }");
  });

  it('keeps customer records minimal and provides search plus purchase history', () => {
    const schema = source('prisma/schema.prisma');
    const customerModel = schema.slice(schema.indexOf('model Customer'), schema.indexOf('model CartDraft'));
    expect(customerModel).toContain('name');
    expect(customerModel).toContain('phone');
    expect(customerModel).not.toContain('email');
    expect(customerModel).not.toContain('address');
    expect(customerModel).not.toContain('note');
    const page = source('src/app/(dashboard)/customers/page.tsx');
    expect(page).toContain('db.customers.search');
    expect(source('src/app/(dashboard)/customers/[id]/page.tsx')).toContain('db.sales.findByCustomer');
    const register = source('src/components/customers/CustomerRegister.tsx');
    expect(register).toContain('setFiltering(true)');
    expect(register).toContain('setFiltering(false)');
    expect(register).toContain("t('loading.searchCustomers')");
    expect(register).toContain('window.history.pushState');
    expect(register).toContain('router.refresh()');
    expect(register).toContain('<TableViewport>');
    expect(register).toContain("t('customers.purchaseHistory')");
    expect(register).toContain("t('customers.view')");
    expect(register).toContain('sm:p-5');
    expect(page).toContain('max-w-5xl');
  });

  it('numbers invoices by the Dhaka calendar year', () => {
    expect(dhakaYear(new Date('2026-12-31T20:00:00.000Z'))).toBe(2027);
  });

  it('filters completed and voided invoices independently of payment status', () => {
    const register = source('src/components/invoices/InvoiceRegister.tsx');
    const page = source('src/app/(dashboard)/invoices/page.tsx');
    const prisma = source('src/repositories/prisma/index.ts');
    const json = source('src/repositories/json/index.ts');
    const messages = source('src/lib/i18n/messages.ts');

    expect(register).toContain('name="status"');
    expect(register).toContain('<option value="COMPLETED">');
    expect(register).toContain('<option value="VOIDED">');
    expect(register).toContain("placeholder={t('invoices.setMaximumPrice')}");
    expect(page).toContain("status === 'COMPLETED' || status === 'VOIDED'");
    expect(prisma).toContain('status: filters.status');
    expect(json).toContain('!filters.status || item.status === filters.status');
    expect(messages).toContain("'invoices.setMaximumPrice': 'Set maximum price'");
  });

  it('persists one server draft per actor and records payment details', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).toContain('actorId String @unique');
    expect(schema).toContain('paymentMethod PaymentMethod');
    expect(schema).toContain('paymentStatus PaymentStatus');
    expect(schema).toContain('enum PaymentStatus');
  });

  it('lets the owner explicitly discard a persisted draft without changing inventory', () => {
    const service = source('src/services/checkout.ts');
    const action = source('src/actions/checkout.ts');
    const control = source('src/components/checkout/DiscardDraftControl.tsx');
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(service).toContain('const cart = await ownedCart(tx, cartId, actorId)');
    expect(service).toContain('await tx.carts.delete(cart.id)');
    expect(action).toContain("action: 'cart.discard'");
    expect(action).toContain("action: 'cart.expire'");
    expect(workspace).toContain('LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000');
    expect(workspace).toContain('window.localStorage.removeItem(storageKey)');
    expect(workspace).toContain('expireCartDraftAction(data)');
    expect(workspace).toContain('if (!cart.tradeInDraft)');
    expect(control).toContain('hasTradeIn ?');
    expect(control).toContain('role="alertdialog"');
    expect(control).toContain("t('checkout.inventoryUnchanged')");
  });

  it('allows STAFF checkout while preserving immutable price snapshots', () => {
    const permissions = source('src/lib/permissions.ts');
    const service = source('src/services/checkout.ts');
    expect(permissions).toContain("CHECKOUT: ['ADMIN', 'MANAGER', 'STAFF']");
    expect(service).toContain('listUnitPrice: item.listUnitPrice');
    expect(service).toContain('unitPrice: item.actualUnitPrice');
    expect(service).toContain('discount: subtotal - total');
  });

  it('uses one client-side searchable customer combobox during checkout', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    const combobox = source('src/components/checkout/CustomerCombobox.tsx');
    expect(workspace).toContain('<CustomerCombobox');
    expect(combobox).toContain('role="combobox"');
    expect(combobox).toContain('role="listbox"');
    expect(combobox).toContain('name="customerId"');
    expect(combobox).toContain('filteredCustomers');
  });

  it('requires confirmation before completing a sale', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('role="alertdialog"');
    expect(workspace).toMatch(/t\(["']checkout\.invoicePreview["']\)/);
    expect(workspace).toMatch(/t\(["']checkout\.invoicePreviewHelp["']\)/);
    expect(workspace).toContain('invoice-preview-viewport contextual-scroll-area scrollbar-active');
    expect(workspace).toContain('orderedLines.map((line) =>');
    expect(workspace).toContain('formatBDT(line.actualUnitPrice * line.quantity)');
    expect(workspace).toMatch(/t\(["']checkout\.previewTradeInDevice["']\)/);
    expect(workspace).toContain('cart.tradeInDraft.serialNo');
    expect(workspace).toContain('cart.tradeInDraft.acquisitionValue');
    expect(workspace).toContain('<form action={completeAction}');
    expect(workspace).toMatch(/t\(["']checkout\.yesComplete["']\)/);
  });

  it('shows the device identifier instead of an editable quantity for serialized cart lines', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toMatch(/line\.trackingType === ["']SERIAL["']/);
    expect(workspace).toMatch(/t\(["']checkout\.serialImei["']\)/);
    expect(workspace).toContain('<SerialChip serial={line.serialNo} />');
    expect(workspace).toContain('quantity: product.trackingType === "SERIAL" ? 1');
  });

  it('uses a bounded local quantity stepper for bulk cart lines', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('stepQuantity(-1)');
    expect(workspace).toContain('stepQuantity(1)');
    expect(workspace).toMatch(/t\(["']checkout\.decreaseQuantity["']\)/);
    expect(workspace).toMatch(/t\(["']checkout\.increaseQuantity["']\)/);
    expect(workspace).toContain('quantity >= maximumQuantity');
    expect(workspace).toContain('onChange(line.id, { quantity: next, actualUnitPrice: line.actualUnitPrice })');
  });

  it('persists edits locally and submits the untrusted browser cart for final server validation', () => {
    const schema = source('prisma/schema.prisma');
    const migration = source('prisma/migrations/20260820150000_local_checkout_drafts/migration.sql');
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    const action = source('src/actions/checkout.ts');
    const service = source('src/services/checkout.ts');
    expect(workspace).toContain('window.localStorage.setItem(storageKey');
    expect(workspace).toContain('const [draftHydrated, setDraftHydrated] = useState(false)');
    expect(workspace).toContain('if (!draftHydrated) return');
    expect(workspace).toContain('setDraftHydrated(true)');
    expect(workspace).toContain('LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000');
    expect(workspace).toContain('name="localCartLines"');
    expect(action).toContain('lines: localLines');
    expect(action).not.toContain('replaceCartItemsFromBrowser');
    expect(service).toContain('lines: localCheckoutLinesSchema');
    expect(service).toContain('checkoutSubmissionSchema.parse(raw)');
    expect(service).toContain("if (input.actorRole === 'STAFF')");
    expect(schema).not.toContain('model CartItem');
    expect(schema).toContain('tradeInDraft Json?');
    expect(migration).toContain('DROP TABLE "cart_items"');
    expect(migration).toContain('DROP COLUMN "paymentMethod"');
    expect(workspace).not.toMatch(/t\(["']checkout\.update["']\)/);
  });

  it('places responsive removal controls at the desktop bottom-right and beside the mobile price', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('className="hidden sm:block"');
    expect(workspace).toContain('className="inline-flex h-9 w-9 shrink-0');
    expect(workspace).toContain('className="size-5 shrink-0" strokeWidth={2.25}');
    expect(workspace).toContain('<Trash2 aria-hidden="true" size={15} />');
    expect(workspace).toMatch(/aria-label=\{t\(["']checkout\.remove["']\)\}/);
  });

  it('keeps drag ordering local and snapshots that order into the immutable invoice', () => {
    const schema = source('prisma/schema.prisma');
    const service = source('src/services/checkout.ts');
    const action = source('src/actions/checkout.ts');
    const repository = source('src/repositories/prisma/index.ts');
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(schema).not.toContain('model CartItem');
    expect(service).toContain('for (const [position, line] of input.lines.entries())');
    expect(service).toContain('position: item.position');
    expect(action).not.toContain("action: 'cart.items_reorder'");
    expect(repository).not.toContain('async reorderItems');
    expect(workspace).toContain('cursor-grab active:cursor-grabbing');
    expect(workspace).toContain('data-cart-line-id={line.id}');
    expect(workspace).toMatch(/closest\(\s*["']input, button, select, textarea, a, label["']/);
    expect(workspace).toContain('onPointerMove');
    expect(workspace).toContain('element.animate(');
    expect(workspace).toContain('duration: 420');
    expect(workspace).toContain('element.offsetHeight / 2');
    expect(workspace).not.toContain('document.elementFromPoint');
    expect(workspace).toContain("prefers-reduced-motion: reduce");
    expect(workspace).toMatch(/event\.key === ["']ArrowUp["']/);
    expect(workspace).toMatch(/event\.key === ["']ArrowDown["']/);
  });
});

describe('Phase 8 stock and invoice invariants', () => {
  const checkout = source('src/services/checkout.ts');

  it('completes the sale inside one repository transaction with concurrency guards', () => {
    expect(checkout).toContain('return db.transaction(async (tx)');
    expect(checkout).toContain("transitionStatus(unit.id, 'IN_STOCK', 'SOLD'");
    expect(checkout).toContain('tx.products._applyQuantityDelta');
    expect(checkout).toContain('tx.movements.record');
    expect(checkout).toContain('tx.sales.createItem');
    expect(checkout).toContain('await tx.carts.delete(cart.id)');
  });

  it('keeps SaleItem lean and derives movement-owned invoice values', () => {
    const schema = source('prisma/schema.prisma');
    const saleItemStart = schema.indexOf('model SaleItem');
    const saleItemModel = schema.slice(saleItemStart, schema.indexOf('\nmodel ', saleItemStart + 1));
    const repository = source('src/repositories/prisma/index.ts');
    const migration = source('prisma/migrations/20260728215000_simplify_sale_items/migration.sql');

    expect(saleItemModel).toContain('movementId String');
    expect(saleItemModel).toContain('movement   StockMovement');
    expect(saleItemModel).toContain('listUnitPrice');
    expect(saleItemModel).not.toContain('productId');
    expect(saleItemModel).not.toContain('unitId');
    expect(saleItemModel).not.toContain('actualUnitPrice');
    expect(saleItemModel).not.toContain('unitCost');
    expect(saleItemModel).not.toContain('lineTotal');
    expect(repository).toContain('const quantity = Math.abs(row.movement.quantity)');
    expect(repository).toContain('actualUnitPrice: row.movement.unitPrice');
    expect(migration).toContain('DROP COLUMN "unitCost"');
  });

  it('provides A4/PDF and selectable 80 mm or 58 mm thermal invoice output', () => {
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    const css = source('src/app/globals.css');
    expect(invoice).toContain("t('invoice.a4Layout')");
    expect(invoice).toContain("t('invoice.thermalLayout')");
    expect(invoice).toContain('/pdf');
    expect(invoice).toContain('flex flex-wrap items-center gap-2');
    expect(css).toContain('.invoice-root[data-layout="a4"]');
    expect(css).toContain('.invoice-root[data-layout="thermal"]');
    expect(css).toContain('width: min(210mm, 100%)');
    expect(css).toContain('container: invoice-preview / inline-size');
    expect(invoice).toContain('className="invoice-preview-viewport scrollbar-hint"');
    expect(invoice).toContain("aria-label={t('invoice.previewAria')}");
    expect(css).toContain('.invoice-preview-viewport');
    expect(css).toContain('overflow: auto');
    expect(css).toContain('@container invoice-preview (max-width: 767px)');
    expect(css).toContain("width: min(72mm, 100%)");
    expect(css).toContain('width: 210mm');
    expect(invoice).toContain("'--invoice-thermal-width': layout === 'thermal58' ? '58mm' : '80mm'");
    expect(css).toContain('width: min(var(--invoice-thermal-width, 80mm), 100%)');
    expect(css).toContain('width: var(--invoice-thermal-width, 80mm)');
  });

  it('filters invoices on the server instead of in the browser', () => {
    const page = source('src/app/(dashboard)/invoices/page.tsx');
    const register = source('src/components/invoices/InvoiceRegister.tsx');
    const repositories = source('src/repositories/types.ts');
    const prisma = source('src/repositories/prisma/index.ts');
    expect(page).toContain('await db.sales.search({ ...filters, paymentStatus: undefined }, 500)');
    expect(page).toContain('effectiveInvoicePaymentStatus');
    expect(page).toContain('effectiveStatus === filters.paymentStatus');
    expect(register).toContain('name="paymentStatus"');
    expect(register).toContain('name="paymentMethod"');
    expect(register).toContain('name="customerType"');
    expect(register).toContain("t('invoices.walkInOnly')");
    expect(register).toContain('name="minTotal"');
    expect(register).toContain('name="maxTotal"');
    expect(register).toContain('useTransition');
    expect(register).toContain("t('loading.filterInvoices')");
    expect(register).toContain('setValues(next)');
    expect(register).toContain('setFiltering(true)');
    expect(register).toContain('setFiltering(false)');
    expect(page).toContain('resultVersion={crypto.randomUUID()}');
    expect(register).toContain('window.history.pushState');
    expect(register).toContain('router.refresh()');
    expect(source('src/app/(dashboard)/invoices/loading.tsx')).toContain('Loading invoices…');
    expect(repositories).toContain('search(filters: SaleFilters');
    expect(prisma).toContain('{ invoiceNumber: { contains: query');
    expect(prisma).toContain("filters.customerType === 'WALK_IN'");
    expect(prisma).toContain('total: filters.minTotal');
  });

  it('keeps item-level returns out while permitting invoice void refund metadata', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).not.toContain('model SaleReturn');
    expect(schema).not.toContain('model ReturnItem');
    expect(schema).toContain('refundAmount');
    expect(source('src/services/sales.ts')).toContain("status: 'VOIDED'");
  });

  it('uses Checkout as the only user-facing sale path', () => {
    const stockAction = source('src/actions/stock.ts');
    const stockForm = source('src/components/stock/StockOutForm.tsx');
    expect(stockAction).toContain("if (reason === 'SALE')");
    expect(stockAction).toContain('Use Checkout for every sale');
    expect(stockForm).not.toContain("['SALE', 'Sold to a customer']");
    expect(checkout).toContain("reason: 'SALE'");
  });
});
