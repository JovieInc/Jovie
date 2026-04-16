import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbInsert, mockDbSelect, mockDbUpdate, mockClerkClient, mockFetch } =
  vi.hoisted(() => ({
    mockDbInsert: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockClerkClient: vi.fn(),
    mockFetch: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/admin', () => ({
  adminSystemSettings: {
    id: 'id',
    playlistSpotifyClerkUserId: 'playlist_spotify_clerk_user_id',
    playlistEngineEnabled: 'playlist_engine_enabled',
    playlistGenerationIntervalValue: 'playlist_generation_interval_value',
    playlistGenerationIntervalUnit: 'playlist_generation_interval_unit',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerk_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((column, value) => ({ column, value })),
  isNull: vi.fn((column: unknown) => ({ type: 'isNull', column })),
  lte: vi.fn((column, value) => ({ type: 'lte', column, value })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

function mockSettingsRow(row: Record<string, unknown> | null) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      }),
    }),
  });
}

function mockInsertReturning(row: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([row]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  mockDbInsert.mockReturnValue({ values });
}

function mockUpdateReturning(rows: Record<string, unknown>[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
}

describe('platform connections settings', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.unstubAllEnvs();
  });

  it('fails closed when the settings row is missing', async () => {
    mockSettingsRow(null);

    const { getPlaylistEngineSettings } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(getPlaylistEngineSettings()).resolves.toMatchObject({
      enabled: false,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: null,
      nextEligibleAt: null,
    });
  });

  it('normalizes invalid persisted interval settings', async () => {
    mockSettingsRow({
      playlistEngineEnabled: true,
      playlistGenerationIntervalValue: 0,
      playlistGenerationIntervalUnit: 'months',
      playlistLastGeneratedAt: null,
      playlistNextEligibleAt: null,
    });

    const { getPlaylistEngineSettings } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(getPlaylistEngineSettings()).resolves.toMatchObject({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
    });
  });

  it('updates playlist engine settings and returns the persisted value', async () => {
    mockSettingsRow(null);
    mockInsertReturning({
      playlistEngineEnabled: true,
      playlistGenerationIntervalValue: 4,
      playlistGenerationIntervalUnit: 'hours',
      playlistLastGeneratedAt: null,
      playlistNextEligibleAt: null,
    });

    const { setPlaylistEngineSettings } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      setPlaylistEngineSettings({
        enabled: true,
        intervalValue: 4,
        intervalUnit: 'hours',
      })
    ).resolves.toMatchObject({
      enabled: true,
      intervalValue: 4,
      intervalUnit: 'hours',
    });
  });

  it('reports missing Spotify publisher when neither DB nor env is configured', async () => {
    mockSettingsRow(null);

    const { getPlaylistSpotifyStatus } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(getPlaylistSpotifyStatus()).resolves.toMatchObject({
      connected: false,
      healthy: false,
      source: 'missing',
      missingScopes: [
        'playlist-modify-public',
        'playlist-read-private',
        'ugc-image-upload',
      ],
    });
  });

  it('reports missing scopes for a connected Spotify account', async () => {
    mockSettingsRow({ playlistSpotifyClerkUserId: 'user_1' });
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          externalAccounts: [
            {
              provider: 'oauth_spotify',
              username: 'jovie',
              approvedScopes: ['playlist-read-private'],
            },
          ],
        }),
      },
    });

    const { getPlaylistSpotifyStatus } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(getPlaylistSpotifyStatus()).resolves.toMatchObject({
      connected: true,
      healthy: false,
      source: 'database',
      accountLabel: 'jovie',
      missingScopes: ['playlist-modify-public', 'ugc-image-upload'],
    });
  });

  it('claims a playlist generation lease only when eligible', async () => {
    mockUpdateReturning([{ id: 1 }]);

    const { acquirePlaylistGenerationLease } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      acquirePlaylistGenerationLease(new Date('2026-04-15T00:00:00.000Z'))
    ).resolves.toMatchObject({
      claimed: true,
    });
  });
});
