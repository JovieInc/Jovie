const CLAIM_TOKEN_EXPIRY_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ClaimTokenPair {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function hashClaimToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateClaimTokenPair(): Promise<ClaimTokenPair> {
  const token = crypto.randomUUID();
  const tokenHash = await hashClaimToken(token);
  const expiresAt = new Date(
    Date.now() + CLAIM_TOKEN_EXPIRY_DAYS * MILLISECONDS_PER_DAY
  );

  return { token, tokenHash, expiresAt };
}
