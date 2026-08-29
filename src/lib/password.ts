import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'pbkdf2-sha256';
const DIGEST = 'sha256';
const ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(
      password.normalize('NFKC'),
      salt,
      iterations,
      KEY_LENGTH,
      DIGEST,
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const [algorithm, iterationText, encodedSalt, encodedKey, extra] = hash.split('$');
  const iterations = Number(iterationText);

  if (
    algorithm !== ALGORITHM ||
    iterations !== ITERATIONS ||
    !encodedSalt ||
    !encodedKey ||
    extra !== undefined
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, 'base64url');
  const expectedKey = Buffer.from(encodedKey, 'base64url');
  if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) return false;

  const actualKey = await deriveKey(password, salt, iterations);
  return timingSafeEqual(actualKey, expectedKey);
}
