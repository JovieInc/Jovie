import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The SSR/prerender baseURL passed to createAuthClient must be a valid
 * absolute URL even when NEXT_PUBLIC_BETTER_AUTH_URL is host-only, missing,
 * or malformed — a raw parse failure here aborts the whole production build
 * during page-data collection (BetterAuthError on /_not-found).
 */
describe('auth client SSR baseURL hardening', () => {
  const original = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL = original;
    }
  });

  async function loadSsrBaseUrl() {
    // Simulate SSR: page-data collection has no window.
    vi.stubGlobal('window', undefined);
    vi.resetModules();
    // capture the options handed to createAuthClient without loading React
    vi.doMock('better-auth/react', () => ({
      createAuthClient: (options: unknown) => options,
    }));
    vi.doMock('@better-auth/oauth-provider/client', () => ({
      oauthProviderClient: () => ({}),
    }));
    vi.doMock('better-auth/client/plugins', () => ({
      emailOTPClient: () => ({}),
      oneTapClient: () => ({}),
    }));
    const mod = await import('@/lib/auth/client');
    return (mod.authClient as { baseURL?: string }).baseURL;
  }

  it('passes a valid URL for a host-only env value', async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'staging.jov.ie';
    const baseURL = await loadSsrBaseUrl();
    expect(() => new URL(baseURL as string)).not.toThrow();
    expect(baseURL).toBe('https://staging.jov.ie');
  });

  it('falls back to the canonical origin when the env value is missing', async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    const baseURL = await loadSsrBaseUrl();
    expect(baseURL).toBe('https://jov.ie');
  });

  it('falls back instead of throwing when the env value is unparseable', async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'ht tp://bad url';
    const baseURL = await loadSsrBaseUrl();
    expect(baseURL).toBe('https://jov.ie');
  });
});
