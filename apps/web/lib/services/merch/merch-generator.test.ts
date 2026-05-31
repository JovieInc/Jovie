import { describe, expect, it } from 'vitest';
import { canFulfillMerch } from './merch-generator';

describe('canFulfillMerch', () => {
  it('returns true (mock data always available)', () => {
    expect(canFulfillMerch()).toBe(true);
  });
});
