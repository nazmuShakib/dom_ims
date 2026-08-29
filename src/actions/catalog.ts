'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/repositories';
import { uuidv7 } from '@/lib/ids';
import { parseBDT } from '@/lib/money';
import { normalizeBangladeshMobile } from '@/lib/phone';
import { requireCapability } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import {
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  createSupplierSchema,
} from '@/schemas';

/**
 * Server Actions for the catalog (PLAN.md §16, Phase 1).
 *
 * Two rules hold in every action here:
 *   1. requireCapability() FIRST. A hidden button is not a permission (§9.2).
 *   2. Zod parses the FormData before anything touches the repository.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const now = () => new Date().toISOString();

/** FormData gives us strings. Empty string means "not provided", not "". */
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

function money(fd: FormData, key: string): number {
  const raw = str(fd, key);
  return raw === null ? 0 : parseBDT(raw);
}

function int(fd: FormData, key: string, fallback = 0): number {
  const raw = str(fd, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : fallback;
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

async function validateProductTaxonomy(
  categoryId: string,
  brandId: string | null | undefined,
  current?: { categoryId: string; brandId: string | null },
): Promise<string | null> {
  const [category, brand] = await Promise.all([
    db.categories.findById(categoryId),
    brandId ? db.brands.findById(brandId) : Promise.resolve(null),
  ]);

  // An existing product may retain a category/brand that was removed later,
  // but new products and changed selections must use active records.
  if (!category || (!category.isActive && current?.categoryId !== categoryId)) {
    return 'The selected category is unavailable.';
  }
  if (brandId && (!brand || (!brand.isActive && current?.brandId !== brandId))) {
    return 'The selected brand is unavailable.';
  }
  return null;
}

/* --- Products ------------------------------------------------------------- */

export async function createProduct(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');

  let input;
  try {
    input = createProductSchema.parse({
      sku: str(fd, 'sku') ?? '',
      barcode: str(fd, 'barcode'),
      name: str(fd, 'name') ?? '',
      description: str(fd, 'description'),
      model: str(fd, 'model'),
      trackingType: str(fd, 'trackingType') ?? 'SERIAL',
      categoryId: str(fd, 'categoryId') ?? '',
      brandId: str(fd, 'brandId'),
      defaultCostPrice: money(fd, 'defaultCostPrice'),
      defaultSalePrice: money(fd, 'defaultSalePrice'),
      staffMaxDiscount: actor.role === 'ADMIN' ? money(fd, 'staffMaxDiscount') : 0,
      taxRate: 0,
      reorderPoint: int(fd, 'reorderPoint', 5),
      imageUrl: null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: fieldErrors(err) };
    return { error: err instanceof Error ? err.message : 'Could not read the form' };
  }

  const taxonomyError = await validateProductTaxonomy(input.categoryId, input.brandId);
  if (taxonomyError) return { error: taxonomyError };

  const [barcodeOwner, serialOwner] = input.barcode
    ? await Promise.all([
        db.products.findByBarcode(input.barcode),
        db.units.findBySerial(input.barcode),
      ])
    : [null, null];
  if (barcodeOwner || serialOwner) {
    return { fieldErrors: { barcode: 'This barcode is already assigned to a product or device.' } };
  }

  let created;
  try {
    created = await db.products.create({
      id: uuidv7(),
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      model: input.model ?? null,
      trackingType: input.trackingType,
      categoryId: input.categoryId,
      brandId: input.brandId ?? null,
      defaultCostPrice: input.defaultCostPrice,
      defaultSalePrice: input.defaultSalePrice,
      staffMaxDiscount: input.staffMaxDiscount,
      taxRate: input.taxRate,
      reorderPoint: input.reorderPoint,
      // Stock starts at zero, always. It can only be moved by the ledger (§5.1).
      quantityOnHand: 0,
      avgCostPrice: 0,
      imageUrl: input.imageUrl ?? null,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the product' };
  }

  await writeAudit({
    actorId: actor.id,
    action: 'product.create',
    entity: 'Product',
    entityId: created.id,
    after: created,
  });

  revalidatePath('/products');
  redirect(`/products/${created.id}`);
}

export async function updateProduct(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');

  const id = str(fd, 'id');
  if (!id) return { error: 'Missing product id' };

  const existing = await db.products.findById(id);
  if (!existing) return { error: 'Product not found' };

  let input;
  try {
    input = createProductSchema.parse({
      sku: str(fd, 'sku') ?? '',
      barcode: str(fd, 'barcode'),
      name: str(fd, 'name') ?? '',
      description: str(fd, 'description'),
      model: str(fd, 'model'),
      // Tracking type is NOT editable once a product exists — see the form.
      trackingType: existing.trackingType,
      categoryId: str(fd, 'categoryId') ?? '',
      brandId: str(fd, 'brandId'),
      defaultCostPrice: money(fd, 'defaultCostPrice'),
      defaultSalePrice: money(fd, 'defaultSalePrice'),
      staffMaxDiscount: actor.role === 'ADMIN'
        ? money(fd, 'staffMaxDiscount')
        : existing.staffMaxDiscount,
      taxRate: existing.taxRate,
      reorderPoint: int(fd, 'reorderPoint', existing.reorderPoint),
      imageUrl: existing.imageUrl,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: fieldErrors(err) };
    return { error: err instanceof Error ? err.message : 'Could not read the form' };
  }

  const taxonomyError = await validateProductTaxonomy(input.categoryId, input.brandId, {
    categoryId: existing.categoryId,
    brandId: existing.brandId,
  });
  if (taxonomyError) return { error: taxonomyError };

  const [barcodeOwner, serialOwner] = input.barcode
    ? await Promise.all([
        db.products.findByBarcode(input.barcode),
        db.units.findBySerial(input.barcode),
      ])
    : [null, null];
  if ((barcodeOwner && barcodeOwner.id !== existing.id) || serialOwner) {
    return { fieldErrors: { barcode: 'This barcode is already assigned to a product or device.' } };
  }

  try {
    const updated = await db.products.update(id, {
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      model: input.model ?? null,
      categoryId: input.categoryId,
      brandId: input.brandId ?? null,
      defaultCostPrice: input.defaultCostPrice,
      defaultSalePrice: input.defaultSalePrice,
      staffMaxDiscount: input.staffMaxDiscount,
      reorderPoint: input.reorderPoint,
      // NOTE: quantityOnHand and avgCostPrice are absent on purpose. Editing a
      // product must never be able to change stock. Stock moves via the ledger.
    });
    await writeAudit({
      actorId: actor.id,
      action: 'product.update',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the product' };
  }

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

/** Soft delete. Movements and units reference this row forever (§6). */
export async function archiveProduct(fd: FormData): Promise<void> {
  const actor = await requireCapability('ARCHIVE_PRODUCTS');
  const id = fd.get('id');
  if (typeof id !== 'string') throw new Error('Missing product id');

  const before = await db.products.findById(id);
  await db.products.softDelete(id);
  await writeAudit({
    actorId: actor.id,
    action: 'product.archive',
    entity: 'Product',
    entityId: id,
    before,
    after: before ? { ...before, isActive: false } : undefined,
  });
  revalidatePath('/products');
  redirect('/products');
}

export async function restoreProduct(fd: FormData): Promise<void> {
  const actor = await requireCapability('ARCHIVE_PRODUCTS');
  const id = fd.get('id');
  if (typeof id !== 'string') throw new Error('Missing product id');

  const before = await db.products.findById(id);
  const after = await db.products.update(id, { isActive: true });
  await writeAudit({
    actorId: actor.id,
    action: 'product.restore',
    entity: 'Product',
    entityId: id,
    before,
    after,
  });
  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
}

/* --- Categories, brands, suppliers ---------------------------------------- */

export async function createCategory(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');

  const parsed = createCategorySchema.safeParse({
    name: str(fd, 'name') ?? '',
    parentId: str(fd, 'parentId'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const created = await db.categories.create({
      id: uuidv7(),
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      parentId: parsed.data.parentId ?? null,
      isActive: true,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'category.create',
      entity: 'Category',
      entityId: created.id,
      after: created,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the category' };
  }

  revalidatePath('/categories');
  return {};
}

export async function updateCategory(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  if (!id) return { error: 'Missing category id' };

  const before = await db.categories.findById(id);
  if (!before) return { error: 'Category not found' };

  const parsed = createCategorySchema.safeParse({
    name: str(fd, 'name') ?? '',
    parentId: before.parentId,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const updated = await db.categories.update(id, {
      name: parsed.data.name,
      slug: slugify(parsed.data.name) || before.slug,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'category.update',
      entity: 'Category',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the category' };
  }

  revalidatePath('/categories');
  revalidatePath('/products');
  revalidatePath('/reports');
  return { ok: 'Category updated.' };
}

export async function setCategoryActive(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  const activeValue = str(fd, 'active');
  if (!id) return { error: 'Missing category id' };
  if (activeValue !== 'true' && activeValue !== 'false') return { error: 'Invalid category status' };
  const active = activeValue === 'true';

  const before = await db.categories.findById(id);
  if (!before) return { error: 'Category not found' };
  if (before.isActive === active) return { ok: active ? 'Category restored.' : 'Category removed.' };

  if (!active) {
    const [products, categories] = await Promise.all([
      db.products.findAll({ categoryId: id, activeOnly: true }),
      db.categories.findAll({ activeOnly: true }),
    ]);
    if (products.length > 0) {
      return { error: 'Move or archive active products before removing this category.' };
    }
    if (categories.some((category) => category.parentId === id)) {
      return { error: 'Move or remove active child categories before removing this category.' };
    }
  }

  try {
    const updated = await db.categories.update(id, { isActive: active });
    await writeAudit({
      actorId: actor.id,
      action: active ? 'category.restore' : 'category.archive',
      entity: 'Category',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not change the category status' };
  }

  revalidatePath('/categories');
  revalidatePath('/products');
  return { ok: active ? 'Category restored.' : 'Category removed.' };
}

export async function createBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');

  const parsed = createBrandSchema.safeParse({ name: str(fd, 'name') ?? '' });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const created = await db.brands.create({
      id: uuidv7(),
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      isActive: true,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'brand.create',
      entity: 'Brand',
      entityId: created.id,
      after: created,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the brand' };
  }

  revalidatePath('/brands');
  return {};
}

export async function updateBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  if (!id) return { error: 'Missing brand id' };

  const before = await db.brands.findById(id);
  if (!before) return { error: 'Brand not found' };

  const parsed = createBrandSchema.safeParse({ name: str(fd, 'name') ?? '' });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const updated = await db.brands.update(id, {
      name: parsed.data.name,
      slug: slugify(parsed.data.name) || before.slug,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'brand.update',
      entity: 'Brand',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the brand' };
  }

  revalidatePath('/brands');
  revalidatePath('/products');
  revalidatePath('/reports');
  return { ok: 'Brand updated.' };
}

export async function setBrandActive(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  const activeValue = str(fd, 'active');
  if (!id) return { error: 'Missing brand id' };
  if (activeValue !== 'true' && activeValue !== 'false') return { error: 'Invalid brand status' };
  const active = activeValue === 'true';

  const before = await db.brands.findById(id);
  if (!before) return { error: 'Brand not found' };
  if (before.isActive === active) return { ok: active ? 'Brand restored.' : 'Brand removed.' };

  if (!active) {
    const products = await db.products.findAll({ brandId: id, activeOnly: true });
    if (products.length > 0) {
      return { error: 'Move or archive active products before removing this brand.' };
    }
  }

  try {
    const updated = await db.brands.update(id, { isActive: active });
    await writeAudit({
      actorId: actor.id,
      action: active ? 'brand.restore' : 'brand.archive',
      entity: 'Brand',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not change the brand status' };
  }

  revalidatePath('/brands');
  revalidatePath('/products');
  return { ok: active ? 'Brand restored.' : 'Brand removed.' };
}

export async function createSupplier(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');

  const parsed = createSupplierSchema.safeParse({
    name: str(fd, 'name') ?? '',
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    address: str(fd, 'address'),
    note: str(fd, 'note'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const created = await db.suppliers.create({
      id: uuidv7(),
      name: parsed.data.name,
      phone: parsed.data.phone ? normalizeBangladeshMobile(parsed.data.phone) : null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      note: parsed.data.note ?? null,
      isActive: true,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'supplier.create',
      entity: 'Supplier',
      entityId: created.id,
      after: created,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the supplier' };
  }

  revalidatePath('/suppliers');
  return {};
}

export async function updateSupplier(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  if (!id) return { error: 'Missing supplier id' };

  const before = await db.suppliers.findById(id);
  if (!before) return { error: 'Supplier not found' };

  const parsed = createSupplierSchema.safeParse({
    name: str(fd, 'name') ?? '',
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    address: str(fd, 'address'),
    note: str(fd, 'note'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const updated = await db.suppliers.update(id, {
      name: parsed.data.name,
      phone: parsed.data.phone ? normalizeBangladeshMobile(parsed.data.phone) : null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      note: parsed.data.note ?? null,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'supplier.update',
      entity: 'Supplier',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the supplier' };
  }

  revalidatePath('/suppliers');
  return { ok: 'Supplier updated.' };
}

export async function setSupplierActive(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireCapability('MANAGE_CATALOG');
  const id = str(fd, 'id');
  const active = str(fd, 'active') === 'true';
  if (!id) return { error: 'Missing supplier id' };

  const before = await db.suppliers.findById(id);
  if (!before) return { error: 'Supplier not found' };

  try {
    const updated = await db.suppliers.update(id, { isActive: active });
    await writeAudit({
      actorId: actor.id,
      action: active ? 'supplier.restore' : 'supplier.archive',
      entity: 'Supplier',
      entityId: id,
      before,
      after: updated,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not change the supplier status' };
  }

  revalidatePath('/suppliers');
  revalidatePath('/stock/in');
  revalidatePath('/warranty');
  return { ok: active ? 'Supplier restored.' : 'Supplier removed.' };
}
