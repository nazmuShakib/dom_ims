'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getSession } from '@/lib/session';

export interface PasswordActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : '';
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(128),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

export async function changeOwnPasswordAction(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const { user } = await getSession();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: value(formData, 'currentPassword'),
    newPassword: value(formData, 'newPassword'),
    confirmPassword: value(formData, 'confirmPassword'),
  });
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? '_'), issue.message]),
      ),
    };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'auth.password_change',
      entity: 'User',
      entityId: user.id,
      after: { otherSessionsRevoked: true },
    });
  } catch {
    return { error: 'Current password is incorrect.' };
  }

  return { ok: 'Password changed. Your other sessions were signed out.' };
}
