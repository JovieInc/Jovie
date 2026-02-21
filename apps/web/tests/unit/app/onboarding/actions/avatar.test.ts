import { describe, expect, it, vi } from 'vitest';

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
      '../../../../../app/onboarding/actions/avatar-url-utils'
    );

    expect(getSafeUploadUrl()).toBe('https://jov.ie/api/images/upload');
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
      '../../../../../app/onboarding/actions/avatar-url-utils'
    );

    expect(() => getSafeUploadUrl()).toThrow(
      'Invalid base URL for avatar upload'
    );
  });
});
