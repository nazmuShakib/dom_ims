import { RMA_STATUS_TRANSITIONS, type RmaStatus, type WarrantyClaim, type WarrantyClaimEvent } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { db } from '@/repositories';
import {
  createWarrantyClaimSchema,
  supplierWarrantyCaseSchema,
  transitionWarrantyClaimSchema,
  warrantyResolutionSchema,
  warrantyHandoverSchema,
  type CreateWarrantyClaimInput,
  type SupplierWarrantyCaseInput,
  type TransitionWarrantyClaimInput,
  type WarrantyResolutionInput,
  type WarrantyHandoverInput,
} from '@/schemas';

const TERMINAL = new Set<RmaStatus>(['REPLACED', 'COMPLETED', 'CANCELLED']);
const event = (value: Omit<WarrantyClaimEvent, 'id' | 'createdAt'>): WarrantyClaimEvent => ({
  ...value, id: uuidv7(), createdAt: new Date().toISOString(),
});

export async function inspectWarrantySerial(serialNo: string, now = new Date()) {
  const unit = await db.units.findBySerial(serialNo.trim());
  if (!unit) throw new Error(`No serialized unit matches ${serialNo}.`);
  const product = await db.products.findById(unit.productId);
  if (!product) throw new Error('The unit points to a missing product.');
  if (product.trackingType !== 'SERIAL') throw new Error('Warranty claims currently support individually tracked products only.');
  if (unit.status !== 'SOLD') throw new Error(`This unit is ${unit.status.replaceAll('_', ' ').toLowerCase()}, not sold.`);
  const movements = await db.movements.findByProduct(product.id);
  const sale = movements.filter((item) => item.unitId === unit.id && item.reason === 'SALE')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!sale) throw new Error('No original sale movement exists for this unit.');
  const activeClaim = await db.warranties.findActiveByUnit(unit.id);
  const coverage = unit.warrantyExpiresAt
    ? (new Date(unit.warrantyExpiresAt) >= now ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY')
    : 'UNKNOWN_PROOF_OF_PURCHASE';
  return { unit, product, sale, coverage, activeClaim } as const;
}

export async function createWarrantyClaim(raw: CreateWarrantyClaimInput): Promise<WarrantyClaim> {
  const input = createWarrantyClaimSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.warranties.findByIdempotencyKey(input.idempotencyKey);
    if (replay) return replay;
    const unit = await tx.units.findBySerial(input.serialNo);
    if (!unit) throw new Error(`No serialized unit matches ${input.serialNo}.`);
    if (unit.status !== 'SOLD') throw new Error('Only a sold serialized unit can open a warranty claim.');
    const product = await tx.products.findById(unit.productId);
    if (!product || product.trackingType !== 'SERIAL') throw new Error('Warranty claims support individually tracked products only.');
    const sale = (await tx.movements.findByProduct(product.id))
      .filter((item) => item.unitId === unit.id && item.reason === 'SALE')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!sale) throw new Error('No original sale movement exists for this unit.');
    const active = await tx.warranties.findActiveByUnit(unit.id);
    if (active) throw new Error(`Active claim ${active.claimNumber} already exists for this unit.`);
    const now = new Date();
    const stamp = now.toISOString();
    const coverage = unit.warrantyExpiresAt
      ? (new Date(unit.warrantyExpiresAt) >= now ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY')
      : 'UNKNOWN_PROOF_OF_PURCHASE';
    const claim: WarrantyClaim = {
      id: uuidv7(), claimNumber: await tx.warranties.nextClaimNumber(now),
      idempotencyKey: input.idempotencyKey, unitId: unit.id, saleMovementId: sale.id,
      claimantName: input.claimantName ?? sale.customerName,
      claimantPhone: input.claimantPhone ?? sale.customerPhone,
      reportedIssue: input.reportedIssue, physicalCondition: input.physicalCondition ?? null,
      status: 'SUBMITTED', coverage, custody: 'RECEIVED_BY_SHOP', resolution: null,
      openedById: input.actorId, assignedToId: null, openedAt: stamp, completedAt: null, updatedAt: stamp,
    };
    await tx.warranties.create(claim);
    await tx.warranties.createEvent(event({
      claimId: claim.id, eventType: 'CLAIM_CREATED', idempotencyKey: `${input.idempotencyKey}:created`,
      fromStatus: null, toStatus: 'SUBMITTED', fromCustody: null, toCustody: 'RECEIVED_BY_SHOP',
      note: input.reportedIssue, actorId: input.actorId,
    }));
    return claim;
  });
}

