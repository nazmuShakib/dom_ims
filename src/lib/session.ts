import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Role, User } from '@/domain/types';
import { normalizeLocale, type Locale } from '@/lib/i18n/config';
import { auth } from '@/lib/auth';
import {
  CAPABILITY_ROLES,
  canUseAccount,
  type Capability,
} from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { retryRead } from '@/lib/retry';

export { canSeeCosts } from '@/lib/permissions';

function toDomainUser(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    phoneNumberVerified: user.phoneNumberVerified,
    image: user.image,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Resolve both the signed session and the current database role on every request. */
export async function getSession(): Promise<{ user: User; role: Role; locale: Locale }> {
  const requestHeaders = await headers();
  const session = await retryRead(() => auth.api.getSession({ headers: requestHeaders }));
  if (!session) redirect('/login');

  const current = await retryRead(() =>
    prisma.user.findUnique({ where: { id: session.user.id } }),
  );
  if (!current || !canUseAccount(current)) {
    redirect('/login?error=inactive');
  }

  const user = toDomainUser(current);
  return { user, role: user.role, locale: normalizeLocale(current.locale) };
}

/** Route Handlers need a 401 response rather than a navigation redirect. */
export async function getOptionalSession(): Promise<{ user: User; role: Role; locale: Locale } | null> {
  const requestHeaders = await headers();
  const session = await retryRead(() => auth.api.getSession({ headers: requestHeaders }));
  if (!session) return null;

  const current = await retryRead(() =>
    prisma.user.findUnique({ where: { id: session.user.id } }),
  );
  if (!current || !canUseAccount(current)) return null;

  const user = toDomainUser(current);
  return { user, role: user.role, locale: normalizeLocale(current.locale) };
}

/** Resolve movement actor labels from Better Auth without exposing auth storage elsewhere. */
export async function getAuthUserNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await retryRead(() =>
    prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    }),
  );
  return new Map(users.map((user) => [user.id, user.name]));
}

/** Throws unless the current database role is allowed. Call first in every mutation. */
export async function requireRole(...allowed: Role[]): Promise<User> {
  const { user, role } = await getSession();
  if (!allowed.includes(role)) {
    throw new Error(`Not allowed: this action requires ${allowed.join(' or ')}, you are ${role}`);
  }
  return user;
}

/** Enforce the canonical PLAN.md §9.1 capability matrix at a server boundary. */
export async function requireCapability(capability: Capability): Promise<User> {
  return requireRole(...CAPABILITY_ROLES[capability]);
}

/** Page guard: show a friendly screen instead of surfacing an authorization exception. */
export async function requirePageRole(...allowed: Role[]): Promise<User> {
  const { user, role } = await getSession();
  if (!allowed.includes(role)) redirect('/access-denied');
  return user;
}

/** Page equivalent of requireCapability. Mutations must keep using the throwing guard above. */
export async function requirePageCapability(capability: Capability): Promise<User> {
  return requirePageRole(...CAPABILITY_ROLES[capability]);
}
