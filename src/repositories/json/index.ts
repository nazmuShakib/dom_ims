import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  UnitStatus,
  User,
  WarrantyClaim,
  WarrantyClaimEvent,
  SupplierWarrantyCase,
  Customer,
  CartDraft,
  Sale,
  SaleItem,
  InvoiceItem,
  UsedDeviceAcquisition,
  RefurbishmentExpense,
  SupplierReturn,
  ExpenseCategory,
  OperatingExpense,
  EmiContract,
  EmiInstallment,
  EmiPayment,
  EmiPaymentAllocation,
  EmiEarlySettlement,
  SaleSettlement,
  AuditLog,
} from '@/domain/types';
import type { Paisa } from '@/lib/money';
import type {
  BrandRepository,
  CategoryRepository,
  MovementFilters,
  ProductRepository,
  ProductUnitRepository,
  Repositories,
  StockMovementRepository,
  SupplierRepository,
  UserRepository,
  WarrantyRepository,
  CustomerRepository,
  CartRepository,
  SaleRepository,
  UsedDeviceAcquisitionRepository,
  RefurbishmentExpenseRepository,
  SupplierReturnRepository,
  ExpenseCategoryRepository,
  OperatingExpenseRepository,
  EmiRepository,
  SaleSettlementRepository,
  AuditLogRepository,
} from '@/repositories/types';
import { nowIso, readAll, withLock, writeAll } from './store';
import { dhakaYear } from '@/lib/time';