export async function transitionWarrantyClaim(raw: TransitionWarrantyClaimInput): Promise<WarrantyClaim> {
  const input = transitionWarrantyClaimSchema.parse(raw);
  return db.transaction(async (tx) => {
    const priorEvent = await tx.warranties.findEventByIdempotencyKey(input.idempotencyKey);
    if (priorEvent) return (await tx.warranties.findById(input.claimId))!;
    const claim = await tx.warranties.findById(input.claimId);
    if (!claim) throw new Error('Warranty claim not found.');
    if (claim.status !== input.expectedStatus) throw new Error('Claim changed while you were working. Refresh and try again.');
    if (!RMA_STATUS_TRANSITIONS[claim.status].includes(input.nextStatus)) {
      throw new Error(`Cannot move a claim from ${claim.status} to ${input.nextStatus}.`);
    }
    const completedAt = TERMINAL.has(input.nextStatus) ? new Date().toISOString() : null;
    const updated = await tx.warranties.transition(claim.id, claim.status, {
      status: input.nextStatus, custody: input.custody ?? claim.custody,
      coverage: input.coverage ?? claim.coverage,
      assignedToId: input.assignedToId === undefined ? claim.assignedToId : input.assignedToId,
      resolution: input.resolution ?? claim.resolution, completedAt,
    });
    await tx.warranties.createEvent(event({
      claimId: claim.id, eventType: 'STATUS_CHANGED', idempotencyKey: input.idempotencyKey,
      fromStatus: claim.status, toStatus: updated.status, fromCustody: claim.custody,
      toCustody: updated.custody, note: input.note, actorId: input.actorId,
    }));
    return updated;
  });
}

export async function addWarrantyNote(claimId: string, note: string, actorId: string, idempotencyKey: string) {
  if (!note.trim()) throw new Error('A note is required.');
  return db.transaction(async (tx) => {
    const replay = await tx.warranties.findEventByIdempotencyKey(idempotencyKey);
    if (replay) return replay;
    const claim = await tx.warranties.findById(claimId);
    if (!claim) throw new Error('Warranty claim not found.');
    return tx.warranties.createEvent(event({
      claimId, eventType: 'NOTE_ADDED', idempotencyKey, fromStatus: claim.status,
      toStatus: claim.status, fromCustody: claim.custody, toCustody: claim.custody,
      note: note.trim(), actorId,
    }));
  });
}

export async function recordWarrantyHandover(raw: WarrantyHandoverInput): Promise<WarrantyClaim> {
  const input = warrantyHandoverSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.warranties.findEventByIdempotencyKey(input.idempotencyKey);
    if (replay) return (await tx.warranties.findById(input.claimId))!;
    const claim = await tx.warranties.findById(input.claimId);
    if (!claim) throw new Error('Warranty claim not found.');
    if (claim.status !== input.expectedStatus || claim.custody !== input.expectedCustody) {
      throw new Error('Claim custody changed while you were working. Refresh and try again.');
    }
    if (TERMINAL.has(claim.status)) throw new Error('A completed claim cannot be handed over.');
    if (claim.custody === input.custody) throw new Error('Choose a new custody location.');
    const updated = await tx.warranties.transition(claim.id, claim.status, { custody: input.custody });
    await tx.warranties.createEvent(event({
      claimId: claim.id, eventType: 'CUSTODY_CHANGED', idempotencyKey: input.idempotencyKey,
      fromStatus: claim.status, toStatus: claim.status, fromCustody: claim.custody,
      toCustody: input.custody, note: input.note, actorId: input.actorId,
    }));
    return updated;
  });
}

