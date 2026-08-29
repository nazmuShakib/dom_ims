'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireCapability } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import {
  addWarrantyNote,
  createWarrantyClaim,
  resolveWarrantyClaim,
  recordWarrantyHandover,
  transitionWarrantyClaim,
  updateSupplierWarrantyCase,
} from '@/services/warranty';
import type { RmaCoverage, RmaCustody, RmaStatus, SupplierWarrantyStatus } from '@/domain/types';

export interface WarrantyActionState { error?: string; ok?: string }
const str = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const message = (error: unknown) => error instanceof z.ZodError
  ? (error.issues[0]?.message ?? 'Invalid input')
  : error instanceof Error ? error.message : 'Something went wrong';

export async function createWarrantyClaimAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('CREATE_RMA');
  let claim;
  try {
    claim = await createWarrantyClaim({
      serialNo: str(fd, 'serialNo') ?? '',
      claimantName: str(fd, 'claimantName'),
      claimantPhone: str(fd, 'claimantPhone'),
      reportedIssue: str(fd, 'reportedIssue') ?? '',
      physicalCondition: str(fd, 'physicalCondition'),
      actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({ actorId: actor.id, action: 'warranty.create', entity: 'WarrantyClaim', entityId: claim.id, after: claim });
  } catch (error) { return { error: message(error) }; }
  revalidatePath('/warranty');
  redirect(`/warranty/${claim.id}`);
}

export async function addWarrantyNoteAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('VIEW_RMA');
  const claimId = str(fd, 'claimId') ?? '';
  try {
    await addWarrantyNote(claimId, str(fd, 'note') ?? '', actor.id, str(fd, 'idempotencyKey') ?? '');
  } catch (error) { return { error: message(error) }; }
  revalidatePath(`/warranty/${claimId}`);
  return { ok: 'Note added.' };
}

export async function transitionWarrantyClaimAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('MANAGE_RMA');
  const claimId = str(fd, 'claimId') ?? '';
  try {
    const claim = await transitionWarrantyClaim({
      claimId,
      expectedStatus: str(fd, 'expectedStatus') as RmaStatus,
      nextStatus: str(fd, 'nextStatus') as RmaStatus,
      custody: (str(fd, 'custody') ?? undefined) as RmaCustody | undefined,
      coverage: (str(fd, 'coverage') ?? undefined) as RmaCoverage | undefined,
      assignedToId: str(fd, 'assignedToId'),
      resolution: str(fd, 'resolution'),
      note: str(fd, 'note') ?? '', actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({ actorId: actor.id, action: 'warranty.transition', entity: 'WarrantyClaim', entityId: claimId, after: claim });
  } catch (error) { return { error: message(error) }; }
  revalidatePath('/warranty'); revalidatePath(`/warranty/${claimId}`);
  return { ok: 'Claim updated.' };
}

export async function recordWarrantyHandoverAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('VIEW_RMA');
  const claimId = str(fd, 'claimId') ?? '';
  try {
    const claim = await recordWarrantyHandover({
      claimId,
      expectedStatus: str(fd, 'expectedStatus') as RmaStatus,
      expectedCustody: str(fd, 'expectedCustody') as RmaCustody,
      custody: str(fd, 'custody') as RmaCustody,
      note: str(fd, 'note') ?? '', actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({ actorId: actor.id, action: 'warranty.handover', entity: 'WarrantyClaim', entityId: claimId, after: claim });
  } catch (error) { return { error: message(error) }; }
  revalidatePath('/warranty'); revalidatePath(`/warranty/${claimId}`);
  return { ok: 'Custody handover recorded.' };
}

export async function resolveWarrantyClaimAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('MANAGE_RMA');
  const claimId = str(fd, 'claimId') ?? '';
  try {
    const claim = await resolveWarrantyClaim({
      claimId,
      expectedStatus: str(fd, 'expectedStatus') as RmaStatus,
      outcome: str(fd, 'outcome') as 'REPLACEMENT' | 'RESTOCK' | 'WRITEOFF',
      replacementSerial: str(fd, 'replacementSerial') ?? undefined,
      note: str(fd, 'note') ?? '', actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({ actorId: actor.id, action: 'warranty.resolve', entity: 'WarrantyClaim', entityId: claimId, after: claim });
  } catch (error) { return { error: message(error) }; }
  revalidatePath('/warranty'); revalidatePath(`/warranty/${claimId}`);
  revalidatePath('/stock/movements'); revalidatePath('/products');
  return { ok: 'Stock resolution recorded.' };
}

export async function updateSupplierWarrantyCaseAction(
  _state: WarrantyActionState,
  fd: FormData,
): Promise<WarrantyActionState> {
  const actor = await requireCapability('MANAGE_RMA');
  const claimId = str(fd, 'claimId') ?? '';
  try {
    const value = await updateSupplierWarrantyCase({
      claimId, supplierId: str(fd, 'supplierId') ?? '',
      reference: str(fd, 'reference'),
      status: str(fd, 'status') as SupplierWarrantyStatus,
      coverage: str(fd, 'coverage') as RmaCoverage,
      resolution: str(fd, 'resolution'), actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({ actorId: actor.id, action: 'supplier-warranty.update', entity: 'SupplierWarrantyCase', entityId: value?.id, after: value });
  } catch (error) { return { error: message(error) }; }
  revalidatePath(`/warranty/${claimId}`);
  return { ok: 'Supplier warranty case updated.' };
}
