import type { Product, ProductUnit, Role } from '@/domain/types';
import { canSeeCosts } from '@/lib/permissions';
import type { Paisa } from '@/lib/money';

/**
 * PLAN.md §9.2 — cost prices are stripped SERVER-SIDE, not hidden with CSS.
 *
 * A STAFF user's payload must not CONTAIN the cost fields. Rendering them and
 * setting `display: none` is not a permission, it's a rumour: anyone can open
 * devtools, and any JSON endpoint leaks them wholesale.
 *
 * So: cost fields are `undefined` in the STAFF DTO, and the type says so. The
 * compiler then refuses to let a component read `.costPrice` without first
 * narrowing — the rule is enforced by TypeScript, not by discipline.
 */

export interface ProductDTO {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  model: string | null;
  trackingType: Product['trackingType'];
  categoryId: string;
  brandId: string | null;
  reorderPoint: number;
  quantityOnHand: number;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;

  /** undefined for STAFF. Never optional-chained away — check the role. */
  defaultCostPrice?: Paisa;
  avgCostPrice?: Paisa;
  defaultSalePrice: Paisa;
}

export function toProductDTO(p: Product, role: Role): ProductDTO {
  const base: ProductDTO = {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    description: p.description,
    model: p.model,
    trackingType: p.trackingType,
    categoryId: p.categoryId,
    brandId: p.brandId,
    reorderPoint: p.reorderPoint,
    quantityOnHand: p.quantityOnHand,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    createdAt: p.createdAt,
    defaultSalePrice: p.defaultSalePrice, // staff need this — they sell things
  };

  if (!canSeeCosts(role)) return base;

  return {
    ...base,
    defaultCostPrice: p.defaultCostPrice,
    avgCostPrice: p.avgCostPrice,
  };
}

export interface ProductUnitDTO {
  id: string;
  serialNo: string;
  productId: string;
  status: ProductUnit['status'];
  supplierId: string | null;
  receivedAt: string;
  soldAt: string | null;
  warrantyExpiresAt: string | null;
  warrantyMonths: number | null;
  warrantyDays: number | null;
  location: string | null;
  salePrice: Paisa | null;
  usedGrade: ProductUnit['usedGrade'];
  batteryHealth: number | null;
  inspectionResults: ProductUnit['inspectionResults'];
  knownDefects: string | null;
  includedAccessories: string | null;
  askingPrice: Paisa | null;

  /** undefined for STAFF — this is the margin, and staff don't get it. */
  costPrice?: Paisa;
}

export function toProductUnitDTO(u: ProductUnit, role: Role): ProductUnitDTO {
  const base: ProductUnitDTO = {
    id: u.id,
    serialNo: u.serialNo,
    productId: u.productId,
    status: u.status,
    supplierId: u.supplierId,
    receivedAt: u.receivedAt,
    soldAt: u.soldAt,
    warrantyExpiresAt: u.warrantyExpiresAt,
    warrantyMonths: u.warrantyMonths,
    warrantyDays: u.warrantyDays ?? null,
    location: u.location,
    salePrice: u.salePrice,
    usedGrade: u.usedGrade ?? null,
    batteryHealth: u.batteryHealth ?? null,
    inspectionResults: u.inspectionResults ?? null,
    knownDefects: u.knownDefects ?? null,
    includedAccessories: u.includedAccessories ?? null,
    askingPrice: u.askingPrice ?? null,
  };

  if (!canSeeCosts(role)) return base;
  return { ...base, costPrice: u.costPrice };
}
