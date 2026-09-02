import { uuidv7 } from '@/lib/ids';
import { prismaRepositories } from '@/repositories/prisma';
import type { Repositories } from '@/repositories';
import { checkoutCart } from '@/services/checkout';

class RollbackVerification extends Error {}
class AuditWriteVerificationFailure extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.DATA_SOURCE !== 'postgres') {
    throw new Error('db:verify requires DATA_SOURCE=postgres.');
  }

  const categoryId = uuidv7();
  const brandId = uuidv7();
  const supplierId = uuidv7();
  const bulkProductId = uuidv7();
  const serialProductId = uuidv7();
  const unitId = uuidv7();
  const checkoutActorId = uuidv7();
  const customerId = uuidv7();
  const cartId = uuidv7();
  const saleId = uuidv7();
  const atomicCategoryId = uuidv7();
  const atomicProductId = uuidv7();
  const atomicActorId = uuidv7();
  const atomicCartId = uuidv7();
  const atomicCheckoutKey = uuidv7();
  const now = new Date().toISOString();

  try {
    await prismaRepositories.transaction(async (tx) => {
      await tx.categories.create({
        id: categoryId, name: `Verification ${categoryId}`, slug: `verify-${categoryId}`,
        parentId: null, isActive: true,
      });
      await tx.brands.create({
        id: brandId, name: `Verification ${brandId}`, slug: `verify-${brandId}`, isActive: true,
      });
      await tx.suppliers.create({
        id: supplierId, name: `Verification ${supplierId}`, phone: null, email: null,
        address: null, note: null, isActive: true,
      });

      await tx.products.create({
        id: bulkProductId, sku: `VERIFY-BULK-${bulkProductId}`, barcode: null,
        name: `Verification bulk ${bulkProductId}`, description: null, model: null,
        trackingType: 'QUANTITY', categoryId, brandId, defaultCostPrice: 1_000,
        defaultSalePrice: 1_500, staffMaxDiscount: 0, taxRate: 0, reorderPoint: 1, quantityOnHand: 0,
        avgCostPrice: 0, imageUrl: null, isActive: true, createdAt: now, updatedAt: now,
      });
      await tx.products._applyQuantityDelta(bulkProductId, 5, 1_000);
      const bulkMovement = await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'PURCHASE', productId: bulkProductId,
        unitId: null, quantity: 5, unitCost: 1_000, unitPrice: null, supplierId,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      assert((await tx.movements.findByIdempotencyKey(bulkMovement.idempotencyKey!))?.id === bulkMovement.id, 'Idempotency lookup failed.');
      assert(await tx.movements.sumQuantity(bulkProductId) === 5, 'Quantity ledger sum failed.');

      await tx.products.create({
        id: serialProductId, sku: `VERIFY-SERIAL-${serialProductId}`, barcode: null,
        name: `Verification serial ${serialProductId}`, description: null, model: null,
        trackingType: 'SERIAL', categoryId, brandId, defaultCostPrice: 50_000,
        defaultSalePrice: 60_000, staffMaxDiscount: 0, taxRate: 0, reorderPoint: 1, quantityOnHand: 0,
        avgCostPrice: 0, imageUrl: null, isActive: true, createdAt: now, updatedAt: now,
      });
      await tx.units.createMany([{
        id: unitId, serialNo: `VERIFY-${unitId}`, productId: serialProductId,
        status: 'IN_STOCK', costPrice: 50_000, salePrice: null, supplierId,
        receivedAt: now, soldAt: null, warrantyMonths: 12, warrantyExpiresAt: null,
        location: null, note: null, usedGrade: null, batteryHealth: null,
        inspectionResults: null, knownDefects: null, includedAccessories: null,
        askingPrice: null, createdAt: now, updatedAt: now,
      }]);
      await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'PURCHASE', productId: serialProductId,
        unitId, quantity: 1, unitCost: 50_000, unitPrice: null, supplierId,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      await tx.units.transitionStatus(unitId, 'IN_STOCK', 'SOLD', {
        salePrice: 60_000, soldAt: now,
      });
      const saleMovement = await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'SALE', productId: serialProductId,
        unitId, quantity: -1, unitCost: 50_000, unitPrice: 60_000, supplierId: null,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      assert(await tx.units.countInStock(serialProductId) === 0, 'Serial status transition failed.');
      assert(await tx.movements.sumQuantity(serialProductId) === 0, 'Serial ledger sum failed.');
      assert((await tx.products.search(bulkProductId)).length === 1, 'PostgreSQL product search failed.');

      const actor = (await tx.users.findAll())[0];
      assert(actor, 'RMA verification needs the bootstrapped administrator.');
      const claimId = uuidv7();
      const claimNumber = await tx.warranties.nextClaimNumber(new Date(now));
      await tx.warranties.create({
        id: claimId, claimNumber, idempotencyKey: uuidv7(), unitId,
        saleMovementId: saleMovement.id, claimantName: 'Rollback verification',
        claimantPhone: null, reportedIssue: 'Rollback-only warranty verification',
        physicalCondition: null, status: 'SUBMITTED', coverage: 'IN_WARRANTY',
        custody: 'RECEIVED_BY_SHOP', resolution: null, openedById: actor.id,
        assignedToId: null, openedAt: now, completedAt: null, updatedAt: now,
      });
      await tx.warranties.createEvent({
        id: uuidv7(), claimId, eventType: 'CLAIM_CREATED', idempotencyKey: uuidv7(),
        fromStatus: null, toStatus: 'SUBMITTED', fromCustody: null,
        toCustody: 'RECEIVED_BY_SHOP', note: 'Rollback verification',
        actorId: actor.id, createdAt: now,
      });
      assert((await tx.warranties.findById(claimId))?.claimNumber === claimNumber, 'Warranty claim persistence failed.');
      assert((await tx.warranties.findEvents(claimId)).length === 1, 'Warranty timeline persistence failed.');

      await tx.users.create({
        id: checkoutActorId,
        name: 'Rollback checkout actor',
        email: `verify-${checkoutActorId}@example.invalid`,
        emailVerified: true,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        role: 'STAFF',
        isActive: true,
      });
      await tx.customers.create({
        id: customerId,
        name: 'Rollback customer',
        phone: '+880 1700 000000',
        phoneNormalized: `880${customerId.replace(/\D/g, '').slice(0, 10) || '1700000000'}`,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      assert((await tx.customers.findById(customerId))?.name === 'Rollback customer', 'Customer persistence failed.');
      await tx.carts.create({
        id: cartId,
        actorId: checkoutActorId,
        tradeInDraft: null,
        createdAt: now,
        updatedAt: now,
      });
      assert((await tx.carts.findById(cartId))?.actorId === checkoutActorId, 'Trade-in draft persistence failed.');

      const invoiceNumber = await tx.sales.nextInvoiceNumber(new Date(now));
      await tx.sales.create({
        id: saleId,
        invoiceNumber,
        idempotencyKey: uuidv7(),
        checkoutCartId: cartId,
        status: 'COMPLETED',
        customerId,
        customerName: 'Rollback customer',
        customerPhone: '+880 1700 000000',
        actorId: checkoutActorId,
        actorName: 'Rollback checkout actor',
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        amountPaid: 0,
        reference: 'ROLLBACK-VERIFY',
        note: null,
        subtotal: 1_500,
        discount: 100,
        total: 1_400,
        tradeInCredit: 2_000,
        tradeInDetails: null,
        completedAt: now,
        createdAt: now,
        voidedAt: null,
        voidedById: null,
        voidedByName: null,
        voidReason: null,
        refundAmount: null,
        refundMethod: null,
        voidIdempotencyKey: null,
      });
      const tradeInPayout = await tx.saleSettlements.create({
        id: uuidv7(),
        receiptNumber: await tx.saleSettlements.nextReceiptNumber('TRADE_IN_PAYOUT', new Date(now)),
        idempotencyKey: uuidv7(),
        saleId,
        type: 'TRADE_IN_PAYOUT',
        amount: 600,
        paymentMethod: 'CASH',
        reference: 'ROLLBACK-VERIFY',
        note: null,
        recordedById: checkoutActorId,
        recordedByName: 'Rollback checkout actor',
        recordedAt: now,
        createdAt: now,
      });
      assert(tradeInPayout.amount === 600, 'Excess trade-in payout amount is incorrect.');
      assert(
        (await tx.saleSettlements.findBySale(saleId)).some((entry) => entry.id === tradeInPayout.id),
        'Excess trade-in payout persistence failed.',
      );
      await tx.products._applyQuantityDelta(bulkProductId, -1);
      const checkoutMovement = await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'SALE', productId: bulkProductId,
        unitId: null, quantity: -1, unitCost: 1_000, unitPrice: 1_400,
        supplierId: null, customerName: 'Rollback customer',
        customerPhone: '+880 1700 000000', reference: invoiceNumber, note: null,
        actorId: checkoutActorId, idempotencyKey: uuidv7(), reversesId: null,
        createdAt: now,
      });
      await tx.sales.createItem({
        id: uuidv7(),
        saleId,
        movementId: checkoutMovement.id,
        productName: `Verification bulk ${bulkProductId}`,
        sku: `VERIFY-BULK-${bulkProductId}`,
        serialNo: null,
        listUnitPrice: 1_500,
        warrantyMonths: null,
        usedGrade: null,
        knownDefects: null,
        position: 0,
        createdAt: now,
      });
      assert((await tx.sales.findItems(saleId)).length === 1, 'Invoice item persistence failed.');
      assert((await tx.sales.findById(saleId))?.invoiceNumber === invoiceNumber, 'Invoice persistence failed.');
      const checkoutAudit = await tx.auditLogs.create({
        id: uuidv7(),
        actorId: checkoutActorId,
        action: 'sale.complete',
        entity: 'Sale',
        entityId: saleId,
        before: null,
        after: { invoiceNumber, total: 1_400, tradeInCredit: 2_000 },
        ip: '127.0.0.1',
        createdAt: now,
      });
      assert(
        (await tx.auditLogs.findByEntity('Sale', saleId)).some((entry) => entry.id === checkoutAudit.id),
        'Atomic checkout audit persistence failed.',
      );
      await tx.carts.delete(cartId);
      assert((await tx.carts.findById(cartId)) === null, 'Completed draft cleanup failed.');

      // This intentional error proves the entire verification flow is rolled back.
      throw new RollbackVerification();
    });
  } catch (error) {
    if (!(error instanceof RollbackVerification)) throw error;
  }

  try {
    await prismaRepositories.transaction(async (tx) => {
      await tx.categories.create({
        id: atomicCategoryId,
        name: `Atomic checkout ${atomicCategoryId}`,
        slug: `atomic-checkout-${atomicCategoryId}`,
        parentId: null,
        isActive: true,
      });
      await tx.users.create({
        id: atomicActorId,
        name: 'Atomic checkout actor',
        email: `atomic-${atomicActorId}@example.invalid`,
        emailVerified: true,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        role: 'STAFF',
        isActive: true,
      });
      await tx.products.create({
        id: atomicProductId,
        sku: `ATOMIC-${atomicProductId}`,
        barcode: null,
        name: `Atomic checkout product ${atomicProductId}`,
        description: null,
        model: null,
        trackingType: 'QUANTITY',
        categoryId: atomicCategoryId,
        brandId: null,
        defaultCostPrice: 1_000,
        defaultSalePrice: 1_400,
        staffMaxDiscount: 0,
        taxRate: 0,
        reorderPoint: 1,
        quantityOnHand: 0,
        avgCostPrice: 0,
        imageUrl: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await tx.products._applyQuantityDelta(atomicProductId, 1, 1_000);
      await tx.movements.record({
        id: uuidv7(),
        type: 'IN',
        reason: 'PURCHASE',
        productId: atomicProductId,
        unitId: null,
        quantity: 1,
        unitCost: 1_000,
        unitPrice: null,
        supplierId: null,
        customerName: null,
        customerPhone: null,
        reference: 'ATOMIC-CHECKOUT-VERIFY',
        note: null,
        actorId: atomicActorId,
        idempotencyKey: uuidv7(),
        reversesId: null,
        createdAt: now,
      });
      await tx.carts.create({
        id: atomicCartId,
        actorId: atomicActorId,
        tradeInDraft: null,
        createdAt: now,
        updatedAt: now,
      });

      let faultingRepositories: Repositories;
      faultingRepositories = {
        ...tx,
        auditLogs: {
          ...tx.auditLogs,
          async create() {
            throw new AuditWriteVerificationFailure();
          },
        },
        transaction: (fn) => fn(faultingRepositories),
      };

      await checkoutCart({
        cartId: atomicCartId,
        actorId: atomicActorId,
        actorName: 'Atomic checkout actor',
        actorRole: 'STAFF',
        idempotencyKey: atomicCheckoutKey,
        lines: [{
          clientId: 'atomic-checkout-line',
          productId: atomicProductId,
          unitId: null,
          quantity: 1,
          actualUnitPrice: 1_400,
        }],
        customerId: null,
        paymentMethod: 'CASH',
        tradeInPayoutMethod: 'CASH',
        paymentStatus: 'PAID',
        reference: 'ATOMIC-CHECKOUT-VERIFY',
        note: null,
        isEmi: false,
        emiTermMonths: null,
        emiDownPayment: 0,
        emiFirstDueDate: null,
        identificationType: null,
        identificationNumber: null,
        auditIp: '127.0.0.1',
      }, faultingRepositories);
    });
    throw new Error('Checkout unexpectedly committed after its audit write failed.');
  } catch (error) {
    if (!(error instanceof AuditWriteVerificationFailure)) throw error;
  }

  const [
    bulk, serial, customer, sale, settlements, auditLogs,
    atomicCategory, atomicProduct, atomicActor, atomicCart, atomicSale,
  ] = await Promise.all([
    prismaRepositories.products.findById(bulkProductId),
    prismaRepositories.products.findById(serialProductId),
    prismaRepositories.customers.findById(customerId),
    prismaRepositories.sales.findById(saleId),
    prismaRepositories.saleSettlements.findBySale(saleId),
    prismaRepositories.auditLogs.findByEntity('Sale', saleId),
    prismaRepositories.categories.findById(atomicCategoryId),
    prismaRepositories.products.findById(atomicProductId),
    prismaRepositories.users.findById(atomicActorId),
    prismaRepositories.carts.findById(atomicCartId),
    prismaRepositories.sales.findByIdempotencyKey(atomicCheckoutKey),
  ]);
  assert(
    !bulk && !serial && !customer && !sale && settlements.length === 0 && auditLogs.length === 0
      && !atomicCategory && !atomicProduct && !atomicActor && !atomicCart && !atomicSale,
    'Verification rollback failed; temporary records remain.',
  );
  console.log('PostgreSQL repository verification passed; transaction rolled back with no dummy data retained.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
