import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockValidateUpdatesPayload = vi.hoisted(() => vi.fn());
const mockParseProfileUpdates = vi.hoisted(() => vi.fn());
const mockBuildProfileUpdateContext = vi.hoisted(() => vi.fn());
const mockGuardUsernameUpdate = vi.hoisted(() => vi.fn());
const mockBuildClerkUpdates = vi.hoisted(() => vi.fn());
const mockSyncClerkProfile = vi.hoisted(() => vi.fn());
const mockUpdateProfileRecords = vi.hoisted(() => vi.fn());
const mockFinalizeProfileResponse = vi.hoisted(() => vi.fn());
const mockAddAvatarCacheBust = vi.hoisted(() => vi.fn());
const mockHandleTestProfileUpdate = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/app/api/dashboard/profile/lib', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
  validateUpdatesPayload: mockValidateUpdatesPayload,
  parseProfileUpdates: mockParseProfileUpdates,
  buildProfileUpdateContext: mockBuildProfileUpdateContext,
  guardUsernameUpdate: mockGuardUsernameUpdate,
  buildClerkUpdates: mockBuildClerkUpdates,
  syncClerkProfile: mockSyncClerkProfile,
  updateProfileRecords: mockUpdateProfileRecords,
  finalizeProfileResponse: mockFinalizeProfileResponse,
  addAvatarCacheBust: mockAddAvatarCacheBust,
  handleTestProfileUpdate: mockHandleTestProfileUpdate,
  getProfileByClerkId: vi.fn(),
}));

describe('PUT /api/dashboard/profile rollback behavior', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();

    mockWithDbSession.mockImplementation(async handler => handler('clerk_123'));
    mockGetCurrentUserEntitlements.mockResolvedValue({
      canRemoveBranding: true,
    });
    mockParseJsonBody.mockResolvedValue({ ok: true, data: { updates: {} } });
    mockValidateUpdatesPayload.mockReturnValue({ ok: true, updates: {} });
    mockParseProfileUpdates.mockReturnValue({ ok: true, parsed: {} });
    mockBuildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: {},
      displayNameForUserUpdate: undefined,
      avatarUrl: undefined,
      usernameUpdate: undefined,
    });
    mockGuardUsernameUpdate.mockResolvedValue(null);
    mockBuildClerkUpdates.mockReturnValue({ firstName: 'New' });
    mockAddAvatarCacheBust.mockImplementation(profile => profile);
    mockFinalizeProfileResponse.mockResolvedValue(undefined);
    mockHandleTestProfileUpdate.mockResolvedValue(
      NextResponse.json({ profile: {} })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes old username to finalize response after profile update', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined);
    mockSyncClerkProfile.mockResolvedValue({
      clerkSyncFailed: false,
      rollback,
    });
    mockUpdateProfileRecords.mockResolvedValue({
      updatedProfile: { id: 'profile-1', usernameNormalized: 'newname' },
      oldUsernameNormalized: 'oldname',
    });

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', {
        method: 'PUT',
        body: JSON.stringify({ updates: { username: 'newname' } }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockFinalizeProfileResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        oldUsernameNormalized: 'oldname',
        updatedProfile: expect.objectContaining({
          usernameNormalized: 'newname',
        }),
      })
    );
  });

  it('rolls Clerk back when DB update throws', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined);
    mockSyncClerkProfile.mockResolvedValue({
      clerkSyncFailed: false,
      rollback,
    });
    mockUpdateProfileRecords.mockRejectedValue(new Error('db failed'));

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', {
        method: 'PUT',
        body: JSON.stringify({ updates: {} }),
      })
    );

    expect(response.status).toBe(500);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Profile update failed',
      expect.any(Error),
      expect.objectContaining({ method: 'PUT' })
    );
  });
});
