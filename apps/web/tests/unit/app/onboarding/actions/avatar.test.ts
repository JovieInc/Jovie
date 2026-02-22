import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
  profilePhotos: {},
}));

vi.mock('@/lib/ingestion/profile', () => ({
  applyProfileEnrichment: vi.fn(),
}));

describe('getSafeUploadUrl', () => {
  it('builds upload URL from NEXT_PUBLIC_APP_URL', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-public', () => ({
      publicEnv: {
        NEXT_PUBLIC_APP_URL: 'https://jov.ie',
        NEXT_PUBLIC_PROFILE_HOSTNAME: 'jov.ie',
      },
    }));

    const { getSafeUploadUrl } = await import(
      '../../../../../app/onboarding/actions/avatar'
    );

    expect(await getSafeUploadUrl()).toBe('https://jov.ie/api/images/upload');
  });

  it('throws for invalid NEXT_PUBLIC_APP_URL', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-public', () => ({
      publicEnv: {
        NEXT_PUBLIC_APP_URL: 'not-a-url',
        NEXT_PUBLIC_PROFILE_HOSTNAME: 'jov.ie',
      },
    }));

    const { getSafeUploadUrl } = await import(
      '../../../../../app/onboarding/actions/avatar'
    );

    await expect(getSafeUploadUrl()).rejects.toThrow(
      'Invalid base URL for avatar upload'
    );
  });
});
