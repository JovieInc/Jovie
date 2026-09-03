import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  listLedger: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: mocks.limit }),
        }),
      }),
    }),
  },
}));
vi.mock('./queries', () => ({
  listChannelVideoLedgerForProfile: mocks.listLedger,
}));

import { loadAuthorizedYouTubeChannelWorkspace } from './channel-workspace';

const input = { userId: 'user-1', creatorProfileId: 'profile-1' };

describe('loadAuthorizedYouTubeChannelWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLedger.mockResolvedValue([]);
  });

  it('requires authorization when no connected account exists', async () => {
    mocks.limit.mockResolvedValue([
      {
        status: 'error',
        channelId: 'UC-old',
        scopes: [],
        lastSyncAt: null,
        errorMessage: 'Reconnect YouTube.',
      },
    ]);

    await expect(loadAuthorizedYouTubeChannelWorkspace(input)).resolves.toEqual(
      {
        state: 'auth-required',
        videos: [],
        errorMessage: 'Reconnect YouTube.',
      }
    );
    expect(mocks.listLedger).not.toHaveBeenCalled();
  });

  it('blocks ambiguous ownership before reading any video ledger', async () => {
    mocks.limit.mockResolvedValue([
      {
        status: 'connected',
        channelId: 'UC-one',
        scopes: ['youtube.readonly'],
        lastSyncAt: null,
        errorMessage: null,
      },
      {
        status: 'connected',
        channelId: 'UC-two',
        scopes: ['youtube.readonly'],
        lastSyncAt: null,
        errorMessage: null,
      },
    ]);

    const result = await loadAuthorizedYouTubeChannelWorkspace(input);

    expect(result.state).toBe('ambiguous-channel');
    expect(mocks.listLedger).not.toHaveBeenCalled();
  });

  it('loads only the exact connected channel for the selected profile', async () => {
    const lastSyncAt = new Date('2026-09-01T12:00:00.000Z');
    mocks.limit.mockResolvedValue([
      {
        status: 'connected',
        channelId: 'UC-owned',
        scopes: ['youtube.readonly'],
        lastSyncAt,
        errorMessage: null,
      },
    ]);
    mocks.listLedger.mockResolvedValue([{ videoId: 'video-1' }]);

    const result = await loadAuthorizedYouTubeChannelWorkspace(input);

    expect(mocks.listLedger).toHaveBeenCalledWith({
      creatorProfileId: 'profile-1',
      channelId: 'UC-owned',
    });
    expect(result).toMatchObject({
      state: 'connected',
      authorizedChannelId: 'UC-owned',
      scopes: ['youtube.readonly'],
      lastSyncAt: '2026-09-01T12:00:00.000Z',
      videos: [{ videoId: 'video-1' }],
    });
  });
});
