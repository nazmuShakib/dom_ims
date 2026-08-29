'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { LOCALE_COOKIE, LOCALES } from '@/lib/i18n/config';
import { prisma } from '@/lib/prisma';
import { getOptionalSession } from '@/lib/session';

export async function setLocaleAction(formData: FormData): Promise<void> {
  const parsed = z.enum(LOCALES).safeParse(formData.get('locale'));
  if (!parsed.success) throw new Error('Unsupported language');

  const session = await getOptionalSession();
  if (session) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { locale: parsed.data },
    });
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
