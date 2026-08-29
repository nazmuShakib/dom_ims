'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getSession } from '@/lib/session';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/config';
import { isBangladeshMobile, normalizeBangladeshMobileE164 } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export interface LoginState {
  error?: string;
}

const loginSchema = z.object({
  phone: z.string().trim().refine(isBangladeshMobile, 'Enter a valid Bangladeshi mobile number'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    phone: formString(formData, 'phone') ?? '',
    password: formString(formData, 'password') ?? '',
    next: formString(formData, 'next'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid login' };

  try {
    const phoneNumber = normalizeBangladeshMobileE164(parsed.data.phone);
    const result = await auth.api.signInPhoneNumber({
      body: { phoneNumber, password: parsed.data.password },
      headers: await headers(),
    });

    await writeAudit({
      actorId: result.user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: result.user.id,
      after: { phoneNumber },
    });

    const current = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { locale: true },
    });
    (await cookies()).set(LOCALE_COOKIE, normalizeLocale(current?.locale), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    return { error: 'Invalid mobile number or password' };
  }

  const destination =
    parsed.data.next?.startsWith('/') && !parsed.data.next.startsWith('//')
      ? parsed.data.next
      : '/products';
  revalidatePath('/', 'layout');
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  const { user } = await getSession();
  await writeAudit({
    actorId: user.id,
    action: 'auth.logout',
    entity: 'User',
    entityId: user.id,
  });
  await auth.api.signOut({ headers: await headers() });
  revalidatePath('/', 'layout');
  redirect('/login');
}
