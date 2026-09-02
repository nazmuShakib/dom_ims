import type { Product, ProductUnit, Role, StockMovement, User } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import { canSeeCosts } from '@/lib/permissions';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';

const DAY_MS = 86_400_000;

export interface DashboardProductRow {
  productId: string;
  name: string;
  sku: string;
  onHand: number;
  reorderPoint: number;
}

export interface DashboardActivity {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  reason: StockMovement['reason'];
  quantity: number;
  actorId: string | null;
  actorName: string;
  createdAt: string;
}

export interface WarrantyAlert {
  unitId: string;
  serialNo: string;
  productId: string;
  productName: string;
  status: ProductUnit['status'];
  warrantyExpiresAt: string;
  daysRemaining: number;
}

export interface MoverRow extends DashboardProductRow {
  movedUnits: number;
}

export type DashboardPeriod = 'day' | 'week' | 'month';
export type DashboardPeriodKey = DashboardPeriod;

export interface DashboardPeriodMetrics {
  revenue: Paisa;
  cogs: Paisa;
  grossProfit: Paisa;
  operatingExpenses: Paisa;
  shrinkage: Paisa;
  internalUseCost: Paisa;
  operatingProfit: Paisa;
}

export interface DashboardPeriodComparison {
  current: DashboardPeriodMetrics;
  previous: DashboardPeriodMetrics;
}

export interface DailyOperationsPoint {
  date: string;
  stockIn: number;
  stockOut: number;
}

export interface DailyFinancialPoint {
  date: string;
  stockValue: Paisa;
  revenue: Paisa;
  margin: Paisa;
  refunds: Paisa;
}

interface DashboardCommon {
  generatedAt: string;
  totalUnits: number;
  distinctSkus: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStock: DashboardProductRow[];
  deadStock: Array<DashboardProductRow & { lastOutAt: string | null; inactiveDays: number | null }>;
  recentActivity: DashboardActivity[];
  recentActivityByPeriod: Record<DashboardPeriodKey, DashboardActivity[]>;
  expiringWarranties: WarrantyAlert[];
  topMovers: MoverRow[];
  slowMovers: MoverRow[];
  topMoversByPeriod: Record<DashboardPeriodKey, MoverRow[]>;
  slowMoversByPeriod: Record<DashboardPeriodKey, MoverRow[]>;
  dailyOperations: DailyOperationsPoint[];
  periodStarts: Record<DashboardPeriodKey, string>;
}

export interface StaffDashboardDTO extends DashboardCommon {
  canSeeFinancials: false;
}

export interface FinancialDashboardDTO extends DashboardCommon {
  canSeeFinancials: true;
  stockValueAtCost: Paisa;
  stockValueAtRetail: Paisa;
  potentialMargin: Paisa;
  monthRevenue: Paisa;
  monthCogs: Paisa;
  monthGrossProfit: Paisa;
  monthOperatingExpenses: Paisa;
  monthShrinkage: Paisa;
  monthInternalUseCost: Paisa;
  monthOperatingProfit: Paisa;
  dailyFinancials: DailyFinancialPoint[];
  periodMetrics: Record<DashboardPeriodKey, DashboardPeriodComparison>;
}

export type DashboardDTO = StaffDashboardDTO | FinancialDashboardDTO;

function startOfDhakaDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // Dhaka is UTC+6 year-round.
  return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00+06:00`);
}

function dhakaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function monthStartDhaka(now: Date): Date {
  const day = startOfDhakaDay(now);
  const [year, month] = dhakaDateKey(day).split('-').map(Number);
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+06:00`);
}

const PERIODS: DashboardPeriod[] = ['day', 'week', 'month'];

function previousMonthStart(currentMonthStart: Date): Date {
  const [year = currentMonthStart.getUTCFullYear(), month = currentMonthStart.getUTCMonth() + 1] = dhakaDateKey(currentMonthStart).split('-').map(Number);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return new Date(`${previous.year}-${String(previous.month).padStart(2, '0')}-01T00:00:00+06:00`);
}

