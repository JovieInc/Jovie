import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { readPendingClaimContext } from '@/lib/claim/context';
import { reserveOnboardingHandle } from '@/lib/onboarding/reserved-handle';

const { onboardingWrapperPropsSpy, redirectMock, mockBootstrapProfileLimit } =
  vi.hoisted(() => ({
    onboardingWrapperPropsSpy: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    mockBootstrapProfileLimit: vi.fn(),
  }));

vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: unknown) => value,
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((requestedId: string | null) => ({
          limit: () => mockBootstrapProfileLimit(requestedId),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    avatarUrl: 'avatarUrl',
    bio: 'bio',
    genres: 'genres',
  },
}));

vi.mock('@/features/dashboard/organisms/OnboardingFormWrapper', () => ({
  OnboardingFormWrapper: (props: Record<string, unknown>) => {
    onboardingWrapperPropsSpy(props);
    return <div data-testid='onboarding-form' />;
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/auth/clerk-identity', () => ({
  resolveClerkIdentity: vi.fn().mockReturnValue({
    email: 'artist@example.com',
    displayName: 'Artist',
    spotifyUsername: null,
  }),
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: {
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    NEEDS_DB_USER: 'NEEDS_DB_USER',
    NEEDS_WAITLIST_SUBMISSION: 'NEEDS_WAITLIST_SUBMISSION',
    WAITLIST_PENDING: 'WAITLIST_PENDING',
    NEEDS_ONBOARDING: 'NEEDS_ONBOARDING',
    ACTIVE: 'ACTIVE',
    BANNED: 'BANNED',
    USER_CREATION_FAILED: 'USER_CREATION_FAILED',
  },
  resolveUserState: vi.fn().mockResolvedValue({
    state: 'NEEDS_WAITLIST_SUBMISSION',
    clerkUserId: 'clerk_123',
    dbUserId: null,
    profileId: null,
    redirectTo: APP_ROUTES.WAITLIST,
    context: {
      isAdmin: false,
      isPro: false,
      email: 'artist@example.com',
    },
  }),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_CLERK_MOCK: '0',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    VERCEL_ENV: 'test',
  },
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/claim/context', () => ({
  readPendingClaimContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/onboarding/reserved-handle', () => ({
  buildHandleCandidates: vi.fn().mockReturnValue([]),
  reserveOnboardingHandle: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/utils/errors', () => ({
  extractErrorMessage: vi.fn().mockReturnValue(''),
}));

import OnboardingPage from '../../../app/onboarding/page';

