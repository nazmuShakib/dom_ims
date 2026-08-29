import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { reportExportMatrix } from '@/lib/report-export';
import type { ReportResult } from '@/services/reports';

const styles = StyleSheet.create({
  page: { padding: 26, fontFamily: 'Helvetica', fontSize: 7, color: '#14181d' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle: { fontSize: 8, color: '#626c76', marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5dade' },
  header: { backgroundColor: '#e9ecee', fontFamily: 'Helvetica-Bold' },
  cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 3 },
  footer: { position: 'absolute', bottom: 14, left: 26, right: 26, fontSize: 7, color: '#626c76', flexDirection: 'row', justifyContent: 'space-between' },
  note: { marginTop: 8, color: '#626c76', fontSize: 7 },
});

function ReportDocument({ report }: { report: ReportResult }) {
  const matrix = reportExportMatrix(report);
  return (
    <Document title={report.title} author="Electronics Shop IMS">
      <Page size="A4" orientation={matrix.headers.length > 6 ? 'landscape' : 'portrait'} style={styles.page} wrap>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.subtitle}>{report.description}</Text>
        <View style={[styles.row, styles.header]} fixed>
          {matrix.headers.map((header) => <Text key={header} style={styles.cell}>{header}</Text>)}
        </View>
        {matrix.rows.map((row, index) => (
          <View key={`${index}-${row[0]}`} style={styles.row} wrap={false}>
            {row.map((cell, cellIndex) => <Text key={cellIndex} style={styles.cell}>{cell || '—'}</Text>)}
          </View>
        ))}
        {report.note && <Text style={styles.note}>{report.note}</Text>}
        <View style={styles.footer} fixed>
          <Text>Generated in Asia/Dhaka</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function reportToPdf(report: ReportResult): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />);
}
