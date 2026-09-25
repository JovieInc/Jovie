/**
 * app/(shell)/admin/platform-connections/actions.ts
 *
 * Regression coverage for JOV-4228: the admin session userId is the app
 * `users.id` UUID post-cutover, so audit-log user resolution must key on
 * `users.id`, never `users.clerkId`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  checkAdminRoleMock: vi.fn(),
  selectLimitMock: vi.fn(),
  selectWhereMock: vi.fn(),
  dbSelectMock: vi.fn(),
  insertValuesMock: vi.fn(),
  dbInsertMock: vi.fn(),
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  setPlaylistEngineSettingsMock: vi.fn(),
  setPlaylistSpotifyClerkUserIdMock: vi.fn(),
  getPlaylistSpotifyStatusMock: vi.fn(),
  generatePlaylistMock: vi.fn(),
  captureErrorMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: hoisted.checkAdminRoleMock,
}));

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelectMock, insert: hoisted.dbInsertMock },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerk_id' },
}));

vi.mock('@/lib/db/schema/admin', () => ({
  adminAuditLog: { id: 'admin_audit_log.id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: hoisted.eqMock,
}));

vi.mock('@/lib/admin/platform-connections', () => ({
  getPlaylistSpotifyStatus: hoisted.getPlaylistSpotifyStatusMock,
  invalidatePlatformConnectionsCache: vi.fn(),
  PLAYLIST_INTERVAL_UNITS: ['hours', 'days', 'weeks'],
  setPlaylistEngineSettings: hoisted.setPlaylistEngineSettingsMock,
  setPlaylistSpotifyClerkUserId: hoisted.setPlaylistSpotifyClerkUserIdMock,
}));

vi.mock('@/lib/playlists/pipeline', () => ({
  generatePlaylist: hoisted.generatePlaylistMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePathMock,
}));

function mockSelectChain(rows: unknown[]) {
  hoisted.selectLimitMock.mockResolvedValue(rows);
  hoisted.selectWhereMock.mockReturnValue({ limit: hoisted.selectLimitMock });
  hoisted.dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: hoisted.selectWhereMock }),
  });
}

function mockInsertChain() {
  hoisted.insertValuesMock.mockResolvedValue(undefined);
  hoisted.dbInsertMock.mockReturnValue({ values: hoisted.insertValuesMock });
}

describe('admin platform-connections actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Session userId is the app users.id UUID post-cutover (JOV-4228).
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-admin-1' });
    hoisted.checkAdminRoleMock.mockResolvedValue(true);
    mockSelectChain([{ id: 'db-admin-1' }]);
    mockInsertChain();
    hoisted.setPlaylistEngineSettingsMock.mockResolvedValue({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: null,
      nextEligibleAt: null,
    });
  });

  it('updatePlaylistEngineSettings resolves the audit user by users.id', async () => {
    const { updatePlaylistEngineSettings } = await import(
      '@/app/app/(shell)/admin/platform-connections/actions'
    );

    const result = await updatePlaylistEngineSettings({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
    });

    expect(result.success).toBe(true);
    // The audit-log user lookup must target users.id with the session UUID.
    expect(hoisted.eqMock).toHaveBeenCalledWith('users.id', 'db-admin-1');
    expect(hoisted.eqMock).not.toHaveBeenCalledWith(
      'users.clerk_id',
      expect.anything()
    );
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: 'db-admin-1',
        action: 'playlist_engine_settings_updated',
      })
    );
  });

  it('skips the audit row when the session user id resolves to no users row', async () => {
    mockSelectChain([]);

    const { updatePlaylistEngineSettings } = await import(
      '@/app/app/(shell)/admin/platform-connections/actions'
    );

    const result = await updatePlaylistEngineSettings({
      enabled: false,
      intervalValue: 7,
      intervalUnit: 'days',
    });

    expect(result.success).toBe(true);
    expect(hoisted.insertValuesMock).not.toHaveBeenCalled();
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      '[Admin Audit] User mapping not found',
      null,
      expect.objectContaining({ userId: 'db-admin-1' })
    );
  });

  it('returns a failure state when the session is unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { updatePlaylistEngineSettings } = await import(
      '@/app/app/(shell)/admin/platform-connections/actions'
    );

    const result = await updatePlaylistEngineSettings({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
    });

    expect(result.success).toBe(false);
    expect(hoisted.setPlaylistEngineSettingsMock).not.toHaveBeenCalled();
  });

  it('passes the session users.id through setPlaylistSpotifyClerkUserId', async () => {
    hoisted.setPlaylistSpotifyClerkUserIdMock.mockResolvedValue(undefined);

    const { setCurrentAdminAsPlaylistSpotifyPublisher } = await import(
      '@/app/app/(shell)/admin/platform-connections/actions'
    );

    const result = await setCurrentAdminAsPlaylistSpotifyPublisher();

    expect(result.success).toBe(true);
    expect(hoisted.setPlaylistSpotifyClerkUserIdMock).toHaveBeenCalledWith({
      clerkUserId: 'db-admin-1',
      updatedByUserId: 'db-admin-1',
    });
  });

  it('generateTestPlaylist refuses when the publisher account is unhealthy', async () => {
    hoisted.getPlaylistSpotifyStatusMock.mockResolvedValue({
      healthy: false,
      error: 'Spotify publisher is not healthy.',
    });

    const { generateTestPlaylist } = await import(
      '@/app/app/(shell)/admin/platform-connections/actions'
    );

    const result = await generateTestPlaylist();

    expect(result.success).toBe(false);
    expect(hoisted.generatePlaylistMock).not.toHaveBeenCalled();
  });
});