function periodBounds(now: Date, period: DashboardPeriod) {
  const today = startOfDhakaDay(now);
  if (period === 'day') {
    const previousStart = new Date(today.getTime() - DAY_MS);
    return { currentStart: today, previousStart, previousEnd: today };
  }
  if (period === 'week') {
    const dayOfWeek = new Date(`${dhakaDateKey(today)}T00:00:00Z`).getUTCDay();
    const daysSinceFriday = (dayOfWeek - 5 + 7) % 7;
    const currentStart = new Date(today.getTime() - daysSinceFriday * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - 7 * DAY_MS);
    return { currentStart, previousStart, previousEnd: currentStart };
  }
  const currentStart = monthStartDhaka(now);
  const previousStart = previousMonthStart(currentStart);
  return { currentStart, previousStart, previousEnd: currentStart };
}

function movementFinancials(
  movement: StockMovement,
  movementById: Map<string, StockMovement>,
): { revenue: Paisa; cogs: Paisa } {
  const isSale = movement.reason === 'SALE';
  const reversed = movement.reversesId ? movementById.get(movement.reversesId) : null;
  const reversesSale = movement.reason === 'CORRECTION' && reversed?.reason === 'SALE';
  if (!isSale && !reversesSale) return { revenue: 0, cogs: 0 };

  return {
    revenue: movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice,
    cogs: -movement.quantity * movement.unitCost,
  };
}

