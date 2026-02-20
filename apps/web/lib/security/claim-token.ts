import { createHash, randomUUID } from 'node:crypto';

const CLAIM_TOKEN_EXPIRY_DAYS = 30;

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateClaimTokenPair(): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomUUID();
  const tokenHash = hashClaimToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS);

  return { token, tokenHash, expiresAt };
}
