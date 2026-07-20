import { describe, expect, it } from 'vitest';
import { resolveProfileSearchMarket } from '@/lib/profile-search/market';

describe('resolveProfileSearchMarket', () => {
  it.each([
    ['Los Angeles, CA, US', 'US'],
    ['Los Angeles, CA', 'US'],
    ['London, GB', 'GB'],
    ['Berlin DE', 'DE'],
    [null, 'US'],
    ['Los Angeles, California', 'US'],
  ])('maps %s to %s', (location, expected) => {
    expect(resolveProfileSearchMarket(location)).toBe(expected);
  });
});
