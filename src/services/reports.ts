import type {
  MovementReason,
  MovementType,
  Product,
  ProductUnit,
  StockMovement,
} from '@/domain/types';
import { MOVEMENT_REASONS, MOVEMENT_TYPES } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';

export const REPORT_KINDS = [
  'valuation',
  'sales',
  'profit',
  'purchases',
  'aging',
  'shrinkage',
  'movements',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportGroup = 'day' | 'month' | 'category' | 'brand';

export interface ReportFilters {
  report: ReportKind;
  from?: string;
  to?: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  type?: MovementType;
  reason?: MovementReason;
  actorId?: string;
  groupBy?: ReportGroup;
  sort?: 'revenue' | 'cogs' | 'profit' | 'margin' | 'quantity' | 'value';
  direction?: 'asc' | 'desc';
}

export type ReportCell = string | number | null;
export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'date';
}
export interface ReportRow {
  id: string;
  cells: Record<string, ReportCell>;
}
export interface ReportResult {
  kind: ReportKind;
  title: string;
  description: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  note?: string;
}

const DAY = 86_400_000;
const epoch = new Date(0);

function startBoundary(value: string | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return epoch;
  return new Date(`${value}T00:00:00+06:00`);
}

function endBoundary(value: string | undefined, now: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return now;
  return new Date(`${value}T23:59:59.999+06:00`);
}

export function parseReportFilters(raw: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const reportValue = one('report');
  const report = REPORT_KINDS.includes(reportValue as ReportKind)
    ? (reportValue as ReportKind)
    : 'valuation';
  const groupValue = one('groupBy');
  const orderValue = one('order');
  const [orderedSort, orderedDirection] = orderValue?.split('-') ?? [];
  const sortValue = orderedSort ?? one('sort');
  const directionValue = orderedDirection ?? one('direction');
  const typeValue = one('type');
  const reasonValue = one('reason');
  return {
    report,
    from: one('from'),
    to: one('to'),
    productId: one('productId'),
    categoryId: one('categoryId'),
    brandId: one('brandId'),
    supplierId: one('supplierId'),
    actorId: one('actorId'),
    groupBy: ['day', 'month', 'category', 'brand'].includes(groupValue ?? '')
      ? (groupValue as ReportGroup)
      : undefined,
    sort: ['revenue', 'cogs', 'profit', 'margin', 'quantity', 'value'].includes(sortValue ?? '')
      ? (sortValue as ReportFilters['sort'])
      : undefined,
    direction: directionValue === 'asc' ? 'asc' : 'desc',
    type: MOVEMENT_TYPES.includes(typeValue as MovementType) ? (typeValue as MovementType) : undefined,
    reason: MOVEMENT_REASONS.includes(reasonValue as MovementReason)
      ? (reasonValue as MovementReason)
      : undefined,
  };
}

function dhakaKey(iso: string, month = false): string {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: month ? undefined : '2-digit',
  }).format(new Date(iso));
  return value;
}

function economicReason(movement: StockMovement, byId: Map<string, StockMovement>): MovementReason {
  if (movement.reason !== 'CORRECTION' || !movement.reversesId) return movement.reason;
  return byId.get(movement.reversesId)?.reason ?? movement.reason;
}

function sum(rows: ReportRow[], key: string): number {
  return rows.reduce((total, row) => total + (typeof row.cells[key] === 'number' ? row.cells[key] : 0), 0);
}

interface Context {
  products: Product[];
  units: ProductUnit[];
  movements: StockMovement[];
  productById: Map<string, Product>;
  categoryNames: Map<string, string>;
  brandNames: Map<string, string>;
  supplierNames: Map<string, string>;
  actorNames: Map<string, string>;
}

