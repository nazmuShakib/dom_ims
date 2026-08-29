'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { requireCapability } from '@/lib/session';
import { ROLES } from '@/domain/types';
import { generateInternalAuthEmail } from '@/lib/auth-identity';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';

export interface UserActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().refine(isBangladeshMobile, 'Enter a valid Bangladeshi mobile number'),
  password: z.string().min(12).max(128),
  role: z.enum(ROLES),
});

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : '';
}

export async function createUserAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireCapability('MANAGE_USERS');
  const parsed = createSchema.safeParse({
    name: value(formData, 'name'),
    phone: value(formData, 'phone'),
    password: value(formData, 'password'),
    role: value(formData, 'role'),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? '_'), issue.message]),
      ),
    };
  }

  try {
    const phoneNumber = normalizeBangladeshMobileE164(parsed.data.phone);
    if (await prisma.user.findUnique({ where: { phoneNumber } })) {
      return { fieldErrors: { phone: 'This mobile number already belongs to a user.' } };
    }
    const email = generateInternalAuthEmail();
    const created = await auth.api.createUser({
      body: {
        name: parsed.data.name,
        email,
        password: parsed.data.password,
        role: parsed.data.role as never,
        data: { isActive: true, phoneNumber },
      },
    });
    await prisma.user.update({
      where: { id: created.user.id },
      data: { phoneNumber, phoneNumberVerified: true },
    });
    await writeAudit({
      actorId: actor.id,
      action: 'user.create',
      entity: 'User',
      entityId: created.user.id,
      after: {
        name: parsed.data.name,
        phoneNumber,
        role: parsed.data.role,
        isActive: true,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the user' };
  }

  revalidatePath('/users');
  return { ok: `Created ${parsed.data.name}.` };
}

const phoneSchema = z.string().trim()
  .refine(isBangladeshMobile, 'Enter a valid Bangladeshi mobile number');

export async function updateUserPhoneAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireCapability('MANAGE_USERS');
  const userId = value(formData, 'userId');
  const parsed = phoneSchema.safeParse(value(formData, 'phone'));
  if (!userId) return { error: 'Missing user' };
  if (!parsed.success) return { fieldErrors: { phone: parsed.error.issues[0]?.message ?? 'Invalid mobile number' } };

  const phoneNumber = normalizeBangladeshMobileE164(parsed.data);
  const conflict = await prisma.user.findFirst({
    where: { phoneNumber, id: { not: userId } },
    select: { id: true },
  });
  if (conflict) return { fieldErrors: { phone: 'This mobile number already belongs to a user.' } };

  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return { error: 'User not found' };
  await prisma.user.update({
    where: { id: userId },
    data: { phoneNumber, phoneNumberVerified: true },
  });
  await writeAudit({
    actorId: actor.id,
    action: 'user.phone_change',
    entity: 'User',
    entityId: userId,
    before: { phoneNumber: before.phoneNumber },
    after: { phoneNumber },
  });
  revalidatePath('/users');
  return { ok: 'Mobile number updated.' };
}

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(12).max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

export async function resetUserPasswordAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireCapability('MANAGE_USERS');
  const parsed = resetPasswordSchema.safeParse({
    userId: value(formData, 'userId'),
    password: value(formData, 'password'),
    confirmPassword: value(formData, 'confirmPassword'),
  });
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? '_'), issue.message]),
      ),
    };
  }
  if (parsed.data.userId === actor.id) {
    return { error: 'Use Settings to change your own password.' };
  }

  try {
    await auth.api.setUserPassword({
      body: { userId: parsed.data.userId, newPassword: parsed.data.password },
      headers: await headers(),
    });
    await prisma.session.deleteMany({ where: { userId: parsed.data.userId } });
    await writeAudit({
      actorId: actor.id,
      action: 'user.password_reset',
      entity: 'User',
      entityId: parsed.data.userId,
      after: { otherSessionsRevoked: true },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not reset the password' };
  }

  return { ok: 'Temporary password set. The user’s other sessions were revoked.' };
}

export async function changeUserRole(formData: FormData): Promise<void> {
  const actor = await requireCapability('MANAGE_USERS');
  const userId = value(formData, 'userId');
  const parsedRole = z.enum(ROLES).safeParse(value(formData, 'role'));
  if (!userId || !parsedRole.success) throw new Error('Invalid user or role');
  if (userId === actor.id) throw new Error('You cannot change your own role.');

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const after = await prisma.user.update({
    where: { id: userId },
    data: { role: parsedRole.data },
  });

  await writeAudit({
    actorId: actor.id,
    action: 'user.role_change',
    entity: 'User',
    entityId: userId,
    before: { role: before.role },
    after: { role: after.role },
  });
  revalidatePath('/users');
  revalidatePath('/', 'layout');
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const actor = await requireCapability('MANAGE_USERS');
  const userId = value(formData, 'userId');
  if (!userId) throw new Error('Missing user');
  if (userId === actor.id) throw new Error('You cannot deactivate your own account.');

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const nextActive = !before.isActive;

  const after = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id: userId },
      data: {
        isActive: nextActive,
        banned: !nextActive,
        banReason: nextActive ? null : 'Account deactivated by administrator',
        banExpires: null,
      },
    });
    if (!nextActive) await transaction.session.deleteMany({ where: { userId } });
    return updated;
  });

  await writeAudit({
    actorId: actor.id,
    action: nextActive ? 'user.activate' : 'user.deactivate',
    entity: 'User',
    entityId: userId,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
  });
  revalidatePath('/users');
}
