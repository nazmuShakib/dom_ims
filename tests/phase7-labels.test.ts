import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { code128Values, encodeCode128, isCode128Value } from '@/lib/code128';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 7.5 Code 128 labels', () => {
  it('encodes ordinary identifiers with Code Set B and a valid checksum', () => {
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });

  it('compacts numeric serials with Code Set C and switches for an odd final digit', () => {
    expect(code128Values('12345')).toEqual([105, 12, 34, 100, 21, 54, 106]);
  });

  it('includes quiet zones and rejects values scanners cannot reproduce', () => {
    const encoded = encodeCode128('SKU-100');
    expect(encoded.modules.startsWith('000000000')).toBe(true);
    expect(encoded.modules.endsWith('000000000')).toBe(true);
    expect(isCode128Value('IMEI-123')).toBe(true);
    expect(isCode128Value('পণ্য')).toBe(false);
    expect(() => encodeCode128('পণ্য')).toThrow(/printable ASCII/);
  });

  it('fits a 14-digit serial at exactly two 203-DPI printer dots per module', () => {
    const encoded = encodeCode128('35643104817547');
    expect(encoded.modules).toHaveLength(130);
    expect(Math.floor(304 / encoded.modules.length)).toBe(2);
  });

  it('fits a 15-digit serial at exactly two 203-DPI printer dots per module', () => {
    const encoded = encodeCode128('352386045293914');
    expect(encoded.modules).toHaveLength(152);
    expect(Math.floor(304 / encoded.modules.length)).toBe(2);
  });

  it('identifies long alphanumeric SKUs that cannot retain two-dot modules', () => {
    const encoded = encodeCode128('ANK-NANO-45W');
    expect(encoded.modules).toHaveLength(185);
    expect(Math.floor(304 / encoded.modules.length)).toBe(1);
  });
});

