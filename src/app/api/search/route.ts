import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getOptionalSession } from '@/lib/session';
import { searchInventory } from '@/lib/search';
import { retryRead } from '@/lib/retry';

export const dynamic = 'force-dynamic';

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(url.searchParams.get('q'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Search must be between 2 and 100 characters' }, { status: 400 });
  }

  // Searching is read-only. Retry the complete operation so a sleeping Neon
  // compute can wake even when the session lookup succeeded first.
  const results = await retryRead(
    () => searchInventory(parsed.data, session.role),
    { attempts: 3, delayMs: 250 },
  );
  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
