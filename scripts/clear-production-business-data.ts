import { Prisma, PrismaClient } from '@prisma/client';

import { uuidv7 } from '@/lib/ids';
import {
  BUSINESS_DATA_TABLES,
  PRESERVED_PRODUCTION_TABLES,
  productionBusinessDataTruncateSql,
} from '@/lib/production-reset';

const CONFIRMATION = 'DELETE_ALL_PRODUCTION_BUSINESS_DATA';

type QueryClient = PrismaClient | Prisma.TransactionClient;
type CountRow = { tableName: string; rowCount: bigint };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseFingerprint(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('PRODUCTION_RESET_DATABASE_URL is not a valid URL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('PRODUCTION_RESET_DATABASE_URL must be a PostgreSQL connection string.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(default database)';
  return `${url.hostname}/${database}`;
}

function maskPhone(phoneNumber: string | null): string {
  if (!phoneNumber) return 'no mobile number';
  if (phoneNumber.length < 8) return '***';
  return `${phoneNumber.slice(0, 6)}*****${phoneNumber.slice(-2)}`;
}

function countSql(tables: readonly string[]): string {
  return tables
    .map((table) => `SELECT '${table}' AS "tableName", COUNT(*)::bigint AS "rowCount" FROM "${table}"`)
    .join('\nUNION ALL\n');
}

async function rowCounts(client: QueryClient, tables: readonly string[]): Promise<Map<string, number>> {
  const rows = await client.$queryRawUnsafe<CountRow[]>(countSql(tables));
  return new Map(rows.map((row) => [row.tableName, Number(row.rowCount)]));
}

function printCounts(title: string, tables: readonly string[], counts: Map<string, number>): void {
  console.log(title);
  for (const table of tables) console.log(`  ${table}: ${counts.get(table) ?? 0}`);
}

async function main(): Promise<void> {
  if (!process.argv.includes('--production-business-reset')) {
    throw new Error('Reset refused: use the guarded production npm command.');
  }

  // Never fall back to DATABASE_URL. The production target must be supplied
  // explicitly for this command and is not loaded from .env.local.
  const connectionString = required('PRODUCTION_RESET_DATABASE_URL');
  const fingerprint = databaseFingerprint(connectionString);
  const client = new PrismaClient({
    datasources: { db: { url: connectionString } },
    log: ['error'],
  });

  try {
    const [users, preservedBefore, businessBefore] = await Promise.all([
      client.user.findMany({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          banned: true,
          locale: true,
          accounts: {
            where: { providerId: 'credential', password: { not: null } },
            select: { id: true },
          },
        },
      }),
      rowCounts(client, PRESERVED_PRODUCTION_TABLES),
      rowCounts(client, BUSINESS_DATA_TABLES),
    ]);

    console.log(`Production database fingerprint: ${fingerprint}`);
    console.log('Preserved users:');
    for (const user of users) {
      const status = user.isActive && !user.banned ? 'active' : 'inactive/banned';
      console.log(
        `  ${user.name} | ${maskPhone(user.phoneNumber)} | ${user.role} | ${status} | locale=${user.locale} | credentials=${user.accounts.length}`,
      );
    }
    printCounts('Preserved table counts:', PRESERVED_PRODUCTION_TABLES, preservedBefore);
    printCounts('Rows that will be permanently removed:', BUSINESS_DATA_TABLES, businessBefore);

    const accessibleAdmin = users.some(
      (user) => user.role === 'ADMIN' && user.isActive && !user.banned && user.accounts.length === 1,
    );
    if (!accessibleAdmin) {
      throw new Error('Reset refused: no active ADMIN with exactly one password credential would remain.');
    }

    if (process.env.CONFIRM_PRODUCTION_DATA_RESET !== CONFIRMATION) {
      console.log('Inspection complete. No changes were made.');
      console.log(`To proceed, set CONFIRM_PRODUCTION_DATA_RESET=${CONFIRMATION}.`);
      console.log(`Also set CONFIRM_PRODUCTION_DATABASE='${fingerprint}'.`);
      return;
    }
    if (process.env.CONFIRM_PRODUCTION_DATABASE !== fingerprint) {
      throw new Error('Reset refused: CONFIRM_PRODUCTION_DATABASE does not match the displayed fingerprint.');
    }

    await client.$transaction(async (transaction) => {
      const [preservedAtCommit, businessAtCommit] = await Promise.all([
        rowCounts(transaction, PRESERVED_PRODUCTION_TABLES),
        rowCounts(transaction, BUSINESS_DATA_TABLES),
      ]);
      for (const table of PRESERVED_PRODUCTION_TABLES) {
        if (preservedAtCommit.get(table) !== preservedBefore.get(table)) {
          throw new Error(`Reset refused: ${table} changed after inspection. No changes made.`);
        }
      }
      for (const table of BUSINESS_DATA_TABLES) {
        if (businessAtCommit.get(table) !== businessBefore.get(table)) {
          throw new Error(`Reset refused: ${table} changed after inspection. No changes made.`);
        }
      }

      await transaction.$executeRawUnsafe(productionBusinessDataTruncateSql());

      const preservedAfter = await rowCounts(transaction, PRESERVED_PRODUCTION_TABLES);
      for (const table of PRESERVED_PRODUCTION_TABLES) {
        if (preservedAfter.get(table) !== preservedBefore.get(table)) {
          throw new Error(`Preservation check failed for ${table}. The transaction will roll back.`);
        }
      }

      const emptied = await rowCounts(transaction, BUSINESS_DATA_TABLES);
      for (const table of BUSINESS_DATA_TABLES) {
        if ((emptied.get(table) ?? 0) !== 0) {
          throw new Error(`Reset verification failed for ${table}. The transaction will roll back.`);
        }
      }

      await transaction.auditLog.create({
        data: {
          id: uuidv7(),
          actorId: null,
          action: 'system.production_business_data_reset',
          entity: 'System',
          after: {
            preservedTables: [...PRESERVED_PRODUCTION_TABLES],
            clearedTables: [...BUSINESS_DATA_TABLES],
          },
        },
      });
    }, { maxWait: 5_000, timeout: 30_000 });

    console.log('Production business data cleared successfully.');
    console.log('Users, password accounts, preferences, and Prisma migration history were preserved.');
    console.log('All sessions were revoked; every user must sign in again.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
