const CLAIM_TOKEN_EXPIRY_DAYS = 30;

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
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS);

  return { token, tokenHash, expiresAt };
}
