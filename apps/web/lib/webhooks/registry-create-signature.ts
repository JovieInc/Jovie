import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyHexSignature(
  rawBody: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1'
): boolean {
  const length = algorithm === 'sha256' ? 64 : 40;
  if (signature.length !== length || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }

  const expected = createHmac(algorithm, secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** GitHub signs the raw body with HMAC-SHA256, prefixed by `sha256=`. */
export function verifyGithubSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  return verifyHexSignature(rawBody, header.slice(7), secret, 'sha256');
}

/** Vercel's x-vercel-signature is an unprefixed hex HMAC-SHA1 digest. */
export function verifyVercelSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header) return false;
  return verifyHexSignature(rawBody, header, secret, 'sha1');
}
