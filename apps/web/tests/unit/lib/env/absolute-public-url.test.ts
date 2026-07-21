import { afterEach, describe, expect, it, vi } from 'vitest';
import { absolutePublicUrl, publicEnv } from '@/lib/env-public';

const ORIGINAL_ENV = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_PROFILE_URL: process.env.NEXT_PUBLIC_PROFILE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

describe('absolutePublicUrl', () => {
  it('falls back when the value is missing or empty', () => {
    expect(absolutePublicUrl(undefined)).toBe('https://jov.ie');
    expect(absolutePublicUrl('')).toBe('https://jov.ie');
    expect(absolutePublicUrl('   ')).toBe('https://jov.ie');
  });

  it('upgrades host-only values to absolute https URLs', () => {
    expect(absolutePublicUrl('staging.jov.ie')).toBe('https://staging.jov.ie');
  });

  it('keeps valid absolute URLs and strips trailing slashes', () => {
    expect(absolutePublicUrl('https://jov.ie')).toBe('https://jov.ie');
    expect(absolutePublicUrl('https://staging.jov.ie/')).toBe(
      'https://staging.jov.ie'
    );
  });

  it('preserves non-https protocols and ports for local development', () => {
    expect(absolutePublicUrl('http://localhost:3000')).toBe(
      'http://localhost:3000'
    );
  });

  it('falls back for unparseable values instead of throwing', () => {
    expect(absolutePublicUrl('not a url :::')).toBe('https://jov.ie');
  });

  it('honors a custom fallback', () => {
    expect(absolutePublicUrl(undefined, 'https://staging.jov.ie')).toBe(
      'https://staging.jov.ie'
    );
  });
});

describe('publicEnv URL getters', () => {
  it('normalizes a host-only NEXT_PUBLIC_PROFILE_URL', () => {
    process.env.NEXT_PUBLIC_PROFILE_URL = 'staging.jov.ie';
    expect(publicEnv.NEXT_PUBLIC_PROFILE_URL).toBe('https://staging.jov.ie');
    expect(() => new URL(publicEnv.NEXT_PUBLIC_PROFILE_URL)).not.toThrow();
  });

  it('normalizes a host-only NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'staging.jov.ie';
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe('https://staging.jov.ie');
  });

  it('defaults to https://jov.ie when unset', () => {
    delete process.env.NEXT_PUBLIC_PROFILE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(publicEnv.NEXT_PUBLIC_PROFILE_URL).toBe('https://jov.ie');
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe('https://jov.ie');
  });
});

describe('BASE_URL (constants/domains)', () => {
  it('yields a valid absolute URL for metadataBase even with host-only env', async () => {
    process.env.NEXT_PUBLIC_PROFILE_URL = 'staging.jov.ie';
    vi.resetModules();
    const { BASE_URL } = await import('@/constants/domains');
    expect(BASE_URL).toBe('https://staging.jov.ie');
    // Regression: `new URL(BASE_URL)` at module scope in app/layout.tsx threw
    // ERR_INVALID_URL during /_not-found page-data collection on off-Vercel
    // staging builds, aborting the whole deploy.
    expect(() => new URL(BASE_URL)).not.toThrow();
  });
});
