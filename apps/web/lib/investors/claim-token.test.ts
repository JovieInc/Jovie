import { describe, expect, it } from 'vitest';
import {
  generateInvestorClaimToken,
  INVESTOR_CLAIM_TOKEN_TTL_MS,
  investorClaimExpiresAt,
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from './claim-token';

describe('investor claim tokens', () => {
  it('draws a 43-character base64url token with 256 bits of entropy', () => {
    const first = generateInvestorClaimToken();
    const second = generateInvestorClaimToken();

    expect(first).toHaveLength(43);
    expect(isInvestorClaimTokenShape(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first).not.toMatch(/[^A-Za-z0-9_-]/u);
  });

  it('rejects the old short base36 tokens and other guesses', () => {
    expect(isInvestorClaimTokenShape('token-123')).toBe(false);
    expect(isInvestorClaimTokenShape('a'.repeat(21))).toBe(false);
    expect(isInvestorClaimTokenShape('a'.repeat(42))).toBe(false);
    expect(isInvestorClaimTokenShape(`${'a'.repeat(42)}+`)).toBe(false);
  });

  it('expires new links and rejects a missing or past expiry', () => {
    const now = new Date('2026-10-02T00:00:00.000Z');
    const expiresAt = investorClaimExpiresAt(now);

    expect(expiresAt.getTime() - now.getTime()).toBe(
      INVESTOR_CLAIM_TOKEN_TTL_MS
    );
    expect(isInvestorClaimUnexpired(expiresAt, now)).toBe(true);
    expect(isInvestorClaimUnexpired(null, now)).toBe(false);
    expect(isInvestorClaimUnexpired(undefined, now)).toBe(false);
    expect(isInvestorClaimUnexpired(new Date(0), now)).toBe(false);
  });
});
