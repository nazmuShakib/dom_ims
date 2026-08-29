import { NextResponse } from 'next/server';

import { hasPermission } from '@/lib/permissions';
import { reportToCsv } from '@/lib/report-export';
import { reportToPdf } from '@/lib/report-pdf';
import { getAuthUserNames, getOptionalSession } from '@/lib/session';
import { formatBDT } from '@/lib/money';
import { db } from '@/repositories';
import { listExpenses, parseExpenseQuery, summarizeExpenses } from '@/services/expenses';
import type { ReportResult } from '@/services/reports';

export const dynamic = 'force-dynamic';

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+06:00`));
}

function formatExportBDT(paisa: number): string {
  return formatBDT(paisa).replace('৳', 'BDT ');
}

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_EXPENSES')) {
    return NextResponse.json({ error: 'Operating expenses require manager access' }, { status: 403 });
  }
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const format = raw.format === 'pdf' ? 'pdf' : 'csv';
  const query = parseExpenseQuery(raw);
  const [expenses, categories] = await Promise.all([listExpenses(query), db.expenseCategories.findAll()]);
  const actors = await getAuthUserNames(expenses.map((item) => item.recordedById));
  const categoryById = new Map(categories.map((item) => [item.id, item.name]));
  const summary = summarizeExpenses(expenses, categories);
  const report: ReportResult = {
    kind: 'movements',
    title: 'Operating expenses',
    description: query.from || query.to
      ? `${query.from ? displayDate(query.from) : 'Beginning'} to ${query.to ? displayDate(query.to) : 'Today'}`
      : 'All dates',
    generatedAt: new Date().toISOString(),
    note: `Active entries: ${summary.activeCount} · Total: ${formatExportBDT(summary.activeTotal)} · Voided entries: ${summary.voidedCount}`,
    columns: [
      { key: 'number', label: 'Expense number', type: 'text' },
      { key: 'date', label: 'Expense date', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'paidTo', label: 'Paid to', type: 'text' },
      { key: 'method', label: 'Payment method', type: 'text' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'actor', label: 'Recorded by', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'voidReason', label: 'Void reason', type: 'text' },
    ],
    rows: expenses.map((item) => ({ id: item.id, cells: {
      number: item.expenseNumber, date: displayDate(item.expenseDate), category: categoryById.get(item.categoryId) ?? '',
      description: item.description, paidTo: item.paidTo, method: item.paymentMethod,
      reference: item.reference, amount: item.amount, actor: actors.get(item.recordedById) ?? '',
      status: item.status, voidReason: item.voidReason,
    } })),
    totals: { amount: summary.activeTotal },
  };
  const filename = `operating-expenses-${query.from ?? 'beginning'}-to-${query.to ?? 'today'}.${format}`;
  if (format === 'pdf') {
    const content = await reportToPdf(report);
    return new Response(new Uint8Array(content), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  }
  return new Response(`\uFEFF${reportToCsv(report)}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
