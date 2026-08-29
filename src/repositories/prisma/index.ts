import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  User,
  WarrantyClaim,
  WarrantyClaimEvent,
  SupplierWarrantyCase,
  Customer,
  CartDraft,
  Sale,
  SaleItem,
  SaleSettlement,
  InvoiceItem,
  UsedDeviceAcquisition,
  RefurbishmentExpense,
  UsedDeviceInspection,
  TradeInCartDraft,
  TradeInSaleSnapshot,
  SupplierReturn,
  ExpenseCategory,
  OperatingExpense,
  EmiContract,
  EmiInstallment,
  EmiPayment,
  EmiPaymentAllocation,
  EmiEarlySettlement,
} from '@/domain/types';
import { prisma } from '@/lib/prisma';
import type { Paisa } from '@/lib/money';
import { dhakaYear } from '@/lib/time';
import type { Repositories } from '@/repositories/types';

type Client = Prisma.TransactionClient;

const iso = (value: Date): string => value.toISOString();

function category(row: Awaited<ReturnType<Client['category']['findUniqueOrThrow']>>): Category {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function brand(row: Awaited<ReturnType<Client['brand']['findUniqueOrThrow']>>): Brand {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function supplier(row: Awaited<ReturnType<Client['supplier']['findUniqueOrThrow']>>): Supplier {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function user(row: Awaited<ReturnType<Client['user']['findUniqueOrThrow']>>): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    phoneNumber: row.phoneNumber,
    phoneNumberVerified: row.phoneNumberVerified,
    image: row.image,
    role: row.role,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function product(row: Awaited<ReturnType<Client['product']['findUniqueOrThrow']>>): Product {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function unit(row: Awaited<ReturnType<Client['productUnit']['findUniqueOrThrow']>>): ProductUnit {
  return {
    ...row,
    inspectionResults: row.inspectionResults as UsedDeviceInspection | null,
    receivedAt: iso(row.receivedAt),
    soldAt: row.soldAt ? iso(row.soldAt) : null,
    warrantyExpiresAt: row.warrantyExpiresAt ? iso(row.warrantyExpiresAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function usedDeviceAcquisition(
  row: Awaited<ReturnType<Client['usedDeviceAcquisition']['findUniqueOrThrow']>>,
): UsedDeviceAcquisition {
  return {
    ...row,
    acquiredAt: iso(row.acquiredAt),
    createdAt: iso(row.createdAt),
  };
}

function refurbishmentExpense(
  row: Awaited<ReturnType<Client['refurbishmentExpense']['findUniqueOrThrow']>>,
): RefurbishmentExpense {
  return { ...row, createdAt: iso(row.createdAt) };
}

function supplierReturn(
  row: Awaited<ReturnType<Client['supplierReturn']['findUniqueOrThrow']>>,
): SupplierReturn {
  return {
    ...row,
    sentAt: iso(row.sentAt),
    settledAt: row.settledAt ? iso(row.settledAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function expenseCategory(
  row: Awaited<ReturnType<Client['expenseCategory']['findUniqueOrThrow']>>,
): ExpenseCategory {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function operatingExpense(
  row: Awaited<ReturnType<Client['operatingExpense']['findUniqueOrThrow']>>,
): OperatingExpense {
  return {
    ...row,
    expenseDate: iso(row.expenseDate),
    voidedAt: row.voidedAt ? iso(row.voidedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function movement(row: Awaited<ReturnType<Client['stockMovement']['findUniqueOrThrow']>>): StockMovement {
  return { ...row, createdAt: iso(row.createdAt) };
}

function warrantyClaim(row: Awaited<ReturnType<Client['warrantyClaim']['findUniqueOrThrow']>>): WarrantyClaim {
  return { ...row, openedAt: iso(row.openedAt), completedAt: row.completedAt ? iso(row.completedAt) : null, updatedAt: iso(row.updatedAt) };
}

function warrantyEvent(row: Awaited<ReturnType<Client['warrantyClaimEvent']['findUniqueOrThrow']>>): WarrantyClaimEvent {
  return { ...row, createdAt: iso(row.createdAt) };
}

function supplierWarrantyCase(row: Awaited<ReturnType<Client['supplierWarrantyCase']['findUniqueOrThrow']>>): SupplierWarrantyCase {
  return { ...row, sentAt: row.sentAt ? iso(row.sentAt) : null, returnedAt: row.returnedAt ? iso(row.returnedAt) : null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function customer(row: Awaited<ReturnType<Client['customer']['findUniqueOrThrow']>>): Customer {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function cartDraft(row: Awaited<ReturnType<Client['cartDraft']['findUniqueOrThrow']>>): CartDraft {
  return {
    ...row,
    tradeInDraft: row.tradeInDraft as TradeInCartDraft | null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function sale(row: Awaited<ReturnType<Client['sale']['findUniqueOrThrow']>>): Sale {
  return {
    ...row,
    amountPaid: row.amountPaid ?? 0,
    tradeInDetails: row.tradeInDetails as TradeInSaleSnapshot | null,
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    voidedAt: row.voidedAt ? iso(row.voidedAt) : null,
  };
}

function saleItem(row: Awaited<ReturnType<Client['saleItem']['findUniqueOrThrow']>>): SaleItem {
  return { ...row, createdAt: iso(row.createdAt) };
}

function saleSettlement(row: Awaited<ReturnType<Client['saleSettlement']['findUniqueOrThrow']>>): SaleSettlement {
  return { ...row, recordedAt: iso(row.recordedAt), createdAt: iso(row.createdAt) };
}

const emiContract = (row: Awaited<ReturnType<Client['emiContract']['findUniqueOrThrow']>>): EmiContract => ({
  ...row, termMonths: row.termMonths as EmiContract['termMonths'], firstDueDate: iso(row.firstDueDate), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), completedAt: row.completedAt ? iso(row.completedAt) : null, voidedAt: row.voidedAt ? iso(row.voidedAt) : null,
});
const emiInstallment = (row: Awaited<ReturnType<Client['emiInstallment']['findUniqueOrThrow']>>): EmiInstallment => ({
  ...row, dueDate: iso(row.dueDate), paidAt: row.paidAt ? iso(row.paidAt) : null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});
const emiPayment = (row: Awaited<ReturnType<Client['emiPayment']['findUniqueOrThrow']>>): EmiPayment => ({
  ...row, paidAt: iso(row.paidAt), reversedAt: row.reversedAt ? iso(row.reversedAt) : null, createdAt: iso(row.createdAt),
});
const emiAllocation = (row: Awaited<ReturnType<Client['emiPaymentAllocation']['findUniqueOrThrow']>>): EmiPaymentAllocation => ({
  ...row, createdAt: iso(row.createdAt),
});
const emiSettlement = (row: Awaited<ReturnType<Client['emiEarlySettlement']['findUniqueOrThrow']>>): EmiEarlySettlement => ({
  ...row, approvedAt: iso(row.approvedAt),
});

function productData(value: Product): Prisma.ProductUncheckedCreateInput {
  return {
    ...value,
    // New catalog rows never introduce stock. Only the stock service may do so.
    quantityOnHand: 0,
    avgCostPrice: 0,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function productPatch(
  value: Parameters<Repositories['products']['update']>[1],
): Prisma.ProductUncheckedUpdateInput {
  return value;
}

function unitData(value: ProductUnit): Prisma.ProductUnitUncheckedCreateInput {
  const { inspectionResults, ...rest } = value;
  return {
    ...rest,
    inspectionResults: inspectionResults ?? Prisma.DbNull,
    receivedAt: new Date(value.receivedAt),
    soldAt: value.soldAt ? new Date(value.soldAt) : null,
    warrantyExpiresAt: value.warrantyExpiresAt ? new Date(value.warrantyExpiresAt) : null,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function unitPatch(value: Partial<ProductUnit>): Prisma.ProductUnitUncheckedUpdateManyInput {
  const { receivedAt, soldAt, warrantyExpiresAt, createdAt, updatedAt, inspectionResults, ...rest } = value;
  return {
    ...rest,
    ...(inspectionResults !== undefined
      ? { inspectionResults: inspectionResults ?? Prisma.DbNull }
      : {}),
    ...(receivedAt ? { receivedAt: new Date(receivedAt) } : {}),
    ...(soldAt !== undefined ? { soldAt: soldAt ? new Date(soldAt) : null } : {}),
    ...(warrantyExpiresAt !== undefined
      ? { warrantyExpiresAt: warrantyExpiresAt ? new Date(warrantyExpiresAt) : null }
      : {}),
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
  };
}

function movementData(value: StockMovement): Prisma.StockMovementUncheckedCreateInput {
  return { ...value, createdAt: new Date(value.createdAt) };
}

function friendlyDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(', ')
        : String(error.meta?.target ?? 'unique value');
      throw new Error(`A record with this ${target} already exists.`);
    }
    if (error.code === 'P2003') throw new Error('This record references an item that no longer exists.');
  }
  throw error;
}

function createRepositories(client: Client, transact?: Repositories['transaction']): Repositories {
  let repositories: Repositories;

  repositories = {
    categories: {
      async findAll(filters) {
        return (await client.category.findMany({
          where: filters?.activeOnly ? { isActive: true } : undefined,
          orderBy: { name: 'asc' },
        })).map(category);
      },
      async findById(id) {
        const row = await client.category.findUnique({ where: { id } });
        return row ? category(row) : null;
      },
      async create(data) {
        try {
          return category(await client.category.create({ data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, data) {
        try {
          return category(await client.category.update({ where: { id }, data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    brands: {
      async findAll(filters) {
        return (await client.brand.findMany({
          where: filters?.activeOnly ? { isActive: true } : undefined,
          orderBy: { name: 'asc' },
        })).map(brand);
      },
      async findById(id) {
        const row = await client.brand.findUnique({ where: { id } });
        return row ? brand(row) : null;
      },
      async create(data) {
        try {
          return brand(await client.brand.create({ data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, data) {
        try {
          return brand(await client.brand.update({ where: { id }, data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    suppliers: {
      async findAll() {
        return (await client.supplier.findMany({ orderBy: { name: 'asc' } })).map(supplier);
      },
      async findById(id) {
        const row = await client.supplier.findUnique({ where: { id } });
        return row ? supplier(row) : null;
      },
      async create(data) {
        try {
          return supplier(await client.supplier.create({ data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, data) {
        try {
          return supplier(await client.supplier.update({ where: { id }, data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    users: {
      async findAll() {
        return (await client.user.findMany({ orderBy: { name: 'asc' } })).map(user);
      },
      async findById(id) {
        const row = await client.user.findUnique({ where: { id } });
        return row ? user(row) : null;
      },
      async findByEmail(email) {
        const row = await client.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
        return row ? user(row) : null;
      },
      async create(data) {
        try {
          return user(await client.user.create({ data }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    products: {
      async findAll(filters) {
        const rows = await client.product.findMany({
          where: {
            categoryId: filters?.categoryId,
            brandId: filters?.brandId,
            ...(filters?.activeOnly ? { isActive: true } : {}),
          },
          orderBy: [{ name: 'asc' }, { sku: 'asc' }],
        });
        return rows.map(product);
      },
      async findById(id) {
        const row = await client.product.findUnique({ where: { id } });
        return row ? product(row) : null;
      },
      async findBySku(sku) {
        const row = await client.product.findFirst({
          where: { sku: { equals: sku, mode: 'insensitive' } },
        });
        return row ? product(row) : null;
      },
      async findByBarcode(barcode) {
        const row = await client.product.findFirst({
          where: { barcode: { equals: barcode.trim(), mode: 'insensitive' } },
        });
        return row ? product(row) : null;
      },
      async search(query, limit = 10) {
        const term = query.trim();
        if (!term) return [];
        const rows = await client.product.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { sku: { contains: term, mode: 'insensitive' } },
              { barcode: { contains: term, mode: 'insensitive' } },
              { model: { contains: term, mode: 'insensitive' } },
            ],
          },
          orderBy: [{ name: 'asc' }, { sku: 'asc' }],
          take: Math.max(1, Math.min(limit, 50)),
        });
        return rows.map(product);
      },
      async create(data) {
        try {
          return product(await client.product.create({ data: productData(data) }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, data) {
        try {
          return product(await client.product.update({ where: { id }, data: productPatch(data) }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async softDelete(id) {
        await client.product.update({ where: { id }, data: { isActive: false } });
      },
      async _applyQuantityDelta(id, delta, newAvgCost?: Paisa) {
        const result = await client.product.updateMany({
          where: {
            id,
            trackingType: 'QUANTITY',
            ...(delta < 0 ? { quantityOnHand: { gte: -delta } } : {}),
          },
          data: {
            quantityOnHand: delta >= 0 ? { increment: delta } : { decrement: -delta },
            ...(newAvgCost === undefined ? {} : { avgCostPrice: newAvgCost }),
          },
        });
        if (result.count !== 1) {
          const current = await client.product.findUnique({ where: { id } });
          if (!current) throw new Error(`Product not found: ${id}`);
          if (current.trackingType !== 'QUANTITY') throw new Error('Quantity cache is only valid for QUANTITY products.');
          throw new Error(`Insufficient stock for ${current.sku}: have ${current.quantityOnHand}, tried to remove ${-delta}`);
        }
        return product(await client.product.findUniqueOrThrow({ where: { id } }));
      },
    },
    units: {
      async findById(id) {
        const row = await client.productUnit.findUnique({ where: { id } });
        return row ? unit(row) : null;
      },
      async findBySerial(serialNo) {
        const exact = await client.productUnit.findUnique({ where: { serialNo: serialNo.trim() } });
        const row = exact ?? await client.productUnit.findFirst({
          where: { serialNo: { equals: serialNo.trim(), mode: 'insensitive' } },
        });
        return row ? unit(row) : null;
      },
      async findBySerials(serialNos) {
        const values = [...new Set(serialNos.map((value) => value.trim()).filter(Boolean))];
        if (values.length === 0) return [];
        return (await client.productUnit.findMany({
          where: {
            OR: values.map((serialNo) => ({
              serialNo: { equals: serialNo, mode: 'insensitive' as const },
            })),
          },
        })).map(unit);
      },
      async findByProduct(productId, status) {
        return (await client.productUnit.findMany({
          where: { productId, status }, orderBy: { receivedAt: 'desc' },
        })).map(unit);
      },
      countInStock(productId) {
        return client.productUnit.count({ where: { productId, status: 'IN_STOCK' } });
      },
      async findAllInStock() {
        return (await client.productUnit.findMany({
          where: { status: 'IN_STOCK' },
          orderBy: { receivedAt: 'desc' },
        })).map(unit);
      },
      async createMany(values) {
        try {
          const rows = await client.productUnit.createManyAndReturn({ data: values.map(unitData) });
          return rows.map(unit);
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async updateDetails(id, patch) {
        return unit(await client.productUnit.update({
          where: { id },
          data: unitPatch(patch),
        }));
      },
      async transitionStatus(id, expectedStatus, next, patch) {
        const result = await client.productUnit.updateMany({
          where: { id, status: expectedStatus },
          data: { ...unitPatch(patch ?? {}), status: next },
        });
        if (result.count !== 1) {
          const current = await client.productUnit.findUnique({ where: { id } });
          if (!current) throw new Error(`Unit not found: ${id}`);
          throw new Error(
            `Unit ${current.serialNo} is ${current.status}, expected ${expectedStatus}. ` +
            'Someone may have just processed it.',
          );
        }
        return unit(await client.productUnit.findUniqueOrThrow({ where: { id } }));
      },
    },
    movements: {
      async record(value) {
        if (value.quantity === 0) throw new Error('A zero-quantity movement is meaningless');
        try {
          return movement(await client.stockMovement.create({ data: movementData(value) }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async findById(id) {
        const row = await client.stockMovement.findUnique({ where: { id } });
        return row ? movement(row) : null;
      },
      async findByIdempotencyKey(idempotencyKey) {
        const row = await client.stockMovement.findUnique({ where: { idempotencyKey } });
        return row ? movement(row) : null;
      },
      async findByProduct(productId) {
        return (await client.stockMovement.findMany({
          where: { productId }, orderBy: { createdAt: 'asc' },
        })).map(movement);
      },
      async findByDateRange(from, to, filters) {
        return (await client.stockMovement.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            productId: filters?.productId,
            supplierId: filters?.supplierId,
            type: filters?.type,
            reason: filters?.reason,
            actorId: filters?.actorId,
          },
          orderBy: { createdAt: 'asc' },
        })).map(movement);
      },
      async sumQuantity(productId) {
        const result = await client.stockMovement.aggregate({
          where: { productId }, _sum: { quantity: true },
        });
        return result._sum.quantity ?? 0;
      },
    },
    warranties: {
      async nextClaimNumber(now) {
        const year = now.getUTCFullYear();
        const sequence = await client.documentSequence.upsert({
          where: { key: `RMA:${year}` },
          create: { key: `RMA:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `RMA-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findAll(filters) {
        return (await client.warrantyClaim.findMany({
          where: { status: filters?.status, unitId: filters?.unitId, assignedToId: filters?.assignedToId },
          orderBy: { openedAt: 'desc' },
        })).map(warrantyClaim);
      },
      async findById(id) {
        const row = await client.warrantyClaim.findUnique({ where: { id } });
        return row ? warrantyClaim(row) : null;
      },
      async findByIdempotencyKey(idempotencyKey) {
        const row = await client.warrantyClaim.findUnique({ where: { idempotencyKey } });
        return row ? warrantyClaim(row) : null;
      },
      async findActiveByUnit(unitId) {
        const row = await client.warrantyClaim.findFirst({
          where: { unitId, status: { notIn: ['REJECTED', 'REPLACED', 'COMPLETED', 'CANCELLED'] } },
          orderBy: { openedAt: 'desc' },
        });
        return row ? warrantyClaim(row) : null;
      },
      async create(value) {
        return warrantyClaim(await client.warrantyClaim.create({
          data: { ...value, openedAt: new Date(value.openedAt), completedAt: value.completedAt ? new Date(value.completedAt) : null, updatedAt: new Date(value.updatedAt) },
        }));
      },
      async transition(id, expectedStatus, patch) {
        const { openedAt, completedAt, updatedAt, ...rest } = patch;
        const result = await client.warrantyClaim.updateMany({
          where: { id, status: expectedStatus },
          data: {
            ...rest,
            ...(openedAt ? { openedAt: new Date(openedAt) } : {}),
            ...(completedAt !== undefined ? { completedAt: completedAt ? new Date(completedAt) : null } : {}),
            ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
          },
        });
        if (result.count !== 1) throw new Error('Claim changed while you were working. Refresh and try again.');
        return warrantyClaim(await client.warrantyClaim.findUniqueOrThrow({ where: { id } }));
      },
      async findEvents(claimId) {
        return (await client.warrantyClaimEvent.findMany({ where: { claimId }, orderBy: { createdAt: 'asc' } })).map(warrantyEvent);
      },
      async findEventByIdempotencyKey(idempotencyKey) {
        const row = await client.warrantyClaimEvent.findUnique({ where: { idempotencyKey } });
        return row ? warrantyEvent(row) : null;
      },
      async createEvent(value) {
        return warrantyEvent(await client.warrantyClaimEvent.create({ data: { ...value, createdAt: new Date(value.createdAt) } }));
      },
      async findSupplierCase(claimId) {
        const row = await client.supplierWarrantyCase.findUnique({ where: { claimId } });
        return row ? supplierWarrantyCase(row) : null;
      },
      async upsertSupplierCase(value) {
        const dates = {
          sentAt: value.sentAt ? new Date(value.sentAt) : null,
          returnedAt: value.returnedAt ? new Date(value.returnedAt) : null,
          updatedAt: new Date(value.updatedAt),
        };
        const row = await client.supplierWarrantyCase.upsert({
          where: { claimId: value.claimId },
          create: { ...value, ...dates, createdAt: new Date(value.createdAt) },
          update: { supplierId: value.supplierId, reference: value.reference, status: value.status, coverage: value.coverage, resolution: value.resolution, ...dates },
        });
        return supplierWarrantyCase(row);
      },
    },
    customers: {
      async findAll(activeOnly = false) {
        return (await client.customer.findMany({
          where: activeOnly ? { isActive: true } : undefined,
          orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        })).map(customer);
      },
      async findById(id) {
        const row = await client.customer.findUnique({ where: { id } });
        return row ? customer(row) : null;
      },
      async findByNormalizedPhone(phoneNormalized) {
        const row = await client.customer.findUnique({ where: { phoneNormalized } });
        return row ? customer(row) : null;
      },
      async search(query, limit = 20) {
        const term = query.trim();
        const digits = term.replace(/\D/g, '');
        return (await client.customer.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
              ...(digits ? [{ phoneNormalized: { contains: digits } }] : []),
            ],
          },
          orderBy: { name: 'asc' },
          take: Math.max(1, Math.min(limit, 50)),
        })).map(customer);
      },
      async create(value) {
        try {
          return customer(await client.customer.create({
            data: {
              ...value,
              createdAt: new Date(value.createdAt),
              updatedAt: new Date(value.updatedAt),
            },
          }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, patch) {
        try {
          return customer(await client.customer.update({ where: { id }, data: patch }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    carts: {
      async findByActor(actorId) {
        const row = await client.cartDraft.findUnique({ where: { actorId } });
        return row ? cartDraft(row) : null;
      },
      async findById(id) {
        const row = await client.cartDraft.findUnique({ where: { id } });
        return row ? cartDraft(row) : null;
      },
      async create(value) {
        return cartDraft(await client.cartDraft.create({
          data: {
            ...value,
            tradeInDraft: value.tradeInDraft
              ? value.tradeInDraft as unknown as Prisma.InputJsonValue
              : Prisma.DbNull,
            createdAt: new Date(value.createdAt),
            updatedAt: new Date(value.updatedAt),
          },
        }));
      },
      async update(id, patch) {
        const data = 'tradeInDraft' in patch
          ? {
              ...patch,
              tradeInDraft: patch.tradeInDraft
                ? patch.tradeInDraft as unknown as Prisma.InputJsonValue
                : Prisma.DbNull,
            }
          : patch;
        return cartDraft(await client.cartDraft.update({
          where: { id },
          data: data as unknown as Prisma.CartDraftUncheckedUpdateInput,
        }));
      },
      async delete(id) {
        await client.cartDraft.delete({ where: { id } });
      },
    },
    saleSettlements: {
      async nextReceiptNumber(type, now) {
        const year = dhakaYear(now);
        const prefix = type === 'CUSTOMER_COLLECTION' ? 'IPR' : 'TIP';
        const sequence = await client.documentSequence.upsert({
          where: { key: `${prefix}:${year}` },
          create: { key: `${prefix}:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `${prefix}-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findBySale(saleId) {
        return (await client.saleSettlement.findMany({
          where: { saleId }, orderBy: { recordedAt: 'desc' },
        })).map(saleSettlement);
      },
      async findByIdempotencyKey(idempotencyKey) {
        const row = await client.saleSettlement.findUnique({ where: { idempotencyKey } });
        return row ? saleSettlement(row) : null;
      },
      async create(value) {
        return saleSettlement(await client.saleSettlement.create({
          data: { ...value, recordedAt: new Date(value.recordedAt), createdAt: new Date(value.createdAt) },
        }));
      },
    },
    sales: {
      async nextInvoiceNumber(now) {
        const year = dhakaYear(now);
        const sequence = await client.documentSequence.upsert({
          where: { key: `INV:${year}` },
          create: { key: `INV:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `INV-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findAll(limit = 100) {
        return (await client.sale.findMany({
          orderBy: { completedAt: 'desc' },
          take: Math.max(1, Math.min(limit, 500)),
        })).map(sale);
      },
      async findVoidedByDateRange(from, to) {
        return (await client.sale.findMany({
          where: {
            status: 'VOIDED',
            voidedAt: { gte: from, lte: to },
          },
          orderBy: { voidedAt: 'desc' },
        })).map(sale);
      },
      async search(filters, limit = 200) {
        const query = filters.query?.trim();
        return (await client.sale.findMany({
          where: {
            status: filters.status,
            completedAt: filters.from || filters.to
              ? { gte: filters.from, lte: filters.to }
              : undefined,
            customerId: filters.customerType === 'WALK_IN'
              ? null
              : filters.customerType === 'REGISTERED'
                ? { not: null }
                : undefined,
            actorId: filters.actorId,
            paymentStatus: filters.paymentStatus,
            paymentMethod: filters.paymentMethod,
            total: filters.minTotal !== undefined || filters.maxTotal !== undefined
              ? { gte: filters.minTotal, lte: filters.maxTotal }
              : undefined,
            ...(query ? {
              OR: [
                { invoiceNumber: { contains: query, mode: 'insensitive' } },
                { customerName: { contains: query, mode: 'insensitive' } },
                { customerPhone: { contains: query } },
                { reference: { contains: query, mode: 'insensitive' } },
                { actorName: { contains: query, mode: 'insensitive' } },
              ],
            } : {}),
          },
          orderBy: { completedAt: 'desc' },
          take: Math.max(1, Math.min(limit, 500)),
        })).map(sale);
      },
      async findById(id) {
        const row = await client.sale.findUnique({ where: { id } });
        return row ? sale(row) : null;
      },
      async findByInvoiceNumber(invoiceNumber) {
        const row = await client.sale.findUnique({ where: { invoiceNumber } });
        return row ? sale(row) : null;
      },
      async findByIdempotencyKey(idempotencyKey) {
        const row = await client.sale.findUnique({ where: { idempotencyKey } });
        return row ? sale(row) : null;
      },
      async findByCustomer(customerId) {
        return (await client.sale.findMany({
          where: { customerId },
          orderBy: { completedAt: 'desc' },
        })).map(sale);
      },
      async create(value) {
        return sale(await client.sale.create({
          data: {
            ...value,
            tradeInDetails: value.tradeInDetails
              ? value.tradeInDetails as unknown as Prisma.InputJsonValue
              : Prisma.DbNull,
            completedAt: new Date(value.completedAt),
            createdAt: new Date(value.createdAt),
          },
        }));
      },
      async updatePayment(id, expectedAmountPaid, patch) {
        const result = await client.sale.updateMany({
          where: { id, status: 'COMPLETED', amountPaid: expectedAmountPaid },
          data: patch,
        });
        if (result.count !== 1) throw new Error('The invoice payment changed. Refresh and try again.');
        return sale(await client.sale.findUniqueOrThrow({ where: { id } }));
      },
      async markVoided(id, patch) {
        const result = await client.sale.updateMany({
          where: { id, status: 'COMPLETED' },
          data: {
            ...patch,
            voidedAt: patch.voidedAt ? new Date(patch.voidedAt) : null,
          },
        });
        if (result.count !== 1) throw new Error('This invoice is no longer eligible to be voided.');
        return sale(await client.sale.findUniqueOrThrow({ where: { id } }));
      },
      async createItem(value) {
        return saleItem(await client.saleItem.create({
          data: { ...value, createdAt: new Date(value.createdAt) },
        }));
      },
      async findItems(saleId) {
        const rows = await client.saleItem.findMany({
          where: { saleId },
          include: { movement: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map((row): InvoiceItem => {
          if (row.movement.unitPrice === null) {
            throw new Error(`Invoice movement ${row.movementId} has no selling price.`);
          }
          const quantity = Math.abs(row.movement.quantity);
          return {
            id: row.id,
            saleId: row.saleId,
            movementId: row.movementId,
            productName: row.productName,
            sku: row.sku,
            serialNo: row.serialNo,
            listUnitPrice: row.listUnitPrice,
            warrantyMonths: row.warrantyMonths,
            warrantyDays: row.warrantyDays,
            usedGrade: row.usedGrade,
            knownDefects: row.knownDefects,
            position: row.position,
            createdAt: iso(row.createdAt),
            quantity,
            actualUnitPrice: row.movement.unitPrice,
            discount: (row.listUnitPrice - row.movement.unitPrice) * quantity,
            lineTotal: row.movement.unitPrice * quantity,
          };
        });
      },
    },
    usedDeviceAcquisitions: {
      async findById(id) {
        const row = await client.usedDeviceAcquisition.findUnique({ where: { id } });
        return row ? usedDeviceAcquisition(row) : null;
      },
      async findByIdempotencyKey(idempotencyKey) {
        const row = await client.usedDeviceAcquisition.findUnique({ where: { idempotencyKey } });
        return row ? usedDeviceAcquisition(row) : null;
      },
      async findByUnit(unitId) {
        const row = await client.usedDeviceAcquisition.findFirst({
          where: { unitId },
          orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
        });
        return row ? usedDeviceAcquisition(row) : null;
      },
      async findBySale(tradeInSaleId) {
        const row = await client.usedDeviceAcquisition.findUnique({ where: { tradeInSaleId } });
        return row ? usedDeviceAcquisition(row) : null;
      },
      async findAvailableTradeIns() {
        return (await client.usedDeviceAcquisition.findMany({
          where: { type: 'TRADE_IN', tradeInSaleId: null },
          orderBy: { acquiredAt: 'desc' },
        })).map(usedDeviceAcquisition);
      },
      async create(value) {
        try {
          return usedDeviceAcquisition(await client.usedDeviceAcquisition.create({
            data: {
              ...value,
              acquiredAt: new Date(value.acquiredAt),
              createdAt: new Date(value.createdAt),
            },
          }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async attachToSale(id, saleId) {
        const result = await client.usedDeviceAcquisition.updateMany({
          where: { id, type: 'TRADE_IN', tradeInSaleId: null },
          data: { tradeInSaleId: saleId },
        });
        if (result.count !== 1) throw new Error('That trade-in has already been used or is unavailable.');
        return usedDeviceAcquisition(await client.usedDeviceAcquisition.findUniqueOrThrow({ where: { id } }));
      },
    },
    refurbishmentExpenses: {
      async findByUnit(unitId) {
        return (await client.refurbishmentExpense.findMany({
          where: { unitId },
          orderBy: { createdAt: 'asc' },
        })).map(refurbishmentExpense);
      },
      async create(value) {
        return refurbishmentExpense(await client.refurbishmentExpense.create({
          data: { ...value, createdAt: new Date(value.createdAt) },
        }));
      },
    },
    supplierReturns: {
      async nextReturnNumber(now) {
        const year = dhakaYear(now);
        const sequence = await client.documentSequence.upsert({
          where: { key: `SRT:${year}` },
          create: { key: `SRT:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `SRT-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findAll() {
        return (await client.supplierReturn.findMany({ orderBy: { sentAt: 'desc' } })).map(supplierReturn);
      },
      async findById(id) {
        const row = await client.supplierReturn.findUnique({ where: { id } });
        return row ? supplierReturn(row) : null;
      },
      async findByMovement(movementId) {
        const row = await client.supplierReturn.findUnique({ where: { movementId } });
        return row ? supplierReturn(row) : null;
      },
      async create(value) {
        return supplierReturn(await client.supplierReturn.create({
          data: {
            ...value,
            sentAt: new Date(value.sentAt),
            settledAt: value.settledAt ? new Date(value.settledAt) : null,
            createdAt: new Date(value.createdAt),
            updatedAt: new Date(value.updatedAt),
          },
        }));
      },
      async settle(id, patch) {
        const result = await client.supplierReturn.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            ...patch,
            settledAt: patch.settledAt ? new Date(patch.settledAt) : null,
            updatedAt: new Date(patch.updatedAt),
          },
        });
        if (result.count !== 1) throw new Error('This supplier return has already been settled or is unavailable.');
        return supplierReturn(await client.supplierReturn.findUniqueOrThrow({ where: { id } }));
      },
      async cancel(id, patch) {
        const result = await client.supplierReturn.updateMany({
          where: { id, status: 'PENDING' },
          data: { ...patch, settledAt: patch.settledAt ? new Date(patch.settledAt) : null, updatedAt: new Date(patch.updatedAt) },
        });
        if (result.count !== 1) throw new Error('This supplier return is no longer pending.');
        return supplierReturn(await client.supplierReturn.findUniqueOrThrow({ where: { id } }));
      },
    },
    expenseCategories: {
      async findAll() {
        return (await client.expenseCategory.findMany({
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        })).map(expenseCategory);
      },
      async findById(id) {
        const row = await client.expenseCategory.findUnique({ where: { id } });
        return row ? expenseCategory(row) : null;
      },
      async create(value) {
        try {
          return expenseCategory(await client.expenseCategory.create({
            data: {
              ...value,
              createdAt: new Date(value.createdAt),
              updatedAt: new Date(value.updatedAt),
            },
          }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, patch) {
        try {
          return expenseCategory(await client.expenseCategory.update({
            where: { id },
            data: { ...patch, updatedAt: new Date(patch.updatedAt) },
          }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
    },
    operatingExpenses: {
      async nextExpenseNumber(now) {
        const year = dhakaYear(now);
        const sequence = await client.documentSequence.upsert({
          where: { key: `EXP:${year}` },
          create: { key: `EXP:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `EXP-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findAll(filters, limit = 500) {
        const query = filters?.query?.trim();
        const amount = filters?.minAmount !== undefined || filters?.maxAmount !== undefined
          ? { gte: filters?.minAmount, lte: filters?.maxAmount }
          : undefined;
        const orderBy = filters?.order === 'oldest'
          ? [{ expenseDate: 'asc' as const }, { createdAt: 'asc' as const }]
          : filters?.order === 'amount-desc'
            ? [{ amount: 'desc' as const }, { expenseDate: 'desc' as const }]
            : filters?.order === 'amount-asc'
              ? [{ amount: 'asc' as const }, { expenseDate: 'desc' as const }]
              : [{ expenseDate: 'desc' as const }, { createdAt: 'desc' as const }];
        return (await client.operatingExpense.findMany({
          where: {
            expenseDate: filters?.from || filters?.to
              ? { gte: filters?.from, lte: filters?.to }
              : undefined,
            categoryId: filters?.categoryId,
            paymentMethod: filters?.paymentMethod,
            recordedById: filters?.recordedById,
            status: filters?.status,
            amount,
            ...(query ? {
              OR: [
                { expenseNumber: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { paidTo: { contains: query, mode: 'insensitive' } },
                { reference: { contains: query, mode: 'insensitive' } },
              ],
            } : {}),
          },
          orderBy,
          take: Math.max(1, Math.min(limit, 2_000)),
        })).map(operatingExpense);
      },
      async findById(id) {
        const row = await client.operatingExpense.findUnique({ where: { id } });
        return row ? operatingExpense(row) : null;
      },
      async create(value) {
        try {
          return operatingExpense(await client.operatingExpense.create({
            data: {
              ...value,
              expenseDate: new Date(value.expenseDate),
              voidedAt: value.voidedAt ? new Date(value.voidedAt) : null,
              createdAt: new Date(value.createdAt),
              updatedAt: new Date(value.updatedAt),
            },
          }));
        } catch (error) { return friendlyDatabaseError(error); }
      },
      async update(id, patch) {
        const result = await client.operatingExpense.updateMany({
          where: { id, status: 'ACTIVE' },
          data: {
            ...patch,
            expenseDate: new Date(patch.expenseDate),
            updatedAt: new Date(patch.updatedAt),
          },
        });
        if (result.count !== 1) throw new Error('Only an active expense can be edited.');
        return operatingExpense(await client.operatingExpense.findUniqueOrThrow({ where: { id } }));
      },
      async void(id, patch) {
        const result = await client.operatingExpense.updateMany({
          where: { id, status: 'ACTIVE' },
          data: {
            ...patch,
            voidedAt: patch.voidedAt ? new Date(patch.voidedAt) : null,
            updatedAt: new Date(patch.updatedAt),
          },
        });
        if (result.count !== 1) throw new Error('This expense is already voided or unavailable.');
        return operatingExpense(await client.operatingExpense.findUniqueOrThrow({ where: { id } }));
      },
    },
    emi: {
      async nextContractNumber(now) {
        const year = dhakaYear(now);
        const sequence = await client.documentSequence.upsert({
          where: { key: `EMI:${year}` },
          create: { key: `EMI:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `EMI-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async nextReceiptNumber(now) {
        const year = dhakaYear(now);
        const sequence = await client.documentSequence.upsert({
          where: { key: `RCPT:${year}` },
          create: { key: `RCPT:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        return `RCPT-${year}-${String(sequence.value).padStart(6, '0')}`;
      },
      async findContracts() { return (await client.emiContract.findMany({ orderBy: { createdAt: 'desc' } })).map(emiContract); },
      async findContractById(id) { const row = await client.emiContract.findUnique({ where: { id } }); return row ? emiContract(row) : null; },
      async findContractBySale(saleId) { const row = await client.emiContract.findUnique({ where: { saleId } }); return row ? emiContract(row) : null; },
      async createContract(value) {
        return emiContract(await client.emiContract.create({ data: { ...value, firstDueDate: new Date(value.firstDueDate), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt), completedAt: value.completedAt ? new Date(value.completedAt) : null, voidedAt: value.voidedAt ? new Date(value.voidedAt) : null } }));
      },
      async updateContract(id, patch) {
        return emiContract(await client.emiContract.update({ where: { id }, data: { ...patch, completedAt: patch.completedAt ? new Date(patch.completedAt) : patch.completedAt, voidedAt: patch.voidedAt ? new Date(patch.voidedAt) : patch.voidedAt, updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined } }));
      },
      async findInstallments(contractId) { return (await client.emiInstallment.findMany({ where: { contractId }, orderBy: { sequence: 'asc' } })).map(emiInstallment); },
      async createInstallment(value) { return emiInstallment(await client.emiInstallment.create({ data: { ...value, dueDate: new Date(value.dueDate), paidAt: value.paidAt ? new Date(value.paidAt) : null, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) } })); },
      async updateInstallment(id, patch) { return emiInstallment(await client.emiInstallment.update({ where: { id }, data: { ...patch, paidAt: patch.paidAt ? new Date(patch.paidAt) : patch.paidAt, updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined } })); },
      async findPayments(contractId) { return (await client.emiPayment.findMany({ where: { contractId }, orderBy: { paidAt: 'desc' } })).map(emiPayment); },
      async findPaymentByIdempotencyKey(idempotencyKey) { const row = await client.emiPayment.findUnique({ where: { idempotencyKey } }); return row ? emiPayment(row) : null; },
      async createPayment(value) { return emiPayment(await client.emiPayment.create({ data: { ...value, paidAt: new Date(value.paidAt), reversedAt: value.reversedAt ? new Date(value.reversedAt) : null, createdAt: new Date(value.createdAt) } })); },
      async updatePayment(id, patch) {
        return emiPayment(await client.emiPayment.update({
          where: { id },
          data: {
            ...patch,
            reversedAt: patch.reversedAt ? new Date(patch.reversedAt) : patch.reversedAt,
          },
        }));
      },
      async findAllocations(paymentId) { return (await client.emiPaymentAllocation.findMany({ where: { paymentId }, orderBy: { createdAt: 'asc' } })).map(emiAllocation); },
      async createAllocation(value) { return emiAllocation(await client.emiPaymentAllocation.create({ data: { ...value, createdAt: new Date(value.createdAt) } })); },
      async findEarlySettlement(contractId) { const row = await client.emiEarlySettlement.findUnique({ where: { contractId } }); return row ? emiSettlement(row) : null; },
      async createEarlySettlement(value) { return emiSettlement(await client.emiEarlySettlement.create({ data: { ...value, approvedAt: new Date(value.approvedAt) } })); },
    },
    transaction: transact ?? ((fn) => fn(repositories)),
  };

  return repositories;
}

export const prismaRepositories = createRepositories(
  prisma as PrismaClient,
  (fn) => prisma.$transaction(
    (tx) => fn(createRepositories(tx)),
    { maxWait: 5_000, timeout: 15_000 },
  ),
);
