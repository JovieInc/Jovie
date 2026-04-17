import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClerkProxyUrl,
  getRequestLocationFromHeaders,
  isMockPublishableKey,
  shouldBypassClerk,
  shouldDisableClerkProxyForLocation,
} from '@/components/providers/clerkAvailability';

describe('clerkAvailability', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bypasses Clerk for whitespace-only publishable keys', () => {
    expect(shouldBypassClerk('   ', '0')).toBe(true);
  });

  it('bypasses Clerk for live Clerk keys on insecure private origins', () => {
    expect(
      shouldBypassClerk(
        'pk_live_example',
        '0',
        new URL('http://localhost:3100')
      )
    ).toBe(true);
    expect(
      shouldBypassClerk(
        'pk_live_example',
        '0',
        new URL('http://127.0.0.1:3100')
      )
    ).toBe(true);
  });

  it('bypasses Clerk for test keys on insecure private origins', () => {
    expect(
      shouldBypassClerk(
        'pk_test_example',
        '0',
        new URL('http://localhost:3100')
      )
    ).toBe(true);
  });

  it('keeps Clerk enabled for local real-auth E2E runs', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');

    expect(
      shouldBypassClerk(
        'pk_test_example',
        '0',
        new URL('http://localhost:3100')
      )
    ).toBe(false);
  });

  it('keeps Clerk enabled for real keys on secure public origins', () => {
    expect(
      shouldBypassClerk(
        'pk_live_example',
        '0',
        new URL('https://staging.jov.ie')
      )
    ).toBe(false);
  });

  it('treats non-Clerk publishable keys as mocked', () => {
    expect(isMockPublishableKey('mock-publishable-key')).toBe(true);
    expect(isMockPublishableKey('dummy')).toBe(true);
    expect(isMockPublishableKey('pk_test_example')).toBe(false);
  });

  describe('getRequestLocationFromHeaders', () => {
    it('normalizes comma-separated hosts, uppercase proto, and IPv6 ports', () => {
      const headers = new Headers({
        'x-forwarded-host': '[::1]:3000, localhost:3000',
        'x-forwarded-proto': 'HTTP, https',
      });

      expect(getRequestLocationFromHeaders(headers)).toEqual({
        hostname: '::1',
        protocol: 'http:',
      });
    });

    it('defaults missing proto headers to http for private hosts', () => {
      const headers = new Headers({
        host: 'localhost:3000',
      });

      expect(getRequestLocationFromHeaders(headers)).toEqual({
        hostname: 'localhost',
        protocol: 'http:',
      });
    });
  });

  describe('getClerkProxyUrl', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns the proxy URL from env when set', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '/custom-clerk');
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBe('/custom-clerk');
    });

    it('falls back to /__clerk when env var is empty string', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '');
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBe('/__clerk');
    });

    it('falls back to /__clerk when env var is not present', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBe('/__clerk');
    });

    it('supports full URL for Clerk FAPI', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      vi.stubEnv(
        'NEXT_PUBLIC_CLERK_PROXY_URL',
        'https://distinct-giraffe-5.clerk.accounts.dev'
      );
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBe(
        'https://distinct-giraffe-5.clerk.accounts.dev'
      );
    });

    it('returns undefined when NEXT_PUBLIC_CLERK_PROXY_DISABLED is "1"', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '1');
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBeUndefined();
    });

    it('prefers disabled flag over explicit proxy URL', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '1');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_URL', '/clerk');
      expect(getClerkProxyUrl(new URL('https://jov.ie'))).toBeUndefined();
    });

    it('auto-disables the proxy on insecure localhost origins', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(
        getClerkProxyUrl(new URL('http://localhost:3000'))
      ).toBeUndefined();
      expect(
        getClerkProxyUrl(new URL('http://127.0.0.1:3000'))
      ).toBeUndefined();
    });

    it('auto-disables the proxy on insecure private network origins', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(
        getClerkProxyUrl(new URL('http://192.168.86.40:3100'))
      ).toBeUndefined();
      expect(getClerkProxyUrl(new URL('http://10.0.0.5:3000'))).toBeUndefined();
      expect(
        getClerkProxyUrl(new URL('http://172.20.10.8:3000'))
      ).toBeUndefined();
    });

    it('keeps the proxy enabled for secure local origins', () => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PROXY_DISABLED', '');
      expect(getClerkProxyUrl(new URL('https://localhost:3000'))).toBe(
        '/__clerk'
      );
    });
  });

  describe('shouldDisableClerkProxyForLocation', () => {
    it('returns false when no location is available', () => {
      expect(shouldDisableClerkProxyForLocation(undefined)).toBe(false);
    });

    it('returns false for public https origins', () => {
      expect(
        shouldDisableClerkProxyForLocation(new URL('https://staging.jov.ie'))
      ).toBe(false);
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
