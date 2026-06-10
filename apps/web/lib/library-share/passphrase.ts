import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 2 ** 14;
const SCRYPT_KEY_LEN = 32;

export function hashLibrarySharePassphrase(passphrase: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(passphrase, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
  }).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyLibrarySharePassphrase(
  passphrase: string,
  stored: string
): boolean {
  const [salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) return false;

  const actualHash = scryptSync(passphrase, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
  }).toString('hex');

  try {
    return timingSafeEqual(
      Buffer.from(actualHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}