const categories: CategoryRepository = {
  async findAll(filters) {
    const rows = await readAll<Category>('categories');
    return filters?.activeOnly ? rows.filter((row) => row.isActive) : rows;
  },
  async findById(id) {
    return (await readAll<Category>('categories')).find((c) => c.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Category>('categories');
      const row: Category = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('categories', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Category>('categories');
      const index = rows.findIndex((item) => item.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Category not found');
      const row: Category = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('categories', copy);
      return row;
    });
  },
};

const brands: BrandRepository = {
  async findAll(filters) {
    const rows = await readAll<Brand>('brands');
    return filters?.activeOnly ? rows.filter((row) => row.isActive) : rows;
  },
  async findById(id) {
    return (await readAll<Brand>('brands')).find((b) => b.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Brand>('brands');
      const row: Brand = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('brands', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Brand>('brands');
      const index = rows.findIndex((item) => item.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Brand not found');
      const row: Brand = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('brands', copy);
      return row;
    });
  },
};

const suppliers: SupplierRepository = {
  findAll: () => readAll<Supplier>('suppliers'),
  async findById(id) {
    return (await readAll<Supplier>('suppliers')).find((s) => s.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Supplier>('suppliers');
      const row: Supplier = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('suppliers', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Supplier>('suppliers');
      const index = rows.findIndex((supplier) => supplier.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Supplier not found');
      const row: Supplier = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('suppliers', copy);
      return row;
    });
  },
};

const users: UserRepository = {
  findAll: () => readAll<User>('users'),
  async findById(id) {
    return (await readAll<User>('users')).find((u) => u.id === id) ?? null;
  },
  async findByEmail(email) {
    const lower = email.toLowerCase();
    return (
      (await readAll<User>('users')).find((u) => u.email.toLowerCase() === lower) ?? null
    );
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<User>('users');
      const row: User = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('users', [...rows, row]);
      return row;
    });
  },
};

const auditLogs: AuditLogRepository = {
  async findByEntity(entity, entityId) {
    return (await readAll<AuditLog>('audit-logs'))
      .filter((item) => item.entity === entity && item.entityId === entityId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async create(value) {
    const rows = await readAll<AuditLog>('audit-logs');
    if (rows.some((item) => item.id === value.id)) throw new Error('Audit log identifier already exists.');
    await writeAll('audit-logs', [...rows, value]);
    return value;
  },
};

const productDefaults = (value: Product): Product => ({
  ...value,
  staffMaxDiscount: value.staffMaxDiscount ?? 0,
});

const products: ProductRepository = {
  async findAll(filters) {
    const rows = await readAll<Product>('products');
    return rows.filter(
      (p) =>
        (!filters?.categoryId || p.categoryId === filters.categoryId) &&
        (!filters?.brandId || p.brandId === filters.brandId) &&
        (!filters?.activeOnly || p.isActive),
    ).map(productDefaults);
  },
  async findById(id) {
    const row = (await readAll<Product>('products')).find((p) => p.id === id);
    return row ? productDefaults(row) : null;
  },
  async findBySku(sku) {
    const lower = sku.toLowerCase();
    const row = (await readAll<Product>('products')).find((p) => p.sku.toLowerCase() === lower);
    return row ? productDefaults(row) : null;
  },
  async findByBarcode(barcode) {
    const lower = barcode.toLowerCase().trim();
    const row = (await readAll<Product>('products')).find(
      (product) => product.barcode?.toLowerCase() === lower,
    );
    return row ? productDefaults(row) : null;
  },
  /**
   * Phase 0 search: naive substring match. Phase 1 replaces this with pg_trgm +
   * GIN (PLAN.md §7). The *interface* is identical, so nothing above changes.
   */
  async search(query, limit = 10) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const rows = await readAll<Product>('products');
    return rows
      .filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode?.toLowerCase().includes(q) ?? false) ||
            (p.model?.toLowerCase().includes(q) ?? false)),
      )
      .slice(0, limit)
      .map(productDefaults);
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Product>('products');
      if (rows.some((p) => p.sku.toLowerCase() === data.sku.toLowerCase())) {
        throw new Error(`Product code (SKU) already exists: ${data.sku}`);
      }
      await writeAll('products', [...rows, data]);
      return data;
    });
  },
  async update(id, patch) {
    return withLock(async () => {
      const rows = await readAll<Product>('products');
      const idx = rows.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Product not found: ${id}`);
      const next: Product = { ...rows[idx]!, ...patch, updatedAt: nowIso() };
      const copy = [...rows];
      copy[idx] = next;
      await writeAll('products', copy);
      return next;
    });
  },
  async softDelete(id) {
    await this.update(id, { isActive: false });
  },
  async _applyQuantityDelta(id, delta, newAvgCost?: Paisa) {
    const rows = await readAll<Product>('products');
    const idx = rows.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Product not found: ${id}`);
    const current = rows[idx]!;
    const nextQty = current.quantityOnHand + delta;

    // Mirrors the CHECK constraint in PLAN.md §7. Fail loudly, don't go negative.
    if (nextQty < 0) {
      throw new Error(
        `Insufficient stock for ${current.sku}: have ${current.quantityOnHand}, tried to remove ${-delta}`,
      );
    }

    const next: Product = {
      ...current,
      quantityOnHand: nextQty,
      avgCostPrice: newAvgCost ?? current.avgCostPrice,
      updatedAt: nowIso(),
    };
    const copy = [...rows];
    copy[idx] = next;
    await writeAll('products', copy);
    return next;
  },
};

