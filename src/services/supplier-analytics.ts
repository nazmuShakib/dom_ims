import type { Product, StockMovement, Supplier, SupplierReturn } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';

export const SUPPLIER_ANALYTICS_ORDERS = [
  'purchase-desc', 'purchase-asc', 'units-desc', 'units-asc',
  'average-desc', 'average-asc', 'products-desc', 'products-asc',
  'returns-desc', 'surplus-desc', 'deficit-desc', 'return-rate-desc',
  'newest', 'oldest', 'name-asc', 'name-desc',
] as const;
export type SupplierAnalyticsOrder = (typeof SUPPLIER_ANALYTICS_ORDERS)[number];
export type SupplierAnalyticsActivity = 'all' | 'purchases' | 'returns' | 'settlements';
export type SupplierAnalyticsStatus = 'all' | 'active' | 'removed';

export interface SupplierAnalyticsFilters {
  from?: string;
  to?: string;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  status: SupplierAnalyticsStatus;
  activity: SupplierAnalyticsActivity;
  order: SupplierAnalyticsOrder;
  onlyWithPurchases: boolean;
  onlyWithReturns: boolean;
}

export interface SupplierAnalyticsRow {
  supplierId: string;
  supplierName: string;
  supplierActive: boolean;
  unitsReceived: number;
  grossPurchaseCost: Paisa;
  averageUnitCost: Paisa;
  distinctProducts: number;
  returnedUnits: number;
  returnedStockCost: Paisa;
  settledReturnCost: Paisa;
  recoveredAmount: Paisa;
  recoveryDifference: Paisa;
  netRetainedPurchaseCost: Paisa;
  returnRate: number;
  lastPurchaseAt: string | null;
}

export interface SupplierProductAnalyticsRow {
  productId: string;
  productName: string;
  sku: string;
  unitsReceived: number;
  purchaseCost: Paisa;
  averageUnitCost: Paisa;
  returnedUnits: number;
  returnedStockCost: Paisa;
  recoveredAmount: Paisa;
}

export interface SupplierActivityRow {
  id: string;
  occurredAt: string;
  kind: 'PURCHASE' | 'CORRECTION' | 'RETURN' | 'SETTLEMENT';
  productName: string;
  sku: string;
  quantity: number;
  amount: Paisa;
  reference: string | null;
}

export interface SupplierAnalyticsResult {
  rows: SupplierAnalyticsRow[];
  productsBySupplier: Map<string, SupplierProductAnalyticsRow[]>;
  activitiesBySupplier: Map<string, SupplierActivityRow[]>;
  totals: Omit<SupplierAnalyticsRow, 'supplierId' | 'supplierName' | 'supplierActive' | 'averageUnitCost' | 'returnRate' | 'lastPurchaseAt'> & {
    suppliers: number;
    averageUnitCost: Paisa;
    returnRate: number;
  };
}

type RawParams = Record<string, string | string[] | undefined>;
const UNKNOWN_SUPPLIER_ID = '__supplier_not_recorded__';

function one(raw: RawParams, key: string): string | undefined {
  const value = raw[key];
  const result = (Array.isArray(value) ? value[0] : value)?.trim();
  return result || undefined;
}

function validDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function parseSupplierAnalyticsFilters(raw: RawParams): SupplierAnalyticsFilters {
  const status = one(raw, 'status');
  const activity = one(raw, 'activity');
  const order = one(raw, 'order');
  return {
    from: validDate(one(raw, 'from')),
    to: validDate(one(raw, 'to')),
    supplierId: one(raw, 'supplierId'),
    productId: one(raw, 'productId'),
    categoryId: one(raw, 'categoryId'),
    brandId: one(raw, 'brandId'),
    status: status === 'active' || status === 'removed' ? status : 'all',
    activity: activity === 'purchases' || activity === 'returns' || activity === 'settlements' ? activity : 'all',
    order: SUPPLIER_ANALYTICS_ORDERS.includes(order as SupplierAnalyticsOrder) ? order as SupplierAnalyticsOrder : 'purchase-desc',
    onlyWithPurchases: one(raw, 'onlyWithPurchases') === 'true',
    onlyWithReturns: one(raw, 'onlyWithReturns') === 'true',
  };
}

function dhakaDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const find = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${find('year')}-${find('month')}-${find('day')}`;
}

function inRange(iso: string, filters: SupplierAnalyticsFilters): boolean {
  const value = dhakaDate(iso);
  return (!filters.from || value >= filters.from) && (!filters.to || value <= filters.to);
}

function allowsProduct(product: Product | undefined, filters: SupplierAnalyticsFilters): product is Product {
  return Boolean(product)
    && (!filters.productId || product!.id === filters.productId)
    && (!filters.categoryId || product!.categoryId === filters.categoryId)
    && (!filters.brandId || product!.brandId === filters.brandId);
}

function effectiveReason(movement: StockMovement, movementsById: Map<string, StockMovement>) {
  if (movement.reason !== 'CORRECTION' || !movement.reversesId) return movement.reason;
  return movementsById.get(movement.reversesId)?.reason ?? movement.reason;
}

type MutableSupplier = SupplierAnalyticsRow & { productIds: Set<string> };
type MutableProduct = SupplierProductAnalyticsRow;

function emptySupplier(id: string, supplier?: Supplier): MutableSupplier {
  return {
    supplierId: id, supplierName: supplier?.name ?? 'Supplier not recorded', supplierActive: supplier?.isActive ?? false,
    unitsReceived: 0, grossPurchaseCost: 0, averageUnitCost: 0, distinctProducts: 0,
    returnedUnits: 0, returnedStockCost: 0, settledReturnCost: 0, recoveredAmount: 0,
    recoveryDifference: 0, netRetainedPurchaseCost: 0, returnRate: 0, lastPurchaseAt: null,
    productIds: new Set(),
  };
}

function emptyProduct(product: Product): MutableProduct {
  return { productId: product.id, productName: product.name, sku: product.sku, unitsReceived: 0, purchaseCost: 0, averageUnitCost: 0, returnedUnits: 0, returnedStockCost: 0, recoveredAmount: 0 };
}

function replacementReceived(item: SupplierReturn, movements: StockMovement[], reversedIds: Set<string>): boolean {
  return item.recoveryMethod === 'SUPPLIER_CREDIT' && movements.some((movement) =>
    movement.reason === 'PURCHASE' && movement.quantity > 0 && movement.reference === item.returnNumber && !reversedIds.has(movement.id));
}

export function buildSupplierAnalytics(input: {
  suppliers: Supplier[];
  products: Product[];
  movements: StockMovement[];
  returns: SupplierReturn[];
  filters: SupplierAnalyticsFilters;
}): SupplierAnalyticsResult {
  const { suppliers, products, movements, returns, filters } = input;
  const suppliersById = new Map(suppliers.map((item) => [item.id, item]));
  const productsById = new Map(products.map((item) => [item.id, item]));
  const movementsById = new Map(movements.map((item) => [item.id, item]));
  const reversedIds = new Set(movements.map((item) => item.reversesId).filter((id): id is string => Boolean(id)));
  const buckets = new Map<string, MutableSupplier>();
  const productBuckets = new Map<string, Map<string, MutableProduct>>();
  const activities = new Map<string, SupplierActivityRow[]>();

  const supplierAllowed = (id: string) => {
    if (filters.supplierId && id !== filters.supplierId) return false;
    const supplier = suppliersById.get(id);
    if (filters.status === 'active' && !supplier?.isActive) return false;
    if (filters.status === 'removed' && (!supplier || supplier.isActive)) return false;
    return true;
  };
  const bucketFor = (id: string) => {
    let bucket = buckets.get(id);
    if (!bucket) { bucket = emptySupplier(id, suppliersById.get(id)); buckets.set(id, bucket); }
    return bucket;
  };
  const productFor = (supplierId: string, product: Product) => {
    let map = productBuckets.get(supplierId);
    if (!map) { map = new Map(); productBuckets.set(supplierId, map); }
    let bucket = map.get(product.id);
    if (!bucket) { bucket = emptyProduct(product); map.set(product.id, bucket); }
    return bucket;
  };
  const addActivity = (supplierId: string, row: SupplierActivityRow) => activities.set(supplierId, [...(activities.get(supplierId) ?? []), row]);

  if (filters.activity === 'all' || filters.activity === 'purchases') {
    for (const movement of movements) {
      if (effectiveReason(movement, movementsById) !== 'PURCHASE' || !inRange(movement.createdAt, filters)) continue;
      const product = productsById.get(movement.productId);
      if (!allowsProduct(product, filters)) continue;
      const supplierId = movement.supplierId ?? UNKNOWN_SUPPLIER_ID;
      if (!supplierAllowed(supplierId)) continue;
      const supplier = bucketFor(supplierId); const item = productFor(supplierId, product);
      const cost = movement.quantity * movement.unitCost;
      supplier.unitsReceived += movement.quantity; supplier.grossPurchaseCost += cost; supplier.productIds.add(product.id);
      if (movement.quantity > 0 && (!supplier.lastPurchaseAt || movement.createdAt > supplier.lastPurchaseAt)) supplier.lastPurchaseAt = movement.createdAt;
      item.unitsReceived += movement.quantity; item.purchaseCost += cost;
      addActivity(supplierId, { id: movement.id, occurredAt: movement.createdAt, kind: movement.reason === 'CORRECTION' ? 'CORRECTION' : 'PURCHASE', productName: product.name, sku: product.sku, quantity: movement.quantity, amount: cost, reference: movement.reference });
    }
  }

  for (const item of returns) {
    if (item.status === 'CANCELLED') continue;
    const movement = movementsById.get(item.movementId); const product = movement ? productsById.get(movement.productId) : undefined;
    if (!movement || !allowsProduct(product, filters) || !supplierAllowed(item.supplierId)) continue;
    const originalCost = Math.abs(movement.quantity) * movement.unitCost;
    const quantity = Math.abs(movement.quantity);
    const includeReturn = (filters.activity === 'all' || filters.activity === 'returns') && inRange(item.sentAt, filters);
    const settlementComplete = item.status === 'SETTLED' && item.settledAt && item.recoveredAmount !== null
      && (item.recoveryMethod !== 'SUPPLIER_CREDIT' || replacementReceived(item, movements, reversedIds));
    const includeSettlement = Boolean(settlementComplete && (filters.activity === 'all' || filters.activity === 'settlements') && inRange(item.settledAt!, filters));
    if (!includeReturn && !includeSettlement) continue;
    const supplier = bucketFor(item.supplierId); const productRow = productFor(item.supplierId, product);
    if (includeReturn) {
      supplier.returnedUnits += quantity; supplier.returnedStockCost += originalCost;
      productRow.returnedUnits += quantity; productRow.returnedStockCost += originalCost;
      addActivity(item.supplierId, { id: `${item.id}:return`, occurredAt: item.sentAt, kind: 'RETURN', productName: product.name, sku: product.sku, quantity, amount: originalCost, reference: item.returnNumber });
    }
    if (includeSettlement) {
      const recovered = item.recoveredAmount ?? 0;
      supplier.settledReturnCost += originalCost; supplier.recoveredAmount += recovered; productRow.recoveredAmount += recovered;
      addActivity(item.supplierId, { id: `${item.id}:settlement`, occurredAt: item.settledAt!, kind: 'SETTLEMENT', productName: product.name, sku: product.sku, quantity, amount: recovered, reference: item.settlementReference ?? item.returnNumber });
    }
  }

  let rows = [...buckets.values()].map(({ productIds: _productIds, ...row }) => ({
    ...row,
    distinctProducts: [...(productBuckets.get(row.supplierId)?.values() ?? [])]
      .filter((item) => item.unitsReceived !== 0 || item.purchaseCost !== 0 || item.returnedUnits !== 0 || item.returnedStockCost !== 0 || item.recoveredAmount !== 0).length,
    averageUnitCost: row.unitsReceived > 0 ? Math.round(row.grossPurchaseCost / row.unitsReceived) : 0,
    recoveryDifference: row.recoveredAmount - row.settledReturnCost,
    netRetainedPurchaseCost: row.grossPurchaseCost - row.returnedStockCost,
    returnRate: row.unitsReceived > 0 ? Math.round((row.returnedUnits / row.unitsReceived) * 10_000) / 100 : 0,
  })).filter((row) => (!filters.onlyWithPurchases || row.unitsReceived > 0) && (!filters.onlyWithReturns || row.returnedUnits > 0));

  const numeric = (row: SupplierAnalyticsRow, order: SupplierAnalyticsOrder): number => ({
    'purchase-desc': row.grossPurchaseCost, 'purchase-asc': row.grossPurchaseCost,
    'units-desc': row.unitsReceived, 'units-asc': row.unitsReceived,
    'average-desc': row.averageUnitCost, 'average-asc': row.averageUnitCost,
    'products-desc': row.distinctProducts, 'products-asc': row.distinctProducts,
    'returns-desc': row.returnedStockCost, 'surplus-desc': row.recoveryDifference,
    'deficit-desc': -row.recoveryDifference, 'return-rate-desc': row.returnRate,
    newest: row.lastPurchaseAt ? new Date(row.lastPurchaseAt).getTime() : 0,
    oldest: row.lastPurchaseAt ? new Date(row.lastPurchaseAt).getTime() : Number.MAX_SAFE_INTEGER,
    'name-asc': 0, 'name-desc': 0,
  })[order];
  rows.sort((a, b) => {
    if (filters.order === 'name-asc') return a.supplierName.localeCompare(b.supplierName, undefined, { numeric: true });
    if (filters.order === 'name-desc') return b.supplierName.localeCompare(a.supplierName, undefined, { numeric: true });
    const asc = filters.order.endsWith('-asc') || filters.order === 'oldest';
    return (numeric(a, filters.order) - numeric(b, filters.order)) * (asc ? 1 : -1) || a.supplierName.localeCompare(b.supplierName);
  });

  const productsBySupplier = new Map([...productBuckets].map(([supplierId, map]) => [supplierId, [...map.values()]
    .filter((row) => row.unitsReceived !== 0 || row.purchaseCost !== 0 || row.returnedUnits !== 0 || row.returnedStockCost !== 0 || row.recoveredAmount !== 0)
    .map((row) => ({ ...row, averageUnitCost: row.unitsReceived > 0 ? Math.round(row.purchaseCost / row.unitsReceived) : 0 })).sort((a, b) => b.purchaseCost - a.purchaseCost)]));
  for (const list of activities.values()) list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const totals = rows.reduce((value, row) => ({
    suppliers: value.suppliers + 1, unitsReceived: value.unitsReceived + row.unitsReceived,
    grossPurchaseCost: value.grossPurchaseCost + row.grossPurchaseCost, distinctProducts: value.distinctProducts + row.distinctProducts,
    returnedUnits: value.returnedUnits + row.returnedUnits, returnedStockCost: value.returnedStockCost + row.returnedStockCost,
    settledReturnCost: value.settledReturnCost + row.settledReturnCost, recoveredAmount: value.recoveredAmount + row.recoveredAmount,
    recoveryDifference: value.recoveryDifference + row.recoveryDifference, netRetainedPurchaseCost: value.netRetainedPurchaseCost + row.netRetainedPurchaseCost,
    averageUnitCost: 0, returnRate: 0,
  }), { suppliers: 0, unitsReceived: 0, grossPurchaseCost: 0, distinctProducts: 0, returnedUnits: 0, returnedStockCost: 0, settledReturnCost: 0, recoveredAmount: 0, recoveryDifference: 0, netRetainedPurchaseCost: 0, averageUnitCost: 0, returnRate: 0 });
  totals.averageUnitCost = totals.unitsReceived > 0 ? Math.round(totals.grossPurchaseCost / totals.unitsReceived) : 0;
  totals.returnRate = totals.unitsReceived > 0 ? Math.round((totals.returnedUnits / totals.unitsReceived) * 10_000) / 100 : 0;
  return { rows, productsBySupplier, activitiesBySupplier: activities, totals };
}

export async function getSupplierAnalytics(filters: SupplierAnalyticsFilters, repositories: Repositories = db): Promise<SupplierAnalyticsResult> {
  const now = new Date();
  const [suppliers, products, movements, returns] = await Promise.all([
    repositories.suppliers.findAll(), repositories.products.findAll(),
    repositories.movements.findByDateRange(new Date(0), now, filters.supplierId && filters.supplierId !== UNKNOWN_SUPPLIER_ID ? { supplierId: filters.supplierId } : undefined), repositories.supplierReturns.findAll(),
  ]);
  return buildSupplierAnalytics({ suppliers, products, movements, returns, filters });
}

export function supplierAnalyticsDateLabel(filters: SupplierAnalyticsFilters): string {
  if (!filters.from && !filters.to) return 'All time';
  return `${filters.from ?? 'Beginning'} to ${filters.to ?? 'Today'}`;
}

export { UNKNOWN_SUPPLIER_ID };
