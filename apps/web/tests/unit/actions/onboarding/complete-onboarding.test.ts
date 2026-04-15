import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cookieSetMock,
  mockAttributeLeadSignupFromClerkUserId,
  mockCacheHandleAvailability,
  mockCaptureError,
  mockClaimPrebuiltProfileForUser,
  mockClearPendingClaimContext,
  mockCreateProfileForExistingUser,
  mockCreateUserAndProfile,
  mockDeactivateOrphanedProfiles,
  mockEnforceOnboardingRateLimit,
  mockEnsureOnboardingUserRow,
  mockEnsureEmailAvailable,
  mockEnsureHandleAvailable,
  mockExtractClientIP,
  mockFetchExistingProfile,
  mockFetchExistingUser,
  mockGetCachedAuth,
  mockGetCachedCurrentUser,
  mockHandleBackgroundAvatarUpload,
  mockHeaders,
  mockInvalidateProfileCache,
  mockInvalidateProxyUserStateCache,
  mockIsContentClean,
  mockLogOnboardingError,
  mockNormalizeUsername,
  mockProfileIsPublishable,
  mockReadPendingClaimContext,
  mockRedirect,
  mockReservePrebuiltProfileForUser,
  mockResolveClerkIdentity,
  mockRunBackgroundSyncOperations,
  mockUpdateExistingProfile,
  mockValidateUsername,
  mockWithDbSessionTx,
  mockWithRetry,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  mockAttributeLeadSignupFromClerkUserId: vi.fn(),
  mockCacheHandleAvailability: vi.fn(),
  mockCaptureError: vi.fn(),
  mockClaimPrebuiltProfileForUser: vi.fn(),
  mockClearPendingClaimContext: vi.fn(),
  mockCreateProfileForExistingUser: vi.fn(),
  mockCreateUserAndProfile: vi.fn(),
  mockDeactivateOrphanedProfiles: vi.fn(),
  mockEnforceOnboardingRateLimit: vi.fn(),
  mockEnsureOnboardingUserRow: vi.fn(),
  mockEnsureEmailAvailable: vi.fn(),
  mockEnsureHandleAvailable: vi.fn(),
  mockExtractClientIP: vi.fn(),
  mockFetchExistingProfile: vi.fn(),
  mockFetchExistingUser: vi.fn(),
  mockGetCachedAuth: vi.fn(),
  mockGetCachedCurrentUser: vi.fn(),
  mockHandleBackgroundAvatarUpload: vi.fn(),
  mockHeaders: vi.fn(),
  mockInvalidateProfileCache: vi.fn(),
  mockInvalidateProxyUserStateCache: vi.fn(),
  mockIsContentClean: vi.fn(),
  mockLogOnboardingError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
  ),
  mockNormalizeUsername: vi.fn(),
  mockProfileIsPublishable: vi.fn(),
  mockReadPendingClaimContext: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  mockReservePrebuiltProfileForUser: vi.fn(),
  mockResolveClerkIdentity: vi.fn(),
  mockRunBackgroundSyncOperations: vi.fn(),
  mockUpdateExistingProfile: vi.fn(),
  mockValidateUsername: vi.fn(),
  mockWithDbSessionTx: vi.fn(),
  mockWithRetry: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: cookieSetMock,
  })),
  headers: mockHeaders,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: mockGetCachedCurrentUser,
}));

vi.mock('@/lib/auth/clerk-identity', () => ({
  resolveClerkIdentity: mockResolveClerkIdentity,
}));

vi.mock('@/lib/claim/context', () => ({
  clearPendingClaimContext: mockClearPendingClaimContext,
  readPendingClaimContext: mockReadPendingClaimContext,
}));

vi.mock('@/lib/claim/finalize', () => ({
  claimPrebuiltProfileForUser: mockClaimPrebuiltProfileForUser,
  ensureOnboardingUserRow: mockEnsureOnboardingUserRow,
  reservePrebuiltProfileForUser: mockReservePrebuiltProfileForUser,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/lib/db/client', () => ({
  withRetry: mockWithRetry,
}));

