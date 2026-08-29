import { generateInternalAuthEmail } from '@/lib/auth-identity';
import { uuidv7 } from '@/lib/ids';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

async function main() {
  const input = process.env.INITIAL_ADMIN_PHONE?.trim();
  if (!input || !isBangladeshMobile(input)) {
    throw new Error('Set INITIAL_ADMIN_PHONE to a valid Bangladeshi mobile number.');
  }

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true, banned: false },
  });
  if (admins.length !== 1) {
    throw new Error(`Expected exactly one active ADMIN, found ${admins.length}. No changes made.`);
  }

  const admin = admins[0]!;
  const phoneNumber = normalizeBangladeshMobileE164(input);
  const conflict = await prisma.user.findFirst({
    where: { phoneNumber, id: { not: admin.id } },
    select: { id: true },
  });
  if (conflict) throw new Error('INITIAL_ADMIN_PHONE is already assigned to another user.');

  if (admin.phoneNumber === phoneNumber && admin.email.endsWith('@ims.internal')) {
    console.log(`Mobile authentication is already configured for ${phoneNumber}.`);
    return;
  }

  const internalEmail = generateInternalAuthEmail();
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: admin.id },
      data: {
        email: internalEmail,
        emailVerified: false,
        phoneNumber,
        phoneNumberVerified: true,
      },
    });
    await transaction.auditLog.create({
      data: {
        id: uuidv7(),
        actorId: admin.id,
        action: 'user.mobile_auth_migration',
        entity: 'User',
        entityId: admin.id,
        before: { hadExternalEmail: !admin.email.endsWith('@ims.internal') },
        after: { phoneNumber, emailDomain: 'ims.internal' },
      },
    });
  });

  console.log(`Configured mobile login for the active ADMIN: ${phoneNumber}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
