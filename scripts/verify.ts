import { db } from '@/repositories';
import { idempotencyKey } from '@/lib/ids';
import { taka } from '@/lib/money';
import { recordStockOut, receiveStock, correctMovement, reconcile } from '@/services/stock';

/**
 * The tests that matter most (PLAN.md §15). Run AFTER `npm run seed`.
 *
 *   npm run seed && npx tsx scripts/verify.ts
 *
 * Port these to Vitest in Phase 2 and keep them green forever.
 */

let failures = 0;
function check(name: string, passed: boolean, detail = '') {
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures++;
}

async function main() {
  const admin = await db.users.findByEmail('owner@shop.test');
  const galaxy = await db.products.findBySku('SAM-A55-8-256');
  const cable = await db.products.findBySku('ACC-USBC-2M');
  if (!admin || !galaxy || !cable) throw new Error('Run `npm run seed` first.');

  console.log('\nCritical invariants:\n');

  // 1. THE most important test in the codebase (PLAN.md §15).
  //    Two staff sell the same IMEI at the same instant. Exactly one must win.
  const serial = '352099001761482';
  const results = await Promise.allSettled([
    recordStockOut({
      productId: galaxy.id, reason: 'SALE', serialNo: serial, salePrice: taka(47500),
      actorId: admin.id, idempotencyKey: idempotencyKey(),
    }),
    recordStockOut({
      productId: galaxy.id, reason: 'SALE', serialNo: serial, salePrice: taka(47000),
      actorId: admin.id, idempotencyKey: idempotencyKey(),
    }),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  check('double-sell of one IMEI: exactly one succeeds', ok === 1 && rejected === 1,
    `${ok} succeeded, ${rejected} rejected`);

  // 2. Idempotency — a retried Server Action must not double-decrement.
  const key = idempotencyKey();
  const before = (await db.products.findBySku('ACC-USBC-2M'))!.quantityOnHand;
  const args = {
    productId: cable.id, reason: 'SALE' as const, quantity: 5, salePrice: taka(550),
    actorId: admin.id, idempotencyKey: key,
  };
  const first = await recordStockOut(args);
  const replay = await recordStockOut(args); // same key — must be a no-op
  const after = (await db.products.findBySku('ACC-USBC-2M'))!.quantityOnHand;
  check('replayed idempotency key creates exactly one movement',
    first.id === replay.id && before - after === 5, `stock went ${before} -> ${after}`);

  // 3. Stock cannot go negative.
  let blocked = false;
  try {
    await recordStockOut({
      productId: cable.id, reason: 'SALE', quantity: 99_999, salePrice: taka(550),
      actorId: admin.id, idempotencyKey: idempotencyKey(),
    });
  } catch { blocked = true; }
  check('overselling is rejected', blocked);

  // 4. Unknown serial is rejected.
  let unknownRejected = false;
  try {
    await recordStockOut({
      productId: galaxy.id, reason: 'SALE', serialNo: 'NOT-A-REAL-IMEI',
      salePrice: taka(1), actorId: admin.id, idempotencyKey: idempotencyKey(),
    });
  } catch { unknownRejected = true; }
  check('unknown serial number is rejected', unknownRejected);

  // 5. THE LEDGER INVARIANT — on-hand === SUM(quantity), for every product.
  const drift = await reconcile();
  check('on-hand === SUM(ledger.quantity) for every product', drift.length === 0,
    drift.length ? JSON.stringify(drift) : 'no drift');

  console.log('\nCorrections (PLAN.md §8.3):\n');

  // 6. Reversing a SALE puts the unit back in stock and clears the sale price.
  const soldSerial = '352099001761481'; // sold during seed
  const soldUnit = await db.units.findBySerial(soldSerial);
  const saleMovement = (await db.movements.findByProduct(galaxy.id))
    .find((m) => m.unitId === soldUnit?.id && m.reason === 'SALE');

  await correctMovement({
    movementId: saleMovement!.id,
    note: 'Customer changed their mind',
    actorId: admin.id,
    idempotencyKey: idempotencyKey(),
  });
  const backInStock = await db.units.findBySerial(soldSerial);
  check('reversing a sale returns the unit to stock and clears the sale price',
    backInStock?.status === 'IN_STOCK' && backInStock?.salePrice === null && backInStock?.soldAt === null,
    `status=${backInStock?.status}, salePrice=${backInStock?.salePrice}`);

  // 7. No double-reversal. Reversing twice would move stock twice.
  let doubleBlocked = false;
  try {
    await correctMovement({
      movementId: saleMovement!.id, note: 'again',
      actorId: admin.id, idempotencyKey: idempotencyKey(),
    });
  } catch { doubleBlocked = true; }
  check('a movement cannot be reversed twice', doubleBlocked);

  // 8. Reversing a PURCHASE marks the unit VOID — NOT sold. This was a real bug:
  //    marking it SOLD invented a sale and a profit figure that never happened.
  const freshSerial = '352099001761484';
  const freshUnit = await db.units.findBySerial(freshSerial);
  const purchase = (await db.movements.findByProduct(galaxy.id))
    .find((m) => m.unitId === freshUnit?.id && m.reason === 'PURCHASE');

  await correctMovement({
    movementId: purchase!.id,
    note: 'IMEI typed wrong on the delivery note',
    actorId: admin.id,
    idempotencyKey: idempotencyKey(),
  });
  const voided = await db.units.findBySerial(freshSerial);
  check('reversing a purchase marks the unit VOID, not SOLD',
    voided?.status === 'VOID' && voided?.salePrice === null,
    `status=${voided?.status}`);

  // 9. A VOID serial can be received again — otherwise a typo would burn the IMEI
  //    of a real phone forever.
  await receiveStock({
    productId: galaxy.id, unitCost: taka(42000), reason: 'PURCHASE',
    serialNumbers: [freshSerial], warrantyMonths: 12,
    actorId: admin.id, idempotencyKey: idempotencyKey(),
  });
  const revived = await db.units.findBySerial(freshSerial);
  const allUnits = await db.units.findByProduct(galaxy.id);
  const dupes = allUnits.filter((u) => u.serialNo === freshSerial).length;
  check('a VOID serial can be re-received, reviving the same unit row',
    revived?.status === 'IN_STOCK' && dupes === 1,
    `status=${revived?.status}, rows with that serial=${dupes}`);

  // 10. The invariant STILL holds after all that correction traffic.
  const finalDrift = await reconcile();
  check('ledger still balances after corrections', finalDrift.length === 0,
    finalDrift.length ? JSON.stringify(finalDrift) : 'no drift');

  console.log(failures === 0 ? '\nAll invariants hold.\n' : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
