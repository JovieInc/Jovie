import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { onboardingWrapperPropsSpy, redirectMock } = vi.hoisted(() => ({
  onboardingWrapperPropsSpy: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: vi.fn().mockResolvedValue({
    selectedProfile: null,
  }),
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

vi.mock('@/lib/onboarding/reserved-handle', () => ({
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
  });

  it('redirects waitlist-state users back to the waitlist instead of rendering onboarding', async () => {
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`REDIRECT:${APP_ROUTES.WAITLIST}`);

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.WAITLIST);
  });

  it('allows active users to resume onboarding when a resume target is present', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions'
    );

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

    vi.mocked(getDashboardData).mockResolvedValueOnce({
      selectedProfile: {
        id: 'profile_123',
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: null,
        bio: null,
        genres: null,
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
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions'
    );

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

    vi.mocked(getDashboardData).mockResolvedValueOnce({
      selectedProfile: {
        id: 'profile_123',
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: null,
        bio: null,
        genres: null,
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
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions'
    );

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

    vi.mocked(getDashboardData).mockResolvedValueOnce({
      selectedProfile: {
        id: 'profile_123',
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: null,
        bio: null,
        genres: null,
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
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions'
    );

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

    vi.mocked(getDashboardData).mockResolvedValueOnce({
      selectedProfile: {
        id: 'profile_123',
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: null,
        bio: null,
        genres: null,
      },
    });

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ handle: 'artist' }),
    });

    expect(page).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('does not fall back to the dev test-auth username for fresh onboarding handles', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');
    const { getCachedCurrentUser } = await import('@/lib/auth/cached');
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions'
    );

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
    vi.mocked(getDashboardData).mockResolvedValueOnce({
      selectedProfile: null,
    });

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
    const { reserveOnboardingHandle } = await import(
      '@/lib/onboarding/reserved-handle'
    );

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
});
