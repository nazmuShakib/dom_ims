import Link from 'next/link';

import { db } from '@/repositories';
import { canSeeCosts, getAuthUserNames, getSession } from '@/lib/session';
import { ReverseButton } from '@/components/stock/ReverseButton';
import { MovementWorkspace } from '@/components/stock/MovementWorkspace';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  SerialChip,
  TableViewport,
} from '@/components/ui';
import {
  MOVEMENT_REASONS,
  MOVEMENT_TYPES,
  type MovementReason,
  type MovementType,
} from '@/domain/types';
import { createTranslator, type MessageKey } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

const REASON_LABEL: Record<MovementReason, MessageKey> = {
  INITIAL_STOCK: 'reason.initialStock',
  PURCHASE: 'reason.purchase',
  TRADE_IN: 'reason.tradeIn',
  CUSTOMER_RETURN: 'reason.customerReturn',
  SALE: 'reason.sale',
  RETURN_TO_SUPPLIER: 'reason.returnSupplier',
  DAMAGE: 'reason.damage',
  LOSS: 'reason.loss',
  INTERNAL_USE: 'reason.internalUse',
  SHOP_USE: 'reason.shopUse',
  GIFT: 'reason.gift',
  WARRANTY_REPLACEMENT: 'reason.warrantyReplacement',
  CORRECTION: 'reason.correction',
  STOCK_COUNT: 'reason.stockCount',
};

