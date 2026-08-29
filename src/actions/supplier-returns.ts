'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@/lib/audit';
import { parseBDT } from '@/lib/money';
import { requireCapability } from '@/lib/session';
import { settleSupplierReturnSchema } from '@/schemas';
import { cancelSupplierReturnSchema } from '@/schemas';
import { cancelSupplierReturn, settleSupplierReturn } from '@/services/supplier-returns';

export interface SupplierReturnActionState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function cancelSupplierReturnAction(
  _previous: SupplierReturnActionState,
  data: FormData,
): Promise<SupplierReturnActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const parsed = cancelSupplierReturnSchema.safeParse({
    returnId: text(data, 'returnId') ?? '',
    reason: text(data, 'reason') ?? '',
    actorId: actor.id,
    idempotencyKey: text(data, 'idempotencyKey') ?? '',
  });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const result = await cancelSupplierReturn(parsed.data);
    await writeAudit({ actorId: actor.id, action: 'supplier_return.cancel', entity: 'SupplierReturn', entityId: result.supplierReturn.id, after: result });
    revalidatePath('/suppliers/returns');
    revalidatePath('/products');
    revalidatePath('/stock/movements');
    return { ok: 'Supplier return cancelled and stock restored.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not cancel this supplier return.' };
  }
}

function text(data: FormData, key: string): string | null {
  const value = data.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function errors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]));
}

export async function settleSupplierReturnAction(
  _previous: SupplierReturnActionState,
  data: FormData,
): Promise<SupplierReturnActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  let recoveredAmount = 0;
  try {
    recoveredAmount = parseBDT(text(data, 'recoveredAmount') ?? '');
  } catch {
    return { fieldErrors: { recoveredAmount: 'Enter a valid recovered amount.' } };
  }

  const parsed = settleSupplierReturnSchema.safeParse({
    returnId: text(data, 'returnId') ?? '',
    recoveredAmount,
    recoveryMethod: text(data, 'recoveryMethod') ?? '',
    settlementReference: text(data, 'settlementReference'),
    settlementNote: text(data, 'settlementNote'),
    actorId: actor.id,
  });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };

  try {
    const settled = await settleSupplierReturn(parsed.data);
    await writeAudit({
      actorId: actor.id,
      action: 'supplier_return.settle',
      entity: 'SupplierReturn',
      entityId: settled.id,
      after: settled,
    });
    revalidatePath('/suppliers/returns');
    revalidatePath('/reports');
    return { ok: 'Supplier return settlement recorded.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not settle this supplier return.' };
  }
}
