import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BUSINESS_DATA_TABLES,
  PRESERVED_PRODUCTION_TABLES,
  productionBusinessDataTruncateSql,
} from '@/lib/production-reset';

describe('production business-data reset safety', () => {
  it('classifies every Prisma application table and preserves only users and accounts', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const mappedTables = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((match) => match[1]!);
    const preservedApplicationTables = PRESERVED_PRODUCTION_TABLES.filter(
      (table) => table !== '_prisma_migrations',
    );

    expect([...preservedApplicationTables].sort()).toEqual(['accounts', 'users']);
    expect([...BUSINESS_DATA_TABLES].sort()).toEqual(
      mappedTables.filter((table) => !preservedApplicationTables.includes(table as never)).sort(),
    );
    expect(BUSINESS_DATA_TABLES).not.toContain('users');
    expect(BUSINESS_DATA_TABLES).not.toContain('accounts');
  });

  it('uses an explicit RESTRICT truncate and never cascades into unclassified tables', () => {
    const sql = productionBusinessDataTruncateSql();
    expect(sql).toContain('RESTART IDENTITY RESTRICT');
    expect(sql).not.toContain('CASCADE');
    expect(sql).not.toContain('"users"');
    expect(sql).not.toContain('"accounts"');
    expect(sql).not.toContain('"_prisma_migrations"');
    for (const table of BUSINESS_DATA_TABLES) expect(sql).toContain(`"${table}"`);
  });

  it('requires a dedicated URL, confirmation phrase and matching database fingerprint', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts/clear-production-business-data.ts'),
      'utf8',
    );
    expect(script).toContain("required('PRODUCTION_RESET_DATABASE_URL')");
    expect(script).not.toContain('process.env.DATABASE_URL');
    expect(script).toContain("CONFIRMATION = 'DELETE_ALL_PRODUCTION_BUSINESS_DATA'");
    expect(script).toContain('CONFIRM_PRODUCTION_DATABASE');
    expect(script).toContain('productionBusinessDataTruncateSql()');
    expect(script).toContain('transaction.auditLog.create');
  });
});
