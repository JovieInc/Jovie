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
      status: 'ok',
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: 'pk_live_staging_example',
      secretKey: 'sk_live_staging_example',
      status: 'ok',
    });
  });

  it('does not fall back to production keys on staging hosts when staging keys are incomplete', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging_example';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_missing',
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_missing',
    });
  });

  it('does not fall back to production keys when only the staging secret key is set', () => {
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging_example';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_missing',
    });
    expect(resolveClerkKeys('main.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_missing',
    });
  });

  it('keeps non-staging hosts on the default production pair', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging_example';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging_example';

    expect(resolveClerkKeys('jov.ie')).toEqual({
      publishableKey: 'pk_live_production_example',
      secretKey: 'sk_live_production_example',
      status: 'ok',
    });
  });

  it('flags staging_inherits_prod when runtime PK matches build-time production PK', () => {
    // beforeEach sets NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
    // to production values and deletes _STAGING vars. The function detects
    // that the staging deployment inherited the production PK and returns
    // a specific status so downstream UI can surface the misconfig.
    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_inherits_prod',
    });
  });

  it('uses runtime staging keys when they differ from build-time production PK', () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_test_staging_real';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_test_staging_real';

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: 'pk_test_staging_real',
      secretKey: 'sk_test_staging_real',
      status: 'ok',
    });
  });

  it('returns staging_missing on staging when no _STAGING vars and no standard vars exist', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;

    expect(resolveClerkKeys('staging.jov.ie')).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      status: 'staging_missing',
    });
  });

  it('returns undefined from headers on staging when runtime PK matches production PK', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
        'x-forwarded-host': 'staging.jov.ie',
        'x-forwarded-proto': 'https',
      })
    );

    // No _STAGING vars, standard vars are set (beforeEach) — runtime PK
    // matches build-time PK, so staging detection returns undefined.
    await expect(resolvePublishableKeyFromHeaders()).resolves.toBeUndefined();
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

  it('returns undefined on staging when publishable key exists but secret key is missing', async () => {
    // Simulates the actual staging bug: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is
    // available (via build-time inlining or Vercel env) but CLERK_SECRET_KEY
    // is not set in the Preview deployment runtime.
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
