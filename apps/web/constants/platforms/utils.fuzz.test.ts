import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SOCIAL_PLATFORMS } from './derived';
import { isValidPlatform } from './utils';

const socialPlatformSet = new Set<string>(SOCIAL_PLATFORMS);

describe('isValidPlatform fuzzing', () => {
  it('accepts only registered platform IDs for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), value => {
        expect(isValidPlatform(value)).toBe(socialPlatformSet.has(value));
      })
    );
  });

  it('rejects arbitrary non-string inputs', () => {
    fc.assert(
      fc.property(fc.anything(), value => {
        fc.pre(typeof value !== 'string');
        expect(isValidPlatform(value)).toBe(false);
      })
    );
  });
});