async function loadContext(
  repositories: Repositories,
  now: Date,
  actorOverrides: ReadonlyMap<string, string>,
): Promise<Context> {
  const [products, movements, categories, brands, suppliers, users] = await Promise.all([
    repositories.products.findAll(),
    repositories.movements.findByDateRange(epoch, now),
    repositories.categories.findAll(), repositories.brands.findAll(), repositories.suppliers.findAll(),
    repositories.users.findAll(),
  ]);
  const unitGroups = await Promise.all(products
    .filter((product) => product.trackingType === 'SERIAL')
    .map((product) => repositories.units.findByProduct(product.id)));
  const actorNames = new Map(users.map((user) => [user.id, user.name]));
  for (const [id, name] of actorOverrides) actorNames.set(id, name);
  return {
    products, movements, units: unitGroups.flat(),
    productById: new Map(products.map((product) => [product.id, product])),
    categoryNames: new Map(categories.map((item) => [item.id, item.name])),
    brandNames: new Map(brands.map((item) => [item.id, item.name])),
    supplierNames: new Map(suppliers.map((item) => [item.id, item.name])),
    actorNames,
  };
}

function allowedProduct(product: Product | undefined, filters: ReportFilters): product is Product {
  return Boolean(product)
    && (!filters.productId || product!.id === filters.productId)
    && (!filters.categoryId || product!.categoryId === filters.categoryId)
    && (!filters.brandId || product!.brandId === filters.brandId);
}

function inPeriod(movement: StockMovement, filters: ReportFilters, now: Date): boolean {
  const when = new Date(movement.createdAt).getTime();
  return when >= startBoundary(filters.from).getTime() && when <= endBoundary(filters.to, now).getTime();
}

const moneyCols = (keys: Array<[string, string]>): ReportColumn[] =>
  keys.map(([key, label]) => ({ key, label, type: 'money' }));

function valuation(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const groupBy = filters.groupBy === 'brand' ? 'brand' : 'category';
  const buckets = new Map<string, { label: string; units: number; value: Paisa }>();
  for (const product of ctx.products) {
    if (!allowedProduct(product, filters)) continue;
    const units = product.trackingType === 'SERIAL'
      ? ctx.units.filter((unit) => unit.productId === product.id && unit.status === 'IN_STOCK')
      : [];
    const quantity = product.trackingType === 'SERIAL' ? units.length : product.quantityOnHand;
    const value = product.trackingType === 'SERIAL'
      ? units.reduce((total, unit) => total + unit.costPrice, 0)
      : quantity * product.avgCostPrice;
    const key = groupBy === 'brand' ? (product.brandId ?? 'unbranded') : product.categoryId;
    const label = groupBy === 'brand'
      ? (product.brandId ? ctx.brandNames.get(product.brandId) : 'Unbranded')
      : ctx.categoryNames.get(product.categoryId);
    const bucket = buckets.get(key) ?? { label: label ?? 'Unknown', units: 0, value: 0 };
    bucket.units += quantity; bucket.value += value; buckets.set(key, bucket);
  }
  const rows = [...buckets].map(([id, item]) => ({ id, cells: { group: item.label, quantity: item.units, value: item.value } }))
    .sort((a, b) => Number(b.cells.value) - Number(a.cells.value));
  return { kind: 'valuation', title: 'Inventory valuation', description: `Current stock at cost, grouped by ${groupBy}.`, generatedAt: now.toISOString(),
    columns: [{ key: 'group', label: groupBy === 'brand' ? 'Brand' : 'Category', type: 'text' }, { key: 'quantity', label: 'Units', type: 'number' }, ...moneyCols([['value', 'Value at cost']])],
    rows, totals: { quantity: sum(rows, 'quantity'), value: sum(rows, 'value') } };
}

function saleRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const groupBy = filters.groupBy ?? 'day';
  const buckets = new Map<string, { label: string; quantity: number; revenue: Paisa; cogs: Paisa }>();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (!inPeriod(movement, filters, now) || !allowedProduct(product, filters) || economicReason(movement, byId) !== 'SALE') continue;
    let key: string; let label: string;
    if (groupBy === 'category') { key = product.categoryId; label = ctx.categoryNames.get(key) ?? 'Unknown'; }
    else if (groupBy === 'brand') { key = product.brandId ?? 'unbranded'; label = product.brandId ? (ctx.brandNames.get(product.brandId) ?? 'Unknown') : 'Unbranded'; }
    else { key = dhakaKey(movement.createdAt, groupBy === 'month'); label = key; }
    const bucket = buckets.get(key) ?? { label, quantity: 0, revenue: 0, cogs: 0 };
    bucket.quantity += -movement.quantity;
    bucket.revenue += movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice;
    bucket.cogs += -movement.quantity * movement.unitCost;
    buckets.set(key, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.revenue !== 0 || item.cogs !== 0)
    .map(([id, item]) => ({ id, cells: { group: item.label, quantity: item.quantity, revenue: item.revenue, cogs: item.cogs, profit: item.revenue - item.cogs, margin: item.revenue === 0 ? 0 : Math.round(((item.revenue - item.cogs) / item.revenue) * 10_000) / 100 } }));
  const sortKey = filters.sort ?? 'revenue'; const direction = filters.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => direction * (Number((a.cells as Record<string, ReportCell>)[sortKey] ?? 0) - Number((b.cells as Record<string, ReportCell>)[sortKey] ?? 0)));
  return { kind: 'sales', title: 'Revenue, cost and sales profit', description: `Sales results grouped by ${groupBy}.`, generatedAt: now.toISOString(),
    columns: [{ key: 'group', label: 'Period / group', type: 'text' }, { key: 'quantity', label: 'Units sold', type: 'number' }, ...moneyCols([['revenue', 'Revenue'], ['cogs', 'Cost of sold items (COGS)'], ['profit', 'Sales profit']]), { key: 'margin', label: 'Profit margin %', type: 'number' }],
    rows, totals: { quantity: sum(rows, 'quantity'), revenue: sum(rows, 'revenue'), cogs: sum(rows, 'cogs'), profit: sum(rows, 'profit') } };
}

function profitRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const base = saleRows(ctx, { ...filters, groupBy: 'day' }, now);
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<string, { product: Product; quantity: number; revenue: Paisa; cogs: Paisa }>();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (!inPeriod(movement, filters, now) || !allowedProduct(product, filters) || economicReason(movement, byId) !== 'SALE') continue;
    const bucket = buckets.get(product.id) ?? { product, quantity: 0, revenue: 0, cogs: 0 };
    bucket.quantity += -movement.quantity; bucket.revenue += movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice; bucket.cogs += -movement.quantity * movement.unitCost; buckets.set(product.id, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.revenue !== 0 || item.cogs !== 0)
    .map(([id, item]) => ({ id, cells: { product: item.product.name, sku: item.product.sku, quantity: item.quantity, revenue: item.revenue, cogs: item.cogs, profit: item.revenue - item.cogs, margin: item.revenue === 0 ? 0 : Math.round(((item.revenue - item.cogs) / item.revenue) * 10_000) / 100 } }));
  const sortKey = filters.sort ?? 'profit'; const direction = filters.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => direction * (Number((a.cells as Record<string, ReportCell>)[sortKey] ?? 0) - Number((b.cells as Record<string, ReportCell>)[sortKey] ?? 0)));
  return { ...base, kind: 'profit', title: 'Profit per product', description: 'Exact sale margin from snapshotted selling price and cost.',
    columns: [{ key: 'product', label: 'Product', type: 'text' }, { key: 'sku', label: 'Product code (SKU)', type: 'text' }, { key: 'quantity', label: 'Units sold', type: 'number' }, ...moneyCols([['revenue', 'Revenue'], ['cogs', 'Cost of sold items (COGS)'], ['profit', 'Sales profit']]), { key: 'margin', label: 'Profit margin %', type: 'number' }],
    rows, totals: { quantity: sum(rows, 'quantity'), revenue: sum(rows, 'revenue'), cogs: sum(rows, 'cogs'), profit: sum(rows, 'profit') } };
}

function purchaseRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<string, { label: string; quantity: number; spend: Paisa }>();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (!inPeriod(movement, filters, now) || !allowedProduct(product, filters) || economicReason(movement, byId) !== 'PURCHASE' || (filters.supplierId && movement.supplierId !== filters.supplierId)) continue;
    const key = movement.supplierId ?? 'unknown'; const label = movement.supplierId ? (ctx.supplierNames.get(movement.supplierId) ?? 'Unknown supplier') : 'No supplier';
    const bucket = buckets.get(key) ?? { label, quantity: 0, spend: 0 };
    bucket.quantity += movement.quantity; bucket.spend += movement.quantity * movement.unitCost; buckets.set(key, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.spend !== 0)
    .map(([id, item]) => ({ id, cells: { supplier: item.label, quantity: item.quantity, spend: item.spend } }))
    .sort((a, b) => Number(b.cells.spend) - Number(a.cells.spend));
  return { kind: 'purchases', title: 'Purchase spend', description: 'Net purchase receipts by supplier; corrections cancel original spend.', generatedAt: now.toISOString(), columns: [{ key: 'supplier', label: 'Supplier', type: 'text' }, { key: 'quantity', label: 'Units', type: 'number' }, ...moneyCols([['spend', 'Spend']])], rows, totals: { quantity: sum(rows, 'quantity'), spend: sum(rows, 'spend') } };
}

function agingRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const values = new Map<string, { quantity: number; value: Paisa }>(['0–30', '31–60', '61–90', '90+'].map((key) => [key, { quantity: 0, value: 0 }]));
  const add = (receivedAt: string, quantity: number, cost: Paisa) => {
    const days = Math.max(0, Math.floor((now.getTime() - new Date(receivedAt).getTime()) / DAY));
    const key = days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+';
    const bucket = values.get(key)!; bucket.quantity += quantity; bucket.value += quantity * cost;
  };
  for (const unit of ctx.units) {
    const product = ctx.productById.get(unit.productId);
    if (unit.status === 'IN_STOCK' && allowedProduct(product, filters)) add(unit.receivedAt, 1, unit.costPrice);
  }
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const reversedIds = new Set(ctx.movements.map((movement) => movement.reversesId).filter((id): id is string => Boolean(id)));
  for (const product of ctx.products.filter((item) => item.trackingType === 'QUANTITY' && allowedProduct(item, filters))) {
    let remaining = product.quantityOnHand;
    const lots = ctx.movements.filter((movement) => movement.productId === product.id && movement.quantity > 0 && movement.reason !== 'CORRECTION' && !reversedIds.has(movement.id) && ['PURCHASE', 'TRADE_IN', 'INITIAL_STOCK', 'CUSTOMER_RETURN'].includes(economicReason(movement, byId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const lot of lots) { if (remaining <= 0) break; const quantity = Math.min(remaining, lot.quantity); add(lot.createdAt, quantity, lot.unitCost); remaining -= quantity; }
    if (remaining > 0) add(product.createdAt, remaining, product.avgCostPrice);
  }
  const rows = [...values].map(([id, item]) => ({ id, cells: { bucket: `${id} days`, quantity: item.quantity, value: item.value } }));
  return { kind: 'aging', title: 'Stock aging', description: 'Current inventory grouped by age since receipt.', generatedAt: now.toISOString(), columns: [{ key: 'bucket', label: 'Age', type: 'text' }, { key: 'quantity', label: 'Units', type: 'number' }, ...moneyCols([['value', 'Value at cost']])], rows, totals: { quantity: sum(rows, 'quantity'), value: sum(rows, 'value') }, note: 'Bulk/count-based stock uses oldest stock first (FIFO) for this report.' };
}

function shrinkageRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<string, { product: Product; damage: Paisa; loss: Paisa; quantity: number }>();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId); const reason = economicReason(movement, byId);
    if (!inPeriod(movement, filters, now) || !allowedProduct(product, filters) || !['DAMAGE', 'LOSS'].includes(reason)) continue;
    const bucket = buckets.get(product.id) ?? { product, damage: 0, loss: 0, quantity: 0 };
    const value = -movement.quantity * movement.unitCost; bucket.quantity += -movement.quantity;
    if (reason === 'DAMAGE') bucket.damage += value; else bucket.loss += value; buckets.set(product.id, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.damage !== 0 || item.loss !== 0)
    .map(([id, item]) => ({ id, cells: { product: item.product.name, sku: item.product.sku, quantity: item.quantity, damage: item.damage, loss: item.loss, value: item.damage + item.loss } }))
    .sort((a, b) => Number(b.cells.value) - Number(a.cells.value));
  return { kind: 'shrinkage', title: 'Shrinkage', description: 'Damage and loss valued at snapshotted cost.', generatedAt: now.toISOString(), columns: [{ key: 'product', label: 'Product', type: 'text' }, { key: 'sku', label: 'Product code (SKU)', type: 'text' }, { key: 'quantity', label: 'Units', type: 'number' }, ...moneyCols([['damage', 'Damage'], ['loss', 'Loss'], ['value', 'Total']])], rows, totals: { quantity: sum(rows, 'quantity'), damage: sum(rows, 'damage'), loss: sum(rows, 'loss'), value: sum(rows, 'value') } };
}