export async function resolveWarrantyClaim(raw: WarrantyResolutionInput): Promise<WarrantyClaim> {
  const input = warrantyResolutionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.warranties.findEventByIdempotencyKey(input.idempotencyKey);
    if (replay) return (await tx.warranties.findById(input.claimId))!;
    const claim = await tx.warranties.findById(input.claimId);
    if (!claim || claim.status !== input.expectedStatus) throw new Error('Claim changed while you were working. Refresh and try again.');
    if (!['APPROVED', 'READY_FOR_COLLECTION'].includes(claim.status)) throw new Error('Approve the claim before applying a stock resolution.');
    const original = await tx.units.findById(claim.unitId);
    if (!original) throw new Error('Claimed unit no longer exists.');
    const now = new Date().toISOString();

    if (input.outcome === 'REPLACEMENT') {
      if (!input.replacementSerial) throw new Error('Scan the replacement serial.');
      const replacement = await tx.units.findBySerial(input.replacementSerial);
      if (!replacement || replacement.productId !== original.productId) throw new Error('Replacement must be an in-stock unit of the same product.');
      await tx.units.transitionStatus(replacement.id, 'IN_STOCK', 'SOLD', { soldAt: now, salePrice: null });
      await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'WARRANTY_REPLACEMENT', productId: replacement.productId,
        unitId: replacement.id, quantity: -1, unitCost: replacement.costPrice, unitPrice: null,
        supplierId: null, customerName: claim.claimantName, customerPhone: claim.claimantPhone,
        reference: claim.claimNumber, note: input.note, actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:movement`, reversesId: null,
        warrantyClaimId: claim.id, createdAt: now,
      });
      const updated = await tx.warranties.transition(claim.id, claim.status, {
        status: 'REPLACED', custody: 'RETAINED_BY_SHOP', resolution: input.note, completedAt: now,
      });
      await tx.warranties.createEvent(event({
        claimId: claim.id, eventType: 'REPLACEMENT_ISSUED', idempotencyKey: input.idempotencyKey,
        fromStatus: claim.status, toStatus: 'REPLACED', fromCustody: claim.custody,
        toCustody: 'RETAINED_BY_SHOP', note: `${input.note} Replacement: ${replacement.serialNo}`,
        actorId: input.actorId,
      }));
      return updated;
    }

    if (original.status !== 'SOLD') throw new Error('The claimed unit is no longer in its sold state.');
    if (input.outcome === 'RESTOCK') {
      await tx.units.transitionStatus(original.id, 'SOLD', 'IN_STOCK', {
        salePrice: null, soldAt: null, warrantyExpiresAt: null,
      });
      await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'CUSTOMER_RETURN', productId: original.productId,
        unitId: original.id, quantity: 1, unitCost: original.costPrice, unitPrice: null,
        supplierId: null, customerName: claim.claimantName, customerPhone: claim.claimantPhone,
        reference: claim.claimNumber, note: input.note, actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:movement`, reversesId: null,
        warrantyClaimId: claim.id, createdAt: now,
      });
    } else {
      await tx.units.transitionStatus(original.id, 'SOLD', 'DAMAGED');
      await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'CUSTOMER_RETURN', productId: original.productId,
        unitId: original.id, quantity: 1, unitCost: original.costPrice, unitPrice: null,
        supplierId: null, customerName: claim.claimantName, customerPhone: claim.claimantPhone,
        reference: claim.claimNumber, note: input.note, actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:return`, reversesId: null,
        warrantyClaimId: claim.id, createdAt: now,
      });
      await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'DAMAGE', productId: original.productId,
        unitId: original.id, quantity: -1, unitCost: original.costPrice, unitPrice: null,
        supplierId: null, customerName: claim.claimantName, customerPhone: claim.claimantPhone,
        reference: claim.claimNumber, note: input.note, actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:damage`, reversesId: null,
        warrantyClaimId: claim.id, createdAt: now,
      });
    }
    const updated = await tx.warranties.transition(claim.id, claim.status, {
      status: 'COMPLETED', custody: 'RETAINED_BY_SHOP', resolution: input.note, completedAt: now,
    });
    await tx.warranties.createEvent(event({
      claimId: claim.id, eventType: input.outcome === 'RESTOCK' ? 'UNIT_RESTOCKED' : 'UNIT_WRITTEN_OFF',
      idempotencyKey: input.idempotencyKey, fromStatus: claim.status, toStatus: 'COMPLETED',
      fromCustody: claim.custody, toCustody: 'RETAINED_BY_SHOP', note: input.note,
      actorId: input.actorId,
    }));
    return updated;
  });
}

export async function updateSupplierWarrantyCase(raw: SupplierWarrantyCaseInput) {
  const input = supplierWarrantyCaseSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.warranties.findEventByIdempotencyKey(input.idempotencyKey);
    if (replay) return tx.warranties.findSupplierCase(input.claimId);
    const claim = await tx.warranties.findById(input.claimId);
    if (!claim) throw new Error('Warranty claim not found.');
    const existing = await tx.warranties.findSupplierCase(input.claimId);
    const now = new Date().toISOString();
    const value = await tx.warranties.upsertSupplierCase({
      id: existing?.id ?? uuidv7(), claimId: input.claimId, supplierId: input.supplierId,
      reference: input.reference ?? null, status: input.status, coverage: input.coverage,
      resolution: input.resolution ?? null,
      sentAt: input.status === 'SENT' ? (existing?.sentAt ?? now) : (existing?.sentAt ?? null),
      returnedAt: ['RETURNED', 'CLOSED'].includes(input.status) ? now : (existing?.returnedAt ?? null),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    await tx.warranties.createEvent(event({
      claimId: claim.id, eventType: 'SUPPLIER_CASE_UPDATED', idempotencyKey: input.idempotencyKey,
      fromStatus: claim.status, toStatus: claim.status, fromCustody: claim.custody,
      toCustody: claim.custody, note: `Supplier case: ${input.status}${input.reference ? ` · ${input.reference}` : ''}`,
      actorId: input.actorId,
    }));
    return value;
  });
}
