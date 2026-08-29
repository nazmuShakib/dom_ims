import { db } from '@/repositories';
import { uuidv7, idempotencyKey } from '@/lib/ids';
import { taka, formatBDT } from '@/lib/money';
import { receiveStock, recordStockOut, getOnHand, reconcile } from '@/services/stock';
import { invalidate } from '@/repositories/json/store';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Wipes /data and rebuilds it with realistic demo stock, so there's something to
 * click through while the UI gets built. Run: npm run seed
 */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const now = () => new Date().toISOString();

async function main() {
  await fs.rm(path.join(process.cwd(), 'data'), { recursive: true, force: true });
  invalidate();

  // --- Users -------------------------------------------------------------
  const admin = await db.users.create({
    id: uuidv7(), name: 'Shop Owner', email: 'owner@shop.test',
    emailVerified: true, phoneNumber: null, phoneNumberVerified: false,
    image: null, role: 'ADMIN', isActive: true,
  });
  await db.users.create({
    id: uuidv7(), name: 'Counter Staff', email: 'staff@shop.test',
    emailVerified: true, phoneNumber: null, phoneNumberVerified: false,
    image: null, role: 'STAFF', isActive: true,
  });

  // --- Catalog -----------------------------------------------------------
  const mk = async (name: string) =>
    db.categories.create({ id: uuidv7(), name, slug: slug(name), parentId: null, isActive: true });

  const phones = await mk('Mobile Phones');
  const laptops = await mk('Laptops');
  const accessories = await mk('Accessories');

  const brand = async (name: string) =>
    db.brands.create({ id: uuidv7(), name, slug: slug(name), isActive: true });

  const samsung = await brand('Samsung');
  const apple = await brand('Apple');
  const generic = await brand('Generic');

  const supplier = await db.suppliers.create({
    id: uuidv7(), name: 'Dhaka Electronics Importers', phone: '+8801700000000',
    email: 'sales@dei.test', address: 'Motijheel, Dhaka', note: null, isActive: true,
  });

  // --- Products ----------------------------------------------------------
  const product = async (p: {
    sku: string; name: string; model: string | null; categoryId: string; brandId: string;
    tracking: 'SERIAL' | 'QUANTITY'; cost: number; price: number; reorder: number;
  }) =>
    db.products.create({
      id: uuidv7(), sku: p.sku, barcode: null, name: p.name, description: null,
      model: p.model, trackingType: p.tracking, categoryId: p.categoryId, brandId: p.brandId,
      defaultCostPrice: taka(p.cost), defaultSalePrice: taka(p.price), staffMaxDiscount: 0, taxRate: 0,
      reorderPoint: p.reorder, quantityOnHand: 0, avgCostPrice: 0, imageUrl: null,
      isActive: true, createdAt: now(), updatedAt: now(),
    });

  const galaxy = await product({
    sku: 'SAM-A55-8-256', name: 'Samsung Galaxy A55 (8/256GB)', model: 'SM-A556E',
    categoryId: phones.id, brandId: samsung.id, tracking: 'SERIAL',
    cost: 42000, price: 47500, reorder: 3,
  });
  const macbook = await product({
    sku: 'APL-MBA-M3-13', name: 'MacBook Air 13" M3 (8/256GB)', model: 'A3113',
    categoryId: laptops.id, brandId: apple.id, tracking: 'SERIAL',
    cost: 138000, price: 152000, reorder: 2,
  });
  const cable = await product({
    sku: 'ACC-USBC-2M', name: 'USB-C to USB-C Cable 2m 60W', model: null,
    categoryId: accessories.id, brandId: generic.id, tracking: 'QUANTITY',
    cost: 250, price: 550, reorder: 20,
  });

  // --- Stock in ----------------------------------------------------------
  await receiveStock({
    productId: galaxy.id, supplierId: supplier.id, unitCost: taka(42000),
    reason: 'PURCHASE', warrantyMonths: 12, location: 'Shelf A1',
    serialNumbers: ['352099001761481', '352099001761482', '352099001761483', '352099001761484'],
    reference: 'CHL-1001', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  await receiveStock({
    productId: macbook.id, supplierId: supplier.id, unitCost: taka(138000),
    reason: 'PURCHASE', warrantyMonths: 12, location: 'Locked Cabinet',
    serialNumbers: ['C02XY1234567', 'C02XY1234568'],
    reference: 'CHL-1002', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  await receiveStock({
    productId: cable.id, supplierId: supplier.id, unitCost: taka(250),
    reason: 'PURCHASE', quantity: 100,
    reference: 'CHL-1003', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  // --- Stock out (sales, damage) -----------------------------------------
  await recordStockOut({
    productId: galaxy.id, reason: 'SALE', serialNo: '352099001761481',
    salePrice: taka(47500), customerName: 'Rahim Uddin', customerPhone: '+8801811111111',
    reference: 'MEMO-2001', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  await recordStockOut({
    productId: macbook.id, reason: 'SALE', serialNo: 'C02XY1234567',
    salePrice: taka(150000), customerName: 'Nusrat Jahan',
    reference: 'MEMO-2002', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  await recordStockOut({
    productId: cable.id, reason: 'SALE', quantity: 12, salePrice: taka(550),
    reference: 'MEMO-2003', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  await recordStockOut({
    productId: cable.id, reason: 'DAMAGE', quantity: 3,
    note: 'Crushed in transit', actorId: admin.id, idempotencyKey: idempotencyKey(),
  });

  // --- Report ------------------------------------------------------------
  console.log('\nSeeded. On-hand:\n');
  for (const p of await db.products.findAll()) {
    const onHand = await getOnHand(p);
    console.log(
      `  ${p.sku.padEnd(16)} ${String(onHand).padStart(3)} x  ${p.name}` +
        (onHand <= p.reorderPoint ? '   [LOW STOCK]' : ''),
    );
  }

  const drift = await reconcile();
  console.log(
    drift.length === 0
      ? '\nReconciliation: OK — every product\'s on-hand equals SUM(ledger).\n'
      : `\nReconciliation: ${drift.length} PRODUCT(S) DRIFTED — a transaction was missed:\n${JSON.stringify(drift, null, 2)}\n`,
  );

  const galaxyUnit = await db.units.findBySerial('352099001761481');
  if (galaxyUnit?.salePrice) {
    const profit = galaxyUnit.salePrice - galaxyUnit.costPrice;
    console.log(
      `Exact profit on IMEI 352099001761481: ` +
        `${formatBDT(galaxyUnit.salePrice)} - ${formatBDT(galaxyUnit.costPrice)} = ${formatBDT(profit)}`,
    );
    console.log('(No FIFO, no weighted average — the unit carries its own cost.)\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
