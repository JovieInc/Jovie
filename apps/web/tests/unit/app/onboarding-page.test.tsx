import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
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
  OnboardingFormWrapper: () => <div data-testid='onboarding-form' />,
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
});
