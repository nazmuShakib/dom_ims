import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type {
  Customer,
  EmiContract,
  EmiEarlySettlement,
  EmiInstallment,
  EmiPayment,
  EmiPaymentAllocation,
  InvoiceItem,
  Sale,
} from '@/domain/types';
import { SHOP_LOGO_DATA_URI } from '@/lib/shop-branding';

const MM_TO_PT = 72 / 25.4;

const styles = StyleSheet.create({
  page: { paddingVertical: 8, fontFamily: 'Helvetica', fontSize: 7.5, color: '#000000' },
  page58: { paddingHorizontal: 5 },
  page80: { paddingHorizontal: 6 },
  logo: { objectFit: 'contain', objectPosition: 'center', alignSelf: 'center' },
  logo58: { width: 88, height: 52 },
  logo80: { width: 108, height: 63 },
  title: { marginTop: 2, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  receiptNumber: { marginTop: 4, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  centered: { textAlign: 'center' },
  muted: { color: '#000000', fontSize: 6.5 },
  divider: { borderBottomWidth: 0.6, borderBottomColor: '#000000', marginVertical: 6 },
  amountGrid: { flexDirection: 'row', borderWidth: 0.4, borderColor: '#000000' },
  amountCell: { width: '50%', padding: 5 },
  amountCellBorder: { borderRightWidth: 0.4, borderRightColor: '#000000' },
  label: { color: '#000000', fontFamily: 'Helvetica-Bold', fontSize: 6, textTransform: 'uppercase', marginBottom: 2 },
  amount: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  detail: { width: '50%', paddingVertical: 3, paddingRight: 4 },
  value: { fontFamily: 'Helvetica-Bold' },
  product: { borderTopWidth: 0.35, borderTopColor: '#000000', marginTop: 5, paddingTop: 5 },
  productName: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  settlement: { borderWidth: 0.4, borderColor: '#000000', marginTop: 5, padding: 5 },
  voided: { borderWidth: 0.5, borderColor: '#000000', color: '#000000', marginBottom: 6, padding: 5 },
  footer: { marginTop: 7 },
});

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

function wrappedLines(value: string | null | undefined, characters: number): number {
  if (!value) return 0;
  return value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / characters)), 0);
}

function receiptHeightMm(input: ThermalReceiptInput, widthMm: 58 | 80): number {
  const characters = widthMm === 58 ? 35 : 52;
  let height = widthMm === 58 ? 94 : 88;
  height += input.saleItems.reduce((total, item) => total + 7 + wrappedLines(item.productName, characters) * 3, 0);
  height += Math.ceil(input.allocations.length / 2) * 4;
  height += wrappedLines(input.payment.reference, characters) * 3;
  height += wrappedLines(input.payment.note, characters) * 3;
  height += wrappedLines(input.voidReason, characters) * 3;
  if (input.earlySettlement) height += 17;
  return Math.min(1000, Math.max(widthMm === 58 ? 108 : 102, Math.ceil(height)));
}

export interface ThermalReceiptInput {
  contract: EmiContract;
  payment: EmiPayment;
  customer: Customer | null;
  sale: Sale | null;
  saleItems: InvoiceItem[];
  installments: EmiInstallment[];
  allocations: EmiPaymentAllocation[];
  earlySettlement: EmiEarlySettlement | null;
  outstanding: number;
  voidReason: string | null;
}

