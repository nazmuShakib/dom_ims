import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';

import { uuidv7 } from '@/lib/ids';
import { prisma } from '@/lib/prisma';

interface AuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function requestAuditIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip');
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const ip = await requestAuditIp();

  await prisma.auditLog.create({
    data: {
      id: uuidv7(),
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? undefined : snapshot(input.before),
      after: input.after === undefined ? undefined : snapshot(input.after),
      ip,
    },
  });
}