describe('Phase 7.5 stock-label invariants', () => {
  it('does not create label storage or stock movements when printing', () => {
    const action = source('src/actions/labels.ts');
    expect(action).toContain("action: 'label.print'");
    expect(action).not.toContain('movements.record');
    expect(action).not.toContain('transitionStatus');
    expect(source('prisma/schema.prisma')).not.toContain('model StockLabel');
  });

  it('enforces in-stock-only STAFF printing at the server boundary', () => {
    const permissions = source('src/lib/permissions.ts');
    const action = source('src/actions/labels.ts');
    expect(permissions).toContain("PRINT_LABELS: ['ADMIN', 'MANAGER', 'STAFF']");
    expect(permissions).toContain("REPRINT_NON_STOCK_LABELS: ['ADMIN', 'MANAGER']");
    expect(action).toContain("status !== 'IN_STOCK'");
    expect(action).toContain('product.quantityOnHand <= 0');
  });

  it('uses existing identifiers and exact physical print dimensions', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    const css = source('src/app/globals.css');
    expect(studio).toContain('serialNo ?? product.barcode');
    expect(studio).not.toContain('serialNo ?? product.barcode ?? product.sku');
    expect(css).toContain('width: 38mm');
    expect(css).toContain('height: 25mm');
    expect(css).toContain('size: 38mm 25mm');
    expect(css).toContain('grid-template-columns: repeat(5, 38mm)');
    expect(css).toContain('@page label-thermal');
    expect(css).toContain('@page label-a4');
    expect(css).toContain('body:has(.stock-label-print-root) .min-h-screen');
    expect(css).toContain('body:has(.stock-label-print-root) .dashboard-content');
    expect(css).toContain('body:has(.stock-label-print-root[data-layout="thermal"])');
    expect(css).toContain('page: label-thermal');
    expect(css.match(/page: label-thermal/g)).toHaveLength(1);
    expect(css).toContain('.stock-label + .stock-label');
    expect(css).toContain('height: 24.8mm');
    expect(css).toContain('.stock-label-print-root[data-layout="thermal"] .label-print-area');
    expect(css).toContain('.stock-label-print-root[data-layout="thermal"] .label-print-grid');
    expect(css).toContain('display: contents !important');
    expect(css).not.toContain('break-after: page');
  });

  it('keeps compact label text without repeating shop or catalog metadata', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    const css = source('src/app/globals.css');
    expect(studio).toContain('<strong className="stock-label-name">{product.name}</strong>');
    expect(studio).toContain('SKU: {product.sku}');
    expect(studio).not.toContain('stock-label-shop');
    expect(studio).not.toContain('product.brandName, product.model');
    expect(studio).toContain('<Barcode128 value={barcodeValue} />');
    expect(studio).toContain('serialNo ? `S/N ${serialNo}` : barcodeValue');
    const barcode = source('src/components/labels/Barcode128.tsx');
    expect(barcode).toContain('Math.floor(LABEL_WIDTH_DOTS / modules.length)');
    expect(barcode).toContain('data-module-dots={moduleDots}');
    expect(barcode).toContain('physicalWidthMm.toFixed(3)');
    expect(css).toContain('width: calc(100% + 3mm)');
    expect(css).toContain('min-height: 10mm');
    expect(css).toContain('margin-inline: -1.5mm');
    expect(css).toContain('font-size: 6pt');
    expect(css).toContain('-webkit-line-clamp: 2');
    expect(studio).toContain('Do not reset label selections here');
    expect(studio).not.toContain('setSelected(new Set(initialUnitIds));');
    expect(studio).toContain('<LabelProductCombobox');
    const productCombobox = source('src/components/labels/LabelProductCombobox.tsx');
    expect(productCombobox).toContain('label-product-combobox-input');
    expect(css).toContain('.label-product-combobox-input:focus-visible');
    expect(studio).toContain("product?.trackingType === 'QUANTITY' && !product.barcode");
    expect(source('src/actions/labels.ts')).toContain('Add a barcode to this product before printing labels.');
  });

  it('connects stock receipt and scanner workflows to label printing', () => {
    const stockIn = source('src/components/stock/StockInForm.tsx');
    expect(stockIn).toContain('state.labelReceiptId');
    expect(stockIn).toContain('createPortal');
    expect(stockIn).toContain('stock.receiptTitle');
    expect(stockIn).toContain('href={receiptLabelHref}');
    expect(stockIn).toContain('`/stock/labels?product=');
    expect(stockIn).toContain('bg-signal');
    expect(stockIn).toContain('onSubmit={reviewReceipt}');
    expect(stockIn).toContain('event.preventDefault()');
    expect(stockIn).toContain('preflightStockSerials');
    expect(stockIn).toContain('startTransition(() => formAction(data))');
    expect(stockIn).toContain('aria-busy={pending}');
    expect(stockIn).toContain("t('stock.receivingHelp')");
    expect(stockIn).toContain('animate-spin');
    expect(stockIn).toContain('onClick={confirmReceipt} disabled={pending}');
    expect(stockIn).toContain("t('stock.confirmReceiveTitle')");
    expect(stockIn).toContain("t('stock.yesReceive')");
    expect(stockIn).toContain('role="alertdialog"');
    expect(stockIn).toContain("t('stock.reviewDeviceNumbers')");
    expect(source('src/repositories/prisma/index.ts')).toContain('async findBySerials(serialNos)');
    expect(source('src/services/stock.ts')).toContain('existing.productId !== product.id');
    expect(source('src/actions/stock.ts')).toContain('totalCost: unitCost * count');
    expect(source('src/components/labels/StockLabelStudio.tsx')).toContain('ScannerInput');
    expect(source('src/components/shell/NavigationLinks.tsx')).toContain('href="/stock/labels"');
  });

  it('keeps controlled print settings synchronized after printing', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    expect(studio).toContain('event.preventDefault()');
    expect(studio).toContain('<form onSubmit={submitPrint}>');
    expect(studio).not.toContain('<form action={formAction}>');
    expect(studio).toContain('className="eyebrow invisible mb-1.5 block"');
  });

  it('synchronizes the label quantity and units when a stock receipt is opened', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    const page = source('src/app/(dashboard)/stock/labels/page.tsx');
    expect(page).toContain('initialCopies = Math.max(1, receipt.quantity)');
    expect(studio).toContain("useState<number | ''>(Math.max(1, initialCopies))");
    expect(studio).toContain('useState(() => new Set(initialUnitIds))');
    expect(page).toContain("key={`${selectedProductId ?? 'none'}-${params.receipt ?? ''}-${params.unit ?? ''}`}");
  });

  it('allows the label quantity to be cleared while entering a replacement value', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    expect(studio).toContain("useState<number | ''>");
    expect(studio).toContain("if (next === '')");
    expect(studio).toContain("if (copies === '') setCopies(1)");
    expect(studio).toContain('requested <= 500');
    expect(studio).toContain("t('labels.rangeHelp')");
  });

  it('shows immediate feedback while label and filtered route data load', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    expect(studio).toContain('useTransition');
    expect(studio).toContain("t('loading.productLabels')");
    expect(studio).toContain("t('search.searching')");
    expect(studio).toContain('<LoadingScreen');
    expect(studio).toContain('setSelectedProductId(productId)');
    expect(studio).toContain('value={selectedProductId}');
    expect(studio).toContain('window.history.pushState');
    expect(studio).toContain('router.refresh()');
    expect(studio).toContain('setNavigating(true)');
    expect(source('src/app/(dashboard)/stock/labels/error.tsx')).toContain('Try again');
    expect(source('src/app/(dashboard)/stock/labels/loading.tsx')).toContain('Loading stock labels…');
    expect(source('src/app/(dashboard)/stock/in/loading.tsx')).toContain('Loading stock receipt…');
    expect(source('src/app/(dashboard)/stock/out/loading.tsx')).toContain('Loading stock removal…');
    expect(source('src/app/(dashboard)/stock/reconcile/loading.tsx')).toContain('Loading reconciliation…');
    expect(source('src/components/invoices/InvoiceRegister.tsx')).toContain("t('loading.filterInvoices')");
    expect(source('src/app/(dashboard)/loading.tsx')).toContain('Loading dashboard…');
  });
});
