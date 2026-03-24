import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClerkProxyUrl,
  isMockPublishableKey,
  shouldBypassClerk,
} from '@/components/providers/clerkAvailability';

describe('clerkAvailability', () => {
  it('bypasses Clerk for whitespace-only publishable keys', () => {
    expect(shouldBypassClerk('   ', '0')).toBe(true);
  });

  it('treats non-Clerk publishable keys as mocked', () => {
    expect(isMockPublishableKey('mock-publishable-key')).toBe(true);
    expect(isMockPublishableKey('dummy')).toBe(true);
    expect(isMockPublishableKey('pk_test_example')).toBe(false);
  });

  describe('getClerkProxyUrl', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns the proxy URL from env when set', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '/clerk');
      expect(getClerkProxyUrl()).toBe('/clerk');
    });

    it('returns undefined when env var is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '');
      expect(getClerkProxyUrl()).toBeUndefined();
    });

    it('supports full URL for staging', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', 'https://clerk.staging.jov.ie');
      expect(getClerkProxyUrl()).toBe('https://clerk.staging.jov.ie');
    });
  });
});