function ThermalReceiptDocument({ input, widthMm }: {
  input: ThermalReceiptInput;
  widthMm: 58 | 80;
}) {
  const sequenceById = new Map(input.installments.map((row) => [row.id, row.sequence]));
  const isEarlySettlement = Boolean(input.earlySettlement && input.payment.paidAt === input.earlySettlement.approvedAt);
  const reversed = input.payment.status === 'REVERSED';
  const applied = input.allocations
    .map((row) => `#${sequenceById.get(row.installmentId) ?? '?'} (${money(row.amount)})`)
    .join(' / ') || 'None';
  const heightMm = receiptHeightMm(input, widthMm);

  return <Document title={input.payment.receiptNumber} author="Irfan Gadget & Mobile">
    <Page
      size={{ width: widthMm * MM_TO_PT, height: heightMm * MM_TO_PT }}
      style={[styles.page, widthMm === 58 ? styles.page58 : styles.page80]}
      wrap={false}
    >
      {reversed && <View style={styles.voided}>
        <Text style={styles.value}>VOIDED RECEIPT</Text>
        <Text style={{ marginTop: 2 }}>Voided on: {input.payment.reversedAt ? dateTime(input.payment.reversedAt) : 'Not recorded'}</Text>
        <Text>Invoice: {input.sale?.invoiceNumber ?? 'Not recorded'}</Text>
        <Text>Reason: {input.voidReason ?? 'Not recorded'}</Text>
      </View>}
      <Image src={SHOP_LOGO_DATA_URI} style={[styles.logo, widthMm === 58 ? styles.logo58 : styles.logo80]} />
      <Text style={styles.title}>INSTALLMENT PAYMENT RECEIPT</Text>
      <Text style={styles.receiptNumber}>{input.payment.receiptNumber}</Text>
      <Text style={[styles.muted, styles.centered]}>{dateTime(input.payment.paidAt)}</Text>
      <View style={styles.divider} />
      <View style={styles.amountGrid}>
        <View style={[styles.amountCell, styles.amountCellBorder]}>
          <Text style={styles.label}>{reversed ? 'Voided amount' : 'Paid amount'}</Text>
          <Text style={styles.amount}>{money(input.payment.amount)}</Text>
        </View>
        <View style={styles.amountCell}>
          <Text style={styles.label}>{isEarlySettlement ? 'Due after settlement' : 'Due amount'}</Text>
          <Text style={styles.amount}>{reversed ? 'Not applicable' : money(input.outstanding)}</Text>
        </View>
      </View>
      {isEarlySettlement && input.earlySettlement && <View style={styles.settlement}>
        <Text style={styles.label}>Early settlement</Text>
        <Text>Due before discount: {money(input.earlySettlement.outstandingBefore)}</Text>
        <Text>Discount: -{money(input.earlySettlement.discountAmount)}</Text>
      </View>}
      <View style={styles.detailGrid}>
        <View style={styles.detail}><Text style={styles.label}>Customer</Text><Text style={styles.value}>{input.customer?.name ?? 'Not recorded'}</Text><Text style={styles.muted}>{input.customer?.phone ?? 'Mobile not recorded'}</Text></View>
        <View style={styles.detail}><Text style={styles.label}>Contract / invoice</Text><Text style={styles.value}>{input.contract.contractNumber}</Text><Text style={styles.muted}>{input.sale?.invoiceNumber ?? 'Invoice not recorded'}</Text></View>
        <View style={styles.detail}><Text style={styles.label}>Payment method</Text><Text style={styles.value}>{input.payment.paymentMethod.replaceAll('_', ' ')}</Text></View>
        <View style={styles.detail}><Text style={styles.label}>Recorded by</Text><Text style={styles.value}>{input.payment.recordedByName}</Text></View>
        <View style={styles.detail}><Text style={styles.label}>Applied to installments</Text><Text>{applied}</Text></View>
        <View style={styles.detail}><Text style={styles.label}>Reference</Text><Text>{input.payment.reference ?? 'None'}</Text></View>
      </View>
      {input.saleItems.length > 0 && <View style={styles.product}>
        <Text style={styles.label}>EMI product details</Text>
        {input.saleItems.map((item) => <View key={item.id} style={{ marginTop: 3 }}>
          <Text style={styles.productName}>{item.productName}</Text>
          <Text style={styles.muted}>{item.sku}{item.serialNo ? ` / Device/IMEI: ${item.serialNo}` : ` / Quantity: ${item.quantity}`}</Text>
        </View>)}
      </View>}
      {input.payment.note && <View style={styles.product}><Text style={styles.label}>Note</Text><Text>{input.payment.note}</Text></View>}
      <View style={styles.footer}>
        <Text>{input.contract.termMonths} monthly installments</Text>
        <Text style={[styles.muted, { marginTop: 2 }]}>Keep this receipt for future payment verification.</Text>
      </View>
    </Page>
  </Document>;
}

export async function emiReceiptToThermalPdf(input: ThermalReceiptInput, widthMm: 58 | 80): Promise<Buffer> {
  return renderToBuffer(<ThermalReceiptDocument input={input} widthMm={widthMm} />);
}
