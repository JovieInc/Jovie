import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

import {
  resolveClerkKeys,
  resolvePublishableKeyFromHeaders,
} from '@/lib/auth/staging-clerk-keys';

const ORIGINAL_ENV = {
  clerkPublishableKeyStaging: process.env.CLERK_PUBLISHABLE_KEY_STAGING,
  clerkSecretKeyStaging: process.env.CLERK_SECRET_KEY_STAGING,
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
};

describe('staging Clerk key resolution', () => {
  beforeEach(() => {
    headersMock.mockReset();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_live_production_example';
    process.env.CLERK_SECRET_KEY = 'sk_live_production_example';
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    delete process.env.CLERK_SECRET_KEY_STAGING;
  });

  afterEach(() => {
    if (ORIGINAL_ENV.clerkPublishableKeyStaging === undefined) {
      delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    } else {
      process.env.CLERK_PUBLISHABLE_KEY_STAGING =
        ORIGINAL_ENV.clerkPublishableKeyStaging;
    }

    if (ORIGINAL_ENV.clerkSecretKeyStaging === undefined) {
      delete process.env.CLERK_SECRET_KEY_STAGING;
    } else {
      process.env.CLERK_SECRET_KEY_STAGING = ORIGINAL_ENV.clerkSecretKeyStaging;
    }

    if (ORIGINAL_ENV.clerkPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
        ORIGINAL_ENV.clerkPublishableKey;
    }

    if (ORIGINAL_ENV.clerkSecretKey === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = ORIGINAL_ENV.clerkSecretKey;
    }
  });

  it('uses the staging Clerk pair for staging hosts when both staging keys exist', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging_example';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging_example';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: 'pk_live_staging_example',
      secretKey: 'sk_live_staging_example',
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: 'pk_live_staging_example',
      secretKey: 'sk_live_staging_example',
    });
  });

  it('does not fall back to production keys on staging hosts when staging keys are incomplete', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging_example';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
    });
  });

  it('does not fall back to production keys when only the staging secret key is set', () => {
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging_example';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
    });
  });

  it('keeps non-staging hosts on the default production pair', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging_example';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging_example';

    expect(resolveClerkKeys('jov.ie')).toEqual({
      publishableKey: 'pk_live_production_example',
      secretKey: 'sk_live_production_example',
    });
  });

  it('falls back to runtime standard env vars on staging when no _STAGING vars exist', () => {
    // beforeEach sets NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
    // but deletes _STAGING vars — simulates the Doppler/Vercel staging env
    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: 'pk_live_production_example',
      secretKey: 'sk_live_production_example',
    });
  });

  it('returns undefined on staging when no _STAGING vars and no standard vars exist', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
    });
  });

  it('resolves staging PK from headers via runtime fallback', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
        'x-forwarded-host': 'staging.jov.ie',
        'x-forwarded-proto': 'https',
      })
    );

    // No _STAGING vars, but standard vars are set (beforeEach)
    await expect(resolvePublishableKeyFromHeaders()).resolves.toBe(
      'pk_live_production_example'
    );
  });

  it('returns undefined publishable key on staging when all keys are missing', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;

    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
        'x-forwarded-host': 'staging.jov.ie',
        'x-forwarded-proto': 'https',
      })
    );

    await expect(resolvePublishableKeyFromHeaders()).resolves.toBeUndefined();
  });

  it('prefers the middleware-injected publishable key header when present', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
        'x-forwarded-host': 'staging.jov.ie',
        'x-forwarded-proto': 'https',
        'x-clerk-publishable-key': 'pk_live_injected_example',
      })
    );

    await expect(resolvePublishableKeyFromHeaders()).resolves.toBe(
      'pk_live_injected_example'
    );
  });
});
