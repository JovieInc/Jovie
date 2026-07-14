import { describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMIT_RULES } from '@/lib/auth/rate-limit-rules';

describe('Better Auth rate-limit policy', () => {
  it('keeps read-only session hydration out of the shared IP bucket', () => {
    expect(AUTH_RATE_LIMIT_RULES['/get-session']).toBe(false);
  });

  it('keeps credential and mutation endpoints rate-limited', () => {
    expect(AUTH_RATE_LIMIT_RULES['/sign-in/social']).toEqual({
      window: 60,
      max: 10,
    });
    expect(AUTH_RATE_LIMIT_RULES['/email-otp/send-verification-otp']).toEqual({
      window: 60,
      max: 3,
    });
    expect(AUTH_RATE_LIMIT_RULES['/one-time-token/verify']).toEqual({
      window: 60,
      max: 10,
    });
  });
});
