import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockLoadFreshSpotifyAccessToken,
  mockGetSpotifyAccountProfile,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockLoadFreshSpotifyAccessToken: vi.fn(),
  mockGetSpotifyAccountProfile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: vi.fn(),
    update: vi.fn(),
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
  users: { id: 'id' },
}));

vi.mock('@/lib/db/schema/connectors', () => ({
  connectorAccounts: {
    id: 'id',
    userId: 'user_id',
    provider: 'provider',
    status: 'status',
    scopes: 'scopes',
    providerAccountId: 'provider_account_id',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((column: unknown) => ({ type: 'desc', column })),
  eq: vi.fn((column, value) => ({ column, value })),
  isNull: vi.fn((column: unknown) => ({ type: 'isNull', column })),
  lte: vi.fn((column, value) => ({ type: 'lte', column, value })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}));

vi.mock('@/lib/connectors/spotify/access-token', () => ({
  loadFreshSpotifyAccessToken: mockLoadFreshSpotifyAccessToken,
}));

vi.mock('@/lib/connectors/spotify/provider', () => ({
  getSpotifyAccountProfile: mockGetSpotifyAccountProfile,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const ALL_PLAYLIST_SCOPES = [
  'user-read-email',
  'playlist-modify-public',
  'playlist-read-private',
  'ugc-image-upload',
];

function mockConnectorAccount(row: Record<string, unknown> | null) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(row ? [row] : []),
        }),
      }),
    }),
  });
}

describe('playlist Spotify publisher via connector_accounts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports missing when the user has no spotify connector account', async () => {
    mockConnectorAccount(null);

    const { validatePlaylistSpotifyAccount } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      validatePlaylistSpotifyAccount('user_1')
    ).resolves.toMatchObject({
      connected: false,
      healthy: false,
      missingScopes: [
        'playlist-modify-public',
        'playlist-read-private',
        'ugc-image-upload',
      ],
    });
    expect(mockLoadFreshSpotifyAccessToken).not.toHaveBeenCalled();
  });

  it('reports missing scopes from the connector account scopes column', async () => {
    mockConnectorAccount({
      id: 'conn_1',
      status: 'connected',
      scopes: ['playlist-read-private'],
      providerAccountId: 'jovie',
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    });

    const { validatePlaylistSpotifyAccount } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      validatePlaylistSpotifyAccount('user_1')
    ).resolves.toMatchObject({
      connected: true,
      healthy: false,
      accountLabel: 'jovie',
      missingScopes: ['playlist-modify-public', 'ugc-image-upload'],
    });
  });

  it('marks a fully scoped account healthy when the vault token reaches /me', async () => {
    mockConnectorAccount({
      id: 'conn_1',
      status: 'connected',
      scopes: ALL_PLAYLIST_SCOPES,
      providerAccountId: 'jovie',
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    });
    mockLoadFreshSpotifyAccessToken.mockResolvedValue('fresh-token');
    mockGetSpotifyAccountProfile.mockResolvedValue({
      id: 'jovie',
      label: 'jovie@jov.ie',
    });

    const { validatePlaylistSpotifyAccount } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      validatePlaylistSpotifyAccount('user_1')
    ).resolves.toMatchObject({
      connected: true,
      healthy: true,
      accountLabel: 'jovie@jov.ie',
      missingScopes: [],
      error: null,
    });
    expect(mockLoadFreshSpotifyAccessToken).toHaveBeenCalledWith('conn_1');
    expect(mockGetSpotifyAccountProfile).toHaveBeenCalledWith({
      accessToken: 'fresh-token',
    });
  });

  it('fails closed when no usable token exists for the connector account', async () => {
    mockConnectorAccount({
      id: 'conn_1',
      status: 'needs_reauth',
      scopes: ALL_PLAYLIST_SCOPES,
      providerAccountId: 'jovie',
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    });
    mockLoadFreshSpotifyAccessToken.mockResolvedValue(null);

    const { validatePlaylistSpotifyAccount } = await import(
      '@/lib/admin/platform-connections'
    );

    await expect(
      validatePlaylistSpotifyAccount('user_1')
    ).resolves.toMatchObject({
      connected: true,
      healthy: false,
      error: 'Spotify token is unavailable. Reconnect Spotify.',
    });
  });
});
