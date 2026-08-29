/** Tables that survive the one-time production business-data reset. */
export const PRESERVED_PRODUCTION_TABLES = [
  'users',
  'accounts',
  '_prisma_migrations',
] as const;

/**
 * Every application table except users and their credentials. Keep this list
 * explicit: the safety test fails when a future Prisma model is not classified.
 */
export const BUSINESS_DATA_TABLES = [
  'sessions',
  'verifications',
  'audit_logs',
  'categories',
  'brands',
  'suppliers',
  'products',
  'product_units',
  'used_device_acquisitions',
  'refurbishment_expenses',
  'operating_expenses',
  'expense_categories',
  'stock_movements',
  'supplier_returns',
  'warranty_claims',
  'warranty_claim_events',
  'supplier_warranty_cases',
  'document_sequences',
  'customers',
  'cart_drafts',
  'sale_settlements',
  'sales',
  'sale_items',
  'emi_contracts',
  'emi_installments',
  'emi_payments',
  'emi_payment_allocations',
  'emi_early_settlements',
] as const;

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

export function productionBusinessDataTruncateSql(): string {
  const tables = BUSINESS_DATA_TABLES.map(quoteIdentifier).join(',\n  ');
  // RESTRICT is intentional. If a future table references one of these tables
  // and is missing above, PostgreSQL refuses instead of deleting it implicitly.
  return `TRUNCATE TABLE\n  ${tables}\nRESTART IDENTITY RESTRICT`;
}