const units: ProductUnitRepository = {
  async findById(id) {
    return (await readAll<ProductUnit>('product-units')).find((u) => u.id === id) ?? null;
  },
  async findBySerial(serialNo) {
    const lower = serialNo.toLowerCase().trim();
    return (
      (await readAll<ProductUnit>('product-units')).find(
        (u) => u.serialNo.toLowerCase() === lower,
      ) ?? null
    );
  },
  async findBySerials(serialNos) {
    const wanted = new Set(serialNos.map((value) => value.toLowerCase().trim()).filter(Boolean));
    return (await readAll<ProductUnit>('product-units')).filter(
      (unit) => wanted.has(unit.serialNo.toLowerCase()),
    );
  },
  async findByProduct(productId, status) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && (!status || u.status === status));
  },
  async countInStock(productId) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && u.status === 'IN_STOCK').length;
  },
  async findAllInStock() {
    return (await readAll<ProductUnit>('product-units'))
      .filter((unit) => unit.status === 'IN_STOCK')
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  },
  async createMany(newUnits) {
    const rows = await readAll<ProductUnit>('product-units');
    const existing = new Set(rows.map((u) => u.serialNo.toLowerCase()));
    for (const u of newUnits) {
      if (existing.has(u.serialNo.toLowerCase())) {
        throw new Error(`Serial number already in the system: ${u.serialNo}`);
      }
    }
    await writeAll('product-units', [...rows, ...newUnits]);
    return newUnits;
  },
  async updateDetails(id, patch) {
    const rows = await readAll<ProductUnit>('product-units');
    const index = rows.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error(`Unit not found: ${id}`);
    const updated = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows];
    copy[index] = updated;
    await writeAll('product-units', copy);
    return updated;
  },
  /**
   * ⚠️ THE CONCURRENCY GUARD. PLAN.md §8.1.
   * If the unit is not in `expectedStatus`, this throws instead of overwriting.
   * Two staff selling the same IMEI: the second one fails. Do not "fix" this.
   * In Prisma it becomes: where: { id, status: expectedStatus }.
   */
  async transitionStatus(id, expectedStatus, next, patch) {
    const rows = await readAll<ProductUnit>('product-units');
    const idx = rows.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`Unit not found: ${id}`);

    const current = rows[idx]!;
    if (current.status !== expectedStatus) {
      throw new Error(
        `Unit ${current.serialNo} is ${current.status}, expected ${expectedStatus}. ` +
          `Someone may have just processed it.`,
      );
    }

    const updated: ProductUnit = { ...current, ...patch, status: next, updatedAt: nowIso() };
    const copy = [...rows];
    copy[idx] = updated;
    await writeAll('product-units', copy);
    return updated;
  },
};