function movementRows(ctx: Context, filters: ReportFilters, now: Date): ReportResult {
  const rows = ctx.movements.filter((movement) => {
    const product = ctx.productById.get(movement.productId);
    return inPeriod(movement, filters, now) && allowedProduct(product, filters) && (!filters.type || movement.type === filters.type) && (!filters.reason || movement.reason === filters.reason) && (!filters.actorId || movement.actorId === filters.actorId);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((movement) => {
    const product = ctx.productById.get(movement.productId)!;
    return { id: movement.id, cells: { date: movement.createdAt, product: product.name, sku: product.sku, type: movement.type, reason: movement.reason.replaceAll('_', ' '), quantity: movement.quantity, unitCost: movement.unitCost, unitPrice: movement.unitPrice, actor: movement.actorId ? (ctx.actorNames.get(movement.actorId) ?? 'Unknown user') : 'System', reference: movement.reference } };
  });
  return { kind: 'movements', title: 'Movement audit', description: 'Append-only inventory ledger with complete operational filters.', generatedAt: now.toISOString(), columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'product', label: 'Product', type: 'text' }, { key: 'sku', label: 'Product code (SKU)', type: 'text' }, { key: 'type', label: 'Type', type: 'text' }, { key: 'reason', label: 'Reason', type: 'text' }, { key: 'quantity', label: 'Qty', type: 'number' }, ...moneyCols([['unitCost', 'Unit cost'], ['unitPrice', 'Unit price']]), { key: 'actor', label: 'Actor', type: 'text' }, { key: 'reference', label: 'Reference', type: 'text' }], rows, totals: { quantity: sum(rows, 'quantity') } };
}

export async function getReport(
  filters: ReportFilters,
  options: { now?: Date; repositories?: Repositories; actorNames?: ReadonlyMap<string, string> } = {},
): Promise<ReportResult> {
  const now = options.now ?? new Date(); const repositories = options.repositories ?? db;
  const ctx = await loadContext(repositories, now, options.actorNames ?? new Map());
  switch (filters.report) {
    case 'valuation': return valuation(ctx, filters, now);
    case 'sales': return saleRows(ctx, filters, now);
    case 'profit': return profitRows(ctx, filters, now);
    case 'purchases': return purchaseRows(ctx, filters, now);
    case 'aging': return agingRows(ctx, filters, now);
    case 'shrinkage': return shrinkageRows(ctx, filters, now);
    case 'movements': return movementRows(ctx, filters, now);
  }
}

export async function getReportActorIds(
  now = new Date(), repositories: Repositories = db,
): Promise<Array<string | null>> {
  const movements = await repositories.movements.findByDateRange(epoch, now);
  return movements.map((movement) => movement.actorId);
}
