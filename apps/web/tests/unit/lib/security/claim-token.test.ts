import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateClaimTokenPair,
  hashClaimToken,
} from '@/lib/security/claim-token';

describe('security/claim-token', () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it('hashClaimToken returns deterministic sha256 hex output', async () => {
    const token = '550e8400-e29b-41d4-a716-446655440000';

    await expect(hashClaimToken(token)).resolves.toBe(
      'a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34'
    );
  });

  it.each([
    ['spring DST gap', '2026-02-15T12:00:00.000Z'],
    ['fall DST fold', '2026-10-15T12:00:00.000Z'],
  ])('uses an exact 30-day lifetime across the %s', async (_label, now) => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const pair = await generateClaimTokenPair();

    expect(pair.token).toHaveLength(36);
    expect(pair.tokenHash).toBe(await hashClaimToken(pair.token));

    expect(pair.expiresAt.getTime() - Date.now()).toBe(
      30 * 24 * 60 * 60 * 1000
    );
  });
});
