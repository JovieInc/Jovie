import { describe, expect, it } from 'vitest';

import {
  generateClaimTokenPair,
  hashClaimToken,
} from '@/lib/security/claim-token';

describe('security/claim-token', () => {
  it('hashClaimToken returns deterministic sha256 hex output', async () => {
    const token = '550e8400-e29b-41d4-a716-446655440000';

    await expect(hashClaimToken(token)).resolves.toBe(
      'a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34'
    );
  });

  it('generateClaimTokenPair returns token, hash, and 30 day expiry', async () => {
    const now = Date.now();
    const pair = await generateClaimTokenPair();

    expect(pair.token).toHaveLength(36);
    expect(pair.tokenHash).toBe(await hashClaimToken(pair.token));

    const expiryMs = pair.expiresAt.getTime() - now;
    const min = 29 * 24 * 60 * 60 * 1000;
    const max = 31 * 24 * 60 * 60 * 1000;

    expect(expiryMs).toBeGreaterThan(min);
    expect(expiryMs).toBeLessThan(max);
  });
});
