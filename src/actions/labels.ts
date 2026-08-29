'use server';

import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { isCode128Value } from '@/lib/code128';
import { hasPermission } from '@/lib/permissions';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';

const printSchema = z.object({
  productId: z.string().trim().min(1),
  unitIds: z.array(z.string().trim().min(1)).max(500),
  copies: z.coerce.number().int().min(1).max(500),
  layout: z.enum(['thermal', 'a4']),
});

export interface LabelPrintState {
  error?: string;
  printNonce?: string;
}

function str(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

export async function recordLabelPrintAction(
  _previous: LabelPrintState,
  fd: FormData,
): Promise<LabelPrintState> {
  const actor = await requireCapability('PRINT_LABELS');

  let unitIds: unknown = [];
  try {
    unitIds = JSON.parse(str(fd, 'unitIds') || '[]');
  } catch {
    return { error: 'The selected unit list is invalid. Reload the page and try again.' };
  }

  const parsed = printSchema.safeParse({
    productId: str(fd, 'productId'),
    unitIds,
    copies: str(fd, 'copies'),
    layout: str(fd, 'layout'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid label print request.' };
  }

  const input = parsed.data;
  const product = await db.products.findById(input.productId);
  if (!product) return { error: 'Product not found.' };

  const canPrintNonStock = hasPermission(actor.role, 'REPRINT_NON_STOCK_LABELS');
  let statuses: string[] = [];
  let uniqueUnitIds: string[] = [];

  if (product.trackingType === 'SERIAL') {
    uniqueUnitIds = [...new Set(input.unitIds)];
    if (uniqueUnitIds.length === 0) {
      return { error: 'Select at least one individually tracked item.' };
    }
    if (uniqueUnitIds.length * input.copies > 500) {
      return { error: 'A print job may contain at most 500 labels.' };
    }

    const unitsById = new Map(
      (await db.units.findByProduct(product.id)).map((unit) => [unit.id, unit]),
    );
    const units = uniqueUnitIds.map((id) => unitsById.get(id));
    if (units.some((unit) => !unit)) {
      return { error: 'One or more selected units do not belong to this product.' };
    }
    statuses = units.map((unit) => unit!.status);
    if (!canPrintNonStock && statuses.some((status) => status !== 'IN_STOCK')) {
      return { error: 'STAFF may only print labels for units currently in stock.' };
    }
    if (units.some((unit) => !isCode128Value(unit!.serialNo))) {
      return { error: 'One or more device numbers contain characters Code 128 cannot encode.' };
    }
  } else {
    if (input.unitIds.length > 0) {
      return { error: 'Bulk/count-based products do not have individual item records.' };
    }
    if (!canPrintNonStock && product.quantityOnHand <= 0) {
      return { error: 'STAFF may only print labels for products currently in stock.' };
    }
    if (!product.barcode) {
      return { error: 'Add a barcode to this product before printing labels.' };
    }
    if (!isCode128Value(product.barcode)) {
      return { error: 'This product barcode contains characters Code 128 cannot encode.' };
    }
  }

  await writeAudit({
    actorId: actor.id,
    action: 'label.print',
    entity: product.trackingType === 'SERIAL' ? 'ProductUnit' : 'Product',
    entityId: uniqueUnitIds.length === 1 ? uniqueUnitIds[0] : product.id,
    after: {
      productId: product.id,
      sku: product.sku,
      layout: input.layout,
      copiesPerItem: input.copies,
      labelCount:
        product.trackingType === 'SERIAL'
          ? uniqueUnitIds.length * input.copies
          : input.copies,
      unitIds: uniqueUnitIds,
      statuses,
    },
  });

  return { printNonce: crypto.randomUUID() };
}
