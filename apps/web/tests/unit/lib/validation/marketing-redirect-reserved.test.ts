import { describe, expect, it } from 'vitest';
import {
  isReservedUsername,
  validateUsernameCore,
} from '@/lib/validation/username-core';

describe('marketing redirect source reservation (JOV-6264)', () => {
  // A username matching a real 301 redirect source would be permanently
  // unreachable (the static route always wins), so every redirect source
  // declared in next.config.js must also be a reserved handle.
  const REDIRECT_SOURCE_ROOTS = ['artist-profile'];

  it('reserves every marketing redirect source segment', () => {
    for (const segment of REDIRECT_SOURCE_ROOTS) {
      expect(
        isReservedUsername(segment),
        `missing reservation: ${segment}`
      ).toBe(true);
    }
  });

  it('rejects signup attempts on each redirect source segment', () => {
    for (const segment of REDIRECT_SOURCE_ROOTS) {
      const result = validateUsernameCore(segment);
      expect(result.isValid, `should reject "${segment}"`).toBe(false);
      expect(result.errorCode).toBe('RESERVED');
    }
  });
});
