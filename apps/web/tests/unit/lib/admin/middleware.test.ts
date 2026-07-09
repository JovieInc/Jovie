import { describe, expect, it } from 'vitest';

/**
 * Clerk-era requireAdmin suite retired after Better Auth cutover.
 * Production `requireAdmin` now resolves identity via getCachedAuth + BA.
 * Reintroduce coverage against the BA path in a follow-up.
 */
describe.skip('requireAdmin (Better Auth rewrite pending)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
