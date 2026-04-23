import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeOnboarding } from '@/app/onboarding/actions/index';

const hoisted = vi.hoisted(() => {
  const withRetryMock = vi.fn();
  const withDbSessionTxMock = vi.fn();
  const getCachedAuthMock = vi.fn();
  const currentUserMock = vi.fn();
  const headersMock = vi.fn();
  const cookiesMock = vi.fn();
  const fetchExistingUserMock = vi.fn();
  const fetchExistingProfileMock = vi.fn();
  const cacheHandleAvailabilityMock = vi.fn();
  const invalidateProxyUserStateCacheMock = vi.fn();
  const attributeLeadSignupFromClerkUserIdMock = vi.fn();
  const invalidateProfileCacheMock = vi.fn();
  const enforceOnboardingRateLimitMock = vi.fn();
  const revalidatePathMock = vi.fn();
  const captureErrorMock = vi.fn();

  return {
    attributeLeadSignupFromClerkUserIdMock,
    cacheHandleAvailabilityMock,
    captureErrorMock,
    cookiesMock,
    currentUserMock,
    enforceOnboardingRateLimitMock,
    fetchExistingProfileMock,
    fetchExistingUserMock,
    getCachedAuthMock,
    headersMock,
    invalidateProfileCacheMock,
    invalidateProxyUserStateCacheMock,
    revalidatePathMock,
    withDbSessionTxMock,
    withRetryMock,
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: hoisted.currentUserMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePathMock,
}));

vi.mock('next/headers', () => ({
  cookies: hoisted.cookiesMock,
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
  getCachedCurrentUser: hoisted.currentUserMock,
}));

vi.mock('@/lib/auth/clerk-identity', () => ({
  resolveClerkIdentity: vi.fn().mockReturnValue({
    avatarUrl: null,
    displayName: 'Gold Path User',
    email: 'fresh@test.jovie.com',
    spotifyUsername: null,
  }),
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: hoisted.invalidateProxyUserStateCacheMock,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: hoisted.invalidateProfileCacheMock,
}));

vi.mock('@/lib/db/client', () => ({
  withRetry: hoisted.withRetryMock,
}));

vi.mock('@/lib/env-server', () => ({
  isSecureEnv: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  attributeLeadSignupFromClerkUserId:
    hoisted.attributeLeadSignupFromClerkUserIdMock,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  cacheHandleAvailability: hoisted.cacheHandleAvailabilityMock,
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: hoisted.enforceOnboardingRateLimitMock,
}));

vi.mock('@/lib/resilience/primitives', () => ({
  withTimeout: vi.fn(async (promise: Promise<unknown>) => promise),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/validation/content-filter', () => ({
  checkContent: vi.fn().mockReturnValue({
    error: undefined,
    isClean: true,
  }),
  isContentClean: vi.fn().mockReturnValue(true),
}));

vi.mock('@/app/onboarding/actions/avatar', () => ({
  handleBackgroundAvatarUpload: vi.fn(),
}));

vi.mock('@/app/onboarding/actions/errors', () => ({
  logOnboardingError: vi.fn((error: unknown) => error),
}));

vi.mock('@/app/onboarding/actions/helpers', () => ({
  profileIsPublishable: vi.fn().mockReturnValue(false),
}));

vi.mock('@/app/onboarding/actions/profile-setup', () => ({
  createProfileForExistingUser: vi.fn(),
  createUserAndProfile: vi.fn(),
  deactivateOrphanedProfiles: vi.fn(),
  fetchExistingProfile: hoisted.fetchExistingProfileMock,
  fetchExistingUser: hoisted.fetchExistingUserMock,
  updateExistingProfile: vi.fn(),
}));

vi.mock('@/app/onboarding/actions/sync', () => ({
  runBackgroundSyncOperations: vi.fn(),
}));

describe('completeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.currentUserMock.mockResolvedValue(null);
    hoisted.headersMock.mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    });
    hoisted.cookiesMock.mockResolvedValue({
      delete: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    });
    hoisted.enforceOnboardingRateLimitMock.mockResolvedValue(undefined);
    hoisted.cacheHandleAvailabilityMock.mockResolvedValue(undefined);
    hoisted.invalidateProxyUserStateCacheMock.mockResolvedValue(undefined);
    hoisted.attributeLeadSignupFromClerkUserIdMock.mockResolvedValue(undefined);
    hoisted.invalidateProfileCacheMock.mockResolvedValue(undefined);
    hoisted.withDbSessionTxMock.mockImplementation(async operation => {
      return operation({} as never, 'clerk_123');
    });
  });

  it('recovers as success when a concurrent duplicate handle belongs to the same user', async () => {
    hoisted.withRetryMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
        ),
        {
          code: '23505',
          constraint: 'creator_profiles_username_normalized_unique',
          detail: 'Key (username_normalized)=(freshhandle) already exists.',
        }
      )
    );
    hoisted.fetchExistingUserMock.mockResolvedValue({ id: 'db_user_123' });
    hoisted.fetchExistingProfileMock.mockResolvedValue({
      id: 'profile_123',
      usernameNormalized: 'freshhandle',
    });

    await expect(
      completeOnboarding({
        username: 'freshhandle',
        displayName: 'Fresh Handle',
        redirectToDashboard: false,
      })
    ).resolves.toMatchObject({
      profileId: 'profile_123',
      status: 'complete',
      username: 'freshhandle',
    });

    expect(hoisted.fetchExistingUserMock).toHaveBeenCalledWith(
      expect.anything(),
      'clerk_123'
    );
    expect(hoisted.fetchExistingProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      'db_user_123'
    );
    expect(hoisted.captureErrorMock).not.toHaveBeenCalledWith(
      'completeOnboarding failed',
      expect.anything(),
      expect.anything()
    );
  });
});
