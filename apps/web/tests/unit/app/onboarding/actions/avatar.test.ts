import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildThemeWithProfileAccent: vi.fn(),
  withDbSessionTx: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocks.withDbSessionTx,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
  profilePhotos: {},
}));

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: mocks.buildThemeWithProfileAccent,
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

describe('handleBackgroundAvatarUpload', () => {
  it('finishes download, upload, and accent extraction before transaction entry', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-public', () => ({
      publicEnv: {
        NEXT_PUBLIC_APP_URL: 'https://jov.ie',
        NEXT_PUBLIC_PROFILE_HOSTNAME: 'jov.ie',
      },
    }));

    const events: string[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push('download');
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      })
      .mockImplementationOnce(async () => {
        events.push('upload');
        return Response.json({
          blobUrl: 'https://example.public.blob.vercel-storage.com/avatar.png',
          photoId: 'photo-1',
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { avatarUrl: null, avatarLockedByUser: false },
              ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    };
    const precomputedTheme = {
      profileAccent: {
        version: 1 as const,
        primaryHex: '#123456',
        sourceUrl: 'https://example.public.blob.vercel-storage.com/avatar.png',
      },
    };
    mocks.buildThemeWithProfileAccent.mockImplementation(async () => {
      events.push('accent');
      return precomputedTheme;
    });
    mocks.withDbSessionTx.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        events.push('transaction');
        return callback(tx);
      }
    );
    const { handleBackgroundAvatarUpload } = await import(
      '../../../../../app/onboarding/actions/avatar'
    );
    await handleBackgroundAvatarUpload(
      'profile-1',
      'https://i.scdn.co/image/avatar',
      'session=cookie'
    );

    expect(events).toEqual(['download', 'upload', 'accent', 'transaction']);
    expect(mocks.buildThemeWithProfileAccent).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