vi.mock('@/lib/env-server', () => ({
  isSecureEnv: vi.fn(() => true),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  attributeLeadSignupFromClerkUserId: mockAttributeLeadSignupFromClerkUserId,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  cacheHandleAvailability: mockCacheHandleAvailability,
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mockEnforceOnboardingRateLimit,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

vi.mock('@/lib/validation/content-filter', () => ({
  isContentClean: mockIsContentClean,
}));

vi.mock('@/lib/validation/username', () => ({
  normalizeUsername: mockNormalizeUsername,
  validateUsername: mockValidateUsername,
}));

vi.mock('@/app/onboarding/actions/avatar', () => ({
  handleBackgroundAvatarUpload: mockHandleBackgroundAvatarUpload,
}));

vi.mock('@/app/onboarding/actions/errors', () => ({
  logOnboardingError: mockLogOnboardingError,
}));

vi.mock('@/app/onboarding/actions/helpers', () => ({
  profileIsPublishable: mockProfileIsPublishable,
}));

vi.mock('@/app/onboarding/actions/profile-setup', () => ({
  createProfileForExistingUser: mockCreateProfileForExistingUser,
  createUserAndProfile: mockCreateUserAndProfile,
  deactivateOrphanedProfiles: mockDeactivateOrphanedProfiles,
  fetchExistingProfile: mockFetchExistingProfile,
  fetchExistingUser: mockFetchExistingUser,
  updateExistingProfile: mockUpdateExistingProfile,
}));

vi.mock('@/app/onboarding/actions/sync', () => ({
  runBackgroundSyncOperations: mockRunBackgroundSyncOperations,
}));

vi.mock('@/app/onboarding/actions/validation', () => ({
  ensureEmailAvailable: mockEnsureEmailAvailable,
  ensureHandleAvailable: mockEnsureHandleAvailable,
}));

import { completeOnboarding } from '@/app/onboarding/actions';
import { APP_ROUTES } from '@/constants/routes';

describe('completeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk-user-123' });
    mockGetCachedCurrentUser.mockResolvedValue({ id: 'clerk-user-123' });
    mockValidateUsername.mockReturnValue({ isValid: true });
    mockNormalizeUsername.mockImplementation((username: string) =>
      username.trim().toLowerCase()
    );
    mockHeaders.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'cookie' ? 'session=test' : null)),
    });
    mockGetCachedCurrentUser.mockResolvedValue({ id: 'clerk-user-123' });
    mockResolveClerkIdentity.mockReturnValue({
      avatarUrl: 'https://images.test/avatar.png',
      email: 'artist@example.com',
    });
    mockReadPendingClaimContext.mockResolvedValue(null);
    mockExtractClientIP.mockReturnValue('127.0.0.1');
    mockIsContentClean.mockReturnValue(true);
    mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) =>
      fn()
    );
    mockWithDbSessionTx.mockImplementation(
      async (
        callback: (tx: Record<string, unknown>, clerkUserId: string) => unknown
      ) => callback({}, 'clerk-user-123')
    );
    mockEnforceOnboardingRateLimit.mockResolvedValue(undefined);
    mockCacheHandleAvailability.mockResolvedValue(undefined);
    mockInvalidateProxyUserStateCache.mockResolvedValue(undefined);
    mockInvalidateProfileCache.mockResolvedValue(undefined);
    mockHandleBackgroundAvatarUpload.mockResolvedValue(undefined);
    mockAttributeLeadSignupFromClerkUserId.mockResolvedValue({
      leadId: null,
      userId: null,
    });
    mockEnsureEmailAvailable.mockResolvedValue(undefined);
    mockEnsureHandleAvailable.mockResolvedValue(undefined);
    mockEnsureOnboardingUserRow.mockResolvedValue({ id: 'db-user-123' });
    mockFetchExistingUser.mockResolvedValue(null);
    mockFetchExistingProfile.mockResolvedValue(null);
    mockClaimPrebuiltProfileForUser.mockResolvedValue({
      username: 'artist',
      status: 'updated',
      profileId: 'profile-123',
    });
    mockCreateUserAndProfile.mockResolvedValue({
      username: 'artist',
      status: 'created',
      profileId: 'profile-123',
    });
    mockCreateProfileForExistingUser.mockResolvedValue({
      username: 'artist',
      status: 'created',
      profileId: 'profile-123',
    });
    mockUpdateExistingProfile.mockResolvedValue({
      username: 'artist',
      status: 'updated',
      profileId: 'profile-123',
    });
    mockReservePrebuiltProfileForUser.mockResolvedValue({
      username: 'artist',
      status: 'updated',
      profileId: 'profile-123',
    });
    mockDeactivateOrphanedProfiles.mockResolvedValue(undefined);
    mockProfileIsPublishable.mockReturnValue(false);
  });

  it('rejects unauthenticated users before touching persistence', async () => {
    mockGetCachedAuth.mockResolvedValueOnce({ userId: null });

    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: 'Artist',
        redirectToDashboard: false,
      })
    ).rejects.toThrow('User not authenticated');

    expect(mockWithDbSessionTx).not.toHaveBeenCalled();
  });

  it('rejects invalid usernames', async () => {
    mockValidateUsername.mockReturnValueOnce({
      isValid: false,
      error: 'Invalid username',
    });

    await expect(
      completeOnboarding({
        username: 'artist!',
        displayName: 'Artist',
        redirectToDashboard: false,
      })
    ).rejects.toThrow('Invalid username');
  });

  it('rejects empty, oversized, and unclean display names', async () => {
    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: '   ',
        redirectToDashboard: false,
      })
    ).rejects.toThrow('Display name is required');

    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: 'A'.repeat(51),
        redirectToDashboard: false,
      })
    ).rejects.toThrow('Display name must be 50 characters or less');

    mockIsContentClean.mockReturnValueOnce(false);

    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: 'Bad Name',
        redirectToDashboard: false,
      })
    ).rejects.toThrow('Display name contains language that is not allowed');
  });

  it('surfaces rate-limit failures through the shared onboarding error path', async () => {
    const rateLimitError = new Error('RATE_LIMITED');
    mockEnforceOnboardingRateLimit.mockRejectedValueOnce(rateLimitError);

    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: 'Artist',
        redirectToDashboard: false,
      })
    ).rejects.toThrow('RATE_LIMITED');

    expect(mockCaptureError).toHaveBeenCalledWith(
      'completeOnboarding failed',
      rateLimitError,
      expect.objectContaining({ route: 'onboarding' })
    );
    expect(mockLogOnboardingError).toHaveBeenCalled();
  });

  it('claims the exact prebuilt profile for token-backed pending claims', async () => {
    mockReadPendingClaimContext.mockResolvedValueOnce({
      mode: 'token_backed',
      creatorProfileId: 'profile-claim-123',
      username: 'artist',
      claimTokenHash: 'hash',
      leadId: 'lead-123',
      expectedSpotifyArtistId: 'spotify-123',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    await completeOnboarding({
      username: 'artist',
      displayName: 'Artist',
      redirectToDashboard: false,
    });

    expect(mockClaimPrebuiltProfileForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        creatorProfileId: 'profile-claim-123',
        displayName: 'Artist',
        expectedUsername: 'artist',
        source: 'token_backed_onboarding',
      })
    );
    expect(mockReservePrebuiltProfileForUser).not.toHaveBeenCalled();
    expect(mockClearPendingClaimContext).toHaveBeenCalled();
  });

  it('reserves the prebuilt profile for direct pending claims', async () => {
    mockReadPendingClaimContext.mockResolvedValueOnce({
      mode: 'direct_profile',
      creatorProfileId: 'profile-claim-456',
      username: 'artist',
      expectedSpotifyArtistId: 'spotify-123',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    await completeOnboarding({
      username: 'artist',
      displayName: 'Artist',
      redirectToDashboard: false,
    });

    expect(mockReservePrebuiltProfileForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        creatorProfileId: 'profile-claim-456',
        displayName: 'Artist',
        expectedUsername: 'artist',
      })
    );
    expect(mockClaimPrebuiltProfileForUser).not.toHaveBeenCalled();
    expect(mockClearPendingClaimContext).not.toHaveBeenCalled();
  });

  it('creates a new user profile, caches completion, and keeps side effects non-blocking', async () => {
    mockAttributeLeadSignupFromClerkUserId.mockRejectedValueOnce(
      new Error('lead attribution down')
    );

    const result = await completeOnboarding({
      username: 'Artist',
      displayName: 'Artist Name',
      email: 'artist@example.com',
      redirectToDashboard: false,
    });

    expect(result).toEqual({
      username: 'artist',
      status: 'created',
      profileId: 'profile-123',
    });
    expect(mockEnsureEmailAvailable).toHaveBeenCalledWith(
      {},
      'clerk-user-123',
      'artist@example.com'
    );
    expect(mockEnsureHandleAvailable).toHaveBeenCalledWith({}, 'artist', null);
    expect(mockCreateUserAndProfile).toHaveBeenCalledWith(
      {},
      'clerk-user-123',
      'artist@example.com',
      'artist',
      'Artist Name'
    );
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith('artist', false);
    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith(
      'clerk-user-123'
    );
    expect(mockHandleBackgroundAvatarUpload).toHaveBeenCalledWith(
      'profile-123',
      'https://images.test/avatar.png',
      'session=test'
    );
    expect(mockRunBackgroundSyncOperations).toHaveBeenCalledWith(
      'clerk-user-123',
      'artist'
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'attribute_lead_signup failed',
      expect.objectContaining({
        message: 'lead attribution down',
      }),
      expect.objectContaining({
        route: 'onboarding',
        contextData: { userId: 'clerk-user-123' },
      })
    );
    expect(cookieSetMock).toHaveBeenCalledWith(
      'jovie_onboarding_complete',
      '1',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 120,
        path: '/',
        sameSite: 'lax',
      })
    );
    expect(mockInvalidateProfileCache).toHaveBeenCalledWith('artist');
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      APP_ROUTES.DASHBOARD,
      'layout'
    );
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockGetCachedCurrentUser).toHaveBeenCalled();
  });

  it('updates an existing incomplete profile and deactivates orphaned profiles', async () => {
    mockFetchExistingUser.mockResolvedValueOnce({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    mockUpdateExistingProfile.mockResolvedValueOnce({
      username: 'newartist',
      status: 'updated',
      profileId: 'profile-123',
    });
    mockFetchExistingProfile.mockResolvedValueOnce({
      id: 'profile-123',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      username: 'old-artist',
      usernameNormalized: 'old-artist',
      displayName: 'Old Artist',
      isClaimed: false,
      isPublic: false,
      claimedAt: null,
      onboardingCompletedAt: null,
    });

    const result = await completeOnboarding({
      username: 'NewArtist',
      displayName: 'New Artist',
      redirectToDashboard: false,
    });

    expect(result).toEqual({
      username: 'newartist',
      status: 'updated',
      profileId: 'profile-123',
    });
    expect(mockEnsureHandleAvailable).toHaveBeenCalledWith(
      {},
      'newartist',
      'profile-123'
    );
    expect(mockUpdateExistingProfile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'profile-123' }),
      'newartist',
      'New Artist',
      'NewArtist'
    );
    expect(mockDeactivateOrphanedProfiles).toHaveBeenCalledWith(
      {},
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'profile-123'
    );
  });

  it('returns an already-complete profile without rewriting it', async () => {
    mockFetchExistingUser.mockResolvedValueOnce({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    mockFetchExistingProfile.mockResolvedValueOnce({
      id: 'profile-123',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      username: 'artist',
      usernameNormalized: 'artist',
      displayName: 'Artist',
      isClaimed: true,
      isPublic: true,
      claimedAt: new Date('2024-01-01T00:00:00.000Z'),
      onboardingCompletedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    mockProfileIsPublishable.mockReturnValueOnce(true);

    const result = await completeOnboarding({
      username: 'artist',
      displayName: 'Artist',
      redirectToDashboard: false,
    });

    expect(result).toEqual({
      username: 'artist',
      status: 'complete',
      profileId: 'profile-123',
    });
    expect(mockUpdateExistingProfile).not.toHaveBeenCalled();
    expect(mockCreateProfileForExistingUser).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard after a successful completion when requested', async () => {
    await expect(
      completeOnboarding({
        username: 'artist',
        displayName: 'Artist',
        redirectToDashboard: true,
      })
    ).rejects.toThrow(`REDIRECT:${APP_ROUTES.DASHBOARD}`);

    expect(cookieSetMock).toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });
});