export async function getDashboard(
  role: Role,
  now = new Date(),
  repositories: Repositories = db,
): Promise<DashboardDTO> {
  const financialHistoryStart = new Date(startOfDhakaDay(now).getTime() - 61 * DAY_MS);
  const [products, movements, users, voidedSales] = await Promise.all([
    repositories.products.findAll(),
    repositories.movements.findByDateRange(new Date(0), now),
    repositories.users.findAll(),
    canSeeCosts(role)
      ? repositories.sales.findVoidedByDateRange(financialHistoryStart, now)
      : Promise.resolve([]),
  ]);
  const unitsByProduct = new Map<string, ProductUnit[]>();
  await Promise.all(
    products.map(async (product) => {
      unitsByProduct.set(
        product.id,
        product.trackingType === 'SERIAL' ? await repositories.units.findByProduct(product.id) : [],
      );
    }),
  );

  const productById = new Map(products.map((product) => [product.id, product]));
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  const reversedMovementIds = new Set(
    movements
      .filter((movement) => movement.reason === 'CORRECTION' && movement.reversesId)
      .map((movement) => movement.reversesId!),
  );
  const isEffectiveOperation = (movement: StockMovement) => (
    movement.reason !== 'CORRECTION' && !reversedMovementIds.has(movement.id)
  );
  const userById = new Map(users.map((user: User) => [user.id, user.name]));
  const onHand = new Map<string, number>();

  for (const product of products) {
    onHand.set(
      product.id,
      product.trackingType === 'SERIAL'
        ? (unitsByProduct.get(product.id) ?? []).filter((unit) => unit.status === 'IN_STOCK').length
        : product.quantityOnHand,
    );
  }

  const activeProducts = products.filter((product) => product.isActive);
  const row = (product: Product): DashboardProductRow => ({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    onHand: onHand.get(product.id) ?? 0,
    reorderPoint: product.reorderPoint,
  });
  const lowStock = activeProducts
    .filter((product) => (onHand.get(product.id) ?? 0) > 0 && (onHand.get(product.id) ?? 0) <= product.reorderPoint)
    .map(row)
    .sort((a, b) => a.onHand - b.onHand);
  const outOfStock = activeProducts.filter((product) => (onHand.get(product.id) ?? 0) === 0);

  const cutoff60 = new Date(now.getTime() - 60 * DAY_MS);
  const recentOutboundByProduct = new Map<string, StockMovement[]>();
  const firstInboundByProduct = new Map<string, StockMovement>();
  for (const movement of movements) {
    if (movement.quantity < 0 && isEffectiveOperation(movement)) {
      const list = recentOutboundByProduct.get(movement.productId) ?? [];
      list.push(movement);
      recentOutboundByProduct.set(movement.productId, list);
    }
    if (movement.quantity > 0 && isEffectiveOperation(movement)) {
      const first = firstInboundByProduct.get(movement.productId);
      if (!first || movement.createdAt < first.createdAt) {
        firstInboundByProduct.set(movement.productId, movement);
      }
    }
  }

  const deadStock = activeProducts
    .filter((product) => (onHand.get(product.id) ?? 0) > 0)
    .map((product) => {
      const latest = (recentOutboundByProduct.get(product.id) ?? []).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      const lastOutAt = latest?.createdAt ?? null;
      const inactivityStartedAt = lastOutAt
        ?? firstInboundByProduct.get(product.id)?.createdAt
        ?? product.createdAt;
      const inactiveDays = Math.max(0, Math.floor(
        (now.getTime() - new Date(inactivityStartedAt).getTime()) / DAY_MS,
      ));
      return { ...row(product), lastOutAt, inactiveDays };
    })
    .filter((item) => item.inactiveDays >= 60
      && (item.lastOutAt === null || new Date(item.lastOutAt) <= cutoff60))
    .sort((a, b) => b.inactiveDays - a.inactiveDays);

  const activityRows = [...movements]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((movement): DashboardActivity => {
      const product = productById.get(movement.productId);
      return {
        id: movement.id,
        productId: movement.productId,
        productName: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '—',
        reason: movement.reason,
        quantity: movement.quantity,
        actorId: movement.actorId,
        actorName: userById.get(movement.actorId ?? '') ?? (movement.actorId ? 'Authenticated user' : 'System'),
        createdAt: movement.createdAt,
      };
    });
  const recentActivity = activityRows.slice(0, 20);
  const recentActivityByPeriod = Object.fromEntries(PERIODS.map((period) => {
    const { currentStart } = periodBounds(now, period);
    return [period, activityRows.filter((item) => new Date(item.createdAt) >= currentStart).slice(0, 20)];
  })) as Record<DashboardPeriodKey, DashboardActivity[]>;

  const warrantyEnd = new Date(now.getTime() + 30 * DAY_MS);
  const expiringWarranties = products
    .flatMap((product) =>
      (unitsByProduct.get(product.id) ?? []).map((unit) => ({ product, unit })),
    )
    .filter(({ unit }) => {
      if (!unit.warrantyExpiresAt || unit.status === 'VOID') return false;
      const expiry = new Date(unit.warrantyExpiresAt);
      return expiry >= now && expiry <= warrantyEnd;
    })
    .map(({ product, unit }): WarrantyAlert => ({
      unitId: unit.id,
      serialNo: unit.serialNo,
      productId: product.id,
      productName: product.name,
      status: unit.status,
      warrantyExpiresAt: unit.warrantyExpiresAt!,
      daysRemaining: Math.ceil((new Date(unit.warrantyExpiresAt!).getTime() - now.getTime()) / DAY_MS),
    }))
    .sort((a, b) => a.warrantyExpiresAt.localeCompare(b.warrantyExpiresAt));

  const moverSets = Object.fromEntries(PERIODS.map((period) => {
    const { currentStart } = periodBounds(now, period);
    const counts = new Map<string, number>();
    for (const movement of movements) {
      if (new Date(movement.createdAt) < currentStart || movement.quantity >= 0 || !isEffectiveOperation(movement)) continue;
      counts.set(movement.productId, (counts.get(movement.productId) ?? 0) + Math.abs(movement.quantity));
    }
    const rows = activeProducts
      .filter((product) => (onHand.get(product.id) ?? 0) > 0 || (counts.get(product.id) ?? 0) > 0)
      .map((product): MoverRow => ({ ...row(product), movedUnits: counts.get(product.id) ?? 0 }));
    return [period, {
      top: [...rows].filter((item) => item.movedUnits > 0)
        .sort((a, b) => b.movedUnits - a.movedUnits).slice(0, 5),
      slow: [...rows].filter((item) => item.onHand > 0)
        .sort((a, b) => a.movedUnits - b.movedUnits || b.onHand - a.onHand).slice(0, 5),
    }];
  })) as Record<DashboardPeriodKey, { top: MoverRow[]; slow: MoverRow[] }>;
  const topMoversByPeriod = Object.fromEntries(PERIODS.map((period) => [period, moverSets[period].top])) as Record<DashboardPeriodKey, MoverRow[]>;
  const slowMoversByPeriod = Object.fromEntries(PERIODS.map((period) => [period, moverSets[period].slow])) as Record<DashboardPeriodKey, MoverRow[]>;
  const topMovers = topMoversByPeriod.month;
  const slowMovers = slowMoversByPeriod.month;

  const dayStart = startOfDhakaDay(now);
  const dayKeys = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(dayStart.getTime() - (30 - index) * DAY_MS);
    return dhakaDateKey(date);
  });
  const financialDayKeys = Array.from({ length: 62 }, (_, index) => {
    const date = new Date(dayStart.getTime() - (61 - index) * DAY_MS);
    return dhakaDateKey(date);
  });
  const operations = new Map(dayKeys.map((date) => [date, { stockIn: 0, stockOut: 0 }]));
  const financials = new Map(financialDayKeys.map((date) => [date, { revenue: 0, margin: 0, refunds: 0 }]));

  for (const movement of movements) {
    const key = dhakaDateKey(new Date(movement.createdAt));
    const operation = operations.get(key);
    if (operation && isEffectiveOperation(movement)) {
      if (movement.quantity > 0) operation.stockIn += movement.quantity;
      if (movement.quantity < 0) operation.stockOut += Math.abs(movement.quantity);
    }
    const financial = financials.get(key);
    // Performance charts show only sales that remain valid. Corrections and the
    // original movements they reverse stay in the ledger, but neither is drawn
    // as a new sale or as negative sales performance.
    if (financial && isEffectiveOperation(movement)) {
      const values = movementFinancials(movement, movementById);
      financial.revenue += values.revenue;
      financial.margin += values.revenue - values.cogs;
    }
  }
  for (const sale of voidedSales) {
    if (!sale.voidedAt || !sale.refundAmount) continue;
    const financial = financials.get(dhakaDateKey(new Date(sale.voidedAt)));
    if (financial) financial.refunds += sale.refundAmount;
  }

  const common: DashboardCommon = {
    generatedAt: now.toISOString(),
    totalUnits: [...onHand.values()].reduce((sum, quantity) => sum + quantity, 0),
    distinctSkus: activeProducts.filter((product) => (onHand.get(product.id) ?? 0) > 0).length,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    lowStock: [...outOfStock.map(row), ...lowStock].slice(0, 10),
    deadStock: deadStock.slice(0, 10),
    recentActivity,
    recentActivityByPeriod,
    expiringWarranties: expiringWarranties.slice(0, 10),
    topMovers,
    slowMovers,
    topMoversByPeriod,
    slowMoversByPeriod,
    dailyOperations: dayKeys.map((date) => ({ date, ...operations.get(date)! })),
    periodStarts: Object.fromEntries(PERIODS.map((period) => [period, dhakaDateKey(periodBounds(now, period).currentStart)])) as Record<DashboardPeriodKey, string>,
  };

  if (!canSeeCosts(role)) return { ...common, canSeeFinancials: false };

  let stockValueAtCost = 0;
  let stockValueAtRetail = 0;
  for (const product of products) {
    const quantity = onHand.get(product.id) ?? 0;
    if (product.trackingType === 'SERIAL') {
      const inStockUnits = (unitsByProduct.get(product.id) ?? [])
        .filter((unit) => unit.status === 'IN_STOCK');
      stockValueAtCost += inStockUnits.reduce((sum, unit) => sum + unit.costPrice, 0);
      stockValueAtRetail += inStockUnits.reduce(
        (sum, unit) => sum + (
          unit.askingPrice
          ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice)
        ),
        0,
      );
    } else {
      stockValueAtCost += quantity * product.avgCostPrice;
      stockValueAtRetail += quantity * product.defaultSalePrice;
    }
  }

  const monthStart = monthStartDhaka(now);
  let monthRevenue = 0;
  let monthCogs = 0;
  for (const movement of movements) {
    if (new Date(movement.createdAt) < monthStart) continue;
    if (!isEffectiveOperation(movement)) continue;
    const values = movementFinancials(movement, movementById);
    monthRevenue += values.revenue;
    monthCogs += values.cogs;
  }
  const sixtyDayStart = periodBounds(now, 'month').previousStart;
  const expenseQueryStart = monthStart < sixtyDayStart ? monthStart : sixtyDayStart;
  const periodExpenses = await repositories.operatingExpenses.findAll({
    from: expenseQueryStart,
    to: now,
    status: 'ACTIVE',
  }, null);
  const monthExpenses = periodExpenses.filter((expense) => new Date(expense.expenseDate) >= monthStart);
  const monthOperatingExpenses = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthShrinkage = movements
    .filter((movement) => new Date(movement.createdAt) >= monthStart
      && isEffectiveOperation(movement)
      && (movement.reason === 'DAMAGE' || movement.reason === 'LOSS'))
    .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCost, 0);
  const monthInternalUseCost = movements
    .filter((movement) => new Date(movement.createdAt) >= monthStart
      && isEffectiveOperation(movement)
      && (movement.reason === 'INTERNAL_USE'
        || movement.reason === 'SHOP_USE'
        || movement.reason === 'GIFT'))
    .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCost, 0);
  const monthGrossProfit = monthRevenue - monthCogs;

  const metricsFor = (from: Date, to: Date): DashboardPeriodMetrics => {
    let revenue = 0;
    let cogs = 0;
    for (const movement of movements) {
      const occurredAt = new Date(movement.createdAt);
      if (occurredAt < from || occurredAt >= to) continue;
      if (!isEffectiveOperation(movement)) continue;
      const values = movementFinancials(movement, movementById);
      revenue += values.revenue;
      cogs += values.cogs;
    }
    const operatingExpenses = periodExpenses
      .filter((expense) => {
        const occurredAt = new Date(expense.expenseDate);
        return occurredAt >= from && occurredAt < to;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
    const effectiveMovements = movements.filter((movement) => {
      const occurredAt = new Date(movement.createdAt);
      return occurredAt >= from && occurredAt < to && isEffectiveOperation(movement);
    });
    const shrinkage = effectiveMovements
      .filter((movement) => movement.reason === 'DAMAGE' || movement.reason === 'LOSS')
      .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCost, 0);
    const internalUseCost = effectiveMovements
      .filter((movement) => movement.reason === 'INTERNAL_USE' || movement.reason === 'SHOP_USE' || movement.reason === 'GIFT')
      .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCost, 0);
    const grossProfit = revenue - cogs;
    return {
      revenue,
      cogs,
      grossProfit,
      operatingExpenses,
      shrinkage,
      internalUseCost,
      operatingProfit: grossProfit - operatingExpenses - shrinkage - internalUseCost,
    };
  };
  const periodMetrics = Object.fromEntries(PERIODS.map((period) => {
    const { currentStart, previousStart, previousEnd } = periodBounds(now, period);
    return [period, {
      current: metricsFor(currentStart, new Date(now.getTime() + 1)),
      previous: metricsFor(previousStart, previousEnd),
    }];
  })) as Record<DashboardPeriodKey, DashboardPeriodComparison>;

  const rangeStart = new Date(`${financialDayKeys[0]}T00:00:00+06:00`);
  const refurbishmentExpenses = await repositories.refurbishmentExpenses.findAll();
  const stockValueDeltaByDay = new Map(financialDayKeys.map((date) => [date, 0]));
  let runningStockValue = movements
    .filter((movement) => new Date(movement.createdAt) < rangeStart)
    .reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);
  runningStockValue += refurbishmentExpenses
    .filter((expense) => new Date(expense.createdAt) < rangeStart)
    .reduce((sum, expense) => sum + expense.amount, 0);
  for (const movement of movements) {
    const key = dhakaDateKey(new Date(movement.createdAt));
    if (stockValueDeltaByDay.has(key)) {
      stockValueDeltaByDay.set(
        key,
        stockValueDeltaByDay.get(key)! + movement.quantity * movement.unitCost,
      );
    }
  }
  for (const expense of refurbishmentExpenses) {
    const key = dhakaDateKey(new Date(expense.createdAt));
    if (stockValueDeltaByDay.has(key)) {
      stockValueDeltaByDay.set(key, stockValueDeltaByDay.get(key)! + expense.amount);
    }
  }
  const dailyFinancials = financialDayKeys.map((date): DailyFinancialPoint => {
    runningStockValue += stockValueDeltaByDay.get(date)!;
    const values = financials.get(date)!;
    return {
      date,
      stockValue: runningStockValue,
      revenue: values.revenue,
      margin: values.margin,
      refunds: values.refunds,
    };
  });

  return {
    ...common,
    canSeeFinancials: true,
    stockValueAtCost,
    stockValueAtRetail,
    potentialMargin: stockValueAtRetail - stockValueAtCost,
    monthRevenue,
    monthCogs,
    monthGrossProfit,
    monthOperatingExpenses,
    monthShrinkage,
    monthInternalUseCost,
    monthOperatingProfit: monthGrossProfit - monthOperatingExpenses - monthShrinkage - monthInternalUseCost,
    dailyFinancials,
    periodMetrics,
  };
}
