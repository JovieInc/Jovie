import { describe, expect, it } from 'vitest';
import {
  hasActiveAuthSession,
  hasActiveClerkSession,
  hasBetterAuthSessionCookie,
  hasClientAuthSession,
  hasLegacyClerkActivityCookie,
  hasTestAuthSession,
} from '@/lib/auth/auth-session-cookies';
import { TEST_USER_ID_COOKIE } from '@/lib/auth/test-mode-constants';

describe('auth-session-cookies', () => {
  it('detects Better Auth session cookies including Secure and Host prefixes', () => {
    expect(
      hasBetterAuthSessionCookie('better-auth.session_token=signed-session')
    ).toBe(true);
    expect(
      hasBetterAuthSessionCookie(
        '__Secure-better-auth.session_token=signed-session'
      )
    ).toBe(true);
    expect(
      hasBetterAuthSessionCookie(
        '__Host-better-auth.session_token=signed-session'
      )
    ).toBe(true);
    expect(hasBetterAuthSessionCookie('better-auth.session_token=')).toBe(
      false
    );
    expect(hasBetterAuthSessionCookie('theme=dark')).toBe(false);
  });

  it('treats leftover Clerk activity cookies as one-release session markers', () => {
    expect(hasLegacyClerkActivityCookie('__client_uat=0')).toBe(false);
    expect(hasLegacyClerkActivityCookie('__client_uat=')).toBe(false);
    expect(hasLegacyClerkActivityCookie('theme=dark')).toBe(false);
    expect(hasLegacyClerkActivityCookie('__client_uat=1712345678')).toBe(true);
  });

  it('treats the E2E bypass cookie as a client session', () => {
    expect(hasTestAuthSession(`${TEST_USER_ID_COOKIE}=user_creator`)).toBe(
      true
    );
    expect(hasClientAuthSession(`${TEST_USER_ID_COOKIE}=user_creator`)).toBe(
      true
    );
    expect(hasActiveAuthSession(`${TEST_USER_ID_COOKIE}=user_creator`)).toBe(
      false
    );
  });

  it('keeps hasActiveClerkSession as an alias of hasActiveAuthSession', () => {
    const cookie = 'better-auth.session_token=signed-session';
    expect(hasActiveClerkSession(cookie)).toBe(hasActiveAuthSession(cookie));
    expect(hasActiveAuthSession('__client_uat=99')).toBe(true);
  });
});
