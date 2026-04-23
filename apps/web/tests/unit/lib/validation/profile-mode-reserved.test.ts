import { describe, expect, it } from 'vitest';
import {
  PROFILE_MODE_RESERVED_TOKENS,
  RESERVED_USERNAMES,
  validateUsernameCore,
} from '@/lib/validation/username-core';

describe('PROFILE_MODE_RESERVED_TOKENS', () => {
  it('covers every public profile mode route segment', () => {
    // Changing this list without updating the route shape is a critical
    // regression: a mismatch leaves a route either unreachable (token in
    // reserved but no route) or hijackable (route without reservation).
    expect([...PROFILE_MODE_RESERVED_TOKENS].sort()).toEqual(
      [
        'about',
        'contact',
        'listen',
        'menu',
        'pay',
        'releases',
        'share',
        'subscribe',
        'tour',
      ].sort()
    );
  });

  it('lists every mode token in the global reserved set', () => {
    const reserved = new Set(RESERVED_USERNAMES);
    for (const token of PROFILE_MODE_RESERVED_TOKENS) {
      expect(reserved.has(token), `missing reservation: ${token}`).toBe(true);
    }
  });

  it('rejects signup attempts on each mode token', () => {
    for (const token of PROFILE_MODE_RESERVED_TOKENS) {
      const result = validateUsernameCore(token);
      expect(result.isValid, `should reject "${token}"`).toBe(false);
      expect(result.errorCode).toBe('RESERVED');
    }
  });
});
