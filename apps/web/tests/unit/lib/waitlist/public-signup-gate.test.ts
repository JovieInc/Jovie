import { afterEach, describe, expect, it } from 'vitest';
import {
  isOneFlowOnboarding,
  mustControlAnonymousAccess,
  shouldRedirectAnonymousStart,
} from '@/lib/waitlist/public-signup-gate';

const KEYS = ['FEATURE_PUBLIC_SIGNUP_CLOSED', 'FEATURE_ONE_FLOW_ONBOARDING'];

describe('one-flow onboarding gate (Tim, 2026-11-09)', () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it('is on by default, so closed signup no longer bounces anonymous /start', () => {
    expect(isOneFlowOnboarding()).toBe(true);
    expect(shouldRedirectAnonymousStart()).toBe(false);
  });

  it('restores the waitlist redirect when the kill switch is off', () => {
    process.env.FEATURE_ONE_FLOW_ONBOARDING = 'false';
    expect(shouldRedirectAnonymousStart()).toBe(true);
  });

  it('never redirects /start when public signup is open', () => {
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'false';
    process.env.FEATURE_ONE_FLOW_ONBOARDING = 'false';
    expect(shouldRedirectAnonymousStart()).toBe(false);
  });

  it('forces controlled admission for anonymous chats while signup is closed', () => {
    expect(mustControlAnonymousAccess(false)).toBe(true);
    expect(mustControlAnonymousAccess(true)).toBe(false);
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'false';
    expect(mustControlAnonymousAccess(false)).toBe(false);
  });
});