const movements: StockMovementRepository = {
  async record(movement) {
    if (movement.quantity === 0) {
      throw new Error('A zero-quantity movement is meaningless'); // mirrors CHECK qty_nonzero
    }
    const rows = await readAll<StockMovement>('stock-movements');
    await writeAll('stock-movements', [...rows, movement]);
    return movement;
  },
  async findById(id) {
    return (await readAll<StockMovement>('stock-movements')).find((m) => m.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (
      (await readAll<StockMovement>('stock-movements')).find(
        (m) => m.idempotencyKey === key,
      ) ?? null
    );
  },
  async findByProduct(productId) {
    const rows = await readAll<StockMovement>('stock-movements');
    return rows
      .filter((m) => m.productId === productId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async findByDateRange(from, to, filters?: MovementFilters) {
    const rows = await readAll<StockMovement>('stock-movements');
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    return rows.filter(
      (m) =>
        m.createdAt >= fromIso &&
        m.createdAt <= toIso &&
        (!filters?.productId || m.productId === filters.productId) &&
        (!filters?.supplierId || m.supplierId === filters.supplierId) &&
        (!filters?.type || m.type === filters.type) &&
        (!filters?.reason || m.reason === filters.reason) &&
        (!filters?.actorId || m.actorId === filters.actorId),
    );
  },
  async sumQuantity(productId) {
    const rows = await readAll<StockMovement>('stock-movements');
    return rows
      .filter((m) => m.productId === productId)
      .reduce((sum, m) => sum + m.quantity, 0);
  },
};

const warranties: WarrantyRepository = {
  async nextClaimNumber(now) {
    const year = now.getUTCFullYear();
    const prefix = `RMA-${year}-`;
    const rows = await readAll<WarrantyClaim>('warranty-claims');
    const next = rows.reduce((max, claim) => claim.claimNumber.startsWith(prefix)
      ? Math.max(max, Number(claim.claimNumber.slice(prefix.length)) || 0)
      : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(filters) {
    return (await readAll<WarrantyClaim>('warranty-claims'))
      .filter((claim) => (!filters?.status || claim.status === filters.status)
        && (!filters?.unitId || claim.unitId === filters.unitId)
        && (!filters?.assignedToId || claim.assignedToId === filters.assignedToId))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  },
  async findById(id) {
    return (await readAll<WarrantyClaim>('warranty-claims')).find((claim) => claim.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<WarrantyClaim>('warranty-claims')).find((claim) => claim.idempotencyKey === key) ?? null;
  },
  async findActiveByUnit(unitId) {
    const terminal = new Set(['REJECTED', 'REPLACED', 'COMPLETED', 'CANCELLED']);
    return (await readAll<WarrantyClaim>('warranty-claims')).find(
      (claim) => claim.unitId === unitId && !terminal.has(claim.status),
    ) ?? null;
  },
  async create(claim) {
    await writeAll('warranty-claims', [...await readAll<WarrantyClaim>('warranty-claims'), claim]);
    return claim;
  },
  async transition(id, expectedStatus, patch) {
    const rows = await readAll<WarrantyClaim>('warranty-claims');
    const index = rows.findIndex((claim) => claim.id === id && claim.status === expectedStatus);
    if (index < 0) throw new Error('Claim changed while you were working. Refresh and try again.');
    const updated = { ...rows[index]!, ...patch, id, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('warranty-claims', copy);
    return updated;
  },
  async findEvents(claimId) {
    return (await readAll<WarrantyClaimEvent>('warranty-claim-events'))
      .filter((event) => event.claimId === claimId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async findEventByIdempotencyKey(key) {
    return (await readAll<WarrantyClaimEvent>('warranty-claim-events')).find((event) => event.idempotencyKey === key) ?? null;
  },
  async createEvent(event) {
    await writeAll('warranty-claim-events', [...await readAll<WarrantyClaimEvent>('warranty-claim-events'), event]);
    return event;
  },
  async findSupplierCase(claimId) {
    return (await readAll<SupplierWarrantyCase>('supplier-warranty-cases')).find((item) => item.claimId === claimId) ?? null;
  },
  async upsertSupplierCase(value) {
    const rows = await readAll<SupplierWarrantyCase>('supplier-warranty-cases');
    const index = rows.findIndex((item) => item.claimId === value.claimId);
    const copy = [...rows];
    if (index < 0) copy.push(value); else copy[index] = value;
    await writeAll('supplier-warranty-cases', copy);
    return value;
  },
};

const customers: CustomerRepository = {
  async findAll(activeOnly = false) {
    return (await readAll<Customer>('customers'))
      .filter((item) => !activeOnly || item.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async findById(id) {
    return (await readAll<Customer>('customers')).find((item) => item.id === id) ?? null;
  },
  async findByNormalizedPhone(phoneNormalized) {
    return (await readAll<Customer>('customers'))
      .find((item) => item.phoneNormalized === phoneNormalized) ?? null;
  },
  async search(query, limit = 20) {
    const term = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    return (await readAll<Customer>('customers'))
      .filter((item) => item.isActive && (
        item.name.toLowerCase().includes(term)
        || item.phone?.includes(term)
        || Boolean(digits && item.phoneNormalized?.includes(digits))
      ))
      .slice(0, limit);
  },
  async create(value) {
    const rows = await readAll<Customer>('customers');
    if (value.phoneNormalized && rows.some((item) => item.phoneNormalized === value.phoneNormalized)) {
      throw new Error('A customer with this phone number already exists.');
    }
    await writeAll('customers', [...rows, value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<Customer>('customers');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Customer not found.');
    const updated = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('customers', copy);
    return updated;
  },
};

const carts: CartRepository = {
  async findByActor(actorId) {
    return (await readAll<CartDraft>('cart-drafts')).find((item) => item.actorId === actorId) ?? null;
  },
  async findById(id) {
    return (await readAll<CartDraft>('cart-drafts')).find((item) => item.id === id) ?? null;
  },
  async findByIdForUpdate(id) {
    // jsonRepositories.transaction already holds the process-wide write lock.
    return this.findById(id);
  },
  async create(value) {
    const rows = await readAll<CartDraft>('cart-drafts');
    if (rows.some((item) => item.actorId === value.actorId)) {
      throw new Error('This user already has a draft cart.');
    }
    await writeAll('cart-drafts', [...rows, value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<CartDraft>('cart-drafts');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Draft cart not found.');
    const next = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = next;
    await writeAll('cart-drafts', copy);
    return next;
  },
  async delete(id) {
    await writeAll('cart-drafts', (await readAll<CartDraft>('cart-drafts')).filter((item) => item.id !== id));
  },
};

const sales: SaleRepository = {
  async nextInvoiceNumber(now) {
    const year = dhakaYear(now);
    const prefix = `INV-${year}-`;
    const next = (await readAll<Sale>('sales')).reduce((max, item) =>
      item.invoiceNumber.startsWith(prefix)
        ? Math.max(max, Number(item.invoiceNumber.slice(prefix.length)) || 0)
        : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(limit = 100) {
    return (await readAll<Sale>('sales'))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, limit);
  },
  async findVoidedByDateRange(from, to) {
    return (await readAll<Sale>('sales'))
      .filter((item) => item.status === 'VOIDED'
        && item.voidedAt !== null
        && new Date(item.voidedAt) >= from
        && new Date(item.voidedAt) <= to)
      .sort((a, b) => (b.voidedAt ?? '').localeCompare(a.voidedAt ?? ''));
  },
  async search(filters, limit = 200) {
    const query = filters.query?.trim().toLowerCase();
    return (await readAll<Sale>('sales'))
      .filter((item) => (
        (!filters.status || item.status === filters.status)
        && (!filters.from || new Date(item.completedAt) >= filters.from)
        && (!filters.to || new Date(item.completedAt) <= filters.to)
        && (
          !filters.customerType
          || (filters.customerType === 'WALK_IN' ? item.customerId === null : item.customerId !== null)
        )
        && (!filters.actorId || item.actorId === filters.actorId)
        && (!filters.paymentStatus || item.paymentStatus === filters.paymentStatus)
        && (!filters.paymentMethod || item.paymentMethod === filters.paymentMethod)
        && (filters.minTotal === undefined || item.total >= filters.minTotal)
        && (filters.maxTotal === undefined || item.total <= filters.maxTotal)
        && (!query || [
          item.invoiceNumber,
          item.customerName,
          item.customerPhone,
          item.reference,
          item.actorName,
        ].some((value) => value?.toLowerCase().includes(query)))
      ))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  },
  async findById(id) {
    return (await readAll<Sale>('sales')).find((item) => item.id === id) ?? null;
  },
  async findByInvoiceNumber(invoiceNumber) {
    return (await readAll<Sale>('sales')).find((item) => item.invoiceNumber === invoiceNumber) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<Sale>('sales')).find((item) => item.idempotencyKey === key) ?? null;
  },
  async findByCustomer(customerId) {
    return (await readAll<Sale>('sales'))
      .filter((item) => item.customerId === customerId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },
  async create(value) {
    await writeAll('sales', [...await readAll<Sale>('sales'), value]);
    return value;
  },
  async updatePayment(id, expectedAmountPaid, patch) {
    const rows = await readAll<Sale>('sales');
    const index = rows.findIndex((item) => item.id === id
      && item.status === 'COMPLETED'
      && (item.amountPaid ?? 0) === expectedAmountPaid);
    if (index < 0) throw new Error('The invoice payment changed. Refresh and try again.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('sales', copy);
    return updated;
  },
  async markVoided(id, patch) {
    const rows = await readAll<Sale>('sales');
    const index = rows.findIndex((item) => item.id === id && item.status === 'COMPLETED');
    if (index < 0) throw new Error('This invoice is no longer eligible to be voided.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('sales', copy);
    return updated;
  },
  async createItem(value) {
    await writeAll('sale-items', [...await readAll<SaleItem>('sale-items'), value]);
    return value;
  },
  async findItems(saleId) {
    const [items, movementRows] = await Promise.all([
      readAll<SaleItem>('sale-items'),
      readAll<StockMovement>('stock-movements'),
    ]);
    const movementById = new Map(movementRows.map((movement) => [movement.id, movement]));
    return items
      .filter((item) => item.saleId === saleId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((item): InvoiceItem => {
      const movement = movementById.get(item.movementId);
      if (!movement || movement.unitPrice === null) {
        throw new Error(`Invoice movement ${item.movementId} has no selling price.`);
      }
      const quantity = Math.abs(movement.quantity);
      return {
        ...item,
        quantity,
        actualUnitPrice: movement.unitPrice,
        discount: (item.listUnitPrice - movement.unitPrice) * quantity,
        lineTotal: movement.unitPrice * quantity,
      };
      });
  },
};

const saleSettlements: SaleSettlementRepository = {
  async nextReceiptNumber(type, now) {
    const year = dhakaYear(now);
    const prefix = type === 'CUSTOMER_COLLECTION' ? 'IPR' : 'TIP';
    const sequencePrefix = `${prefix}-${year}-`;
    const next = (await readAll<SaleSettlement>('sale-settlements')).reduce((max, item) =>
      item.receiptNumber.startsWith(sequencePrefix)
        ? Math.max(max, Number(item.receiptNumber.slice(sequencePrefix.length)) || 0)
        : max, 0) + 1;
    return `${sequencePrefix}${String(next).padStart(6, '0')}`;
  },
  async findBySale(saleId) {
    return (await readAll<SaleSettlement>('sale-settlements'))
      .filter((item) => item.saleId === saleId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  },
  async findByIdempotencyKey(idempotencyKey) {
    return (await readAll<SaleSettlement>('sale-settlements'))
      .find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  },
  async create(value) {
    const rows = await readAll<SaleSettlement>('sale-settlements');
    if (rows.some((item) => item.idempotencyKey === value.idempotencyKey)) {
      throw new Error('This payment or payout has already been recorded.');
    }
    await writeAll('sale-settlements', [...rows, value]);
    return value;
  },
};

const usedDeviceAcquisitions: UsedDeviceAcquisitionRepository = {
  async findById(id) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.idempotencyKey === key) ?? null;
  },
  async findByUnit(unitId) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .filter((item) => item.unitId === unitId)
      .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  },
  async findBySale(saleId) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.tradeInSaleId === saleId) ?? null;
  },
  async findAvailableTradeIns() {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .filter((item) => item.type === 'TRADE_IN' && item.tradeInSaleId === null)
      .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
  },
  async create(value) {
    const rows = await readAll<UsedDeviceAcquisition>('used-device-acquisitions');
    await writeAll('used-device-acquisitions', [...rows, value]);
    return value;
  },
  async attachToSale(id, saleId) {
    const rows = await readAll<UsedDeviceAcquisition>('used-device-acquisitions');
    const index = rows.findIndex((item) => item.id === id);
    const current = rows[index];
    if (!current || current.type !== 'TRADE_IN' || current.tradeInSaleId) {
      throw new Error('That trade-in has already been used or is unavailable.');
    }
    const updated = { ...current, tradeInSaleId: saleId };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('used-device-acquisitions', copy);
    return updated;
  },
};

const refurbishmentExpenses: RefurbishmentExpenseRepository = {
  async findAll() {
    return (await readAll<RefurbishmentExpense>('refurbishment-expenses'))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async findByUnit(unitId) {
    return (await readAll<RefurbishmentExpense>('refurbishment-expenses'))
      .filter((item) => item.unitId === unitId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async create(value) {
    const rows = await readAll<RefurbishmentExpense>('refurbishment-expenses');
    await writeAll('refurbishment-expenses', [...rows, value]);
    return value;
  },
};

const supplierReturns: SupplierReturnRepository = {
  async nextReturnNumber(now) {
    const year = dhakaYear(now);
    const prefix = `SRT-${year}-`;
    const next = (await readAll<SupplierReturn>('supplier-returns')).reduce((maximum, item) =>
      item.returnNumber.startsWith(prefix)
        ? Math.max(maximum, Number(item.returnNumber.slice(prefix.length)) || 0)
        : maximum, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll() {
    return (await readAll<SupplierReturn>('supplier-returns'))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  },
  async findById(id) {
    return (await readAll<SupplierReturn>('supplier-returns')).find((item) => item.id === id) ?? null;
  },
  async findByMovement(movementId) {
    return (await readAll<SupplierReturn>('supplier-returns')).find((item) => item.movementId === movementId) ?? null;
  },
  async create(value) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    await writeAll('supplier-returns', [...rows, value]);
    return value;
  },
  async settle(id, patch) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    const index = rows.findIndex((item) => item.id === id && item.status === 'PENDING');
    if (index < 0) throw new Error('This supplier return has already been settled or is unavailable.');
    const updated: SupplierReturn = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('supplier-returns', copy);
    return updated;
  },
  async cancel(id, patch) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    const index = rows.findIndex((item) => item.id === id && item.status === 'PENDING');
    if (index < 0) throw new Error('This supplier return is no longer pending.');
    const updated: SupplierReturn = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('supplier-returns', copy);
    return updated;
  },
};

const expenseCategories: ExpenseCategoryRepository = {
  async findAll() {
    return (await readAll<ExpenseCategory>('expense-categories'))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  },
  async findById(id) {
    return (await readAll<ExpenseCategory>('expense-categories')).find((item) => item.id === id) ?? null;
  },
  async create(value) {
    const rows = await readAll<ExpenseCategory>('expense-categories');
    if (rows.some((item) => item.name.toLowerCase() === value.name.toLowerCase())) {
      throw new Error('An expense category with this name already exists.');
    }
    await writeAll('expense-categories', [...rows, value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<ExpenseCategory>('expense-categories');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Expense category not found.');
    if (rows.some((item) => item.id !== id && item.name.toLowerCase() === patch.name.toLowerCase())) {
      throw new Error('An expense category with this name already exists.');
    }
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('expense-categories', copy);
    return updated;
  },
};

const operatingExpenses: OperatingExpenseRepository = {
  async nextExpenseNumber(now) {
    const year = dhakaYear(now);
    const prefix = `EXP-${year}-`;
    const next = (await readAll<OperatingExpense>('operating-expenses')).reduce((max, item) =>
      item.expenseNumber.startsWith(prefix)
        ? Math.max(max, Number(item.expenseNumber.slice(prefix.length)) || 0)
        : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(filters, limit = 500) {
    const query = filters?.query?.trim().toLowerCase();
    const rows = (await readAll<OperatingExpense>('operating-expenses')).filter((item) => (
      (!filters?.from || new Date(item.expenseDate) >= filters.from)
      && (!filters?.to || new Date(item.expenseDate) <= filters.to)
      && (!filters?.categoryId || item.categoryId === filters.categoryId)
      && (!filters?.paymentMethod || item.paymentMethod === filters.paymentMethod)
      && (!filters?.recordedById || item.recordedById === filters.recordedById)
      && (!filters?.status || item.status === filters.status)
      && (filters?.minAmount === undefined || item.amount >= filters.minAmount)
      && (filters?.maxAmount === undefined || item.amount <= filters.maxAmount)
      && (!query || [item.expenseNumber, item.description, item.paidTo, item.reference]
        .some((value) => value?.toLowerCase().includes(query)))
    ));
    rows.sort((a, b) => {
      if (filters?.order === 'oldest') return a.expenseDate.localeCompare(b.expenseDate);
      if (filters?.order === 'amount-desc') return b.amount - a.amount;
      if (filters?.order === 'amount-asc') return a.amount - b.amount;
      return b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt);
    });
    return limit === null ? rows : rows.slice(0, Math.max(1, Math.min(limit, 2_000)));
  },
  async findById(id) {
    return (await readAll<OperatingExpense>('operating-expenses')).find((item) => item.id === id) ?? null;
  },
  async create(value) {
    await writeAll('operating-expenses', [...await readAll<OperatingExpense>('operating-expenses'), value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<OperatingExpense>('operating-expenses');
    const index = rows.findIndex((item) => item.id === id && item.status === 'ACTIVE');
    if (index < 0) throw new Error('Only an active expense can be edited.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('operating-expenses', copy);
    return updated;
  },
  async void(id, patch) {
    const rows = await readAll<OperatingExpense>('operating-expenses');
    const index = rows.findIndex((item) => item.id === id && item.status === 'ACTIVE');
    if (index < 0) throw new Error('This expense is already voided or unavailable.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('operating-expenses', copy);
    return updated;
  },
};

const emi: EmiRepository = {
  async nextContractNumber(now) {
    const year = dhakaYear(now); const prefix = `EMI-${year}-`;
    const next = (await readAll<EmiContract>('emi-contracts')).reduce((max, row) => row.contractNumber.startsWith(prefix) ? Math.max(max, Number(row.contractNumber.slice(prefix.length)) || 0) : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async nextReceiptNumber(now) {
    const year = dhakaYear(now); const prefix = `RCPT-${year}-`;
    const next = (await readAll<EmiPayment>('emi-payments')).reduce((max, row) => row.receiptNumber.startsWith(prefix) ? Math.max(max, Number(row.receiptNumber.slice(prefix.length)) || 0) : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findContracts() { return (await readAll<EmiContract>('emi-contracts')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  async findContractById(id) { return (await readAll<EmiContract>('emi-contracts')).find((row) => row.id === id) ?? null; },
  async findContractBySale(saleId) { return (await readAll<EmiContract>('emi-contracts')).find((row) => row.saleId === saleId) ?? null; },
  async createContract(value) { await writeAll('emi-contracts', [...await readAll<EmiContract>('emi-contracts'), value]); return value; },
  async updateContract(id, patch) { const rows = await readAll<EmiContract>('emi-contracts'); const index = rows.findIndex((row) => row.id === id); if (index < 0) throw new Error('EMI contract not found.'); const value = { ...rows[index]!, ...patch }; const copy = [...rows]; copy[index] = value; await writeAll('emi-contracts', copy); return value; },
  async findInstallments(contractId) { return (await readAll<EmiInstallment>('emi-installments')).filter((row) => row.contractId === contractId).sort((a, b) => a.sequence - b.sequence); },
  async createInstallment(value) { await writeAll('emi-installments', [...await readAll<EmiInstallment>('emi-installments'), value]); return value; },
  async updateInstallment(id, patch) { const rows = await readAll<EmiInstallment>('emi-installments'); const index = rows.findIndex((row) => row.id === id); if (index < 0) throw new Error('Installment not found.'); const value = { ...rows[index]!, ...patch }; const copy = [...rows]; copy[index] = value; await writeAll('emi-installments', copy); return value; },
  async findPayments(contractId) { return (await readAll<EmiPayment>('emi-payments')).filter((row) => row.contractId === contractId).sort((a, b) => b.paidAt.localeCompare(a.paidAt)); },
  async findPaymentByIdempotencyKey(key) { return (await readAll<EmiPayment>('emi-payments')).find((row) => row.idempotencyKey === key) ?? null; },
  async createPayment(value) { await writeAll('emi-payments', [...await readAll<EmiPayment>('emi-payments'), value]); return value; },
  async updatePayment(id, patch) { const rows = await readAll<EmiPayment>('emi-payments'); const index = rows.findIndex((row) => row.id === id); if (index < 0) throw new Error('EMI payment not found.'); const value = { ...rows[index]!, ...patch }; const copy = [...rows]; copy[index] = value; await writeAll('emi-payments', copy); return value; },
  async findAllocations(paymentId) { return (await readAll<EmiPaymentAllocation>('emi-payment-allocations')).filter((row) => row.paymentId === paymentId); },
  async createAllocation(value) { await writeAll('emi-payment-allocations', [...await readAll<EmiPaymentAllocation>('emi-payment-allocations'), value]); return value; },
  async findEarlySettlement(contractId) { return (await readAll<EmiEarlySettlement>('emi-early-settlements')).find((row) => row.contractId === contractId) ?? null; },
  async createEarlySettlement(value) { await writeAll('emi-early-settlements', [...await readAll<EmiEarlySettlement>('emi-early-settlements'), value]); return value; },
};

export const jsonRepositories: Repositories = {
  categories,
  brands,
  suppliers,
  users,
  products,
  units,
  movements,
  warranties,
  customers,
  carts,
  auditLogs,
  sales,
  saleSettlements,
  usedDeviceAcquisitions,
  refurbishmentExpenses,
  supplierReturns,
  expenseCategories,
  operatingExpenses,
  emi,
  transaction: (fn) => withLock(() => fn(jsonRepositories)),
};

export type { UnitStatus };
