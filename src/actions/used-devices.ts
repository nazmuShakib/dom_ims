'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { parseBDT } from '@/lib/money';
import { requireCapability } from '@/lib/session';
import { acceptUsedDevice, addRefurbishmentExpense, updateUsedDeviceDetails } from '@/services/used-devices';
import { saveTradeInDraft } from '@/services/checkout';
import type { AcceptUsedDeviceInput } from '@/schemas';
import type { InspectionResult, UsedAcquisitionType, UsedDeviceGrade } from '@/domain/types';

export interface UsedDeviceActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  receipt?: {
    unitId: string;
    productId: string;
    serialNo: string;
    acquisitionType: UsedAcquisitionType;
    acquisitionValue: number;
    askingPrice: number;
  };
}

const inspectionKeys = [
  'imeiMatches', 'activationLockClear', 'networkAndSim', 'wifi', 'bluetooth',
  'display', 'touchscreen', 'cameras', 'microphone', 'speakers', 'chargingPort',
  'buttons', 'biometrics', 'frameAndBack', 'waterDamageFree', 'battery',
] as const;

function str(data: FormData, name: string): string | null {
  const value = data.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Invalid input.';
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) output[issue.path.join('.') || '_'] ??= issue.message;
  return output;
}

function inputFromForm(
  data: FormData,
  actorId: string,
  acquisitionType?: UsedAcquisitionType,
): AcceptUsedDeviceInput {
  if (data.get('ownershipConfirmed') !== 'on') {
    throw new Error('Confirm that the seller owns the device.');
  }
  const inspectionResults = Object.fromEntries(
    inspectionKeys.map((key) => [key, (str(data, `inspection.${key}`) ?? 'NOT_TESTED') as InspectionResult]),
  ) as AcceptUsedDeviceInput['inspectionResults'];
  const warrantyDuration = str(data, 'warrantyDuration') ? Number(str(data, 'warrantyDuration')) : null;
  const warrantyUnit = str(data, 'warrantyUnit') ?? 'MONTHS';
  const resolvedAcquisitionType = acquisitionType ?? (str(data, 'acquisitionType') ?? '') as UsedAcquisitionType;
  const acquisitionValue = parseBDT(str(data, 'acquisitionValue') ?? '');
  const askingPriceText = str(data, 'askingPrice');
  return {
    productId: str(data, 'productId') ?? '',
    serialNo: str(data, 'serialNo') ?? '',
    grade: (str(data, 'grade') ?? '') as UsedDeviceGrade,
    batteryHealth: str(data, 'batteryHealth') ? Number(str(data, 'batteryHealth')) : null,
    inspectionResults,
    knownDefects: str(data, 'knownDefects'),
    includedAccessories: str(data, 'includedAccessories'),
    askingPrice: askingPriceText ? parseBDT(askingPriceText) : parseBDT(''),
    warrantyMonths: warrantyUnit === 'MONTHS' ? warrantyDuration : null,
    warrantyDays: warrantyUnit === 'DAYS' ? warrantyDuration : null,
    location: str(data, 'location'),
    acquisitionType: resolvedAcquisitionType,
    sellerName: str(data, 'sellerName') ?? '',
    sellerPhone: str(data, 'sellerPhone') ?? '',
    identificationType: str(data, 'identificationType'),
    identificationNumber: str(data, 'identificationNumber'),
    acquisitionValue,
    ownershipConfirmed: true,
    reference: str(data, 'reference'),
    note: str(data, 'note'),
    actorId,
    idempotencyKey: str(data, 'idempotencyKey') ?? '',
  };
}

