import { describe, expect, it, vi } from 'vitest';
import {
  createRiderAccessCookieValue,
  createRiderLinkToken,
  hashRiderPassword,
  verifyRiderAccessCookieValue,
  verifyRiderLinkToken,
  verifyRiderPassword,
} from './access.server';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

describe('rider password hashing', () => {
  it('round-trips, salts per hash, and never stores plaintext', () => {
    const stored = hashRiderPassword('correct horse');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(stored).not.toContain('correct horse');
    expect(hashRiderPassword('same')).not.toBe(hashRiderPassword('same'));
    expect(verifyRiderPassword('correct horse', stored)).toBe(true);
    expect(verifyRiderPassword('wrong', stored)).toBe(false);
    expect(verifyRiderPassword('x', 'garbage')).toBe(false);
  });
});

describe('signed rider tokens', () => {
  it('verifies link tokens and rejects tamper/expiry/wrong profile', () => {
    const token = createRiderLinkToken(PROFILE_ID)!;
    expect(verifyRiderLinkToken(PROFILE_ID, token)).toBe(true);
    expect(verifyRiderLinkToken(PROFILE_ID, `${token}x`)).toBe(false);
    expect(verifyRiderLinkToken(PROFILE_ID, null)).toBe(false);
    expect(verifyRiderLinkToken(OTHER_ID, token)).toBe(false);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
      expect(verifyRiderLinkToken(PROFILE_ID, token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('verifies access cookie values with a 30-minute TTL', () => {
    const value = createRiderAccessCookieValue(PROFILE_ID)!;
    expect(verifyRiderAccessCookieValue(PROFILE_ID, value)).toBe(true);
    expect(verifyRiderAccessCookieValue(PROFILE_ID, `${value}x`)).toBe(false);
    expect(verifyRiderAccessCookieValue(OTHER_ID, value)).toBe(false);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 31 * 60 * 1000);
      expect(verifyRiderAccessCookieValue(PROFILE_ID, value)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
