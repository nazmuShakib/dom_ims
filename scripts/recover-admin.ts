import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

import { uuidv7 } from '@/lib/ids';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';

const CONFIRMATION = 'RESET_DEV_ADMIN';
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseLabel(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('ADMIN_RECOVERY_DATABASE_URL is not a valid URL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('ADMIN_RECOVERY_DATABASE_URL must be a PostgreSQL connection string.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(default database)';
  return `${url.hostname}/${database}`;
}

function maskPhone(phoneNumber: string): string {
  return `${phoneNumber.slice(0, 6)}*****${phoneNumber.slice(-2)}`;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--development')) {
    throw new Error('Recovery refused: use the development-only npm command.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Recovery refused while NODE_ENV=production.');
  }

  // Deliberately never fall back to DATABASE_URL. This must be a separately named
  // connection string so a runtime environment change cannot silently target production.
  const connectionString = required('ADMIN_RECOVERY_DATABASE_URL');
  const phoneInput = required('ADMIN_RECOVERY_PHONE');

  if (!isBangladeshMobile(phoneInput)) {
    throw new Error('ADMIN_RECOVERY_PHONE must be a valid Bangladeshi mobile number.');
  }

  const phoneNumber = normalizeBangladeshMobileE164(phoneInput);
  const targetDatabase = databaseLabel(connectionString);
  const client = new PrismaClient({
    datasources: { db: { url: connectionString } },
    log: ['error'],
  });

  try {
    const admins = await client.user.findMany({
      where: {
        phoneNumber,
        role: 'ADMIN',
        isActive: true,
        banned: false,
      },
      select: { id: true, name: true, phoneNumber: true },
      take: 2,
    });
    if (admins.length !== 1) {
      throw new Error(
        `Expected exactly one active ADMIN for ${maskPhone(phoneNumber)}, found ${admins.length}. No changes made.`,
      );
    }

    const admin = admins[0]!;
    const credentialAccounts = await client.account.findMany({
      where: { userId: admin.id, providerId: 'credential' },
      select: { id: true, password: true },
      take: 2,
    });
    if (credentialAccounts.length !== 1 || !credentialAccounts[0]!.password) {
      throw new Error('The target ADMIN does not have exactly one password credential. No changes made.');
    }

    console.log(`Recovery target: ${admin.name} (${maskPhone(phoneNumber)})`);
    console.log(`Development database: ${targetDatabase}`);

    if (process.env.CONFIRM_ADMIN_RECOVERY !== CONFIRMATION) {
      console.log('Inspection complete. No changes were made.');
      console.log(`To perform the reset, set CONFIRM_ADMIN_RECOVERY=${CONFIRMATION} and run again.`);
      return;
    }

    const password = process.env.ADMIN_RECOVERY_PASSWORD;
    if (!password || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new Error(
        `ADMIN_RECOVERY_PASSWORD must contain ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
      );
    }

    const passwordHash = await hashPassword(password);
    await client.$transaction(async (transaction) => {
      const currentAdmin = await transaction.user.findFirst({
        where: {
          id: admin.id,
          phoneNumber,
          role: 'ADMIN',
          isActive: true,
          banned: false,
        },
        select: { id: true },
      });
      if (!currentAdmin) {
        throw new Error('The recovery target changed before the reset completed. No changes made.');
      }

      await transaction.account.update({
        where: { id: credentialAccounts[0]!.id },
        data: { password: passwordHash },
      });
      const revoked = await transaction.session.deleteMany({ where: { userId: admin.id } });
      await transaction.auditLog.create({
        data: {
          id: uuidv7(),
          actorId: null,
          action: 'auth.emergency_admin_password_reset',
          entity: 'User',
          entityId: admin.id,
          after: {
            method: 'development_cli_recovery',
            sessionsRevoked: revoked.count,
          },
        },
      });
    });

    console.log('ADMIN password reset successfully. All existing sessions were revoked.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
