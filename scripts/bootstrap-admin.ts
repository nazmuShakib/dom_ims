import { generateInternalAuthEmail } from '@/lib/auth-identity';
import { uuidv7 } from '@/lib/ids';
import { hashPassword } from '@/lib/password';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

async function main() {
  const name = process.env.INITIAL_ADMIN_NAME?.trim();
  const phone = process.env.INITIAL_ADMIN_PHONE?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (
    !name ||
    !phone ||
    !isBangladeshMobile(phone) ||
    !password ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new Error(
      'Set INITIAL_ADMIN_NAME, a valid INITIAL_ADMIN_PHONE, and INITIAL_ADMIN_PASSWORD ' +
        '(12–128 characters) in .env.local.',
    );
  }

  const phoneNumber = normalizeBangladeshMobileE164(phone);
  const existingUsers = await prisma.user.findMany({
    take: 2,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      role: true,
      _count: { select: { accounts: true, sessions: true, auditLogs: true } },
    },
  });

  if (existingUsers.length > 0) {
    const orphan = existingUsers.length === 1 ? existingUsers[0]! : null;
    const isInterruptedBootstrap =
      orphan?.name === name &&
      orphan.email.endsWith('@ims.internal') &&
      orphan.phoneNumber === phoneNumber &&
      orphan.phoneNumberVerified === false &&
      orphan.role === 'ADMIN' &&
      orphan._count.accounts === 0 &&
      orphan._count.sessions === 0 &&
      orphan._count.auditLogs === 0;

    if (!isInterruptedBootstrap || !orphan) {
      throw new Error('Bootstrap refused: an authentication user already exists.');
    }

    await prisma.user.delete({ where: { id: orphan.id } });
    console.log('Removed the incomplete ADMIN left by an interrupted bootstrap.');
  }

  const email = generateInternalAuthEmail();
  const userId = uuidv7();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (transaction) => {
    await transaction.user.create({
      data: {
        id: userId,
        name,
        email,
        emailVerified: false,
        phoneNumber,
        phoneNumberVerified: true,
        role: 'ADMIN',
        isActive: true,
      },
    });

    await transaction.account.create({
      data: {
        id: uuidv7(),
        userId,
        accountId: userId,
        providerId: 'credential',
        password: passwordHash,
      },
    });

    await transaction.auditLog.create({
      data: {
        id: uuidv7(),
        actorId: userId,
        action: 'user.bootstrap_admin',
        entity: 'User',
        entityId: userId,
        after: { name, phoneNumber, role: 'ADMIN', isActive: true },
      },
    });
  });

  console.log(`Created initial ADMIN: ${phoneNumber}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
