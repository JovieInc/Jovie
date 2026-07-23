import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withDbSessionTx: vi.fn(),
  parseJsonBody: vi.fn(),
  validateUpdatesPayload: vi.fn(),
  parseProfileUpdates: vi.fn(),
  buildProfileUpdateContext: vi.fn(),
  updateProfileRecords: vi.fn(),
  finalizeProfileResponse: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(),
  withDbSessionTx: mocks.withDbSessionTx,
}));
vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mocks.parseJsonBody,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/query-timeout', () => ({ dashboardQuery: vi.fn() }));
vi.mock('@/lib/db/social-links-sync', () => ({
  syncSocialLinksFromPrimaryMusicUrls: vi.fn(),
}));
vi.mock('@/lib/wallet/apple/profile-pass', () => ({
  refreshAppleWalletProfilePassForProfileId: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app/api/dashboard/profile/lib', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
  validateUpdatesPayload: mocks.validateUpdatesPayload,
  parseProfileUpdates: mocks.parseProfileUpdates,
  buildProfileUpdateContext: mocks.buildProfileUpdateContext,
  updateProfileRecords: mocks.updateProfileRecords,
  finalizeProfileResponse: mocks.finalizeProfileResponse,
  addAvatarCacheBust: (profile: unknown) => profile,
  getProfileByClerkId: vi.fn(),
}));

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('PUT /api/dashboard/profile exact transaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const tx = { marker: 'transaction' };
    mocks.withDbSessionTx.mockImplementation(callback =>
      callback(tx, APP_USER_ID)
    );
    mocks.parseJsonBody.mockResolvedValue({
      ok: true,
      data: {
        profileId: PROFILE_ID,
        expectedVersion: 3,
        updates: { username: 'newname', displayName: 'New Name' },
      },
    });
    mocks.validateUpdatesPayload.mockReturnValue({
      ok: true,
      updates: { username: 'newname', displayName: 'New Name' },
    });
    mocks.parseProfileUpdates.mockReturnValue({
      ok: true,
      parsed: { username: 'newname', displayName: 'New Name' },
    });
    mocks.buildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: { displayName: 'New Name' },
      displayNameForUserUpdate: 'New Name',
      avatarUrl: undefined,
      usernameUpdate: 'newname',
    });
    mocks.updateProfileRecords.mockResolvedValue({
      updatedProfile: {
        id: PROFILE_ID,
        usernameNormalized: 'newname',
        profileEditVersion: 4,
      },
      oldUsernameNormalized: 'oldname',
    });
  });

  it('passes the exact profile, app UUID, username, and CAS token into one transaction', async () => {
    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(200);
    expect(mocks.updateProfileRecords).toHaveBeenCalledWith({
      tx: { marker: 'transaction' },
      appUserId: APP_USER_ID,
      profileId: PROFILE_ID,
      dbProfileUpdates: { displayName: 'New Name' },
      displayNameForUserUpdate: 'New Name',
      usernameUpdate: 'newname',
      expectedVersion: 3,
    });
    expect(mocks.finalizeProfileResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        oldUsernameNormalized: 'oldname',
        clerkUserId: APP_USER_ID,
      })
    );
  });

  it('rejects a missing or non-canonical selected profile id', async () => {
    mocks.parseJsonBody.mockResolvedValue({
      ok: true,
      data: { profileId: 'profile-1', updates: { bio: 'x' } },
    });
    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(400);
    expect(mocks.updateProfileRecords).not.toHaveBeenCalled();
  });

  it('returns the transaction CAS conflict without post-commit effects', async () => {
    const { NextResponse } = await import('next/server');
    mocks.updateProfileRecords.mockResolvedValue(
      NextResponse.json({ code: 'VERSION_CONFLICT' }, { status: 409 })
    );
    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(409);
    expect(mocks.finalizeProfileResponse).not.toHaveBeenCalled();
  });
});
