import { NextResponse } from 'next/server';

import { hasPermission } from '@/lib/permissions';
import { reportToCsv } from '@/lib/report-export';
import { reportToPdf } from '@/lib/report-pdf';
import { getAuthUserNames, getOptionalSession } from '@/lib/session';
import { getReport, getReportActorIds, parseReportFilters } from '@/services/reports';

export const dynamic = 'force-dynamic';

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_REPORTS')) {
    return NextResponse.json({ error: 'Financial reports require manager access' }, { status: 403 });
  }

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const format = raw.format === 'pdf' ? 'pdf' : 'csv';
  const filters = parseReportFilters(raw);
  const actorNames = await getAuthUserNames(await getReportActorIds());
  const report = await getReport(filters, { actorNames });
  const filename = `${safeName(report.title)}-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (format === 'pdf') {
    const content = await reportToPdf(report);
    return new Response(new Uint8Array(content), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
    });
  }

  const content = `\uFEFF${reportToCsv(report)}`;
  return new Response(content, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
  });
}
