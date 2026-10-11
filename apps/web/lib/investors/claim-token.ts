import { randomBytes } from 'node:crypto';

/** 32 bytes, base64url, no padding: 256 bits, 43 characters. */
export const INVESTOR_CLAIM_TOKEN_BYTES = 32;
export const INVESTOR_CLAIM_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/u;

/**
 * Unguessable claim token. `crypto.randomBytes` is the CSPRNG; base64url
 * keeps the full 256 bits in the URL. The previous 21-character base36
 * slice dropped entropy and biased the alphabet.
 */
export function generateInvestorClaimToken(): string {
  return randomBytes(INVESTOR_CLAIM_TOKEN_BYTES).toString('base64url');
}

export function investorClaimExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INVESTOR_CLAIM_TOKEN_TTL_MS);
}

export function isInvestorClaimTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/** Active links must carry a future expiry. A missing date is not a forever pass. */
export function isInvestorClaimUnexpired(
  expiresAt: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (expiresAt == null) return false;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry > now;
}
