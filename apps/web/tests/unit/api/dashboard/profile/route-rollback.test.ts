import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  withDbSessionTx: vi.fn(),
  buildThemeWithProfileAccent: vi.fn(),
  getProfileUpdatePreflight: vi.fn(),
  parseJsonBody: vi.fn(),
  validateUpdatesPayload: vi.fn(),
  parseProfileUpdates: vi.fn(),
  buildProfileUpdateContext: vi.fn(),
  updateProfileRecords: vi.fn(),
  finalizeProfileResponse: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: mocks.requireAuth,
  withDbSession: vi.fn(),
  withDbSessionTx: mocks.withDbSessionTx,
}));
vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: mocks.buildThemeWithProfileAccent,
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
  getProfileUpdatePreflight: mocks.getProfileUpdatePreflight,
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
    mocks.requireAuth.mockResolvedValue(APP_USER_ID);
    mocks.buildThemeWithProfileAccent.mockResolvedValue({});
    mocks.getProfileUpdatePreflight.mockResolvedValue({
      avatarUrl: 'https://example.com/old-avatar.png',
      profileEditVersion: 3,
    });
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
      precomputedAvatarTheme: undefined,
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

  it.each([
    { status: 403, error: 'Forbidden' },
    { status: 404, error: 'Profile not found' },
  ])('returns $status before deriving a theme for an inaccessible exact profile', async ({
    status,
    error,
  }) => {
    const { NextResponse } = await import('next/server');
    const avatarUrl = 'https://example.com/avatar.png';
    mocks.parseJsonBody.mockResolvedValue({
      ok: true,
      data: {
        profileId: PROFILE_ID,
        expectedVersion: 3,
        updates: { avatarUrl },
      },
    });
    mocks.validateUpdatesPayload.mockReturnValue({
      ok: true,
      updates: { avatarUrl },
    });
    mocks.parseProfileUpdates.mockReturnValue({
      ok: true,
      parsed: { avatarUrl },
    });
    mocks.buildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: { avatarUrl },
      displayNameForUserUpdate: undefined,
      avatarUrl,
      usernameUpdate: undefined,
    });
    mocks.getProfileUpdatePreflight.mockResolvedValue(
      NextResponse.json({ error }, { status })
    );

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(status);
    expect(mocks.buildThemeWithProfileAccent).not.toHaveBeenCalled();
    expect(mocks.updateProfileRecords).not.toHaveBeenCalled();
  });

  it('does not derive a theme when the avatar URL is unchanged', async () => {
    const avatarUrl = 'https://example.com/avatar.png';
    mocks.parseJsonBody.mockResolvedValue({
      ok: true,
      data: {
        profileId: PROFILE_ID,
        expectedVersion: 3,
        updates: { avatarUrl },
      },
    });
    mocks.validateUpdatesPayload.mockReturnValue({
      ok: true,
      updates: { avatarUrl },
    });
    mocks.parseProfileUpdates.mockReturnValue({
      ok: true,
      parsed: { avatarUrl },
    });
    mocks.buildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: { avatarUrl },
      displayNameForUserUpdate: undefined,
      avatarUrl,
      usernameUpdate: undefined,
    });
    mocks.getProfileUpdatePreflight.mockResolvedValue({
      avatarUrl,
      profileEditVersion: 3,
    });

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(200);
    expect(mocks.buildThemeWithProfileAccent).not.toHaveBeenCalled();
  });

  it('does not derive a theme when the requested CAS version is stale', async () => {
    const { NextResponse } = await import('next/server');
    const avatarUrl = 'https://example.com/avatar.png';
    mocks.parseJsonBody.mockResolvedValue({
      ok: true,
      data: {
        profileId: PROFILE_ID,
        expectedVersion: 3,
        updates: { avatarUrl },
      },
    });
    mocks.validateUpdatesPayload.mockReturnValue({
      ok: true,
      updates: { avatarUrl },
    });
    mocks.parseProfileUpdates.mockReturnValue({
      ok: true,
      parsed: { avatarUrl },
    });
    mocks.buildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: { avatarUrl },
      displayNameForUserUpdate: undefined,
      avatarUrl,
      usernameUpdate: undefined,
    });
    mocks.getProfileUpdatePreflight.mockResolvedValue({
      avatarUrl: 'https://example.com/old-avatar.png',
      profileEditVersion: 4,
    });
    mocks.updateProfileRecords.mockResolvedValue(
      NextResponse.json({ code: 'VERSION_CONFLICT' }, { status: 409 })
    );

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(409);
    expect(mocks.buildThemeWithProfileAccent).not.toHaveBeenCalled();
  });

  it('derives a changed avatar theme after preflight and before the write transaction', async () => {
    const events: string[] = [];
    const avatarUrl = 'https://example.com/avatar.png';
    const precomputedAvatarTheme = {
      profileAccent: {
        version: 1,
        primaryHex: '#123456',
        sourceUrl: avatarUrl,
      },
    };
    mocks.parseJsonBody.mockImplementation(async () => {
      events.push('parse');
      return {
        ok: true,
        data: {
          profileId: PROFILE_ID,
          expectedVersion: 3,
          updates: { avatarUrl },
        },
      };
    });
    mocks.validateUpdatesPayload.mockReturnValue({
      ok: true,
      updates: { avatarUrl },
    });
    mocks.parseProfileUpdates.mockReturnValue({
      ok: true,
      parsed: { avatarUrl },
    });
    mocks.buildProfileUpdateContext.mockReturnValue({
      dbProfileUpdates: { avatarUrl },
      displayNameForUserUpdate: undefined,
      avatarUrl,
      usernameUpdate: undefined,
    });
    mocks.buildThemeWithProfileAccent.mockImplementation(async () => {
      events.push('theme');
      return precomputedAvatarTheme;
    });
    mocks.withDbSessionTx.mockImplementation(async callback => {
      events.push('transaction');
      return callback({ marker: 'transaction' }, APP_USER_ID);
    });
    mocks.updateProfileRecords.mockImplementation(async () => {
      events.push('database');
      return {
        updatedProfile: {
          id: PROFILE_ID,
          usernameNormalized: 'oldname',
          profileEditVersion: 4,
        },
        oldUsernameNormalized: 'oldname',
      };
    });

    const { PUT } = await import('@/app/api/dashboard/profile/route');
    const response = await PUT(
      new Request('http://localhost/api/dashboard/profile', { method: 'PUT' })
    );

    expect(response.status).toBe(200);
    expect(events).toEqual([
      'parse',
      'transaction',
      'theme',
      'transaction',
      'database',
    ]);
    expect(mocks.buildThemeWithProfileAccent).toHaveBeenCalledWith({
      existingTheme: null,
      sourceUrl: avatarUrl,
    });
    expect(mocks.updateProfileRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        precomputedAvatarTheme,
        avatarPreflightVersion: 3,
      })
    );
  });
});
