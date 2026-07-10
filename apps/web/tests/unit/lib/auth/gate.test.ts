/**
 * Non-critical gate coverage lives next to the BA critical suite.
 * @see ./gate.critical.test.ts
 *
 * This file previously held Clerk-era unit cases that duplicated critical
 * coverage; it now re-exports the shared pure helpers still useful outside
 * resolveUserState I/O.
 */
import { describe, expect, it } from 'vitest';
import {
  CanonicalUserState,
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
} from '@/lib/auth/gate';

describe('gate.ts pure helpers (Better Auth era)', () => {
  it('maps ACTIVE to no redirect and NEEDS_ONBOARDING to /start', () => {
    expect(getRedirectForState(CanonicalUserState.ACTIVE)).toBeNull();
    expect(getRedirectForState(CanonicalUserState.NEEDS_ONBOARDING)).toBe(
      '/start'
    );
  });

  it('allows app access only for ACTIVE', () => {
    expect(canAccessApp(CanonicalUserState.ACTIVE)).toBe(true);
    expect(canAccessApp(CanonicalUserState.NEEDS_ONBOARDING)).toBe(false);
    expect(canAccessApp(CanonicalUserState.UNAUTHENTICATED)).toBe(false);
  });

  it('allows onboarding for NEEDS_ONBOARDING and ACTIVE; not NEEDS_DB_USER', () => {
    // Production: NEEDS_ONBOARDING | ACTIVE only (see canonical-user-state.ts).
    // NEEDS_DB_USER is pre-user-row and cannot enter onboarding until the user exists.
    expect(canAccessOnboarding(CanonicalUserState.NEEDS_ONBOARDING)).toBe(true);
    expect(canAccessOnboarding(CanonicalUserState.ACTIVE)).toBe(true);
    expect(canAccessOnboarding(CanonicalUserState.NEEDS_DB_USER)).toBe(false);
    expect(canAccessOnboarding(CanonicalUserState.UNAUTHENTICATED)).toBe(false);
  });
});
