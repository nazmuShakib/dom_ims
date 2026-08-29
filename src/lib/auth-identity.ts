import { uuidv7 } from '@/lib/ids';

/** Better Auth requires an email-shaped core identifier even for phone login. */
export function generateInternalAuthEmail(): string {
  return `user-${uuidv7()}@ims.internal`;
}