export async function acceptUsedDeviceAction(
  _previous: UsedDeviceActionState,
  data: FormData,
): Promise<UsedDeviceActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const input = inputFromForm(data, actor.id);
    if (input.acquisitionType === 'TRADE_IN') {
      throw new Error('Start a trade-in from Checkout so the credit and sale complete together.');
    }
    const result = await acceptUsedDevice(input);
    await writeAudit({
      actorId: actor.id,
      action: 'used_device.accept',
      entity: 'UsedDeviceAcquisition',
      entityId: result.acquisition.id,
      after: {
        unitId: result.unit.id,
        productId: result.unit.productId,
        serialNo: result.unit.serialNo,
        type: result.acquisition.type,
        grade: result.unit.usedGrade,
        acquisitionValue: result.acquisition.acquisitionValue,
        askingPrice: result.unit.askingPrice,
      },
    });
    revalidatePath('/products');
    revalidatePath(`/products/${result.unit.productId}`);
    revalidatePath('/stock/movements');
    revalidatePath('/checkout');
    return {
      ok: `Accepted ${result.unit.serialNo} into used-phone inventory.`,
      receipt: {
        unitId: result.unit.id,
        productId: result.unit.productId,
        serialNo: result.unit.serialNo,
        acquisitionType: result.acquisition.type,
        acquisitionValue: result.acquisition.acquisitionValue,
        askingPrice: result.unit.askingPrice ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: message(error), fieldErrors: fieldErrors(error) };
    return { error: message(error) };
  }
}

export async function saveTradeInDraftAction(
  _previous: UsedDeviceActionState,
  data: FormData,
): Promise<UsedDeviceActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const cartId = str(data, 'cartId') ?? '';
    const cart = await saveTradeInDraft({
      ...inputFromForm(data, actor.id, 'TRADE_IN'),
      cartId,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'trade_in.draft_save',
      entity: 'CartDraft',
      entityId: cart.id,
      after: { serialNo: cart.tradeInDraft?.serialNo, acquisitionValue: cart.tradeInDraft?.acquisitionValue },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: message(error), fieldErrors: fieldErrors(error) };
    return { error: message(error) };
  }
  revalidatePath('/checkout');
  redirect('/checkout');
}

export async function addRefurbishmentExpenseAction(
  _previous: UsedDeviceActionState,
  data: FormData,
): Promise<UsedDeviceActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const result = await addRefurbishmentExpense({
      unitId: str(data, 'unitId') ?? '',
      description: str(data, 'description') ?? '',
      amount: parseBDT(str(data, 'amount') ?? ''),
      actorId: actor.id,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'used_device.refurbishment_cost_add',
      entity: 'ProductUnit',
      entityId: result.unit.id,
      after: { expenseId: result.expense.id, amount: result.expense.amount, costPrice: result.unit.costPrice },
    });
    revalidatePath(`/products/${result.unit.productId}`);
    revalidatePath('/reports');
    return { ok: 'Refurbishment cost added to this phone.' };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: message(error), fieldErrors: fieldErrors(error) };
    return { error: message(error) };
  }
}

export async function updateUsedDeviceAction(
  _previous: UsedDeviceActionState,
  data: FormData,
): Promise<UsedDeviceActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const warrantyDuration = str(data, 'warrantyDuration') ? Number(str(data, 'warrantyDuration')) : null;
    const warrantyUnit = str(data, 'warrantyUnit') ?? 'MONTHS';
    const unit = await updateUsedDeviceDetails({
      unitId: str(data, 'unitId') ?? '',
      grade: (str(data, 'grade') ?? 'GRADE_B') as UsedDeviceGrade,
      batteryHealth: str(data, 'batteryHealth') ? Number(str(data, 'batteryHealth')) : null,
      knownDefects: str(data, 'knownDefects'),
      includedAccessories: str(data, 'includedAccessories'),
      askingPrice: parseBDT(str(data, 'askingPrice') ?? ''),
      warrantyMonths: warrantyUnit === 'MONTHS' ? warrantyDuration : null,
      warrantyDays: warrantyUnit === 'DAYS' ? warrantyDuration : null,
      actorId: actor.id,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'used_device.details_update',
      entity: 'ProductUnit',
      entityId: unit.id,
      after: { grade: unit.usedGrade, askingPrice: unit.askingPrice, warrantyMonths: unit.warrantyMonths, warrantyDays: unit.warrantyDays },
    });
    revalidatePath(`/products/${unit.productId}`);
    revalidatePath('/checkout');
    return { ok: 'Used-phone details updated.' };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: message(error), fieldErrors: fieldErrors(error) };
    return { error: message(error) };
  }
}
