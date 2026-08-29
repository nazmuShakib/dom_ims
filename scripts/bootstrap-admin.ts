import { auth } from '@/lib/auth';
import { generateInternalAuthEmail } from '@/lib/auth-identity';
import { uuidv7 } from '@/lib/ids';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

async function main() {
  const name = process.env.INITIAL_ADMIN_NAME?.trim();
  const phone = process.env.INITIAL_ADMIN_PHONE?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!name || !phone || !isBangladeshMobile(phone) || !password || password.length < 12) {
    throw new Error(
      'Set INITIAL_ADMIN_NAME, a valid INITIAL_ADMIN_PHONE, and INITIAL_ADMIN_PASSWORD ' +
        '(at least 12 characters) in .env.local.',
    );
  }

  if ((await prisma.user.count()) > 0) {
    throw new Error('Bootstrap refused: an authentication user already exists.');
  }

  const phoneNumber = normalizeBangladeshMobileE164(phone);
  const email = generateInternalAuthEmail();
  const created = await auth.api.createUser({
    body: {
      name,
      email,
      password,
      role: 'ADMIN' as never,
      data: { isActive: true, phoneNumber },
    },
  });
  await prisma.user.update({
    where: { id: created.user.id },
    data: { phoneNumber, phoneNumberVerified: true },
  });

  await prisma.auditLog.create({
    data: {
      id: uuidv7(),
      actorId: created.user.id,
      action: 'user.bootstrap_admin',
      entity: 'User',
      entityId: created.user.id,
      after: { name, phoneNumber, role: 'ADMIN', isActive: true },
    },
  });

  console.log(`Created initial ADMIN: ${phoneNumber}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
