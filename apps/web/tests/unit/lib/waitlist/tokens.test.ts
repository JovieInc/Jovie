import { describe, expect, it } from 'vitest';
import {
  generateWaitlistInviteTokenPair,
  hashWaitlistInviteToken,
  waitlistInviteTokenMatches,
} from '@/lib/waitlist/tokens';

describe('waitlist invite tokens', () => {
  it('stores only a hash and validates the raw token safely', () => {
    const pair = generateWaitlistInviteTokenPair(new Date('2026-05-01'));

    expect(pair.token).not.toBe(pair.tokenHash);
    expect(pair.tokenHash).toBe(hashWaitlistInviteToken(pair.token));
    expect(waitlistInviteTokenMatches(pair.token, pair.tokenHash)).toBe(true);
    expect(waitlistInviteTokenMatches('wrong-token', pair.tokenHash)).toBe(
      false
    );
  });

  it('expires invite tokens after the configured window', () => {
    const pair = generateWaitlistInviteTokenPair(new Date('2026-05-01'));

    expect(pair.expiresAt.toISOString()).toBe('2026-05-15T00:00:00.000Z');
  });
});
