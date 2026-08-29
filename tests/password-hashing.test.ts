import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/password';

describe('low-memory password hashing', () => {
  it('creates a salted PBKDF2-HMAC-SHA-256 hash and verifies it', async () => {
    const password = 'a-secure-test-password';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^pbkdf2-sha256\$600000\$/);
    await expect(verifyPassword({ hash, password })).resolves.toBe(true);
    await expect(verifyPassword({ hash, password: 'incorrect-password' })).resolves.toBe(false);
  });

  it('rejects malformed and unsupported hashes', async () => {
    await expect(verifyPassword({ hash: 'invalid', password: 'anything' })).resolves.toBe(false);
    await expect(
      verifyPassword({
        hash: 'pbkdf2-sha256$1$c2FsdA$a2V5',
        password: 'anything',
      }),
    ).resolves.toBe(false);
  });
});
