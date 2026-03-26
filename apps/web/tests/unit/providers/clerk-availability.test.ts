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
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '/custom-clerk');
      expect(getClerkProxyUrl()).toBe('/custom-clerk');
    });

    it('falls back to /__clerk when env var is empty string', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '');
      expect(getClerkProxyUrl()).toBe('/__clerk');
    });

    it('falls back to /__clerk when env var is not present', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(getClerkProxyUrl()).toBe('/__clerk');
    });

    it('supports full URL for Clerk FAPI', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv(
        'NEXT_PUBLIC_CLERK_PROXY_URL',
        'https://distinct-giraffe-5.clerk.accounts.dev'
      );
      expect(getClerkProxyUrl()).toBe(
        'https://distinct-giraffe-5.clerk.accounts.dev'
      );
    });

    it('returns undefined when NEXT_PUBLIC_CLERK_PROXY_DISABLED is "1"', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '1');
      expect(getClerkProxyUrl()).toBeUndefined();
    });

    it('prefers disabled flag over explicit proxy URL', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '1');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '/clerk');
      expect(getClerkProxyUrl()).toBeUndefined();
    });

    it('disables the fallback proxy on plain-http localhost', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(
        getClerkProxyUrl({ hostname: 'localhost', protocol: 'http:' })
      ).toBeUndefined();
    });

    it('keeps the fallback proxy on secure or non-local origins', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(
        getClerkProxyUrl({ hostname: 'localhost', protocol: 'https:' })
      ).toBe('/__clerk');
      expect(getClerkProxyUrl({ hostname: 'jov.ie', protocol: 'https:' })).toBe(
        '/__clerk'
      );
    });
  });
});
