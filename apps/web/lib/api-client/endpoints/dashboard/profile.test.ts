/**
 * Tests for Dashboard Profile API Endpoint Methods
 *
 * Tests the typed methods for GET and PUT operations on /api/dashboard/profile.
 * Uses mocking of the api client to test endpoint method behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiErrorCode } from '../../types';
import {
  dashboardProfile,
  getProfile,
  getProfileSafe,
  updateAvatar,
  updateBio,
  updateDisplayName,
  updateProfile,
  updateProfileSafe,
  updateSettings,
  updateTheme,
  updateVenmoHandle,
} from './profile';
import type {
  DashboardProfile,
  GetProfileResponse,
  UpdateProfileResponse,
} from './types';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the api client
vi.mock('../../client', () => {
  const mockDashboard = {
    get: vi.fn(),
    put: vi.fn(),
    request: vi.fn(),
  };
  return {
    api: {
      dashboard: mockDashboard,
    },
  };
});

// Import the mocked api after mock setup
import { api } from '../../client';

// Get typed mock functions
const mockDashboardGet = api.dashboard.get as ReturnType<typeof vi.fn>;
const mockDashboardPut = api.dashboard.put as ReturnType<typeof vi.fn>;
const mockDashboardRequest = api.dashboard.request as ReturnType<typeof vi.fn>;

// =============================================================================
// Test Data
// =============================================================================

const mockProfile: DashboardProfile = {
  id: 'profile-123',
  userId: 'user-456',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  displayTitle: 'Artist',
  bio: 'A test bio',
  avatarUrl: 'https://example.com/avatar.jpg',
  creatorType: 'artist',
  spotifyUrl: 'https://open.spotify.com/artist/123',
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: 'spotify-123',
  venmoHandle: '@testartist',
  isPublic: true,
  isVerified: false,
  isFeatured: false,
  isClaimed: true,
  marketingOptOut: false,
  profileViews: 100,
  profileCompletionPct: 85,
  avatarLockedByUser: false,
  displayNameLocked: false,
  ingestionStatus: 'idle',
  settings: { hide_branding: false },
  theme: { preference: 'system' },
  claimToken: null,
  claimedAt: '2024-01-01T00:00:00Z',
  onboardingCompletedAt: '2024-01-02T00:00:00Z',
  lastLoginAt: '2024-06-01T00:00:00Z',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
};

const mockGetProfileResponse: GetProfileResponse = {
  profile: mockProfile,
};

const mockUpdateProfileResponse: UpdateProfileResponse = {
  profile: mockProfile,
};

// Helper to create ApiError with correct signature
function createApiError(
  message: string,
  status: number,
  code: ApiErrorCode,
  retryable = false
): ApiError {
  return new ApiError(message, { code, status, retryable });
}

// =============================================================================
// Tests
// =============================================================================

describe('dashboard profile endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // getProfile Tests
  // ===========================================================================

  describe('getProfile', () => {
    it('fetches the current user profile', async () => {
      mockDashboardGet.mockResolvedValue(mockGetProfileResponse);

      const result = await getProfile();

      expect(result).toEqual(mockGetProfileResponse);
      expect(mockDashboardGet).toHaveBeenCalledWith('/profile', undefined);
    });

    it('passes request options to the API client', async () => {
      mockDashboardGet.mockResolvedValue(mockGetProfileResponse);
      const options = { timeout: 5000 };

      await getProfile(options);

      expect(mockDashboardGet).toHaveBeenCalledWith('/profile', options);
    });

    it('passes abort signal to the API client', async () => {
      mockDashboardGet.mockResolvedValue(mockGetProfileResponse);
      const controller = new AbortController();
      const options = { signal: controller.signal };

      await getProfile(options);

      expect(mockDashboardGet).toHaveBeenCalledWith('/profile', options);
    });

    it('throws ApiError on failure', async () => {
      const error = createApiError(
        'Unauthorized',
        401,
        ApiErrorCode.UNAUTHORIZED
      );
      mockDashboardGet.mockRejectedValue(error);

      await expect(getProfile()).rejects.toThrow(ApiError);
      await expect(getProfile()).rejects.toThrow('Unauthorized');
    });

    it('throws ApiError for 404 not found', async () => {
      const error = createApiError(
        'Profile not found',
        404,
        ApiErrorCode.NOT_FOUND
      );
      mockDashboardGet.mockRejectedValue(error);

      try {
        await getProfile();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isNotFound()).toBe(true);
      }
    });
  });

  // ===========================================================================
  // getProfileSafe Tests
  // ===========================================================================

  describe('getProfileSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockDashboardRequest.mockResolvedValue({
        ok: true,
        data: mockGetProfileResponse,
        status: 200,
      });

      const result = await getProfileSafe();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(mockGetProfileResponse);
      }
      expect(mockDashboardRequest).toHaveBeenCalledWith(
        'GET',
        '/profile',
        undefined
      );
    });

    it('returns ok: false with error on failure', async () => {
      const error = createApiError(
        'Unauthorized',
        401,
        ApiErrorCode.UNAUTHORIZED
      );
      mockDashboardRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await getProfileSafe();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ApiError);
        expect(result.error.isUnauthorized()).toBe(true);
      }
    });

    it('passes request options', async () => {
      mockDashboardRequest.mockResolvedValue({
        ok: true,
        data: mockGetProfileResponse,
        status: 200,
      });
      const options = { timeout: 3000 };

      await getProfileSafe(options);

      expect(mockDashboardRequest).toHaveBeenCalledWith(
        'GET',
        '/profile',
        options
      );
    });
  });

  // ===========================================================================
  // updateProfile Tests
  // ===========================================================================

  describe('updateProfile', () => {
    it('updates profile with display name', async () => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);

      const result = await updateProfile({ displayName: 'New Name' });

      expect(result).toEqual(mockUpdateProfileResponse);
      expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
        body: { updates: { displayName: 'New Name' } },
      });
    });

    it('updates profile with multiple fields', async () => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);
      const updates = {
        displayName: 'New Name',
        bio: 'New bio text',
        venmo_handle: '@newhandle',
      };

      await updateProfile(updates);

      expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
        body: { updates },
      });
    });

    it('updates profile with settings', async () => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);

      await updateProfile({ settings: { hide_branding: true } });

      expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
        body: { updates: { settings: { hide_branding: true } } },
      });
    });

    it('updates profile with theme', async () => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);

      await updateProfile({ theme: { preference: 'dark' } });

      expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
        body: { updates: { theme: { preference: 'dark' } } },
      });
    });

    it('passes request options', async () => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);
      const options = { timeout: 5000 };

      await updateProfile({ displayName: 'Test' }, options);

      expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
        ...options,
        body: { updates: { displayName: 'Test' } },
      });
    });

    it('returns warning when Clerk sync fails', async () => {
      const responseWithWarning: UpdateProfileResponse = {
        profile: mockProfile,
        warning: 'Failed to sync avatar with Clerk',
      };
      mockDashboardPut.mockResolvedValue(responseWithWarning);

      const result = await updateProfile({
        avatarUrl: 'https://example.com/new.jpg',
      });

      expect(result.warning).toBe('Failed to sync avatar with Clerk');
    });

    it('throws ApiError on validation failure', async () => {
      const error = createApiError(
        'Invalid bio length',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockDashboardPut.mockRejectedValue(error);

      await expect(updateProfile({ bio: 'x'.repeat(1000) })).rejects.toThrow(
        ApiError
      );
    });
  });

  // ===========================================================================
  // updateProfileSafe Tests
  // ===========================================================================

  describe('updateProfileSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockDashboardRequest.mockResolvedValue({
        ok: true,
        data: mockUpdateProfileResponse,
        status: 200,
      });

      const result = await updateProfileSafe({ displayName: 'New Name' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(mockUpdateProfileResponse);
      }
      expect(mockDashboardRequest).toHaveBeenCalledWith('PUT', '/profile', {
        body: { updates: { displayName: 'New Name' } },
      });
    });

    it('returns ok: false with error on failure', async () => {
      const error = createApiError(
        'Validation failed',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockDashboardRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await updateProfileSafe({ bio: 'x'.repeat(1000) });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(400);
      }
    });
  });

  // ===========================================================================
  // Convenience Method Tests
  // ===========================================================================

  describe('convenience methods', () => {
    beforeEach(() => {
      mockDashboardPut.mockResolvedValue(mockUpdateProfileResponse);
    });

    describe('updateDisplayName', () => {
      it('updates only the display name', async () => {
        await updateDisplayName('New Artist Name');

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { displayName: 'New Artist Name' } },
        });
      });

      it('passes options through', async () => {
        await updateDisplayName('Name', { timeout: 3000 });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          timeout: 3000,
          body: { updates: { displayName: 'Name' } },
        });
      });
    });

    describe('updateBio', () => {
      it('updates only the bio', async () => {
        await updateBio('My new bio text');

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { bio: 'My new bio text' } },
        });
      });
    });

    describe('updateAvatar', () => {
      it('updates only the avatar URL', async () => {
        await updateAvatar('https://example.com/new-avatar.jpg');

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: {
            updates: { avatarUrl: 'https://example.com/new-avatar.jpg' },
          },
        });
      });
    });

    describe('updateVenmoHandle', () => {
      it('updates the venmo handle with @ prefix', async () => {
        await updateVenmoHandle('@myhandle');

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { venmo_handle: '@myhandle' } },
        });
      });

      it('updates the venmo handle without @ prefix', async () => {
        await updateVenmoHandle('myhandle');

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { venmo_handle: 'myhandle' } },
        });
      });
    });

    describe('updateSettings', () => {
      it('updates only settings', async () => {
        await updateSettings({ hide_branding: true });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { settings: { hide_branding: true } } },
        });
      });

      it('updates marketing preferences', async () => {
        await updateSettings({ marketing_emails: false });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { settings: { marketing_emails: false } } },
        });
      });
    });

    describe('updateTheme', () => {
      it('updates theme to dark mode', async () => {
        await updateTheme({ preference: 'dark' });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { theme: { preference: 'dark' } } },
        });
      });

      it('updates theme to light mode', async () => {
        await updateTheme({ preference: 'light' });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { theme: { preference: 'light' } } },
        });
      });

      it('updates theme to system preference', async () => {
        await updateTheme({ preference: 'system' });

        expect(mockDashboardPut).toHaveBeenCalledWith('/profile', {
          body: { updates: { theme: { preference: 'system' } } },
        });
      });
    });
  });

  // ===========================================================================
  // Namespace Export Tests
  // ===========================================================================

  describe('dashboardProfile namespace', () => {
    it('exposes all methods through the namespace', () => {
      expect(dashboardProfile.get).toBe(getProfile);
      expect(dashboardProfile.getSafe).toBe(getProfileSafe);
      expect(dashboardProfile.update).toBe(updateProfile);
      expect(dashboardProfile.updateSafe).toBe(updateProfileSafe);
      expect(dashboardProfile.updateDisplayName).toBe(updateDisplayName);
      expect(dashboardProfile.updateBio).toBe(updateBio);
      expect(dashboardProfile.updateAvatar).toBe(updateAvatar);
      expect(dashboardProfile.updateVenmoHandle).toBe(updateVenmoHandle);
      expect(dashboardProfile.updateSettings).toBe(updateSettings);
      expect(dashboardProfile.updateTheme).toBe(updateTheme);
    });

    it('can be used to call methods', async () => {
      mockDashboardGet.mockResolvedValue(mockGetProfileResponse);

      const result = await dashboardProfile.get();

      expect(result).toEqual(mockGetProfileResponse);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('handles network errors', async () => {
      const error = createApiError(
        'Network error',
        0,
        ApiErrorCode.NETWORK_ERROR,
        true
      );
      mockDashboardGet.mockRejectedValue(error);

      try {
        await getProfile();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isNetworkError()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('handles rate limiting', async () => {
      const error = createApiError(
        'Too many requests',
        429,
        ApiErrorCode.RATE_LIMITED,
        true
      );
      mockDashboardGet.mockRejectedValue(error);

      try {
        await getProfile();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isRateLimited()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('handles server errors', async () => {
      const error = createApiError(
        'Internal server error',
        500,
        ApiErrorCode.SERVER_ERROR,
        true
      );
      mockDashboardPut.mockRejectedValue(error);

      try {
        await updateProfile({ displayName: 'Test' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isServerError()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('handles forbidden errors for admin-only operations', async () => {
      const error = createApiError('Forbidden', 403, ApiErrorCode.FORBIDDEN);
      mockDashboardPut.mockRejectedValue(error);

      try {
        await updateProfile({ displayName: 'Test' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isForbidden()).toBe(true);
      }
    });
  });
});