describe('onboarding page', () => {
  beforeEach(() => {
    onboardingWrapperPropsSpy.mockClear();
    redirectMock.mockClear();
    vi.mocked(reserveOnboardingHandle).mockClear();
    vi.mocked(readPendingClaimContext).mockResolvedValue(null);
    mockBootstrapProfileLimit.mockReset();
    mockBootstrapProfileLimit.mockImplementation(
      async (requestedId: string | null) => {
        if (requestedId === 'claim_target_profile') {
          return [
            {
              id: 'claim_target_profile',
              username: 'claimed-handle',
              displayName: 'Claim Target',
              avatarUrl: 'https://example.com/avatar.jpg',
              bio: 'Target bio',
              genres: ['pop'],
            },
          ];
        }

        if (
          requestedId === 'current_profile' ||
          requestedId === 'profile_123'
        ) {
          return [
            {
              id: requestedId,
              username: 'artist',
              displayName: 'Artist',
              avatarUrl: null,
              bio: null,
              genres: null,
            },
          ];
        }

        return [];
      }
    );
  });

  it('redirects waitlist-state users back to the waitlist instead of rendering onboarding', async () => {
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`REDIRECT:${APP_ROUTES.WAITLIST}`);

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.WAITLIST);
  });

  it('allows active users to resume onboarding when a resume target is present', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    const page = await OnboardingPage({
      searchParams: Promise.resolve({ resume: 'dsp' }),
    });

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('allows active users to stay in onboarding on the spotify resume path', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    const page = await OnboardingPage({
      searchParams: Promise.resolve({ resume: 'spotify' }),
    });

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it.each([
    'artist-confirm',
    'upgrade',
    'late-arrivals',
  ] as const)('allows active users to stay in onboarding on the %s resume path', async resume => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    const page = await OnboardingPage({
      searchParams: Promise.resolve({ resume }),
    });

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('allows active users to continue onboarding when the handle query is still present', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    const page = await OnboardingPage({
      searchParams: Promise.resolve({ handle: 'artist' }),
    });

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('treats the legacy username query as a continuation signal and prefilled handle', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ username: 'legacy-artist' }),
    });
    render(page);

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    expect(onboardingWrapperPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: 'legacy-artist',
      })
    );
  });

  it('redirects active users with only a pending claim cookie back to the app shell', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    vi.mocked(readPendingClaimContext).mockResolvedValueOnce({
      mode: 'direct_profile',
      creatorProfileId: 'profile_123',
      username: 'artist',
      expectedSpotifyArtistId: 'spotify_123',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('REDIRECT:/app');
  });

  it('bootstraps the pending-claim target profile instead of the signed-in user profile', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'current_profile',
      redirectTo: APP_ROUTES.ONBOARDING,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    vi.mocked(readPendingClaimContext).mockResolvedValueOnce({
      mode: 'direct_profile',
      creatorProfileId: 'claim_target_profile',
      username: 'claimed-handle',
      expectedSpotifyArtistId: 'spotify_123',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const page = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(onboardingWrapperPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: 'claimed-handle',
        initialDisplayName: 'Claim Target',
        initialProfileId: 'claim_target_profile',
        existingAvatarUrl: 'https://example.com/avatar.jpg',
        existingBio: 'Target bio',
        existingGenres: ['pop'],
      })
    );
  });

  it('does not fall back to the dev test-auth username for fresh onboarding handles', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');
    const { getCachedCurrentUser } = await import('@/lib/auth/cached');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: null,
      redirectTo: APP_ROUTES.ONBOARDING,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    vi.mocked(getCachedCurrentUser).mockResolvedValueOnce({
      username: 'browse-test-user',
    } as never);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(page).toBeTruthy();
    expect(onboardingWrapperPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: '',
      })
    );
  });

  it('redirects banned users to the unavailable page', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'BANNED',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.UNAVAILABLE,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`REDIRECT:${APP_ROUTES.UNAVAILABLE}`);
  });

  it('redirects user creation failures to the dedicated error page', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'USER_CREATION_FAILED',
      clerkUserId: 'clerk_123',
      dbUserId: null,
      profileId: null,
      redirectTo: '/error/user-creation-failed',
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('REDIRECT:/error/user-creation-failed');
  });

  it('redirects active users without a continuation signal back to the app shell', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'ACTIVE',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.DASHBOARD,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('REDIRECT:/app');
  });

  it('redirects to signin when clerkUserId is missing despite routing into onboarding', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      clerkUserId: null,
      dbUserId: 'db_123',
      profileId: null,
      redirectTo: APP_ROUTES.ONBOARDING,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.ONBOARDING}`
    );
  });

  it('prefills a reserved handle when no explicit handle is provided', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');
    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: null,
      redirectTo: APP_ROUTES.ONBOARDING,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    vi.mocked(reserveOnboardingHandle).mockResolvedValueOnce('reserved-handle');

    const page = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(page).toBeTruthy();
    expect(onboardingWrapperPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: 'reserved-handle',
        isReservedHandle: true,
        userId: 'clerk_123',
      })
    );
  });

  it('does not reserve a handle when a pending claim already provides one', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');
    vi.mocked(resolveUserState).mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      clerkUserId: 'clerk_123',
      dbUserId: 'db_123',
      profileId: 'profile_123',
      redirectTo: APP_ROUTES.ONBOARDING,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'artist@example.com',
      },
    });
    vi.mocked(readPendingClaimContext).mockResolvedValueOnce({
      mode: 'direct_profile',
      creatorProfileId: 'profile_123',
      username: 'claimed-handle',
      expectedSpotifyArtistId: 'spotify_123',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    const page = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(onboardingWrapperPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: 'claimed-handle',
        isReservedHandle: false,
      })
    );
    expect(vi.mocked(reserveOnboardingHandle).mock.calls).toHaveLength(0);
  });
});