const stamp = (iso: string, _locale: Locale) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function dateBoundary(value: string, endOfDay = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+06:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const rawParams = await searchParams;
  const query = one(rawParams, 'q');
  const from = one(rawParams, 'from');
  const to = one(rawParams, 'to');
  const productFilter = one(rawParams, 'product');
  const typeValue = one(rawParams, 'type');
  const reasonValue = one(rawParams, 'reason');
  const actorFilter = one(rawParams, 'actor');
  const order = one(rawParams, 'order') === 'oldest' ? 'oldest' : 'newest';
  const reason = MOVEMENT_REASONS.includes(reasonValue as MovementReason)
    ? reasonValue as MovementReason
    : undefined;
  const type = MOVEMENT_TYPES.includes(typeValue as MovementType)
    ? typeValue as MovementType
    : undefined;
  const fromDate = dateBoundary(from) ?? new Date(0);
  const toDate = dateBoundary(to, true) ?? new Date();
  const invalidDateRange = fromDate > toDate;

  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);
  const canReverse = role === 'ADMIN' || role === 'MANAGER';

  const [candidateMovements, products, users, corrections, exactUnit] = await Promise.all([
    invalidDateRange
      ? Promise.resolve([])
      : db.movements.findByDateRange(fromDate, toDate, {
          reason,
          productId: productFilter || undefined,
          type,
          actorId: actorFilter || undefined,
        }),
    db.products.findAll(),
    db.users.findAll(),
    db.movements.findByDateRange(new Date(0), new Date(), { reason: 'CORRECTION' }),
    query ? db.units.findBySerial(query) : Promise.resolve(null),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const normalizedQuery = query.toLocaleLowerCase();
  const filteredMovements = normalizedQuery
    ? candidateMovements.filter((movement) => {
        const product = productById.get(movement.productId);
        return product?.name.toLocaleLowerCase().includes(normalizedQuery)
          || product?.sku.toLocaleLowerCase().includes(normalizedQuery)
          || movement.reference?.toLocaleLowerCase().includes(normalizedQuery)
          || movement.note?.toLocaleLowerCase().includes(normalizedQuery)
          || movement.unitId === exactUnit?.id;
      })
    : candidateMovements;

  const actorNameById = new Map(users.map((user) => [user.id, user.name]));
  const authActorNames = await getAuthUserNames(filteredMovements.map((movement) => movement.actorId));
  for (const [id, name] of authActorNames) actorNameById.set(id, name);

  const reversedIds = new Set(corrections.map((movement) => movement.reversesId).filter(Boolean));
  const sorted = [...filteredMovements].sort((a, b) => (
    order === 'oldest'
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt)
  ));
  const rows = await Promise.all(
    sorted.slice(0, 200).map(async (movement) => {
      const [unit, acquisition, invoiceSale] = await Promise.all([
        movement.unitId ? db.units.findById(movement.unitId) : Promise.resolve(null),
        movement.unitId ? db.usedDeviceAcquisitions.findByUnit(movement.unitId) : Promise.resolve(null),
        movement.reason === 'SALE' && movement.reference
          ? db.sales.findByInvoiceNumber(movement.reference)
          : Promise.resolve(null),
      ]);
      const linkedSale = acquisition?.tradeInSaleId
        ? await db.sales.findById(acquisition.tradeInSaleId)
        : null;
      return { movement, serial: unit?.serialNo ?? null, linkedSale, invoiceSale };
    }),
  );

  const tabs = [
    { reason: '', label: t('ledger.all') },
    { reason: 'PURCHASE', label: t('ledger.purchases') },
    { reason: 'TRADE_IN', label: t('reason.tradeIn') },
    { reason: 'SALE', label: t('ledger.sales') },
    { reason: 'DAMAGE', label: t('ledger.damage') },
    { reason: 'LOSS', label: t('ledger.loss') },
    { reason: 'SHOP_USE', label: t('reason.shopUse') },
    { reason: 'GIFT', label: t('reason.gift') },
    { reason: 'CORRECTION', label: t('ledger.corrections') },
  ];

  return (
    <>
      <PageHeader
        title={t('nav.movementLedger')}
        count={t('ledger.entries', { count: filteredMovements.length })}
      />

      <MovementWorkspace
        tabs={tabs}
        confirmedReason={reason ?? ''}
        resultVersion={crypto.randomUUID()}
      >
        <Card className="mb-4 p-4">
          <form action="/stock/movements" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {reason && <input type="hidden" name="reason" value={reason} />}
            <div className="sm:col-span-2">
              <Field label={t('common.search')}>
                <Input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={t('ledger.searchPlaceholder')}
                />
              </Field>
            </div>
            <Field label={t('invoices.fromDate')}>
              <Input type="date" name="from" defaultValue={from} />
            </Field>
            <Field label={t('invoices.toDate')}>
              <Input type="date" name="to" defaultValue={to} />
            </Field>
            <Field label={t('common.product')}>
              <Select name="product" defaultValue={productFilter}>
                <option value="">{t('ledger.allProducts')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('ledger.direction')}>
              <Select name="type" defaultValue={type ?? ''}>
                <option value="">{t('ledger.allDirections')}</option>
                <option value="IN">{t('ledger.stockIn')}</option>
                <option value="OUT">{t('ledger.stockOut')}</option>
                <option value="ADJUST">{t('ledger.adjustments')}</option>
              </Select>
            </Field>
            <Field label={t('ledger.by')}>
              <Select name="actor" defaultValue={actorFilter}>
                <option value="">{t('ledger.allUsers')}</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </Field>
            <Field label={t('catalog.orderBy')}>
              <Select name="order" defaultValue={order}>
                <option value="newest">{t('ledger.newestFirst')}</option>
                <option value="oldest">{t('ledger.oldestFirst')}</option>
              </Select>
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">{t('common.applyFilters')}</Button>
              <Button type="button" variant="ghost" data-ledger-reset>{t('common.reset')}</Button>
            </div>
          </form>
          {invalidDateRange && <p className="mt-3 text-[12px] text-out">{t('invoices.invalidDates')}</p>}
          <p className="mt-3 text-[11px] text-graphite">{t('ledger.limitHelp')}</p>
        </Card>

        <Card>
          {rows.length === 0 ? (
            <EmptyState title={t('ledger.empty')} />
          ) : (
            <TableViewport>
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-left">{t('ledger.when')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('stock.reason')}</th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('ledger.qty')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('common.cost')}</th>}
                    <th className="eyebrow px-4 py-2.5 text-right">{t('common.price')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('ledger.by')}</th>
                    {canReverse && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ movement, serial, linkedSale, invoiceSale }) => {
                    const product = productById.get(movement.productId);
                    const inbound = movement.quantity > 0;
                    const isCorrection = movement.reason === 'CORRECTION';
                    const wasReversed = reversedIds.has(movement.id);
                    const invoiceOwnedTradeIn = Boolean(linkedSale && movement.reason === 'TRADE_IN');
                    return (
                      <tr key={movement.id} className={`border-b border-rule-soft last:border-0 ${isCorrection ? 'bg-plate/40' : ''}`}>
                        <td className="tnum whitespace-nowrap px-4 py-2.5 text-[12px] text-graphite">{stamp(movement.createdAt, locale)}</td>
                        <td className="px-4 py-2.5">
                          {product ? <Link href={`/products/${product.id}`} className="text-[13px] hover:text-signal">{product.name}</Link> : <span className="text-[13px] text-graphite">—</span>}
                          {serial && <span className="mt-1 block"><SerialChip serial={serial} dim /></span>}
                          {movement.reference && <span className="tnum mt-0.5 block text-[11px] text-graphite">{movement.reference}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={isCorrection ? 'low' : movement.reason === 'SALE' ? 'ok' : inbound ? 'signal' : 'out'}>
                            {t(REASON_LABEL[movement.reason])}
                          </Badge>
                          {movement.note && <span className="mt-1 block max-w-56 text-[11px] text-graphite">{movement.note}</span>}
                          {wasReversed && <span className="mt-1 block text-[11px] text-low">{t('ledger.reversed')}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`tnum text-[13px] font-medium ${inbound ? 'text-ok' : 'text-out'}`}>{inbound ? '+' : ''}{movement.quantity}</span>
                        </td>
                        {showCosts && <td className="px-4 py-2.5 text-right"><Money value={movement.unitCost} muted /></td>}
                        <td className="px-4 py-2.5 text-right"><Money value={movement.unitPrice} /></td>
                        <td className="px-4 py-2.5 text-[12px] text-graphite">
                          {movement.actorId ? (actorNameById.get(movement.actorId) ?? t('ledger.unknownUser')) : t('ledger.system')}
                        </td>
                        {canReverse && (
                          <td className="px-4 py-2.5 text-right">
                            {!isCorrection && !wasReversed && movement.reason !== 'SALE' && !invoiceOwnedTradeIn && (
                              <ReverseButton
                                movementId={movement.id}
                                label={t('ledger.movementLabel', { reason: t(REASON_LABEL[movement.reason]), item: product?.name ?? t('ledger.item') })}
                              />
                            )}
                            {movement.reason === 'SALE' && !wasReversed && invoiceSale && (
                              <Link
                                href={`/invoices/${invoiceSale.id}`}
                                className="text-[11px] text-signal underline underline-offset-2"
                              >
                                Void from its invoice
                              </Link>
                            )}
                            {linkedSale && movement.reason === 'TRADE_IN' && (
                              <Link
                                href={`/invoices/${linkedSale.id}`}
                                className="text-[11px] text-signal underline underline-offset-2"
                              >
                                Managed by {linkedSale.invoiceNumber}
                              </Link>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      </MovementWorkspace>

      <p className="mt-3 text-[12px] text-graphite">{t('ledger.appendOnlyHelp')}</p>
    </>
  );
}
