import Papa from 'papaparse';

import { formatBDT } from '@/lib/money';
import type { ReportCell, ReportColumn, ReportResult } from '@/services/reports';

export function formatReportCell(value: ReportCell, column: ReportColumn): string {
  if (value === null || value === '') return '';
  if (column.type === 'money') return formatBDT(Number(value)).replace('৳', 'BDT ');
  if (column.type === 'date') {
    return new Date(String(value)).toLocaleString('en-GB', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }
  return String(value);
}

/** CSV and PDF both consume this exact matrix, keeping exports in parity. */
export function reportExportMatrix(report: ReportResult): { headers: string[]; rows: string[][] } {
  return {
    headers: report.columns.map((column) => column.label),
    rows: report.rows.map((row) => report.columns.map((column) => formatReportCell(row.cells[column.key] ?? null, column))),
  };
}

export function reportToCsv(report: ReportResult): string {
  const matrix = reportExportMatrix(report);
  return Papa.unparse({ fields: matrix.headers, data: matrix.rows });
}
