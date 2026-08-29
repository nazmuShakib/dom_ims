import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { EmiContract, EmiEarlySettlement, EmiInstallment, InvoiceItem, Sale } from '@/domain/types';
import { emiDisplayStatus } from '@/lib/emi-summary';
import { SHOP_LOGO_DATA_URI } from '@/lib/shop-branding';

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: 'Helvetica', fontSize: 9, color: '#14181d' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#14181d',
    paddingBottom: 6,
    marginBottom: 10,
  },
  logo: { width: 96, height: 64, objectFit: 'contain', objectPosition: 'left top', marginBottom: 3 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 24, lineHeight: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  paymentBadge: {
    marginTop: 6,
    backgroundColor: '#f3f4f6',
    color: '#14181d',
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  voided: { color: '#b42318' },
  muted: { color: '#374151', fontSize: 8, marginTop: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  metaBox: { width: '47%' },
  label: { color: '#374151', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d5dade',
    paddingVertical: 7,
    paddingHorizontal: 7,
  },
  tableHead: { backgroundColor: '#e9ecee', fontFamily: 'Helvetica-Bold' },
  item: { width: '55%' },
  qty: { width: '10%', textAlign: 'right' },
  amount: { width: '17.5%', textAlign: 'right' },
  summary: { marginLeft: '55%', marginTop: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  total: { borderTopWidth: 1, paddingTop: 6, marginTop: 3, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  note: { marginTop: 18, color: '#374151', fontSize: 8 },
  tradeIn: { marginTop: 12, borderWidth: 0.5, borderColor: '#d5dade', padding: 8 },
  payment: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: '#b8c0c8', paddingTop: 10 },
  paymentRow: { marginBottom: 7 },
  footer: { position: 'absolute', left: 34, right: 34, bottom: 24, color: '#374151', fontSize: 7 },
});

const thermalStyles = StyleSheet.create({
  page: { paddingTop: 9, paddingBottom: 7, fontFamily: 'Helvetica', fontSize: 7.2, color: '#000000' },
  page58: { paddingHorizontal: 5 },
  page80: { paddingHorizontal: 6 },
  logo: { objectFit: 'contain', objectPosition: 'center', alignSelf: 'center' },
  logo58: { width: 96, height: 56 },
  logo80: { width: 118, height: 69 },
  title: { marginTop: 3, fontSize: 11.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  centered: { textAlign: 'center' },
  muted: { color: '#000000', fontSize: 6.3, marginTop: 1.2 },
  badge: { alignSelf: 'center', marginTop: 4, paddingVertical: 2, paddingHorizontal: 5, borderWidth: 0.5, borderColor: '#c7cdd3', color: '#000000', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: '#d5dade', marginVertical: 7 },
  label: { color: '#000000', fontSize: 6, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 1 },
  section: { marginBottom: 1 },
  itemHeader: { flexDirection: 'row', backgroundColor: '#e9ecee', color: '#000000', borderBottomWidth: 0.5, borderBottomColor: '#d5dade', paddingVertical: 3, paddingHorizontal: 2, fontFamily: 'Helvetica-Bold', fontSize: 6.2 },
  itemHeaderName: { width: '67%' },
  itemHeaderQty: { width: '10%', textAlign: 'right' },
  itemHeaderTotal: { width: '23%', textAlign: 'right' },
  item: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5dade', paddingVertical: 5, paddingHorizontal: 2 },
  itemBody: { width: '67%', paddingRight: 2 },
  itemQty: { width: '10%', textAlign: 'right' },
  itemTotal: { width: '23%', textAlign: 'right' },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 7.6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  summary: { marginTop: 7 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.7, borderTopColor: '#000000', paddingTop: 5, marginTop: 5, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  box: { borderWidth: 0.35, borderColor: '#d5dade', padding: 5, marginTop: 5 },
  voided: { color: '#000000' },
});

const MM_TO_PT = 72 / 25.4;

function money(value: number): string {
  return `BDT ${(value / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(new Date(value));
}

function dateOnly(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
  }).format(new Date(value));
}

function wrappedLines(value: string | null | undefined, characters: number): number {
  if (!value) return 0;
  return value.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / characters)), 0);
}

function thermalInvoiceHeightMm(sale: Sale, items: InvoiceItem[], emi: { installments: EmiInstallment[] } | null, widthMm: 58 | 80): number {
  // React PDF will create another logical page when the content is even a few
  // points taller than this value. Keep a deliberate safety allowance so a
  // receipt remains one continuous roll page instead of moving its totals to a
  // second sheet. The narrower layout also wraps metadata more frequently.
  const chars = widthMm === 58 ? 29 : 44;
  let height = widthMm === 58 ? 112 : 100;
  for (const item of items) {
    const identity = `Code (SKU) ${item.sku}${item.serialNo ? ` / Device no. ${item.serialNo}` : ''}`;
    height += 9;
    height += wrappedLines(item.productName, chars) * 3.6;
    height += wrappedLines(identity, chars) * 3;
    if (item.usedGrade) height += 3.2;
    height += wrappedLines(item.knownDefects, chars) * 3.2;
    if (item.warrantyDays || item.warrantyMonths) height += 3.2;
  }
  if (sale.tradeInDetails) height += 20 + wrappedLines(sale.tradeInDetails.productName, chars) * 3.2;
  if (emi) height += 20 + Math.ceil(emi.installments.length / (widthMm === 58 ? 2 : 3)) * 4.2;
  if (sale.note) height += 8 + wrappedLines(sale.note, chars) * 3.2;
  if (sale.status === 'VOIDED') height += 15 + wrappedLines(sale.voidReason, chars) * 3.2;
  return Math.min(1000, Math.max(95, Math.ceil(height)));
}

function InvoiceDocument({
  sale,
  items,
  shop,
  emi,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; address: string | null; phone: string | null; policy: string | null };
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null;
}) {
  const collectibleTotal = Math.max(0, sale.total - sale.tradeInCredit);
  const paidAmount = Math.min(collectibleTotal, Math.max(0, sale.amountPaid ?? 0));
  const amountDue = Math.max(0, collectibleTotal - paidAmount);
  const tradeInCashPayout = Math.max(0, sale.tradeInCredit - sale.total);
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const invoicePaymentStatus = rawEmiStatus
    ? rawEmiStatus === 'PAID' || rawEmiStatus === 'SETTLED_EARLY' ? 'PAID' : 'ACTIVE'
    : sale.paymentStatus;
  const paymentBadge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus
      ? `EMI / ${invoicePaymentStatus}`
      : invoicePaymentStatus === 'UNPAID'
        ? 'UNPAID'
        : `${sale.paymentMethod.replaceAll('_', ' ')} / ${invoicePaymentStatus.replaceAll('_', ' ')}`;
  return (
    <Document title={sale.invoiceNumber} author={shop.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Image src={SHOP_LOGO_DATA_URI} style={styles.logo} />
            {shop.address && <Text style={styles.muted}>{shop.address}</Text>}
            {shop.phone && <Text style={styles.muted}>{shop.phone}</Text>}
          </View>
          <View style={styles.titleBox}>
            <Text style={[styles.title, sale.status === 'VOIDED' ? styles.voided : {}]}>
              {sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}
            </Text>
            <Text style={styles.muted}>{sale.invoiceNumber}</Text>
            {paymentBadge && <Text style={styles.paymentBadge}>{paymentBadge}</Text>}
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Customer</Text>
            <Text>{sale.customerName ?? 'Walk-in customer'}</Text>
            {sale.customerPhone && <Text style={styles.muted}>{sale.customerPhone}</Text>}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Date</Text>
            <Text>{dateTime(sale.completedAt)}</Text>
            <Text style={styles.muted}>Served by {sale.actorName}</Text>
            {sale.reference && <Text style={styles.muted}>Ref: {sale.reference}</Text>}
          </View>
        </View>
        <View style={[styles.row, styles.tableHead]}>
          <Text style={styles.item}>Item</Text><Text style={styles.qty}>Qty</Text><Text style={styles.amount}>Unit price</Text><Text style={styles.amount}>Total</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={styles.row} wrap={false}>
            <View style={styles.item}>
              <Text>{item.productName}</Text>
              <Text style={styles.muted}>Code (SKU) {item.sku}{item.serialNo ? ` / Device no. ${item.serialNo}` : ''}</Text>
              {item.usedGrade && <Text style={styles.muted}>Used phone / {item.usedGrade === 'REFURBISHED' ? 'Refurbished' : item.usedGrade.replace('GRADE_', 'Grade ')}</Text>}
              {item.knownDefects && <Text style={styles.muted}>Declared defects: {item.knownDefects}</Text>}
              {item.warrantyDays
                ? <Text style={styles.muted}>{item.warrantyDays} {item.warrantyDays === 1 ? 'day' : 'days'} warranty</Text>
                : item.warrantyMonths
                  ? <Text style={styles.muted}>{item.warrantyMonths} {item.warrantyMonths === 1 ? 'month' : 'months'} warranty</Text>
                  : null}
            </View>
            <Text style={styles.qty}>{item.quantity}</Text>
            <Text style={styles.amount}>{money(item.actualUnitPrice)}</Text>
            <Text style={styles.amount}>{money(item.lineTotal)}</Text>
          </View>
        ))}
        {sale.tradeInDetails && (
          <View style={styles.tradeIn} wrap={false}>
            <Text style={styles.label}>Trade-in device</Text>
            <Text>{sale.tradeInDetails.productName}</Text>
            <Text style={styles.muted}>Code (SKU) {sale.tradeInDetails.sku} / Device no. {sale.tradeInDetails.serialNo}</Text>
            <Text style={styles.muted}>{sale.tradeInDetails.grade === 'REFURBISHED' ? 'Refurbished' : sale.tradeInDetails.grade.replace('GRADE_', 'Grade ')} / Credit {money(sale.tradeInDetails.acquisitionValue)}</Text>
          </View>
        )}
        <View style={styles.summary}>
          {emi ? (
            <>
              <View style={styles.summaryRow}><Text>Down payment</Text><Text>{money(emi.contract.downPayment)}</Text></View>
              <View style={[styles.summaryRow, styles.total]}><Text>Outstanding</Text><Text>{money(emi.contract.financedAmount)}</Text></View>
            </>
          ) : (
            <>
              <View style={[styles.summaryRow, styles.total]}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
              {sale.tradeInCredit > 0 && (
                <>
                  <View style={styles.summaryRow}><Text>Trade-in credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>
                  {tradeInCashPayout > 0 && <View style={styles.summaryRow}><Text>Trade-in cash payout</Text><Text>{money(tradeInCashPayout)}</Text></View>}
                </>
              )}
              {collectibleTotal > 0 && <View style={styles.summaryRow}><Text>Paid amount</Text><Text>{money(paidAmount)}</Text></View>}
              {collectibleTotal > 0 && <View style={[styles.summaryRow, styles.total]}><Text>Amount due</Text><Text>{money(amountDue)}</Text></View>}
            </>
          )}
        </View>
        {emi && (
          <View style={styles.tradeIn} wrap={false}>
            <Text style={styles.label}>Installment schedule</Text>
            <Text style={styles.muted}>
              {emi.installments
                .map((row) => `#${row.sequence} ${new Date(row.dueDate).toLocaleDateString('en-GB')} ${money(row.amountDue)}`)
                .join(' · ')}
            </Text>
          </View>
        )}
        {(emi || sale.note || sale.status === 'VOIDED') && <View style={styles.payment}>
          {emi ? (
            <>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Payment plan</Text>
                <Text>Shop-managed EMI</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Installments</Text>
                <Text>{emi.contract.termMonths} monthly installments</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>First installment date</Text>
                <Text>{dateOnly(emi.contract.firstDueDate)}</Text>
              </View>
            </>
          ) : null}
          {sale.note && (
            <View style={styles.paymentRow}>
              <Text style={styles.label}>Note</Text>
              <Text>{sale.note}</Text>
            </View>
          )}
          {sale.status === 'VOIDED' && (
            <View style={styles.paymentRow}>
              <Text style={[styles.label, styles.voided]}>Voided</Text>
              <Text style={styles.voided}>
                {sale.voidedAt ? dateTime(sale.voidedAt) : 'Recorded'}
                {sale.voidedByName ? ` by ${sale.voidedByName}` : ''}. Reason: {sale.voidReason ?? 'Not recorded'}.
                {' '}Refund: {money(sale.refundAmount ?? 0)}{sale.refundMethod ? ` via ${sale.refundMethod.replaceAll('_', ' ')}` : ''}.
              </Text>
            </View>
          )}
        </View>}
        {shop.policy && (
          <View style={styles.footer}>
            <Text>{shop.policy}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

function ThermalInvoiceDocument({
  sale,
  items,
  shop,
  emi,
  widthMm,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; address: string | null; phone: string | null; policy: string | null };
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null;
  widthMm: 58 | 80;
}) {
  const collectibleTotal = Math.max(0, sale.total - sale.tradeInCredit);
  const paidAmount = Math.min(collectibleTotal, Math.max(0, sale.amountPaid ?? 0));
  const amountDue = Math.max(0, collectibleTotal - paidAmount);
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const paymentStatus = rawEmiStatus
    ? rawEmiStatus === 'PAID' || rawEmiStatus === 'SETTLED_EARLY' ? 'PAID' : 'ACTIVE'
    : sale.paymentStatus;
  const badge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus ? `EMI / ${paymentStatus}` : paymentStatus === 'UNPAID' ? 'UNPAID' : `${sale.paymentMethod.replaceAll('_', ' ')} / ${paymentStatus}`;
  const heightMm = thermalInvoiceHeightMm(sale, items, emi, widthMm);

  return <Document title={sale.invoiceNumber} author={shop.name}>
    <Page
      size={{ width: widthMm * MM_TO_PT, height: heightMm * MM_TO_PT }}
      style={[thermalStyles.page, widthMm === 58 ? thermalStyles.page58 : thermalStyles.page80]}
      wrap={false}
    >
      <Image
        src={SHOP_LOGO_DATA_URI}
        style={[thermalStyles.logo, widthMm === 58 ? thermalStyles.logo58 : thermalStyles.logo80]}
      />
      <Text style={[thermalStyles.title, sale.status === 'VOIDED' ? thermalStyles.voided : {}]}>
        {sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}
      </Text>
      <Text style={[thermalStyles.muted, thermalStyles.centered]}>{sale.invoiceNumber}</Text>
      {badge && <Text style={thermalStyles.badge}>{badge}</Text>}
      <View style={thermalStyles.divider} />
      <View style={thermalStyles.section}>
        <Text style={thermalStyles.label}>Customer</Text>
        <Text>{sale.customerName ?? 'Walk-in customer'}</Text>
        {sale.customerPhone && <Text style={thermalStyles.muted}>{sale.customerPhone}</Text>}
        <Text style={[thermalStyles.label, { marginTop: 4 }]}>Date</Text>
        <Text>{dateTime(sale.completedAt)}</Text>
        <Text style={thermalStyles.muted}>Served by {sale.actorName}</Text>
      </View>
      <View style={thermalStyles.divider} />
      <View style={thermalStyles.itemHeader}>
        <Text style={thermalStyles.itemHeaderName}>ITEM</Text>
        <Text style={thermalStyles.itemHeaderQty}>QTY</Text>
        <Text style={thermalStyles.itemHeaderTotal}>TOTAL</Text>
      </View>
      {items.map((item) => <View key={item.id} style={thermalStyles.item} wrap={false}>
        <View style={thermalStyles.itemBody}>
          <Text style={thermalStyles.itemName}>{item.productName}</Text>
          <Text style={thermalStyles.muted}>Code (SKU) {item.sku}{item.serialNo ? ` / Device no. ${item.serialNo}` : ''}</Text>
          {item.usedGrade && <Text style={thermalStyles.muted}>Used phone · {item.usedGrade === 'REFURBISHED' ? 'Refurbished' : item.usedGrade.replace('GRADE_', 'Grade ')}</Text>}
          {item.knownDefects && <Text style={thermalStyles.muted}>Declared defects: {item.knownDefects}</Text>}
          {item.warrantyDays ? <Text style={thermalStyles.muted}>{item.warrantyDays} day warranty</Text> : item.warrantyMonths ? <Text style={thermalStyles.muted}>{item.warrantyMonths} month warranty</Text> : null}
        </View>
        <Text style={thermalStyles.itemQty}>{item.quantity}</Text>
        <Text style={thermalStyles.itemTotal}>{money(item.lineTotal)}</Text>
      </View>)}
      {sale.tradeInDetails && <View style={thermalStyles.box} wrap={false}>
        <Text style={thermalStyles.label}>Trade-in device</Text>
        <Text>{sale.tradeInDetails.productName}</Text>
        <Text style={thermalStyles.muted}>{sale.tradeInDetails.sku} / {sale.tradeInDetails.serialNo}</Text>
        <View style={thermalStyles.line}><Text>Credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>
      </View>}
      <View style={thermalStyles.summary} wrap={false}>
        {emi ? <>
          <View style={thermalStyles.line}><Text>Down payment</Text><Text>{money(emi.contract.downPayment)}</Text></View>
          <View style={thermalStyles.totalLine}><Text>Outstanding</Text><Text>{money(emi.contract.financedAmount)}</Text></View>
          <View style={thermalStyles.box} wrap={false}>
            <Text style={thermalStyles.label}>Payment plan</Text>
            <Text>{emi.contract.termMonths} monthly installments</Text>
            <Text style={thermalStyles.muted}>{emi.installments.map((row) => `#${row.sequence} ${dateOnly(row.dueDate)} ${money(row.amountDue)}`).join(' / ')}</Text>
          </View>
        </> : <>
          <View style={thermalStyles.totalLine}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
          {sale.tradeInCredit > 0 && <View style={thermalStyles.line}><Text>Trade-in credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>}
          {collectibleTotal > 0 && <View style={thermalStyles.line}><Text>Paid amount</Text><Text>{money(paidAmount)}</Text></View>}
          {collectibleTotal > 0 && <View style={thermalStyles.totalLine}><Text>Amount due</Text><Text>{money(amountDue)}</Text></View>}
        </>}
      </View>
      {sale.note && <View style={thermalStyles.box}><Text style={thermalStyles.label}>Note</Text><Text>{sale.note}</Text></View>}
      {sale.status === 'VOIDED' && <View style={thermalStyles.box}>
        <Text style={[thermalStyles.label, thermalStyles.voided]}>Voided</Text>
        <Text style={thermalStyles.voided}>{sale.voidReason ?? 'Reason not recorded'}</Text>
      </View>}
      {shop.policy && <Text style={[thermalStyles.muted, { marginTop: 7 }]}>{shop.policy}</Text>}
    </Page>
  </Document>;
}

export async function invoiceToPdf(
  sale: Sale,
  items: InvoiceItem[],
  shop: { name: string; address: string | null; phone: string | null; policy: string | null },
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null = null,
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument sale={sale} items={items} shop={shop} emi={emi} />);
}

export async function invoiceToThermalPdf(
  sale: Sale,
  items: InvoiceItem[],
  shop: { name: string; address: string | null; phone: string | null; policy: string | null },
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null,
  widthMm: 58 | 80,
): Promise<Buffer> {
  return renderToBuffer(<ThermalInvoiceDocument sale={sale} items={items} shop={shop} emi={emi} widthMm={widthMm} />);
}
