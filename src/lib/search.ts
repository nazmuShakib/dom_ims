import type { Role } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import { toProductDTO, toProductUnitDTO } from '@/lib/dto';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';

export interface UnitSearchResult {
  kind: 'unit';
  id: string;
  serialNo: string;
  productId: string;
  productName: string;
  sku: string;
  status: string;
  supplierName: string | null;
  receivedAt: string;
  soldAt: string | null;
  warrantyExpiresAt: string | null;
  underWarranty: boolean;
  salePrice: Paisa | null;
  costPrice?: Paisa;
}

export interface ProductSearchResult {
  kind: 'product';
  id: string;
  name: string;
  sku: string;
  model: string | null;
  barcode: string | null;
  trackingType: string;
  onHand: number;
  defaultSalePrice: Paisa;
  defaultCostPrice?: Paisa;
  avgCostPrice?: Paisa;
  isActive: boolean;
}

export interface SearchResponse {
  query: string;
  units: UnitSearchResult[];
  products: ProductSearchResult[];
}

/** Scanner order: exact serial → exact barcode → exact SKU → fuzzy product search. */
export async function searchInventory(
  query: string,
  role: Role,
  now = new Date(),
  repositories: Repositories = db,
): Promise<SearchResponse> {
  const normalized = query.trim();
  if (!normalized) return { query: '', units: [], products: [] };

  const unit = await repositories.units.findBySerial(normalized);
  if (unit) {
    const [product, supplier] = await Promise.all([
      repositories.products.findById(unit.productId),
      unit.supplierId ? repositories.suppliers.findById(unit.supplierId) : Promise.resolve(null),
    ]);
    if (!product) return { query: normalized, units: [], products: [] };
    const dto = toProductUnitDTO(unit, role);
    const result: UnitSearchResult = {
      kind: 'unit',
      id: dto.id,
      serialNo: dto.serialNo,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      status: dto.status,
      supplierName: supplier?.name ?? null,
      receivedAt: dto.receivedAt,
      soldAt: dto.soldAt,
      warrantyExpiresAt: dto.warrantyExpiresAt,
      underWarranty: dto.warrantyExpiresAt ? new Date(dto.warrantyExpiresAt) >= now : false,
      salePrice: dto.salePrice,
    };
    if (dto.costPrice !== undefined) result.costPrice = dto.costPrice;
    return { query: normalized, units: [result], products: [] };
  }

  const exactBarcode = await repositories.products.findByBarcode(normalized);
  const exactSku = exactBarcode ? null : await repositories.products.findBySku(normalized);
  const matches = exactBarcode || exactSku
    ? [exactBarcode ?? exactSku!]
    : await repositories.products.search(normalized, 10);
  const products = await Promise.all(
    matches.map(async (product): Promise<ProductSearchResult> => {
      const dto = toProductDTO(product, role);
      const result: ProductSearchResult = {
        kind: 'product',
        id: dto.id,
        name: dto.name,
        sku: dto.sku,
        model: dto.model,
        barcode: dto.barcode,
        trackingType: dto.trackingType,
        onHand:
          product.trackingType === 'SERIAL'
            ? await repositories.units.countInStock(product.id)
            : product.quantityOnHand,
        defaultSalePrice: dto.defaultSalePrice,
        isActive: dto.isActive,
      };
      if (dto.defaultCostPrice !== undefined) result.defaultCostPrice = dto.defaultCostPrice;
      if (dto.avgCostPrice !== undefined) result.avgCostPrice = dto.avgCostPrice;
      return result;
    }),
  );

  return { query: normalized, units: [], products };
}
