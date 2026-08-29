import { db } from '@/repositories';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { PageHeader } from '@/components/ui';
import { SupplierReturnRegister, type SupplierReturnRow } from '@/components/suppliers/SupplierReturnRegister';
import type { SupplierReturnFilterValues } from '@/components/suppliers/SupplierReturnRegister';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function dhakaDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default async function SupplierReturnsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const rawParams = await searchParams;
  const allowedStatuses = ['PENDING', 'SETTLED', 'AWAITING_REPLACEMENT', 'CANCELLED'];
  const allowedActions = ['SETTLEMENT', 'REPLACEMENT', 'COMPLETED'];
  const allowedMethods = ['CASH', 'MOBILE_BANKING', 'BANK_TRANSFER', 'SUPPLIER_CREDIT', 'MIXED', 'OTHER', 'NO_RECOVERY'];
  const allowedOrders = ['newest', 'oldest', 'recovered-desc', 'recovered-asc', 'cost-desc', 'cost-asc', 'difference-desc', 'difference-asc'];
  const requestedOrder = one(rawParams, 'order');
  const confirmedFilters: SupplierReturnFilterValues = {
    q: one(rawParams, 'q'),
    from: one(rawParams, 'from'),
    to: one(rawParams, 'to'),
    supplier: one(rawParams, 'supplier'),
    status: allowedStatuses.includes(one(rawParams, 'status')) ? one(rawParams, 'status') : '',
    action: allowedActions.includes(one(rawParams, 'action')) ? one(rawParams, 'action') : '',
    recoveryMethod: allowedMethods.includes(one(rawParams, 'recoveryMethod')) ? one(rawParams, 'recoveryMethod') : '',
    order: allowedOrders.includes(requestedOrder) ? requestedOrder : 'newest',
  };
  await requirePageCapability('MANAGE_CATALOG');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const [returns, movements, suppliers] = await Promise.all([
    db.supplierReturns.findAll(),
    db.movements.findByDateRange(new Date(0), new Date()),
    db.suppliers.findAll(),
  ]);
  const reversedMovementIds = new Set(movements.map((movement) => movement.reversesId).filter((id): id is string => Boolean(id)));
  const completedReplacementReferences = new Set(movements
    .filter((movement) => movement.reason === 'PURCHASE' && movement.quantity > 0 && movement.reference && !reversedMovementIds.has(movement.id))
    .map((movement) => movement.reference as string));
  const allRows = (await Promise.all(returns.map(async (item): Promise<SupplierReturnRow | null> => {
    const movement = await db.movements.findById(item.movementId);
    if (!movement) return null;
    const [product, supplier, unit] = await Promise.all([
      db.products.findById(movement.productId),
      db.suppliers.findById(item.supplierId),
      movement.unitId ? db.units.findById(movement.unitId) : Promise.resolve(null),
    ]);
    return {
      id: item.id, returnNumber: item.returnNumber, status: item.status, reason: item.reason,
      supplierId: item.supplierId, supplierName: supplier?.name ?? 'Unknown supplier',
      productName: product?.name ?? 'Unknown product', sku: product?.sku ?? '—', serialNo: unit?.serialNo ?? null,
      quantity: Math.abs(movement.quantity), originalCost: Math.abs(movement.quantity) * movement.unitCost,
      recoveredAmount: item.recoveredAmount, recoveryMethod: item.recoveryMethod,
      settlementReference: item.settlementReference, sentAt: item.sentAt,
      replacementReceived: item.recoveryMethod === 'SUPPLIER_CREDIT' && completedReplacementReferences.has(item.returnNumber),
    };
  }))).filter((row): row is SupplierReturnRow => row !== null);

  const query = confirmedFilters.q.toLocaleLowerCase();
  const awaitingReplacement = (row: SupplierReturnRow) => row.status === 'SETTLED' && row.recoveryMethod === 'SUPPLIER_CREDIT' && !row.replacementReceived;
  const rows = allRows.filter((row) => {
    const date = dhakaDate(row.sentAt);
    if (confirmedFilters.from && date < confirmedFilters.from) return false;
    if (confirmedFilters.to && date > confirmedFilters.to) return false;
    if (confirmedFilters.supplier && row.supplierId !== confirmedFilters.supplier) return false;
    if (confirmedFilters.status === 'AWAITING_REPLACEMENT' && !awaitingReplacement(row)) return false;
    if (confirmedFilters.status && confirmedFilters.status !== 'AWAITING_REPLACEMENT' && row.status !== confirmedFilters.status) return false;
    if (confirmedFilters.status === 'SETTLED' && awaitingReplacement(row)) return false;
    if (confirmedFilters.action === 'SETTLEMENT' && row.status !== 'PENDING') return false;
    if (confirmedFilters.action === 'REPLACEMENT' && !awaitingReplacement(row)) return false;
    if (confirmedFilters.action === 'COMPLETED' && (row.status === 'PENDING' || awaitingReplacement(row))) return false;
    if (confirmedFilters.recoveryMethod && row.recoveryMethod !== confirmedFilters.recoveryMethod) return false;
    if (query && ![row.returnNumber, row.productName, row.sku, row.serialNo].some((value) => value?.toLocaleLowerCase().includes(query))) return false;
    return true;
  }).sort((a, b) => {
    const recoveredA = awaitingReplacement(a) ? 0 : (a.recoveredAmount ?? 0);
    const recoveredB = awaitingReplacement(b) ? 0 : (b.recoveredAmount ?? 0);
    const differenceA = a.status === 'CANCELLED' ? 0 : recoveredA - a.originalCost;
    const differenceB = b.status === 'CANCELLED' ? 0 : recoveredB - b.originalCost;
    if (confirmedFilters.order === 'oldest') return a.sentAt.localeCompare(b.sentAt);
    if (confirmedFilters.order === 'recovered-desc') return recoveredB - recoveredA;
    if (confirmedFilters.order === 'recovered-asc') return recoveredA - recoveredB;
    if (confirmedFilters.order === 'cost-desc') return b.originalCost - a.originalCost;
    if (confirmedFilters.order === 'cost-asc') return a.originalCost - b.originalCost;
    if (confirmedFilters.order === 'difference-desc') return differenceB - differenceA;
    if (confirmedFilters.order === 'difference-asc') return differenceA - differenceB;
    return b.sentAt.localeCompare(a.sentAt);
  });

  return <><PageHeader title={t('supplierReturns.title')} count={t('supplierReturns.help')} /><SupplierReturnRegister
    rows={rows}
    totalCount={allRows.length}
    confirmedFilters={confirmedFilters}
    suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
    resultVersion={crypto.randomUUID()}
  /></>;
}
