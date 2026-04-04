import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getAuthenticatedSubmissionRequestMock: vi.fn(),
  getMetadataSubmissionStatusMock: vi.fn(),
  verifySubmissionProfileOwnershipMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/submission-agent/service', () => ({
  getAuthenticatedSubmissionRequest:
    hoisted.getAuthenticatedSubmissionRequestMock,
  getMetadataSubmissionStatus: hoisted.getMetadataSubmissionStatusMock,
  verifySubmissionProfileOwnership:
    hoisted.verifySubmissionProfileOwnershipMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('GET /api/metadata-submissions/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAdmin: true,
      canAccessMetadataSubmissionAgent: true,
    });
    hoisted.verifySubmissionProfileOwnershipMock.mockResolvedValue({
      id: 'profile_123',
    });
    hoisted.getMetadataSubmissionStatusMock.mockResolvedValue([]);
  });

  it('returns submission status for owned profiles', async () => {
    const { GET } = await import('@/app/api/metadata-submissions/status/route');

    const response = await GET(
      new Request(
        'http://localhost/api/metadata-submissions/status?profileId=profile_123&releaseId=release_123'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requests: [],
    });
    expect(hoisted.verifySubmissionProfileOwnershipMock).toHaveBeenCalledWith(
      'profile_123',
      'clerk_123'
    );
  });

  it('degrades cleanly when metadata submission tables are missing', async () => {
    hoisted.getMetadataSubmissionStatusMock.mockRejectedValue({
      code: '42P01',
      message: 'relation "metadata_submission_requests" does not exist',
    });

    const { GET } = await import('@/app/api/metadata-submissions/status/route');

    const response = await GET(
      new Request(
        'http://localhost/api/metadata-submissions/status?profileId=profile_123&releaseId=release_123'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requests: [],
      storageAvailable: false,
      error:
        'Metadata submission storage is not available in this environment.',
    });
    expect(hoisted.captureErrorMock).not.toHaveBeenCalled();
  });

  it('degrades cleanly when Drizzle wraps the missing-table error', async () => {
    hoisted.getMetadataSubmissionStatusMock.mockRejectedValue(
      new Error(
        'Failed query: select * from "metadata_submission_requests" where "creator_profile_id" = $1'
      )
    );

    const { GET } = await import('@/app/api/metadata-submissions/status/route');

    const response = await GET(
      new Request(
        'http://localhost/api/metadata-submissions/status?profileId=profile_123&releaseId=release_123'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requests: [],
      storageAvailable: false,
      error:
        'Metadata submission storage is not available in this environment.',
    });
    expect(hoisted.captureErrorMock).not.toHaveBeenCalled();
  });
});
