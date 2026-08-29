import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 7 scanner workflow', () => {
  it('uses one scanner input in stock-in, stock-out, and RMA workflows', () => {
    const scanner = source('src/components/search/ScannerInput.tsx');
    expect(scanner).toContain("event.key !== 'Enter'");
    expect(scanner).toContain('event.preventDefault()');
    expect(scanner).toContain('now - last.current.at < 750');
    for (const file of [
      'src/components/stock/StockInForm.tsx',
      'src/components/stock/StockOutForm.tsx',
      'src/components/warranty/WarrantyForms.tsx',
      'src/components/search/CommandPalette.tsx',
    ]) expect(source(file)).toContain('ScannerInput');
  });

  it('submits the checkout add-item form when a scanner sends Enter', () => {
    const checkout = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(checkout).toContain('ref={scannerFormRef} onSubmit={submitLocalItem}');
    expect(checkout).toContain('onScan={() => scannerFormRef.current?.requestSubmit()}');
  });

  it('appends scanned receipt identifiers without querying or duplicating units', () => {
    const stockIn = source('src/components/stock/StockInForm.tsx');
    expect(stockIn).toContain('function appendScannedSerial');
    expect(stockIn).toContain('onScan={appendScannedSerial}');
    expect(stockIn).toContain("`${existing}\\n${scanned}`");
    expect(stockIn).toContain('is already in this receipt');
    expect(stockIn).toContain('uniqueSerialCount');
    expect(stockIn).toContain("t('stock.imeiHint')");
    expect(stockIn).not.toContain('fetch(');
  });

  it('shows every stock-removal result in a shared modal', () => {
    const stockOut = source('src/components/stock/StockOutForm.tsx');
    expect(stockOut.match(/<StockRemovalResultModal/g)).toHaveLength(2);
    expect(stockOut).toContain('role="alertdialog"');
    expect(stockOut).toContain("t('stock.removalSuccessTitle')");
    expect(stockOut).toContain("t('stock.removalFailedTitle')");
    expect(stockOut).toContain("href=\"/stock/movements\"");
    expect(stockOut).toContain("href=\"/suppliers/returns\"");
  });
});

describe('Phase 7 warranty invariants', () => {
  const service = source('src/services/warranty.ts');

  it('opens a claim without moving stock or changing the sold unit', () => {
    const intake = service.slice(service.indexOf('export async function createWarrantyClaim'), service.indexOf('export async function transitionWarrantyClaim'));
    expect(intake).toContain("status: 'SUBMITTED'");
    expect(intake).not.toContain('tx.movements.record');
    expect(intake).not.toContain('transitionStatus');
  });

  it('writes a normal outbound movement for replacement stock', () => {
    expect(service).toContain("reason: 'WARRANTY_REPLACEMENT'");
    expect(service).toContain("transitionStatus(replacement.id, 'IN_STOCK', 'SOLD'");
    expect(service).toContain('warrantyClaimId: claim.id');
  });

  it('allows REPLACED only through the stock-affecting resolution', () => {
    const types = source('src/domain/types.ts');
    const transitions = types.slice(types.indexOf('RMA_STATUS_TRANSITIONS'), types.indexOf('export const RMA_COVERAGES'));
    expect(transitions).not.toMatch(/APPROVED:.*REPLACED/);
    expect(transitions).not.toMatch(/READY_FOR_COLLECTION:.*REPLACED/);
    expect(service).toContain("status: 'REPLACED'");
    expect(source('src/components/warranty/WarrantyForms.tsx')).toContain('RMA_STATUS_TRANSITIONS[status]');
  });

  it('records returned-good and returned-damaged inventory without net inflation', () => {
    expect(service).toContain("transitionStatus(original.id, 'SOLD', 'IN_STOCK'");
    expect(service).toContain("transitionStatus(original.id, 'SOLD', 'DAMAGED'");
    expect(service).toContain("reason: 'CUSTOMER_RETURN'");
    expect(service).toContain("reason: 'DAMAGE'");
  });

  it('tracks customer coverage and supplier warranty as separate records', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).toContain('model WarrantyClaim');
    expect(schema).toContain('model SupplierWarrantyCase');
    expect(schema).toContain('supplierCase');
  });

  it('protects claim creation and management at server boundaries', () => {
    const actions = source('src/actions/warranty.ts');
    expect(actions).toContain("requireCapability('CREATE_RMA')");
    expect(actions).toContain("requireCapability('VIEW_RMA')");
    expect(actions).toContain("requireCapability('MANAGE_RMA')");
  });

  it('keeps timeline rows and stock movements append-only', () => {
    const contract = source('src/repositories/types.ts');
    expect(contract).toContain('createEvent(event: WarrantyClaimEvent)');
    expect(contract).not.toContain('deleteEvent');
    expect(contract).not.toContain('updateEvent');
  });
});

describe('Phase 7 migration', () => {
  it('adds claim numbering, idempotency, custody, supplier cases, and movement links', () => {
    const migration = source('prisma/migrations/20260720010000_phase_7_rma/migration.sql');
    for (const required of [
      'document_sequences', 'warranty_claims', 'warranty_claim_events',
      'supplier_warranty_cases', 'warrantyClaimId', 'WARRANTY_REPLACEMENT',
      'warranty_claims_idempotencyKey_key', 'warranty_claim_events_idempotencyKey_key',
    ]) expect(migration).toContain(required);
  });
});
