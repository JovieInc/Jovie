/**
 * Tests for Admin Creator Management API Endpoint Methods
 *
 * Tests the typed methods for creator ingestion, avatar updates,
 * social links fetching, and profile refresh operations.
 * Uses mocking of the api client to test endpoint method behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiErrorCode } from '../../types';
import {
  adminCreators,
  getCreatorSocialLinks,
  getCreatorSocialLinksSafe,
  ingestCreator,
  ingestCreatorSafe,
  ingestFromLaylo,
  ingestFromLinktree,
  refreshProfile,
  refreshProfileSafe,
  rerunIngestion,
  rerunIngestionSafe,
  updateCreatorAvatar,
  updateCreatorAvatarSafe,
} from './creators';
import type {
  AdminSocialLink,
  GetCreatorSocialLinksResponse,
  IngestCreatorResponse,
  RerunIngestionResponse,
  UpdateCreatorAvatarResponse,
} from './types';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the api client
vi.mock('../../client', () => {
  const mockAdmin = {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  };
  return {
    api: {
      admin: mockAdmin,
    },
  };
});

// Import the mocked api after mock setup
import { api } from '../../client';

// Get typed mock functions
const mockAdminGet = api.admin.get as ReturnType<typeof vi.fn>;
const mockAdminPost = api.admin.post as ReturnType<typeof vi.fn>;
const mockAdminRequest = api.admin.request as ReturnType<typeof vi.fn>;

// =============================================================================
// Test Data
// =============================================================================

const mockIngestResponse: IngestCreatorResponse = {
  ok: true,
  profile: {
    id: 'profile-123',
    username: 'testartist',
    usernameNormalized: 'testartist',
    claimToken: 'claim-token-abc',
  },
  links: 5,
};

const mockIngestResponseWithWarning: IngestCreatorResponse = {
  ok: true,
  profile: {
    id: 'profile-456',
    username: 'anotherartist',
    usernameNormalized: 'anotherartist',
    claimToken: 'claim-token-def',
  },
  links: 3,
  warning: 'Some links could not be extracted',
};

const mockRerunResponse: RerunIngestionResponse = {
  ok: true,
  jobId: 'job-789',
  profile: {
    id: 'profile-123',
    username: 'testartist',
  },
};

const mockUpdateAvatarResponse: UpdateCreatorAvatarResponse = {
  avatarUrl: 'https://example.com/new-avatar.jpg',
};

const mockSocialLinks: AdminSocialLink[] = [
  {
    id: 'link-1',
    label: 'Spotify',
    url: 'https://open.spotify.com/artist/123',
    platform: 'spotify',
    platformType: 'music',
  },
  {
    id: 'link-2',
    label: 'Instagram',
    url: 'https://instagram.com/testartist',
    platform: 'instagram',
    platformType: 'social',
  },
];

const mockGetSocialLinksResponse: GetCreatorSocialLinksResponse = {
  success: true,
  links: mockSocialLinks,
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

describe('admin creators endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // ingestCreator Tests
  // ===========================================================================

  describe('ingestCreator', () => {
    it('ingests a creator profile from a URL', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponse);

      const result = await ingestCreator({
        url: 'https://linktr.ee/testartist',
      });

      expect(result).toEqual(mockIngestResponse);
      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
        body: {
          url: 'https://linktr.ee/testartist',
          idempotencyKey: undefined,
        },
      });
    });

    it('ingests with idempotency key', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponse);

      await ingestCreator({
        url: 'https://linktr.ee/testartist',
        idempotencyKey: 'unique-key-123',
      });

      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
        body: {
          url: 'https://linktr.ee/testartist',
          idempotencyKey: 'unique-key-123',
        },
      });
    });

    it('ingests a Laylo profile', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponse);

      await ingestCreator({ url: 'https://laylo.com/testartist' });

      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
        body: {
          url: 'https://laylo.com/testartist',
          idempotencyKey: undefined,
        },
      });
    });

    it('returns response with warning for partial success', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponseWithWarning);

      const result = await ingestCreator({
        url: 'https://linktr.ee/testartist',
      });

      expect(result.warning).toBe('Some links could not be extracted');
      expect(result.links).toBe(3);
    });

    it('passes request options', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponse);
      const options = { timeout: 10000 };

      await ingestCreator({ url: 'https://linktr.ee/test' }, options);

      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
        ...options,
        body: { url: 'https://linktr.ee/test', idempotencyKey: undefined },
      });
    });

    it('throws ApiError for invalid URL', async () => {
      const error = createApiError(
        'Invalid URL format',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockAdminPost.mockRejectedValue(error);

      await expect(ingestCreator({ url: 'invalid-url' })).rejects.toThrow(
        ApiError
      );
    });

    it('throws ApiError for 409 conflict (profile already claimed)', async () => {
      const error = createApiError(
        'Profile already exists and is claimed',
        409,
        ApiErrorCode.CONFLICT
      );
      mockAdminPost.mockRejectedValue(error);

      try {
        await ingestCreator({ url: 'https://linktr.ee/claimed' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.status).toBe(409);
        expect(apiError.code).toBe(ApiErrorCode.CONFLICT);
      }
    });

    it('throws ApiError for 502 when source profile cannot be fetched', async () => {
      // Note: 502 maps to SERVER_ERROR in ApiErrorCode
      const error = createApiError(
        'Could not fetch source profile',
        502,
        ApiErrorCode.SERVER_ERROR
      );
      mockAdminPost.mockRejectedValue(error);

      await expect(
        ingestCreator({ url: 'https://linktr.ee/nonexistent' })
      ).rejects.toThrow(ApiError);
    });

    it('throws ApiError for 403 forbidden (non-admin)', async () => {
      const error = createApiError('Forbidden', 403, ApiErrorCode.FORBIDDEN);
      mockAdminPost.mockRejectedValue(error);

      try {
        await ingestCreator({ url: 'https://linktr.ee/test' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isForbidden()).toBe(true);
      }
    });
  });

  // ===========================================================================
  // ingestCreatorSafe Tests
  // ===========================================================================

  describe('ingestCreatorSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockAdminRequest.mockResolvedValue({
        ok: true,
        data: mockIngestResponse,
        status: 200,
      });

      const result = await ingestCreatorSafe({
        url: 'https://linktr.ee/testartist',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(mockIngestResponse);
        expect(result.data.profile.username).toBe('testartist');
      }
      expect(mockAdminRequest).toHaveBeenCalledWith('POST', '/creator-ingest', {
        body: {
          url: 'https://linktr.ee/testartist',
          idempotencyKey: undefined,
        },
      });
    });

    it('returns ok: false with error on failure', async () => {
      const error = createApiError(
        'Invalid URL',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockAdminRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await ingestCreatorSafe({ url: 'bad-url' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ApiError);
        expect(result.error.status).toBe(400);
      }
    });

    it('returns ok: false for 409 conflict', async () => {
      const error = createApiError(
        'Profile already claimed',
        409,
        ApiErrorCode.CONFLICT
      );
      mockAdminRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await ingestCreatorSafe({
        url: 'https://linktr.ee/claimed',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(409);
      }
    });
  });

  // ===========================================================================
  // rerunIngestion Tests
  // ===========================================================================

  describe('rerunIngestion', () => {
    it('reruns ingestion for a profile', async () => {
      mockAdminPost.mockResolvedValue(mockRerunResponse);

      const result = await rerunIngestion({ profileId: 'profile-123' });

      expect(result).toEqual(mockRerunResponse);
      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest/rerun', {
        body: { profileId: 'profile-123' },
      });
    });

    it('returns job ID for queued ingestion', async () => {
      mockAdminPost.mockResolvedValue(mockRerunResponse);

      const result = await rerunIngestion({ profileId: 'profile-123' });

      expect(result.jobId).toBe('job-789');
      expect(result.ok).toBe(true);
    });

    it('passes request options', async () => {
      mockAdminPost.mockResolvedValue(mockRerunResponse);
      const options = { timeout: 5000 };

      await rerunIngestion({ profileId: 'profile-123' }, options);

      expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest/rerun', {
        ...options,
        body: { profileId: 'profile-123' },
      });
    });

    it('throws ApiError for 404 profile not found', async () => {
      const error = createApiError(
        'Profile not found',
        404,
        ApiErrorCode.NOT_FOUND
      );
      mockAdminPost.mockRejectedValue(error);

      try {
        await rerunIngestion({ profileId: 'nonexistent' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isNotFound()).toBe(true);
      }
    });

    it('throws ApiError for 500 queue failure', async () => {
      const error = createApiError(
        'Failed to queue job',
        500,
        ApiErrorCode.SERVER_ERROR,
        true
      );
      mockAdminPost.mockRejectedValue(error);

      await expect(
        rerunIngestion({ profileId: 'profile-123' })
      ).rejects.toThrow(ApiError);
    });
  });

  // ===========================================================================
  // rerunIngestionSafe Tests
  // ===========================================================================

  describe('rerunIngestionSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockAdminRequest.mockResolvedValue({
        ok: true,
        data: mockRerunResponse,
        status: 200,
      });

      const result = await rerunIngestionSafe({ profileId: 'profile-123' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.jobId).toBe('job-789');
      }
    });

    it('returns ok: false for not found', async () => {
      const error = createApiError('Not found', 404, ApiErrorCode.NOT_FOUND);
      mockAdminRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await rerunIngestionSafe({ profileId: 'nonexistent' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.isNotFound()).toBe(true);
      }
    });
  });

  // ===========================================================================
  // updateCreatorAvatar Tests
  // ===========================================================================

  describe('updateCreatorAvatar', () => {
    it('updates creator avatar', async () => {
      mockAdminPost.mockResolvedValue(mockUpdateAvatarResponse);

      const result = await updateCreatorAvatar({
        profileId: 'profile-123',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      expect(result).toEqual(mockUpdateAvatarResponse);
      expect(mockAdminPost).toHaveBeenCalledWith('/creator-avatar', {
        body: {
          profileId: 'profile-123',
          avatarUrl: 'https://example.com/new-avatar.jpg',
        },
      });
    });

    it('throws ApiError for invalid URL (not HTTPS)', async () => {
      const error = createApiError(
        'Avatar URL must use HTTPS',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockAdminPost.mockRejectedValue(error);

      await expect(
        updateCreatorAvatar({
          profileId: 'profile-123',
          avatarUrl: 'http://insecure.com/avatar.jpg',
        })
      ).rejects.toThrow(ApiError);
    });

    it('passes request options', async () => {
      mockAdminPost.mockResolvedValue(mockUpdateAvatarResponse);
      const options = { timeout: 8000 };

      await updateCreatorAvatar(
        {
          profileId: 'profile-123',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
        options
      );

      expect(mockAdminPost).toHaveBeenCalledWith('/creator-avatar', {
        ...options,
        body: {
          profileId: 'profile-123',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      });
    });
  });

  // ===========================================================================
  // updateCreatorAvatarSafe Tests
  // ===========================================================================

  describe('updateCreatorAvatarSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockAdminRequest.mockResolvedValue({
        ok: true,
        data: mockUpdateAvatarResponse,
        status: 200,
      });

      const result = await updateCreatorAvatarSafe({
        profileId: 'profile-123',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.avatarUrl).toBe(
          'https://example.com/new-avatar.jpg'
        );
      }
    });

    it('returns ok: false for validation error', async () => {
      const error = createApiError(
        'Invalid URL',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockAdminRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await updateCreatorAvatarSafe({
        profileId: 'profile-123',
        avatarUrl: 'http://bad.com/avatar.jpg',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(400);
      }
    });
  });

  // ===========================================================================
  // getCreatorSocialLinks Tests
  // ===========================================================================

  describe('getCreatorSocialLinks', () => {
    it('fetches social links for a profile', async () => {
      mockAdminGet.mockResolvedValue(mockGetSocialLinksResponse);

      const result = await getCreatorSocialLinks('profile-123');

      expect(result).toEqual(mockGetSocialLinksResponse);
      expect(mockAdminGet).toHaveBeenCalledWith(
        '/creator-social-links?profileId=profile-123',
        undefined
      );
    });

    it('returns array of social links', async () => {
      mockAdminGet.mockResolvedValue(mockGetSocialLinksResponse);

      const result = await getCreatorSocialLinks('profile-123');

      expect(result.links).toHaveLength(2);
      expect(result.links[0].platform).toBe('spotify');
      expect(result.links[1].platform).toBe('instagram');
    });

    it('passes request options', async () => {
      mockAdminGet.mockResolvedValue(mockGetSocialLinksResponse);
      const options = { timeout: 3000 };

      await getCreatorSocialLinks('profile-123', options);

      expect(mockAdminGet).toHaveBeenCalledWith(
        '/creator-social-links?profileId=profile-123',
        options
      );
    });

    it('throws ApiError for missing profileId', async () => {
      const error = createApiError(
        'Missing profileId parameter',
        400,
        ApiErrorCode.BAD_REQUEST
      );
      mockAdminGet.mockRejectedValue(error);

      await expect(getCreatorSocialLinks('')).rejects.toThrow(ApiError);
    });
  });

  // ===========================================================================
  // getCreatorSocialLinksSafe Tests
  // ===========================================================================

  describe('getCreatorSocialLinksSafe', () => {
    it('returns ok: true with data on success', async () => {
      mockAdminRequest.mockResolvedValue({
        ok: true,
        data: mockGetSocialLinksResponse,
        status: 200,
      });

      const result = await getCreatorSocialLinksSafe('profile-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.links).toHaveLength(2);
      }
    });

    it('returns ok: false for error', async () => {
      const error = createApiError(
        'Fetch failed',
        500,
        ApiErrorCode.SERVER_ERROR,
        true
      );
      mockAdminRequest.mockResolvedValue({
        ok: false,
        error,
      });

      const result = await getCreatorSocialLinksSafe('profile-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.isServerError()).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Convenience Method Tests
  // ===========================================================================

  describe('convenience methods', () => {
    describe('ingestFromLinktree', () => {
      it('prepends Linktree base URL', async () => {
        mockAdminPost.mockResolvedValue(mockIngestResponse);

        await ingestFromLinktree('testartist');

        expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
          body: {
            url: 'https://linktr.ee/testartist',
            idempotencyKey: undefined,
          },
        });
      });

      it('passes request options', async () => {
        mockAdminPost.mockResolvedValue(mockIngestResponse);
        const options = { timeout: 5000 };

        await ingestFromLinktree('testartist', options);

        expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
          ...options,
          body: {
            url: 'https://linktr.ee/testartist',
            idempotencyKey: undefined,
          },
        });
      });
    });

    describe('ingestFromLaylo', () => {
      it('prepends Laylo base URL', async () => {
        mockAdminPost.mockResolvedValue(mockIngestResponse);

        await ingestFromLaylo('testartist');

        expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest', {
          body: {
            url: 'https://laylo.com/testartist',
            idempotencyKey: undefined,
          },
        });
      });
    });

    describe('refreshProfile', () => {
      it('is an alias for rerunIngestion', async () => {
        mockAdminPost.mockResolvedValue(mockRerunResponse);

        const result = await refreshProfile('profile-123');

        expect(result).toEqual(mockRerunResponse);
        expect(mockAdminPost).toHaveBeenCalledWith('/creator-ingest/rerun', {
          body: { profileId: 'profile-123' },
        });
      });
    });

    describe('refreshProfileSafe', () => {
      it('is an alias for rerunIngestionSafe', async () => {
        mockAdminRequest.mockResolvedValue({
          ok: true,
          data: mockRerunResponse,
          status: 200,
        });

        const result = await refreshProfileSafe('profile-123');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.jobId).toBe('job-789');
        }
      });
    });
  });

  // ===========================================================================
  // Namespace Export Tests
  // ===========================================================================

  describe('adminCreators namespace', () => {
    it('exposes all methods through the namespace', () => {
      expect(adminCreators.ingest).toBe(ingestCreator);
      expect(adminCreators.ingestSafe).toBe(ingestCreatorSafe);
      expect(adminCreators.ingestFromLinktree).toBe(ingestFromLinktree);
      expect(adminCreators.ingestFromLaylo).toBe(ingestFromLaylo);
      expect(adminCreators.rerunIngestion).toBe(rerunIngestion);
      expect(adminCreators.rerunIngestionSafe).toBe(rerunIngestionSafe);
      expect(adminCreators.refresh).toBe(refreshProfile);
      expect(adminCreators.refreshSafe).toBe(refreshProfileSafe);
      expect(adminCreators.updateAvatar).toBe(updateCreatorAvatar);
      expect(adminCreators.updateAvatarSafe).toBe(updateCreatorAvatarSafe);
      expect(adminCreators.getSocialLinks).toBe(getCreatorSocialLinks);
      expect(adminCreators.getSocialLinksSafe).toBe(getCreatorSocialLinksSafe);
    });

    it('can be used to call methods', async () => {
      mockAdminPost.mockResolvedValue(mockIngestResponse);

      const result = await adminCreators.ingest({
        url: 'https://linktr.ee/test',
      });

      expect(result).toEqual(mockIngestResponse);
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
      mockAdminPost.mockRejectedValue(error);

      try {
        await ingestCreator({ url: 'https://linktr.ee/test' });
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
      mockAdminPost.mockRejectedValue(error);

      try {
        await ingestCreator({ url: 'https://linktr.ee/test' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isRateLimited()).toBe(true);
      }
    });

    it('handles authorization errors', async () => {
      const error = createApiError(
        'Unauthorized',
        401,
        ApiErrorCode.UNAUTHORIZED
      );
      mockAdminGet.mockRejectedValue(error);

      try {
        await getCreatorSocialLinks('profile-123');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.isUnauthorized()).toBe(true);
      }
    });

    it('handles abort signals', async () => {
      const error = createApiError('Request aborted', 0, ApiErrorCode.ABORTED);
      mockAdminPost.mockRejectedValue(error);

      try {
        await ingestCreator({ url: 'https://linktr.ee/test' });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const apiError = e as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.ABORTED);
      }
    });
  });
});
