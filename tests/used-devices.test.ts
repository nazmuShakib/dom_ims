import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { acceptUsedDeviceSchema, receiveStockSchema } from '@/schemas';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

const validInput = {
  productId: '019c0000-0000-7000-8000-000000000001',
  serialNo: 'USED-IMEI-1',
  grade: 'GRADE_B' as const,
  batteryHealth: 88,
  inspectionResults: {
    imeiMatches: 'WORKING', activationLockClear: 'WORKING', networkAndSim: 'WORKING',
    wifi: 'WORKING', bluetooth: 'WORKING', display: 'WORKING', touchscreen: 'WORKING',
    cameras: 'WORKING', microphone: 'WORKING', speakers: 'WORKING', chargingPort: 'WORKING',
    buttons: 'WORKING', biometrics: 'WORKING', frameAndBack: 'WORKING',
    waterDamageFree: 'WORKING', battery: 'WORKING',
  } as const,
  knownDefects: null,
  includedAccessories: 'Charger',
  askingPrice: 25_000_00,
  warrantyMonths: 1,
  location: 'Shelf U1',
  acquisitionType: 'DIRECT_PURCHASE' as const,
  sellerName: 'Seller',
  sellerPhone: '01712345678',
  identificationType: null,
  identificationNumber: null,
  acquisitionValue: 20_000_00,
  ownershipConfirmed: true as const,
  reference: null,
  note: null,
  actorId: 'actor',
  idempotencyKey: 'used-device-test-key',
};

describe('accepted used-device workflow', () => {
  it('requires IMEI match, activation-lock clearance and ownership confirmation', () => {
    expect(acceptUsedDeviceSchema.safeParse(validInput).success).toBe(true);
    expect(acceptUsedDeviceSchema.safeParse({
      ...validInput,
      inspectionResults: { ...validInput.inspectionResults, activationLockClear: 'NOT_TESTED' },
    }).success).toBe(false);
    expect(acceptUsedDeviceSchema.safeParse({ ...validInput, ownershipConfirmed: false }).success).toBe(false);
  });

  it('supports an exact day-based warranty without also storing months', () => {
    const result = acceptUsedDeviceSchema.safeParse({
      ...validInput,
      warrantyMonths: null,
      warrantyDays: 15,
    });
    expect(result.success).toBe(true);
    expect(acceptUsedDeviceSchema.safeParse({
      ...validInput,
      warrantyDays: 15,
    }).success).toBe(false);
  });

  it('allows supplier receipts to mark serialized units as refurbished without a seller intake', () => {
    const parsed = receiveStockSchema.parse({
      productId: validInput.productId,
      unitCost: validInput.acquisitionValue,
      reason: 'PURCHASE',
      serialNumbers: ['SUPPLIER-REFURB-1'],
      unitCondition: 'REFURBISHED',
      warrantyDays: 30,
      actorId: validInput.actorId,
      idempotencyKey: 'supplier-refurbished-test',
    });
    expect(parsed.unitCondition).toBe('REFURBISHED');
    expect(parsed.warrantyDays).toBe(30);
    expect(source('src/services/stock.ts')).toContain("askingPrice: input.unitCondition === 'REFURBISHED' ? input.unitCost : null");
    expect(source('src/services/checkout.ts')).toContain("unit?.usedGrade === 'REFURBISHED' ? unit.costPrice");
    expect(source('src/services/used-devices.ts')).toContain('unit.askingPrice === null || unit.askingPrice === unit.costPrice');
  });

  it('commits unit, inbound movement and accepted acquisition in one transaction', () => {
    const service = source('src/services/used-devices.ts');
    expect(service).toContain('return db.transaction((tx) => acceptUsedDeviceInTransaction(input, tx))');
    expect(service).toContain('await tx.units.createMany([unit])');
    expect(service).toContain("type: 'IN'");
    expect(service).toContain('await tx.movements.record');
    expect(service).toContain('await tx.usedDeviceAcquisitions.create');
    expect(service).not.toContain('photo');
  });

  it('keeps trade-in credit distinct from discount and restricts intake to Manager/Admin', () => {
    const checkout = source('src/services/checkout.ts');
    const permission = source('src/lib/permissions.ts');
    expect(checkout).toContain('tradeInCredit');
    expect(checkout).toContain('discount: subtotal - total');
    expect(permission).toContain("MANAGE_USED_DEVICES: ['ADMIN', 'MANAGER']");
  });

  it('keeps a checkout trade-in provisional and commits it with its sale atomically', () => {
    const schema = source('prisma/schema.prisma');
    const checkout = source('src/services/checkout.ts');
    const action = source('src/actions/used-devices.ts');
    expect(schema).toContain('tradeInDraft Json?');
    expect(checkout).toContain('saveTradeInDraft');
    expect(checkout).toContain('acceptUsedDeviceInTransaction');
    expect(checkout).toContain("idempotencyKey: `${input.idempotencyKey}:trade-in`");
    expect(checkout).toContain('await tx.sales.create(sale)');
    expect(checkout).toContain('attachToSale(acceptedTradeIn.acquisition.id, sale.id)');
    expect(checkout).toContain('tradeInDetails: incomingTradeInUnit');
    expect(action).toContain('Start a trade-in from Checkout');
  });

  it('requires a distinct shop selling price when preparing a trade-in', () => {
    const form = source('src/components/stock/UsedDeviceIntakeForm.tsx');
    const action = source('src/actions/used-devices.ts');
    expect(form).toContain("required('askingPrice')");
    expect(form).toContain('initialTradeInDraft.askingPrice');
    expect(form).not.toContain("!tradeInCartId && <div><dt className=\"eyebrow\">{t('used.askingPrice')}");
    expect(action).not.toContain("resolvedAcquisitionType === 'TRADE_IN'\n        ? acquisitionValue");
  });

  it('revives a safely voided IMEI while retaining separate acquisition history', () => {
    const schema = source('prisma/schema.prisma');
    const service = source('src/services/used-devices.ts');
    const migration = source('prisma/migrations/20260809183000_reusable_voided_used_units/migration.sql');
    expect(schema).toContain('usedAcquisitions      UsedDeviceAcquisition[]');
    expect(schema).toContain('@@index([unitId, acquiredAt])');
    expect(service).toContain("transitionStatus(existingUnit.id, 'VOID', 'IN_STOCK'");
    expect(service).toContain('has later warranty, refurbishment, or invoice history');
    expect(migration).toContain('DROP INDEX "used_device_acquisitions_unitId_key"');
  });

  it('prints an immutable incoming-device snapshot on trade-in invoices', () => {
    const schema = source('prisma/schema.prisma');
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    const pdf = source('src/lib/invoice-pdf.tsx');
    expect(schema).toContain('tradeInDetails Json?');
    expect(invoice).toContain('Trade-in device');
    expect(invoice).toContain('sale.tradeInDetails.serialNo');
    expect(pdf).toContain('sale.tradeInDetails.serialNo');
  });

  it('stores accepted history without a pending intake model or photo fields', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).toContain('model UsedDeviceAcquisition');
    expect(schema).toContain('model RefurbishmentExpense');
    expect(schema).not.toContain('model UsedDeviceIntake');
    expect(schema).not.toMatch(/photo|image.*UsedDevice/i);
  });
});
